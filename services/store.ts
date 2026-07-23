
import {
    collection, doc, getDoc, getDocs, setDoc, updateDoc,
    onSnapshot, query, where, orderBy, addDoc, deleteDoc,
    serverTimestamp, arrayUnion, writeBatch, WriteBatch,
    runTransaction, increment, Transaction, deleteField
} from 'firebase/firestore';
import {
    signInWithEmailAndPassword, signOut, sendPasswordResetEmail,
    onAuthStateChanged, createUserWithEmailAndPassword, updateProfile,
    getAuth, updateEmail, updatePassword,
    User as FirebaseUser
} from 'firebase/auth';
import { initializeApp, deleteApp, FirebaseApp } from 'firebase/app';
import { ref, uploadString, getDownloadURL, deleteObject } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { db, auth, storage, functions, firebaseConfig } from './firebase';
import { FulfillmentPreview, getInventoryEvidenceUrl, inventoryApi, newOperationId, uploadInventoryEvidence } from './inventoryApi';
import {
    User, Project, Role, ProjectStatus, DiamondBag, IssueRequest, RequestLine, BagReturnLine, BagReturnTransaction,
    InventoryMovement, DiamondSpec, GoldPriceCache, GlobalSettings,
    ProjectCostSummary, WeeklyReportSnapshot, ProgressStage,
    DiamondLedgerTransaction, WeeklyReportLine,
    DiamondPriceBand, BagStatus, InventoryMovementType, Priority,
    TransactionStatus, VerificationOutcome, ProjectTransaction,
    InventorySummaryItem, InventoryLine, BagItem, CastingEvent, ProjectNote, ProjectAssignment,
    AppNotification, NotificationType, SystemLog, GoldComponent, GoldCostBreakdownItem,
    RepairDetailsV2, RepairStatus, RepairType, RepairCostSummary,
    Diamond, EvidenceImage, EvidenceReplacement
} from '../types';
import { generateThumbnail } from '../components/ImageUpload';
import {
    MOCK_USERS, MOCK_PROJECTS, MOCK_SPECS, MOCK_BAGS,
    MOCK_REQUESTS, MOCK_SETTINGS
} from './demoData';
import {
    calculateCurrentStockCarats, computeLineDelta, estimatedValue, normalizeBalance, resolveAvgWeight, resolveLineCarats, roundCt,
    isAdditiveMovement, MIXED_UNSORTED_SPEC_ID
} from './inventoryMath';
import { InventoryCorrectionInput, ReconcileIssue, ReconcileResult } from '../types';
import { getProjectRevisions as fetchProjectRevisions, reviseProjectDetails, ProjectRevisionPayload } from './projectRevisionApi';
import { handoffProject as handoffProjectTrusted } from './projectWorkflowApi';
import * as phase5Api from './phase5Api';
import { ProjectRevision } from '../types';
import {
    createCanonicalService,
    getCanonicalServiceCode,
    getProjectServiceLabel,
    PROJECT_SERVICE_LABELS,
    requireCreatableService,
} from './projectServiceModel';

// Helpers
const now = () => new Date().toISOString();

// Safe Deep Copy to strip undefineds and handle circular references
function deepCopySafe(obj: any, seen = new WeakSet()): any {
    if (obj === null || typeof obj !== 'object') return obj;
    if (seen.has(obj)) return null; // Break circular reference

    // Handle Date objects (convert to ISO string to match JSON behavior)
    if (obj instanceof Date) return obj.toISOString();

    seen.add(obj);

    if (Array.isArray(obj)) {
        return obj.map(v => deepCopySafe(v, seen)).filter(v => v !== undefined);
    }

    const res: any = {};
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const val = obj[key];
            // Skip undefined and functions
            if (val !== undefined && typeof val !== 'function') {
                res[key] = deepCopySafe(val, seen);
            }
        }
    }
    return res;
}

class StoreService {
    private users: User[] = [];
    private projects: Project[] = [];
    private bags: DiamondBag[] = [];
    private requests: IssueRequest[] = [];
    private movements: InventoryMovement[] = [];
    private specs: DiamondSpec[] = [];
    private bands: DiamondPriceBand[] = [];
    private settings: GlobalSettings = {
        usdToCadMultiplier: 1.35,
        setterCostPerSetPieceCad: 3,
        purityMapping: { '10k': 0.417, '14k': 0.585, '18k': 0.750, '21k': 0.875, '950': 0.95 },
        goldWidget: { enabled: true, refreshIntervalMinutes: 30, showPerGram: true }
    };
    private weeklyReports: WeeklyReportSnapshot[] = [];
    private transactions: ProjectTransaction[] = [];
    private notifications: AppNotification[] = [];
    private systemLogs: SystemLog[] = [];
    private diamondTransactions: DiamondLedgerTransaction[] = [];
    private diamonds: Diamond[] = [];
    private evidenceImages: EvidenceImage[] = [];

    private liveGoldPrice: GoldPriceCache | null = null;
    private currentUser: User | null = null;
    private listeners: (() => void)[] = [];
    private unsubscribes: (() => void)[] = [];

    public isDemoMode = false;

    // Stages Configuration
    private stages: ProgressStage[] = [
        { id: 's1', name: 'Intake', percentValue: 10 },
        { id: 's2', name: 'Pre-Polish', percentValue: 40 },
        { id: 's3', name: 'Setting', percentValue: 70 },
        { id: 's4', name: 'QC/Polish', percentValue: 90 },
        { id: 's5', name: 'Complete', percentValue: 100 }
    ];

    constructor() { }

    private async fixProjectSO01001848() {
        const p = this.projects.find(p => p.code === 'SO-01-001848');
        if (!p) return;

        console.log("Found project SO-01-001848, checking if it needs fixing...");

        let needsUpdate = false;
        const updates: any = {};

        // 10k gold at 13.7g
        if (p.goldPurity !== '10k') {
            updates.goldPurity = '10k';
            needsUpdate = true;
        }

        // Check if casting weight is recorded
        const castingProgress = p.progress.find(pr => pr.stageName === 'Casting');
        if (castingProgress && castingProgress.weightG !== 13.7) {
            const newProgress = p.progress.map(pr => {
                if (pr.stageName === 'Casting') {
                    return { ...pr, weightG: 13.7 };
                }
                return pr;
            });
            updates.progress = newProgress;
            needsUpdate = true;
        } else if (!castingProgress) {
            const activeCreator = (p.assignments || []).find(a => a.active)?.userId || p.assignedSetterId || 'system';
            const newProgress = [...p.progress, {
                id: Math.random().toString(),
                projectId: p.id,
                createdById: activeCreator,
                createdAt: new Date().toISOString(),
                stageName: 'Casting',
                percentComplete: 20,
                weightG: 13.7
            }];
            updates.progress = newProgress;
            needsUpdate = true;
        }

        // Recalculate costs if locked
        if (p.status === ProjectStatus.CLOSED || p.status === ProjectStatus.REVIEW) {
            const costSummary = this.getProjectCostSummary(p.id);

            let ratio = p.goldPurityRatioSnapshot || 0;
            if (!ratio && (updates.goldPurity || p.goldPurity)) {
                ratio = this.settings.purityMapping?.[updates.goldPurity || p.goldPurity] || 0;
            }

            const goldPrice = p.projectEndGoldPriceSnapshot || this.liveGoldPrice?.price || 0;

            const weights = (updates.progress || p.progress).map((pr: any) => pr.weightG).filter((w: any) => w !== undefined && w !== null && w > 0) as number[];
            const initialWeightG = weights.length > 0 ? Math.max(...weights) : 13.7;

            const newGoldCost = initialWeightG * ratio * goldPrice;

            if (p.finalGoldCostCalculated !== newGoldCost) {
                updates.finalGoldCostCalculated = newGoldCost;
                needsUpdate = true;
            }

            // Recalculate diamond cost
            const newDiamondCostUsd = costSummary.breakdown.reduce((acc, b) => acc + b.costUsd, 0);
            const newDiamondCostCad = newDiamondCostUsd * (p.usdToCadMultiplierSnapshot || this.settings.usdToCadMultiplier);
            if (p.finalDiamondCostCalculated !== newDiamondCostCad) {
                updates.finalDiamondCostCalculated = newDiamondCostCad;
                needsUpdate = true;
            }

            // Recalculate setter cost
            const totalStonesSet = costSummary.breakdown.reduce((acc, b) => acc + b.usedPcs, 0);
            const newSetterCost = totalStonesSet * (p.setterCostPerSetPieceCadSnapshot || this.settings.setterCostPerSetPieceCad || 3);
            if (p.finalSetterCostCalculated !== newSetterCost) {
                updates.finalSetterCostCalculated = newSetterCost;
                needsUpdate = true;
            }
        }

        if (needsUpdate) {
            console.log("Applying fixes to SO-01-001848:", updates);
            try {
                await updateDoc(doc(db, 'projects', p.id), updates);
                console.log("Successfully fixed SO-01-001848");
            } catch (e) {
                console.error("Failed to fix SO-01-001848:", e);
            }
        } else {
            console.log("SO-01-001848 is already correct.");
        }
    }

    /**
     * EMERGENCY REPAIR: Scrub base64 photos from project documents and move to Firebase Storage.
     * This resolves the 1MB document size limit issue for projects with many photos.
     */
    async scrubProjectPhotos(projectId: string) {
        console.log(`Starting emergency scrub for project: ${projectId}`);
        const projectRef = doc(db, 'projects', projectId);
        const projectSnap = await getDoc(projectRef);

        if (!projectSnap.exists()) return;
        const p = projectSnap.data() as Project;
        let needsFix = false;

        // 1. Scrub projectPhotos
        const updatedPhotos = [...(p.projectPhotos || [])];
        for (let i = 0; i < updatedPhotos.length; i++) {
            if (updatedPhotos[i] && updatedPhotos[i].startsWith('data:')) {
                console.log(`Migrating photo ${i} to Storage...`);
                const photoId = (p.projectPhotoIds && p.projectPhotoIds[i]) || Math.random().toString(36).substr(2, 9);
                const path = `projects/${projectId}/gallery/${photoId}.jpg`;
                updatedPhotos[i] = await this.uploadImage(path, updatedPhotos[i]);
                needsFix = true;
            }
        }

        // 2. Scrub designLogs (notes)
        const updatedLogs = [...(p.designLogs || [])];
        for (let i = 0; i < updatedLogs.length; i++) {
            if (updatedLogs[i].attachment && updatedLogs[i].attachment?.startsWith('data:')) {
                console.log(`Migrating design log attachment ${i} to Storage...`);
                const path = `projects/${projectId}/notes/${updatedLogs[i].id}.jpg`;
                updatedLogs[i].attachment = await this.uploadImage(path, updatedLogs[i].attachment!);
                needsFix = true;
            }
        }

        if (needsFix) {
            const safeUpdates = deepCopySafe({
                projectPhotos: updatedPhotos,
                designLogs: updatedLogs
            });
            await updateDoc(projectRef, safeUpdates);
            console.log(`Successfully scrubbed and migrated project: ${projectId}`);

            // Trigger a local projects update
            const idx = this.projects.findIndex(proj => proj.id === projectId);
            if (idx !== -1) {
                this.projects[idx] = { ...this.projects[idx], ...safeUpdates };
            }
            this.notify();
        } else {
            console.log(`No base64 photos found in project: ${projectId}`);
        }
    }

    /**
     * Helper to estimate the size of a document in bytes (rough estimate)
     */
    private estimateDocumentSize(data: any): number {
        const str = JSON.stringify(data);
        return str.length; // Close enough for 1MB limit check
    }

    // --- Storage Helpers ---
    private async uploadImage(path: string, base64: string): Promise<string> {
        // If it's already a URL, return it
        if (!base64.startsWith('data:')) return base64;
        if (this.isDemoMode) return base64;

        const storageRef = ref(storage, path);
        await uploadString(storageRef, base64, 'data_url');
        return await getDownloadURL(storageRef);
    }

    private async deleteUploadedImage(url: string) {
        if (this.isDemoMode || !url || !url.startsWith('http')) return;
        try {
            const storageRef = ref(storage, url);
            await deleteObject(storageRef);
        } catch (err) {
            console.error("Error deleting orphaned image:", err);
        }
    }

    private async syncUserProfile(u: FirebaseUser) {
        try {
            try {
                await inventoryApi.ensureSecurityProfile();
            } catch (profileBootstrapError) {
                console.warn('Trusted UID profile bootstrap was unavailable; checking existing profile compatibility.', profileBootstrapError);
            }
            const userEmail = u.email ? u.email.toLowerCase().trim() : '';
            const authName = u.displayName ? u.displayName.toLowerCase().trim() : '';
            const usersRef = collection(db, 'users');

            const directDocRef = doc(db, 'users', u.uid);
            const directDocSnap = await getDoc(directDocRef);
            let directData: User | null = directDocSnap.exists() ? (directDocSnap.data() as User) : null;

            // Query all users in collection to find any matching legacy profile by email, name, authUid, or legacy IDs
            const allUsersSnap = await getDocs(usersRef);
            const matchingLegacyDocs: Array<{ id: string; data: User }> = [];

            allUsersSnap.docs.forEach(docSnap => {
                const d = docSnap.data() as User;
                const docEmail = (d.email || '').toLowerCase().trim();
                const docName = (d.name || '').toLowerCase().trim();

                const isEmailMatch = Boolean(userEmail && docEmail === userEmail);
                const isUidMatch = d.authUid === u.uid;
                const isLegacyIdMatch = Boolean(directData?.legacyProfileIds?.includes(docSnap.id) || d.legacyProfileIds?.includes(u.uid));
                const isNameMatch = Boolean(authName && docName && (docName === authName || docName.includes(authName) || authName.includes(docName)));

                if (isEmailMatch || isUidMatch || isLegacyIdMatch || isNameMatch) {
                    matchingLegacyDocs.push({ id: docSnap.id, data: d });
                }
            });

            // Find best legacy data (prefer doc with profilePhoto or setterColor)
            const legacyDoc = matchingLegacyDocs.find(m => m.data.profilePhoto || m.data.setterColor || (m.data.legacyProfileIds && m.data.legacyProfileIds.length > 0)) || matchingLegacyDocs[0];
            const legacyData = legacyDoc?.data;

            const allLegacyIds = Array.from(new Set([
                ...(directData?.legacyProfileIds || []),
                ...(legacyData?.legacyProfileIds || []),
                ...matchingLegacyDocs.map(m => m.id),
            ])).filter(id => id !== u.uid);

            const isOwnerEmail = userEmail === 'kilanimedia@gmail.com' || userEmail === 'harout@kilani.com';
            const finalRole = directData?.role || legacyData?.role || (isOwnerEmail ? Role.MANAGER : Role.SETTER);

            const mergedProfile: User = {
                ...(legacyData || {}),
                ...(directData || {}),
                id: u.uid,
                authUid: u.uid,
                legacyProfileIds: allLegacyIds,
                email: u.email || directData?.email || legacyData?.email || '',
                name: (directData?.name && !directData.name.includes('@')) ? directData.name : (legacyData?.name || u.displayName || (u.email ? u.email.split('@')[0] : 'User')),
                profilePhoto: directData?.profilePhoto || legacyData?.profilePhoto || undefined,
                setterColor: directData?.setterColor || legacyData?.setterColor || undefined,
                role: finalRole,
                active: directData?.active !== undefined ? directData.active : (legacyData?.active !== undefined ? legacyData.active : true)
            };

            await setDoc(directDocRef, deepCopySafe(mergedProfile), { merge: true });

            // Ensure legacy profile docs maintain authUid link
            for (const m of matchingLegacyDocs) {
                if (m.id !== u.uid) {
                    await setDoc(doc(db, 'users', m.id), { authUid: u.uid }, { merge: true }).catch(console.error);
                }
            }

            this.currentUser = mergedProfile;
        } catch (e) {
            console.error("Error fetching/creating user profile", e);
            if (!this.currentUser) {
                const userEmail = u.email ? u.email.toLowerCase().trim() : '';
                const isOwner = userEmail === 'kilanimedia@gmail.com' || userEmail === 'harout@kilani.com';
                this.currentUser = {
                    id: u.uid,
                    authUid: u.uid,
                    name: u.displayName || (u.email ? u.email.split('@')[0] : 'User'),
                    email: u.email || '',
                    role: isOwner ? Role.MANAGER : Role.SETTER,
                    active: true
                };
            }
        }
    }

    async init() {
        // Detect Secret Demo Trigger — #ZiziEdition or legacy /access/portal
        const isZiziEdition = window.location.hash === '#ZiziEdition' || window.location.hash.startsWith('#ZiziEdition');
        const isLegacyPortal = window.location.hash.includes('/access/portal') || window.location.search.includes('demo=true');

        if (isZiziEdition) {
            console.log("DEMO MODE ACTIVATED via ZiziEdition");
            this.enableDemoMode();
            this.notify();
            // Redirect to the premium demo portal
            window.location.replace(window.location.origin + window.location.pathname + '#/demo');
            return;
        }

        if (isLegacyPortal) {
            console.log("DEMO MODE ACTIVATED via legacy portal — redirecting to ZiziEdition");
            this.enableDemoMode();
            this.notify();
            window.location.replace(window.location.origin + window.location.pathname + '#/demo');
            return;
        }

        // Auth
        await new Promise<void>(resolve => {
            let resolved = false;
            onAuthStateChanged(auth, async (u) => {
                if (u) {
                    await this.syncUserProfile(u);
                    this.setupListeners();

                    // Automatically run notification migration if a Manager logs in
                    if (this.currentUser?.role === Role.MANAGER) {
                        this.runNotificationMigration()
                            .then(counts => {
                                if (counts.migratedCount > 0 || counts.copiesCreated > 0) {
                                    console.log('[MIGRATION] Notification migration completed:', counts);
                                }
                            })
                            .catch(err => console.error('[MIGRATION] Notification migration failed:', err));
                    }

                    // --- Emergency Patch for Large Projects ---
                    // Automatically find and scrub projects that might be approaching the 1MB limit (Managers & Designers only)
                    if (this.currentUser?.role === Role.MANAGER || this.currentUser?.role === Role.DESIGNER) {
                        setTimeout(() => {
                            const projectsWithBase64 = this.projects.filter(p =>
                                (p.projectPhotos || []).some(url => url && url.startsWith('data:')) ||
                                (p.designLogs || []).some(log => log.attachment && log.attachment.startsWith('data:'))
                            );

                            if (projectsWithBase64.length > 0) {
                                console.log(`Found ${projectsWithBase64.length} projects needing photo scrubbing...`);
                                projectsWithBase64.forEach(p => {
                                    this.scrubProjectPhotos(p.id).catch(err => console.error(`Scrub failed for ${p.id}:`, err));
                                });
                            }
                        }, 5000);
                    }
                } else {
                    this.currentUser = null;
                    this.clearListeners();
                }
                this.notify();
                if (!resolved) {
                    resolved = true;
                    resolve();
                }
            });
        });
    }

    private setupListeners() {
        if (this.unsubscribes.length > 0) return; // Already setup
        if (this.isDemoMode) return; // No listeners in demo mode

        // No inventory-bearing collection is globally subscribed. Setters receive
        // a sanitized, user-scoped context from the trusted backend instead.
        const publicCollections = ['users', 'projects'];

        publicCollections.forEach(col => {
            this.unsubscribes.push(onSnapshot(collection(db, col), (snap) => {
                const data = snap.docs.map(d => ({ ...d.data(), id: d.id }));
                if (col === 'users') {
                    this.users = data as User[];
                    if (this.currentUser) {
                        const updatedUser = this.users.find(u => u.id === this.currentUser!.id);
                        if (updatedUser) this.currentUser = updatedUser;
                    }
                }
                if (col === 'projects') {
                    this.projects = data as Project[];
                    const canRepairAssignments = this.currentUser?.role === Role.MANAGER || this.currentUser?.role === Role.DESIGNER;
                    const missing = canRepairAssignments ? this.projects.filter(p => !p.activeAssignees) : [];
                    if (missing.length > 0) {
                        missing.forEach(async p => {
                            const activeIds = (p.assignments || []).filter(a => a.active).map(a => a.userId);
                            if (!this.isDemoMode) {
                                try {
                                    await updateDoc(doc(db, 'projects', p.id), { activeAssignees: activeIds });
                                } catch (err) {
                                    console.error("Failed to repair activeAssignees for project:", p.id, err);
                                }
                            } else {
                                p.activeAssignees = activeIds;
                            }
                        });
                    }
                }
                this.notify();
            }, (error) => {
                console.error(`Error listening to ${col}:`, error);
            }));
        });

        if (this.currentUser?.role === Role.MANAGER) {
            ['bags', 'requests'].forEach(col => {
                this.unsubscribes.push(onSnapshot(collection(db, col), (snap) => {
                    const data = snap.docs.map(d => ({ ...d.data(), id: d.id }));
                    if (col === 'bags') this.bags = data as DiamondBag[];
                    if (col === 'requests') this.requests = data as IssueRequest[];
                    this.notify();
                }, error => console.error(`Error listening to Manager collection ${col}:`, error)));
            });
        }

        if (this.currentUser?.role === Role.MANAGER || this.currentUser?.role === Role.DESIGNER) {
            ['specs', 'bands', 'transactions'].forEach(col => {
                this.unsubscribes.push(onSnapshot(collection(db, col), (snap) => {
                    const data = snap.docs.map(d => ({ ...d.data(), id: d.id }));
                    if (col === 'specs') this.specs = data as DiamondSpec[];
                    if (col === 'bands') this.bands = data as DiamondPriceBand[];
                    if (col === 'transactions') this.transactions = data as ProjectTransaction[];
                    this.notify();
                }, error => console.error(`Error listening to restricted catalog ${col}:`, error)));
            });
        } else {
            void this.refreshPrivateInventoryContext();
            const contextTimer = window.setInterval(() => void this.refreshPrivateInventoryContext(), 30_000);
            this.unsubscribes.push(() => window.clearInterval(contextTimer));
        }

        // Collections restricted to Managers & Designers (unauthorized users get no raw inventory)
        if (this.currentUser?.role === Role.MANAGER || this.currentUser?.role === Role.DESIGNER) {
            const restrictedCollections = ['movements', 'weekly_reports', 'system_logs', 'diamond_transactions', 'diamonds'];
            restrictedCollections.forEach(col => {
                this.unsubscribes.push(onSnapshot(collection(db, col), (snap) => {
                    const data = snap.docs.map(d => ({ ...d.data(), id: d.id }));
                    if (col === 'movements') {
                        this.movements = data as InventoryMovement[];
                    }
                    if (col === 'weekly_reports') this.weeklyReports = data as WeeklyReportSnapshot[];
                    if (col === 'system_logs') this.systemLogs = data as SystemLog[];
                    if (col === 'diamond_transactions') this.diamondTransactions = data as DiamondLedgerTransaction[];
                    if (col === 'diamonds') this.diamonds = data as Diamond[];

                    this.notify();
                }, (error) => {
                    console.error(`Error listening to restricted collection ${col}:`, error);
                }));
            });
        } else {
            this.movements = [];
            this.weeklyReports = [];
            this.systemLogs = [];
            this.diamondTransactions = [];
            this.diamonds = [];
        }

        // Notifications query subscription: strictly constrained to current user's ID
        if (this.currentUser) {
            const currentUserId = this.currentUser.id;
            const notifQuery = query(collection(db, 'notifications'), where('userId', '==', currentUserId));
            this.unsubscribes.push(onSnapshot(notifQuery, (snap) => {
                this.notifications = snap.docs.map(d => ({ ...d.data(), id: d.id })) as AppNotification[];
                this.notify();
            }, (error) => {
                console.error("Error listening to user notifications:", error);
            }));
        } else {
            this.notifications = [];
        }

        if (this.currentUser?.role === Role.MANAGER || this.currentUser?.role === Role.DESIGNER) {
            this.unsubscribes.push(onSnapshot(doc(db, 'settings', 'global'), (snap) => {
                if (snap.exists()) {
                    const data = snap.data() as Partial<GlobalSettings>;
                    this.settings = {
                        ...this.settings,
                        ...data,
                        purityMapping: { ...this.settings.purityMapping, ...(data.purityMapping || {}) },
                        goldWidget: { ...this.settings.goldWidget, ...(data.goldWidget || {}) }
                    } as GlobalSettings;
                }
                this.notify();
            }, (error) => console.error("Error listening to settings:", error)));

            this.unsubscribes.push(onSnapshot(doc(db, 'settings', 'gold_price'), (snap) => {
                if (snap.exists()) this.liveGoldPrice = snap.data() as GoldPriceCache;
                this.notify();
            }, (error) => console.error("Error listening to gold_price:", error)));
        }

        // Evidence is Manager-only. New documents store an immutable Storage path;
        // download URLs are resolved only inside a Manager session.
        if (this.currentUser?.role === Role.MANAGER) {
            this.unsubscribes.push(onSnapshot(collection(db, 'evidence'), (snap) => {
                const evidence = snap.docs.map(d => ({ ...d.data(), id: d.id })) as EvidenceImage[];
                void Promise.all(evidence.map(async item => {
                    if (!item.storagePath) return item;
                    try {
                        const photoUrl = await getInventoryEvidenceUrl(item.storagePath);
                        return { ...item, photoUrl, thumbnailUrl: photoUrl };
                    } catch (error) {
                        console.error('Unable to resolve Manager evidence URL:', error);
                        return item;
                    }
                })).then(items => {
                    this.evidenceImages = items;
                    this.notify();
                });
            }, (error) => {
                console.error("Error listening to evidence:", error);
            }));
        } else {
            this.evidenceImages = [];
        }
    }

    async refreshPrivateInventoryContext() {
        if (this.isDemoMode || !this.currentUser || this.currentUser.role === Role.MANAGER || this.currentUser.role === Role.DESIGNER) return;
        try {
            const context = await inventoryApi.getMyContext();
            this.specs = context.specs;
            this.bags = context.bags;
            this.requests = context.requests;
            this.movements = [];
            this.diamondTransactions = [];
            this.notify();
        } catch (error) {
            console.error('Unable to refresh private inventory context:', error);
        }
    }

    private async repairSpecsStockCache() {
        const missing = this.specs.filter(s => s.pcs === undefined || s.ct === undefined);
        if (missing.length > 0) {
            console.error(`[INTEGRITY] ${missing.length} specs are missing authoritative balances. Phase 1 mutations remain blocked until bootstrap validation passes.`);
        }
    }

    private clearListeners() {
        this.unsubscribes.forEach(unsub => unsub());
        this.unsubscribes = [];
        this.evidenceImages.forEach(item => {
            if (item.photoUrl?.startsWith('blob:')) URL.revokeObjectURL(item.photoUrl);
        });
        this.evidenceImages = [];
    }

    subscribe(listener: () => void) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    notify() {
        this.listeners.forEach(l => l());
    }

    getSystemLogs() { return this.systemLogs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); }

    async addSystemLog(action: string, details: string) {
        if (!this.currentUser) return;
        const id = 'log-' + Math.random().toString(36).substr(2, 9);
        const log: SystemLog = {
            id,
            createdAt: now(),
            createdById: this.currentUser.id,
            action,
            details
        };
        await setDoc(doc(db, 'system_logs', id), deepCopySafe(log));
    }

    // --- Auth & User ---

    enableDemoMode() {
        this.isDemoMode = true;
        this.users = [...MOCK_USERS];
        this.projects = [...MOCK_PROJECTS];
        this.specs = [...MOCK_SPECS];
        this.bags = [...MOCK_BAGS];
        this.requests = [...MOCK_REQUESTS] as any;
        this.settings = { ...MOCK_SETTINGS };
        this.movements = []; // Start fresh
        this.diamondTransactions = [];
        this.evidenceImages = [];

        // Auto-populate some movements for the charts
        this.movements = [
            {
                id: 'mov-init-1',
                type: InventoryMovementType.SHIPMENT_IN,
                createdAt: now(),
                createdById: 'demo-system-1',
                lines: this.specs.map(s => ({ specId: s.id, pcs: 5000, ct: 5000 * s.ctPerStone }))
            }
        ];

        this.notify();
    }

    async demoLogin(role: Role) {
        if (!this.isDemoMode) return;

        const user = this.users.find(u => u.role === role);
        if (user) {
            this.currentUser = { ...user };
            this.notify();
        }
    }

    async login(email: string, password?: string) {
        if (this.isDemoMode) {
            const user = this.users.find(u => u.email === email);
            if (user) {
                this.currentUser = { ...user };
                this.notify();
                return this.currentUser;
            }
            throw new Error("Demo User not found");
        }
        if (!password) throw new Error("Password required");
        try {
            const cred = await signInWithEmailAndPassword(auth, email, password);
            await this.syncUserProfile(cred.user);
            return this.currentUser;
        } catch (e: any) {
            console.error("Firebase Login Error:", e);
            if (e.code === 'auth/network-request-failed') {
                throw new Error("Network error: Firebase could not be reached. Please check your internet connection or ensure the domain is whitelisted in Firebase Console.");
            }
            throw e;
        }
    }

    async logout() {
        if (this.isDemoMode) {
            this.currentUser = null;
            this.notify();
            return;
        }
        await signOut(auth);
        this.currentUser = null;
        this.notify();
    }

    getCurrentUser() { return this.currentUser; }
    getUsers() { return this.users; }
    getUser(id: string) { return this.users.find(u => u.id === id); }

    async createUser(user: User) {
        // Handle Sales Reps separately (No Auth)
        if (user.role === Role.SALES_REP) {
            const id = user.id.startsWith('temp-') || !user.id ? 'rep-' + Math.random().toString(36).substr(2, 9) : user.id;
            // Clean user object - remove password
            const { password, ...safeUser } = user;
            const finalUser = deepCopySafe({ ...safeUser, id });
            await setDoc(doc(db, 'users', id), finalUser);
            return;
        }

        // Handle Staff (Requires Firebase Auth)
        if (!user.password) throw new Error("Password is required for staff accounts.");

        // Use a secondary app instance to avoid logging out the current admin
        let secondaryApp: FirebaseApp | null = null;
        try {
            secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
            const secondaryAuth = getAuth(secondaryApp);

            const cred = await createUserWithEmailAndPassword(secondaryAuth, user.email, user.password);
            const uid = cred.user.uid;

            // Immediately sign out from secondary to be safe
            await signOut(secondaryAuth);

            // Create Firestore Document using the Auth UID
            const { password, ...safeUser } = user;
            const finalUser = { ...safeUser, id: uid };

            const safeFinalUser = deepCopySafe(finalUser);
            await setDoc(doc(db, 'users', uid), safeFinalUser);

        } catch (e: any) {
            console.error("Error creating user:", e);
            if (e.code === 'auth/email-already-in-use') {
                throw new Error('This email is already registered.');
            }
            throw e;
        } finally {
            if (secondaryApp) {
                await deleteApp(secondaryApp);
            }
        }
    }

    async updateUser(user: User) {
        const { password, ...safeUser } = user;
        const safeFinalUser = deepCopySafe({ ...safeUser });
        await updateDoc(doc(db, 'users', user.id), safeFinalUser);
    }

    async deleteUser(id: string) {
        // Note: This only deletes from Firestore. 
        // Deleting from Auth requires Admin SDK or user context.
        // For client-side, consider using an 'active: false' flag instead.
        await deleteDoc(doc(db, 'users', id));
    }

    async updateCurrentUserProfile(data: Partial<User>) {
        if (!this.currentUser) return;

        const authUser = auth.currentUser;
        if (authUser) {
            if (data.email && data.email !== authUser.email) {
                await updateEmail(authUser, data.email);
            }
            if (data.password && data.password.trim() !== '') {
                await updatePassword(authUser, data.password);
            }
        }

        const updated = { ...this.currentUser, ...data };
        await this.updateUser(updated);
    }

    validatePassword(pass: string) {
        if (pass.length < 6) return "Password must be at least 6 characters";
        return null;
    }

    async requestPasswordReset(email: string) {
        await sendPasswordResetEmail(auth, email);
    }

    async completeOnboarding(userId: string) {
        const u = this.getUser(userId);
        if (u) await this.updateUser({ ...u, onboarding: { ...u.onboarding, needsOnboarding: false, completedAt: now() } });
    }

    async skipOnboarding(userId: string) {
        const u = this.getUser(userId);
        if (u) await this.updateUser({ ...u, onboarding: { ...u.onboarding, needsOnboarding: false, skippedAt: now() } });
    }

    // --- Notifications ---

    getNotifications(userId: string) {
        return this.notifications
            .filter(n => n.userId === userId && !n.isArchived)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    async sendNotification(
        userId: string,
        title: string,
        message: string,
        type: NotificationType,
        link?: string,
        customId?: string,
        relatedProjectId?: string,
        metadata?: Record<string, any>
    ) {
        const id = customId || 'notif-' + Math.random().toString(36).substr(2, 9);
        const notification: AppNotification = {
            id,
            userId,
            eventType: type,
            projectId: relatedProjectId || metadata?.projectId || undefined,
            requestId: metadata?.requestId || undefined,
            bagId: metadata?.bagId || undefined,
            title,
            message,
            createdById: this.currentUser?.id || 'SYSTEM',
            createdAt: now(),
            isRead: false,
            readAt: null,
            isArchived: false,
            archivedAt: null,

            // Legacy Compatibility
            type,
            read: false,
            link,
            relatedProjectId,
            metadata
        };
        const safeNotification = deepCopySafe(notification);
        if (this.isDemoMode) {
            const idx = this.notifications.findIndex(n => n.id === id);
            if (idx !== -1) {
                this.notifications[idx] = safeNotification;
            } else {
                this.notifications.push(safeNotification);
            }
            this.notify();
            return;
        }
        try {
            await setDoc(doc(db, 'notifications', id), safeNotification);
        } catch (err) {
            const projectId = relatedProjectId || metadata?.projectId || link?.match(/^\/project\/([^/?#]+)/)?.[1];
            const trustedProjectTypes: NotificationType[] = ['ASSIGNMENT', 'HANDOFF', 'MENTION', 'STATUS_UPDATE'];
            if (projectId && trustedProjectTypes.includes(type)) {
                const callable = httpsCallable(functions, 'createProjectNotification');
                await callable({
                    operationId: customId || crypto.randomUUID(),
                    projectId,
                    targetUserId: userId,
                    title,
                    message,
                    type,
                });
                return;
            }
            console.warn(`[NOTIFICATIONS] Notification was rejected by Firestore and has no trusted project fallback: ${id}`, err);
        }
    }

    async markNotificationRead(id: string) {
        if (this.isDemoMode) {
            const n = this.notifications.find(notif => notif.id === id);
            if (n) {
                n.isRead = true;
                n.read = true;
                n.readAt = now();
                this.notify();
            }
            return;
        }
        const safeUpdates = deepCopySafe({ isRead: true, read: true, readAt: now() });
        await updateDoc(doc(db, 'notifications', id), safeUpdates);
    }

    async markAllNotificationsRead(userId: string) {
        if (this.isDemoMode) {
            this.notifications.forEach(n => {
                if (n.userId === userId) {
                    n.isRead = true;
                    n.read = true;
                    n.readAt = now();
                }
            });
            this.notify();
            return;
        }
        const unread = this.notifications.filter(n => n.userId === userId && !n.isRead);
        const safeUpdates = deepCopySafe({ isRead: true, read: true, readAt: now() });
        const batchPromises = unread.map(n => updateDoc(doc(db, 'notifications', n.id), safeUpdates));
        await Promise.all(batchPromises);
    }

    async deleteNotification(id: string) {
        if (this.isDemoMode) {
            this.notifications = this.notifications.filter(n => n.id !== id);
            this.notify();
            return;
        }
        // Security hardening: Normal clients cannot permanently delete notification records.
        // Refactored to an archive operation.
        const safeUpdates = deepCopySafe({ isArchived: true, archivedAt: now() });
        await updateDoc(doc(db, 'notifications', id), safeUpdates);
        this.notifications = this.notifications.filter(n => n.id !== id);
        this.notify();
    }

    async runNotificationMigration() {
        if (this.isDemoMode) {
            return { auditedCount: 0, migratedCount: 0, copiesCreated: 0, ambiguousCount: 0 };
        }

        const notifsSnap = await getDocs(collection(db, 'notifications'));
        let auditedCount = 0;
        let migratedCount = 0;
        let copiesCreated = 0;
        let ambiguousCount = 0;

        const batch = writeBatch(db);
        const allUsers = this.getUsers();

        for (const d of notifsSnap.docs) {
            const n = d.data() as any;
            auditedCount++;

            // 1. Role-wide notifications without a specific userId
            if (n.role && !n.userId) {
                const targetUsers = allUsers.filter(u => u.role === n.role && u.active);
                if (targetUsers.length > 0) {
                    targetUsers.forEach(user => {
                        const newId = `notif-mig-${n.id}-${user.id}`;
                        const copy = {
                            ...n,
                            id: newId,
                            userId: user.id,
                            eventType: n.eventType || n.type || 'SYSTEM',
                            projectId: n.projectId || n.relatedProjectId || null,
                            createdById: n.createdById || 'SYSTEM',
                            isRead: n.read || false,
                            readAt: n.read ? n.createdAt : null,
                            isArchived: false,
                            archivedAt: null,
                            // legacy compatibility
                            type: n.type || 'SYSTEM',
                            read: n.read || false,
                            relatedProjectId: n.relatedProjectId || null,
                        };
                        delete copy.role; // Remove role field
                        batch.set(doc(db, 'notifications', newId), copy);
                        copiesCreated++;
                    });

                    // Archive original legacy document
                    batch.update(doc(db, 'notifications', n.id), {
                        userId: 'MIGRATED_LEGACY_ROLE',
                        isRead: true,
                        read: true,
                        isArchived: true,
                        archivedAt: now(),
                        metadata: {
                            migrated: true,
                            originalRole: n.role,
                            targetCount: targetUsers.length
                        },
                        role: deleteField()
                    });
                    migratedCount++;
                } else {
                    // Ambiguous: Role has no active users
                    batch.update(doc(db, 'notifications', n.id), {
                        userId: 'AMBIGUOUS_LEGACY_ROLE',
                        isArchived: true,
                        archivedAt: now(),
                        metadata: {
                            ambiguous: true,
                            reason: `No active users found for role: ${n.role}`
                        },
                        role: deleteField()
                    });
                    ambiguousCount++;
                }
            }
            // 2. Individual notifications missing standardized fields
            else if (n.userId && (!('isRead' in n) || !('eventType' in n) || !('createdById' in n) || !('isArchived' in n))) {
                const updates: any = {};
                if (!('isRead' in n)) {
                    updates.isRead = n.read || false;
                    updates.readAt = n.read ? n.createdAt : null;
                }
                if (!('isArchived' in n)) {
                    updates.isArchived = false;
                    updates.archivedAt = null;
                }
                if (!('eventType' in n)) {
                    updates.eventType = n.type || 'SYSTEM';
                }
                if (!('createdById' in n)) {
                    updates.createdById = n.metadata?.createdById || 'SYSTEM';
                }
                if (!('projectId' in n) && n.relatedProjectId) {
                    updates.projectId = n.relatedProjectId;
                }
                batch.update(doc(db, 'notifications', n.id), updates);
                migratedCount++;
            }
        }

        if (migratedCount > 0 || copiesCreated > 0 || ambiguousCount > 0) {
            await batch.commit();
            await this.addSystemLog('MIGRATION', `Completed notification schema migration: Audited: ${auditedCount}, Migrated: ${migratedCount}, Copies Created: ${copiesCreated}, Ambiguous: ${ambiguousCount}.`);
        }

        return { auditedCount, migratedCount, copiesCreated, ambiguousCount };
    }


    async runLedgerAuditAndNotify() {
        // 1. Check for negative stocks
        const summary = this.getInventorySummary();
        const managers = this.getUsers().filter(u => u.role === Role.MANAGER);

        for (const item of summary) {
            if (item.pcs < 0) {
                const specLabel = item.spec.label || item.spec.id;
                const todayStr = new Date().toISOString().split('T')[0];
                for (const m of managers) {
                    const notifId = `notif-negstock-${item.spec.id}-${todayStr}-${m.id}`;
                    await this.sendNotification(
                        m.id,
                        'Urgent: Negative Stock',
                        `Negative closing balance detected for ${specLabel}: ${item.pcs} pcs.`,
                        'SYSTEM',
                        '/reports',
                        notifId
                    );
                }
            }
        }
    }

    // --- Projects ---

    getProjects() { return this.projects; }
    getProject(id: string) { return this.projects.find(p => p.id === id); }
    getServiceNames(project: Project) {
        return [getProjectServiceLabel(project)];
    }

    getCanonicalServiceCode(project: Project) {
        return getCanonicalServiceCode(project);
    }

    isRepairProject(project: Project) {
        return !!project.repair || !!project.repairDetails || !!project.isQuickRepair || getCanonicalServiceCode(project) === 'REPAIR';
    }

    getRepairDetails(project: Project): RepairDetailsV2 | null {
        if (project.repair) {
            return {
                ...project.repair,
                status: project.repair.status || RepairStatus.INTAKE,
                submittedDate: project.repair.submittedDate || project.createdAt,
                financials: project.repair.financials || {}
            };
        }

        if (!project.repairDetails && !project.isQuickRepair) return null;

        const legacyStatus = project.status === ProjectStatus.CLOSED
            ? RepairStatus.COMPLETED
            : project.status === ProjectStatus.REVIEW
                ? RepairStatus.READY_FOR_PICKUP
                : RepairStatus.IN_PROGRESS;

        return {
            type: RepairType.DIAMOND_SETTING,
            status: legacyStatus,
            submittedDate: project.repairDetails?.date || project.createdAt,
            completedDate: project.date_completed || project.date_picked_up,
            issueNotes: project.repairDetails?.report || project.workDetails || '',
            repairNotes: project.repairDetails?.report || '',
            diamondItems: project.repairDetails?.items || [],
            financials: {
                clientChargeCad: 0,
                noCharge: false
            }
        };
    }

    getRepairCostSummary(projectId: string): RepairCostSummary {
        const p = this.getProject(projectId);
        const repair = p ? this.getRepairDetails(p) : null;
        const financials = repair?.financials || {};
        const labourCostCad = Number(financials.labourCostCad || 0);
        const goldUsedG = Number(financials.goldUsedG || 0);
        const goldCostCad = Number(financials.goldCostCad || 0);
        const diamondPieces = Number(financials.diamondPieces || 0);
        const diamondCarats = Number(financials.diamondCarats || 0);
        const diamondCostCad = Number(financials.diamondCostCad || 0);
        const outsourcedCostCad = Number(financials.outsourcedCostCad || 0);
        const materialCostCad = Number(financials.materialCostCad || 0);
        const noCharge = !!financials.noCharge;
        const finalClientChargeCad = noCharge ? 0 : Number(financials.clientChargeCad || 0);
        const totalInternalCostCad = labourCostCad + goldCostCad + diamondCostCad + outsourcedCostCad + materialCostCad;

        return {
            isRepair: !!repair,
            repairType: repair?.type,
            repairStatus: repair?.status,
            totalInternalCostCad,
            finalClientChargeCad,
            profitLossCad: finalClientChargeCad - totalInternalCostCad,
            noCharge,
            noChargeReason: financials.noChargeReason,
            labourCostCad,
            goldUsedG,
            goldCostCad,
            diamondPieces,
            diamondCarats,
            diamondCostCad,
            outsourcedCostCad,
            materialCostCad,
            outsourced: !!repair?.outsourced || outsourcedCostCad > 0
        };
    }

    async createProject(project: Partial<Project>, assigneeIds: string[]) {
        requireCreatableService(project.services);
        const id = 'proj-' + Math.random().toString(36).substr(2, 9);
        const assignments = assigneeIds.map(uid => ({ userId: uid, assignedAt: now(), active: true }));

        let ratioSnapshot = 0;
        const purityKey = project.goldPurity || '';
        if (this.settings.purityMapping && this.settings.purityMapping[purityKey]) {
            ratioSnapshot = this.settings.purityMapping[purityKey];
        }

        const newProject: Project = {
            id,
            createdAt: now(),
            status: ProjectStatus.ACTIVE,
            currentStageName: 'Intake',
            currentPercentComplete: 10,
            services: [createCanonicalService('CUSTOM_MAKE')],
            progress: [],
            goldPurityRatioSnapshot: ratioSnapshot,
            ...project as any,
            assignments, // MUST be after spread to prevent overwrite
            activeAssignees: assigneeIds,
        };

        // Sync legacy assignedSetterId for backward compatibility
        const firstSetter = assigneeIds.find(uid => {
            const u = this.getUser(uid);
            return u && (u.role === Role.SETTER || u.role === Role.JEWELLER);
        });
        if (firstSetter) {
            newProject.assignedSetterId = firstSetter;
        }

        if (this.isDemoMode) {
            this.projects.push(newProject);
            this.notify();
            return newProject;
        }

        const safeProject = deepCopySafe(newProject);
        await setDoc(doc(db, 'projects', id), safeProject);

        // Validate assignment was saved
        const savedAssignees = (newProject.assignments || []).filter(a => a.active).map(a => a.userId);
        const missingAssignees = assigneeIds.filter(uid => !savedAssignees.includes(uid));
        if (missingAssignees.length > 0) {
            console.error('[ASSIGNMENT INTEGRITY] Missing assignees after createProject:', missingAssignees, 'for project:', id);
        }

        // Notify Assignees
        for (const userId of assigneeIds) {
            this.sendNotification(userId, 'New Assignment', `You have been assigned to ${newProject.code}`, 'ASSIGNMENT', `/project/${id}`);
        }

        return newProject;
    }

    private async prepareRepairImages(projectId: string, repair?: RepairDetailsV2): Promise<RepairDetailsV2 | undefined> {
        if (!repair) return undefined;
        const prepared: RepairDetailsV2 = {
            ...repair,
            financials: repair.financials || {}
        };

        if (prepared.beforeImage && prepared.beforeImage.startsWith('data:')) {
            prepared.beforeImage = await this.uploadImage(`projects/${projectId}/repair/before.jpg`, prepared.beforeImage);
        }
        if (prepared.afterImage && prepared.afterImage.startsWith('data:')) {
            prepared.afterImage = await this.uploadImage(`projects/${projectId}/repair/after.jpg`, prepared.afterImage);
        }

        return prepared;
    }

    async createRepairProject(project: Partial<Project>, assigneeIds: string[]) {
        const repairStatus = project.repair?.status || RepairStatus.INTAKE;
        const serviceStatus = repairStatus === RepairStatus.COMPLETED
            ? 'COMPLETED'
            : repairStatus === RepairStatus.INTAKE
                ? 'PENDING'
                : 'IN_PROGRESS';

        const repairProject = {
            ...project,
            status: repairStatus === RepairStatus.READY_FOR_PICKUP
                ? ProjectStatus.REVIEW
                : (repairStatus === RepairStatus.COMPLETED || repairStatus === RepairStatus.CANCELLED)
                    ? ProjectStatus.CLOSED
                    : ProjectStatus.ACTIVE,
            date_completed: repairStatus === RepairStatus.READY_FOR_PICKUP || repairStatus === RepairStatus.COMPLETED ? now() : undefined,
            date_picked_up: repairStatus === RepairStatus.COMPLETED || repairStatus === RepairStatus.CANCELLED ? now() : undefined,
            priority: project.priority || Priority.NORMAL,
            dueDate: project.dueDate || new Date().toISOString().split('T')[0],
            services: [createCanonicalService('REPAIR', serviceStatus as 'PENDING' | 'IN_PROGRESS' | 'COMPLETED')],
            currentStageName: repairStatus,
            currentPercentComplete: repairStatus === RepairStatus.INTAKE ? 10 : repairStatus === RepairStatus.COMPLETED ? 100 : 50,
            designStage: 'Ready for Production',
            repair: {
                type: project.repair?.type || RepairType.GENERAL,
                status: repairStatus,
                submittedDate: project.repair?.submittedDate || new Date().toISOString().split('T')[0],
                financials: {},
                ...project.repair
            }
        } as Partial<Project>;

        const created = await this.createProject(repairProject, assigneeIds);
        if (created?.repair) {
            const preparedRepair = await this.prepareRepairImages(created.id, created.repair);
            if (preparedRepair !== created.repair) {
                await this.updateRepairDetails(created.id, preparedRepair!);
                return { ...created, repair: preparedRepair };
            }
        }
        return created;
    }

    async updateRepairDetails(projectId: string, repair: RepairDetailsV2) {
        const p = this.getProject(projectId);
        if (!p) return;
        const preparedRepair = await this.prepareRepairImages(projectId, repair);

        const safeUpdates = deepCopySafe({ repair: preparedRepair });
        if (this.isDemoMode) {
            const idx = this.projects.findIndex(proj => proj.id === projectId);
            if (idx !== -1) {
                this.projects[idx] = { ...this.projects[idx], ...safeUpdates };
                this.notify();
            }
            return;
        }

        await updateDoc(doc(db, 'projects', projectId), safeUpdates);
    }

    async updateRepairStatus(projectId: string, status: RepairStatus, userId: string) {
        const p = this.getProject(projectId);
        if (!p) return;

        const currentRepair = this.getRepairDetails(p) || {
            type: RepairType.GENERAL,
            status: RepairStatus.INTAKE,
            submittedDate: p.createdAt,
            financials: {}
        };
        const updatedRepair: RepairDetailsV2 = {
            ...currentRepair,
            status,
            completedDate: status === RepairStatus.COMPLETED ? now() : currentRepair.completedDate
        };

        const serviceStatus = status === RepairStatus.COMPLETED
            ? 'COMPLETED'
            : status === RepairStatus.INTAKE
                ? 'PENDING'
                : 'IN_PROGRESS';

        const normalizedServices = [{
            ...createCanonicalService('REPAIR', serviceStatus as 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'),
            updatedAt: now(),
            updatedBy: userId,
        }];

        const progressEntry = {
            id: Math.random().toString(),
            projectId,
            createdById: userId,
            createdAt: now(),
            stageName: status,
            percentComplete: status === RepairStatus.COMPLETED ? 100 : status === RepairStatus.READY_FOR_PICKUP ? 90 : 50,
            weightG: 0
        };

        const updates: any = {
            repair: updatedRepair,
            services: normalizedServices,
            currentStageName: status,
            currentPercentComplete: progressEntry.percentComplete,
            last_status_change_at: now(),
            last_status_change_by: userId,
            progress: [...(p.progress || []), progressEntry]
        };

        if (status === RepairStatus.READY_FOR_PICKUP) {
            updates.status = ProjectStatus.REVIEW;
            updates.date_completed = now();
        }
        if (status === RepairStatus.COMPLETED) {
            updates.status = ProjectStatus.CLOSED;
            updates.date_completed = p.date_completed || now();
            updates.date_picked_up = now();
        }
        if (status === RepairStatus.CANCELLED) {
            updates.status = ProjectStatus.CLOSED;
            updates.date_picked_up = now();
        }

        const safeUpdates = deepCopySafe(updates);
        if (this.isDemoMode) {
            const idx = this.projects.findIndex(proj => proj.id === projectId);
            if (idx !== -1) {
                this.projects[idx] = { ...this.projects[idx], ...safeUpdates };
                this.notify();
            }
            return;
        }

        await updateDoc(doc(db, 'projects', projectId), safeUpdates);
    }

    async logQuickRepair(repairData: Partial<Project>) {
        const id = 'rep-' + Math.random().toString(36).substr(2, 9);
        const code = 'REP-' + (Math.floor(Math.random() * 900000) + 100000).toString();

        const newProject: Project = {
            id,
            code,
            createdAt: now(),
            status: ProjectStatus.CLOSED,
            isQuickRepair: true,
            priority: Priority.NORMAL,
            dueDate: now(),
            pieceName: 'Repair Log',
            services: [createCanonicalService('REPAIR', 'COMPLETED')],
            progress: [],
            assignments: [],
            currentStageName: 'Complete',
            currentPercentComplete: 0,
            ...repairData as any,
        };

        const safeProject = deepCopySafe(newProject);
        await setDoc(doc(db, 'projects', id), safeProject);

        // System Log
        this.addSystemLog('PROJECT', `Quick Repair logged: ${code}`);

        return newProject;
    }

    async deleteProject(id: string) {
        await deleteDoc(doc(db, 'projects', id));
    }

    async updateProject(project: Project) {
        const existing = this.getProject(project.id);
        if (existing && existing.status !== project.status) {
            // Notify assigned users about status change
            const currentUser = this.getCurrentUser();
            const activeUsers = (project.assignments || []).filter(a => a.active).map(a => a.userId);
            for (const uid of activeUsers) {
                if (uid !== currentUser?.id) {
                    this.sendNotification(uid, 'Status Updated', `Project ${project.code} status changed to ${project.status}`, 'STATUS_UPDATE', `/project/${project.id}`);
                }
            }
        }
        if (this.isDemoMode) {
            const idx = this.projects.findIndex(p => p.id === project.id);
            if (idx !== -1) {
                this.projects[idx] = { ...project };
                this.notify();
            }
            return;
        }
        const safeProject = deepCopySafe(project);
        await updateDoc(doc(db, 'projects', project.id), safeProject);
    }

    async reviseProjectDetails(payload: ProjectRevisionPayload) {
        if (this.isDemoMode) {
            const project = this.getProject(payload.projectId);
            if (!project) throw new Error('Project was not found.');
            if (project.status === ProjectStatus.CLOSED || project.date_picked_up) throw new Error('Picked Up projects are permanently read-only.');
            if (!payload.reason.trim()) throw new Error('A reason is required.');
            if (payload.kind === 'INSTRUCTIONS') {
                if ((project.instructionRevisionVersion || 0) !== payload.expectedVersion || (project.workDetails || '') !== payload.expectedInstructions) {
                    throw new Error('Instructions changed after this screen loaded. Refresh and try again.');
                }
                project.workDetails = payload.instructions;
                project.instructionRevisionVersion = payload.expectedVersion + 1;
            } else {
                if ((project.metalRevisionVersion || 0) !== payload.expectedVersion
                    || (project.goldType || project.goldComponents?.[0]?.type || '') !== payload.expectedMetal
                    || (project.goldPurity || project.goldComponents?.[0]?.purity || '') !== payload.expectedPurity) {
                    throw new Error('Metal information changed after this screen loaded. Refresh and try again.');
                }
                project.goldType = payload.metal as Project['goldType'];
                project.goldPurity = payload.purity;
                project.goldComponents = project.goldComponents?.length
                    ? project.goldComponents.map((component, index) => index === 0 ? { ...component, type: payload.metal, purity: payload.purity } : component)
                    : [{ id: 'legacy-component', label: 'Main Piece', type: payload.metal, purity: payload.purity }];
                project.metalRevisionVersion = payload.expectedVersion + 1;
            }
            this.notify();
            return { projectId: payload.projectId, revisionId: payload.operationId, kind: payload.kind, version: payload.expectedVersion + 1 };
        }
        return reviseProjectDetails(payload);
    }

    async getProjectRevisions(projectId: string): Promise<ProjectRevision[]> {
        if (this.isDemoMode) return [];
        return fetchProjectRevisions(projectId);
    }

    async reviseMetalComponent(input: Omit<Parameters<typeof phase5Api.reviseMetalComponent>[0], 'operationId'>) {
        return phase5Api.reviseMetalComponent({ ...input, operationId: newOperationId() });
    }

    async confirmInternalCastingCost(projectId: string, revisionId: string, supplierRateCentsPerGram: number) {
        return phase5Api.confirmInternalCastingCost({ operationId: newOperationId(), projectId, revisionId, supplierRateCentsPerGram });
    }

    async correctInternalCastingCost(projectId: string, revisionId: string, castingWeightMg: number, supplierRateCentsPerGram: number, reason: string) {
        return phase5Api.correctInternalCastingCost({ operationId: newOperationId(), projectId, revisionId, castingWeightMg, supplierRateCentsPerGram, reason });
    }

    async recordFinalComponentWeights(projectId: string, weights: Array<{ revisionId: string; weightMg: number }>) {
        return phase5Api.recordFinalComponentWeights({ operationId: newOperationId(), projectId, weights });
    }

    async assignUser(projectId: string, userId: string) {
        const p = this.getProject(projectId);
        if (!p) return;
        const assignments = p.assignments || [];
        const exists = assignments.some(a => a.userId === userId && a.active);
        let newAssignments;
        if (exists) {
            newAssignments = assignments.map(a => a.userId === userId ? { ...a, active: false } : a);
        } else {
            newAssignments = [...assignments, { userId, assignedAt: now(), active: true }];
            // Notify the newly assigned user
            this.sendNotification(userId, 'New Assignment', `You have been assigned to ${p.code}`, 'ASSIGNMENT', `/project/${projectId}`);
        }
        const safeAssignments = deepCopySafe(newAssignments);

        // Sync legacy assignedSetterId
        const activeIds = newAssignments.filter(a => a.active).map(a => a.userId);
        const updatePayload: any = { assignments: safeAssignments, activeAssignees: activeIds };
        const user = this.getUser(userId);
        if (user && (user.role === Role.SETTER || user.role === Role.JEWELLER)) {
            if (exists) {
                // User was unassigned — find next active setter/jeweller
                const nextSetter = newAssignments.find(a => a.active && (() => { const u = this.getUser(a.userId); return u && (u.role === Role.SETTER || u.role === Role.JEWELLER); })());
                updatePayload.assignedSetterId = nextSetter ? nextSetter.userId : null;
            } else {
                updatePayload.assignedSetterId = userId;
            }
        }

        await updateDoc(doc(db, 'projects', projectId), updatePayload);
    }
    async handoffProject(projectId: string, fromUserId: string, toUserId: string, note: string, weight: number) {
        if (this.isDemoMode) return;
        await handoffProjectTrusted({
            operationId: crypto.randomUUID(),
            projectId,
            targetUserId: toUserId,
            note,
            weightG: weight,
        });
    }

    // --- Assignment Integrity Check (run on login) ---
    verifyAssignmentIntegrity(userId: string): { ok: boolean; issues: string[] } {
        const issues: string[] = [];
        const user = this.getUser(userId);
        if (!user) return { ok: false, issues: ['User not found: ' + userId] };

        // Check for projects where user is in legacy field but NOT in assignments[]
        const legacyProjects = this.projects.filter(p =>
            p.assignedSetterId === userId &&
            !(p.assignments || []).some(a => a.userId === userId && a.active)
        );
        for (const p of legacyProjects) {
            issues.push(`Project ${p.code}: user in legacy assignedSetterId but NOT in assignments[] — auto-repairing`);
            // Auto-repair: add to assignments
            const newAssignment = { userId, assignedAt: now(), active: true };
            p.assignments = [...(p.assignments || []), newAssignment];
            const activeIds = p.assignments.filter(a => a.active).map(a => a.userId);
            updateDoc(doc(db, 'projects', p.id), { assignments: deepCopySafe(p.assignments), activeAssignees: activeIds })
                .catch(err => console.error('[ASSIGNMENT REPAIR FAILED]', p.id, err));
        }

        // Check for projects where user is in assignments[] but legacy field points elsewhere
        const assignedProjects = this.projects.filter(p =>
            (p.assignments || []).some(a => a.userId === userId && a.active)
        );
        for (const p of assignedProjects) {
            if (p.assignedSetterId && p.assignedSetterId !== userId &&
                (user.role === Role.SETTER || user.role === Role.JEWELLER)) {
                // Only warn — don't auto-fix since multiple users can be assigned
                const legacyUser = this.getUser(p.assignedSetterId);
                issues.push(`Project ${p.code}: legacy assignedSetterId points to ${legacyUser?.name || p.assignedSetterId}, not current user`);
            }
        }

        if (issues.length > 0) {
            console.warn(`[ASSIGNMENT INTEGRITY CHECK for ${user.name}]`, issues);
        } else {
            console.log(`[ASSIGNMENT INTEGRITY CHECK for ${user.name}] ✓ All assignments consistent`);
        }

        return { ok: issues.length === 0, issues };
    }

    async addProgress(progress: any) {
        const p = this.getProject(progress.projectId);
        if (!p) return;

        if (this.isDemoMode) {
            const safeProgress = deepCopySafe(progress);
            const newProgress = [...(p.progress || []), safeProgress];
            const updates: any = { progress: newProgress };
            if (progress.stageName && progress.stageName !== 'Handoff') {
                updates.currentStageName = progress.stageName;
                updates.currentPercentComplete = progress.percentComplete;
            }
            const idx = this.projects.findIndex(proj => proj.id === p.id);
            if (idx !== -1) {
                this.projects[idx] = { ...this.projects[idx], ...updates };
                this.notify();
            }
            return;
        }

        // PROACTIVE SIZE CHECK
        // If the project document is getting too large, run an emergency scrub
        const currentSize = this.estimateDocumentSize(p);
        if (currentSize > 800000) { // 800KB threshold
            console.log(`[SIZE WATCH] Project ${p.id} is large (${currentSize} bytes). Running emergency scrub.`);
            try {
                await this.scrubProjectPhotos(p.id);
                // Refresh project data after scrub to get accurate progress array
                const refreshed = this.getProject(p.id);
                if (refreshed) {
                    const safeProgress = deepCopySafe(progress);
                    const newProgress = [...(refreshed.progress || []), safeProgress];
                    const updates: any = { progress: newProgress };
                    if (progress.stageName && progress.stageName !== 'Handoff') {
                        updates.currentStageName = progress.stageName;
                        updates.currentPercentComplete = progress.percentComplete;
                    }
                    await updateDoc(doc(db, 'projects', p.id), deepCopySafe(updates));
                    return;
                }
            } catch (scrubError) {
                console.error('[SIZE WATCH] Emergency scrub failed:', scrubError);
            }
        }

        const safeProgress = deepCopySafe(progress);
        const newProgress = [...(p.progress || []), safeProgress];

        const updates: any = { progress: newProgress };
        if (progress.stageName && progress.stageName !== 'Handoff') {
            updates.currentStageName = progress.stageName;
            updates.currentPercentComplete = progress.percentComplete;
        }

        try {
            const safeUpdates = deepCopySafe(updates);
            await updateDoc(doc(db, 'projects', p.id), safeUpdates);
        } catch (e: any) {
            // If it still fails due to size, try one last scrub
            if (e.message?.includes('maximum allowed size') || e.code === 'invalid-argument') {
                console.error('[SIZE ERROR] Write failed. Attempting final emergency scrub.');
                await this.scrubProjectPhotos(p.id);
                const refreshed = this.getProject(p.id);
                if (refreshed) {
                    const lastAttemptProgress = [...(refreshed.progress || []), deepCopySafe(progress)];
                    await updateDoc(doc(db, 'projects', p.id), deepCopySafe({ ...updates, progress: lastAttemptProgress }));
                    return;
                }
            }
            throw e;
        }
    }

    async addProjectNote(note: ProjectNote) {
        const p = this.getProject(note.projectId);
        if (!p) return;

        const updatedNote = { ...note };
        if (note.attachment && note.attachment.startsWith('data:image')) {
            const path = `projects/${note.projectId}/notes/${note.id}.jpg`;
            updatedNote.attachment = await this.uploadImage(path, note.attachment);
        }

        if (this.isDemoMode) {
            const idx = this.projects.findIndex(proj => proj.id === p.id);
            if (idx !== -1) {
                const logs = [...(this.projects[idx].designLogs || []), updatedNote];
                this.projects[idx] = { ...this.projects[idx], designLogs: logs };
                this.notify();
            }
            return;
        }

        const safeNote = deepCopySafe(updatedNote);
        await updateDoc(doc(db, 'projects', p.id), { designLogs: arrayUnion(safeNote) });
    }

    async addProjectPhoto(projectId: string, base64: string) {
        const p = this.getProject(projectId);
        if (!p) return;

        const photoId = Math.random().toString(36).substr(2, 9);
        const path = `projects/${projectId}/gallery/${photoId}.jpg`;

        // 1. Upload to Storage FIRST
        const downloadUrl = await this.uploadImage(path, base64);

        // 2. Add URL to array
        const newPhotos = [...(p.projectPhotos || []), downloadUrl];
        const newIds = [...(p.projectPhotoIds || []), photoId];

        // 3. Safety Check: If document is already huge, scrub it first
        const currentSize = this.estimateDocumentSize(p);
        if (currentSize > 800000) { // Approaching 1MB
            console.warn(`Project ${projectId} is large (${currentSize} bytes). Scrubbing before adding new photo.`);
            await this.scrubProjectPhotos(projectId);
            const updatedP = this.getProject(projectId);
            if (updatedP) {
                const refreshedPhotos = [...(updatedP.projectPhotos || []), downloadUrl];
                const refreshedIds = [...(updatedP.projectPhotoIds || []), photoId];
                const safeUpdates = deepCopySafe({ projectPhotos: refreshedPhotos, projectPhotoIds: refreshedIds });
                await updateDoc(doc(db, 'projects', projectId), safeUpdates);
                return;
            }
        }

        const safeUpdates = deepCopySafe({ projectPhotos: newPhotos, projectPhotoIds: newIds });
        if (this.isDemoMode) {
            const idx = this.projects.findIndex(proj => proj.id === projectId);
            if (idx !== -1) {
                this.projects[idx] = { ...this.projects[idx], ...safeUpdates as any };
                this.notify();
            }
            return;
        }

        try {
            await updateDoc(doc(db, 'projects', projectId), safeUpdates);
        } catch (e: any) {
            if (e.code === 'permission-denied' || e.message?.includes('too large')) {
                console.error("Update failed (likely size). Attempting emergency scrub.");
                await this.scrubProjectPhotos(projectId);
                throw new Error("Document limit reached. System is auto-repairing. Please try again in a moment.");
            }
            throw e;
        }
    }

    async deleteProjectPhoto(projectId: string, index: number) {
        const p = this.getProject(projectId);
        if (!p || !p.projectPhotos) return;
        const newPhotos = [...p.projectPhotos];
        newPhotos.splice(index, 1);
        const newIds = p.projectPhotoIds ? [...p.projectPhotoIds] : [];
        if (newIds.length > index) newIds.splice(index, 1);

        if (this.isDemoMode) {
            const idx = this.projects.findIndex(proj => proj.id === projectId);
            if (idx !== -1) {
                this.projects[idx] = { ...this.projects[idx], projectPhotos: newPhotos, projectPhotoIds: newIds };
                this.notify();
            }
            return;
        }
        const safeUpdates = deepCopySafe({ projectPhotos: newPhotos, projectPhotoIds: newIds });
        await updateDoc(doc(db, 'projects', projectId), safeUpdates);
    }

    async completeProject(projectId: string, finalWeight: number, userId: string) {
        const p = this.getProject(projectId);
        if (!p) return;

        // Review is no longer a financial lock. Phase 5 locks client gold pricing
        // only when the Manager records the actual pickup date.
        const currentCostSummary = this.getProjectCostSummary(projectId, finalWeight);
        const finalDiamondCostCalculated = currentCostSummary.totalDiamondCostCad;
        const finalSetterCostCalculated = currentCostSummary.automatedSetterCost;

        const activeUsers = (p.assignments || []).filter(a => a.active).map(a => a.userId);
        for (const uid of activeUsers) {
            if (uid !== userId) {
                this.sendNotification(uid, 'Status Updated', `Project ${p.code} status changed to ${ProjectStatus.REVIEW}`, 'STATUS_UPDATE', `/project/${p.id}`);
            }
        }

        const safeUpdates = deepCopySafe({
            status: ProjectStatus.REVIEW,
            currentStageName: 'Complete',
            currentPercentComplete: 100,
            date_completed: now(),
            last_status_change_at: now(),
            last_status_change_by: userId,
            usdToCadMultiplierSnapshot: this.settings.usdToCadMultiplier,
            setterCostPerSetPieceCadSnapshot: this.settings.setterCostPerSetPieceCad,
            finalDiamondCostCalculated: finalDiamondCostCalculated,
            finalSetterCostCalculated: finalSetterCostCalculated
        });
        await updateDoc(doc(db, 'projects', projectId), safeUpdates);
    }

    async confirmProjectPickup(projectId: string, userId: string, actualPickupDate?: string, lateEntryReason?: string) {
        const p = this.getProject(projectId);
        if (!p) throw new Error("Project not found in store");

        if (!this.isDemoMode) {
            return phase5Api.confirmProjectPickupPhase5({
                operationId: newOperationId(),
                projectId,
                actualPickupDate: actualPickupDate || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' }),
                ...(lateEntryReason ? { lateEntryReason } : {})
            });
        }

        const logEntry = {
            id: Math.random().toString(),
            projectId,
            createdById: userId,
            createdAt: now(),
            stageName: 'Picked Up',
            percentComplete: 100,
            weightG: 0
        };

        const safeEntry = deepCopySafe(logEntry);
        const newProgress = [...(p.progress || []), safeEntry];

        const activeUsers = (p.assignments || []).filter(a => a.active).map(a => a.userId);
        for (const uid of activeUsers) {
            if (uid !== userId) {
                this.sendNotification(uid, 'Status Updated', `Project ${p.code} status changed to ${ProjectStatus.CLOSED}`, 'STATUS_UPDATE', `/project/${p.id}`);
            }
        }

        const safeUpdates = deepCopySafe({
            status: ProjectStatus.CLOSED,
            date_picked_up: now(),
            last_status_change_at: now(),
            last_status_change_by: userId,
            progress: newProgress,
            ...(this.isRepairProject(p) ? {
                currentStageName: RepairStatus.COMPLETED,
                currentPercentComplete: 100,
                repair: {
                    ...(this.getRepairDetails(p) || {
                        type: RepairType.GENERAL,
                        submittedDate: p.createdAt,
                        financials: {}
                    }),
                    status: RepairStatus.COMPLETED,
                    completedDate: now()
                }
            } : {})
        });
        await updateDoc(doc(db, 'projects', projectId), safeUpdates);
    }

    async revertToActive(projectId: string, userId: string) {
        const p = this.getProject(projectId);
        if (!p) return;
        if (p.status === ProjectStatus.CLOSED || p.date_picked_up) {
            throw new Error('Picked Up projects are permanently read-only and cannot be reopened.');
        }

        if (!this.isDemoMode) {
            return phase5Api.revertProjectToActivePhase5({ operationId: newOperationId(), projectId });
        }

        const logEntry = {
            id: Math.random().toString(),
            projectId,
            createdById: userId,
            createdAt: now(),
            stageName: 'Reverted to Active',
            percentComplete: 90,
            weightG: 0
        };

        const safeEntry = deepCopySafe(logEntry);
        const newProgress = [...(p.progress || []), safeEntry];

        const activeUsers = (p.assignments || []).filter(a => a.active).map(a => a.userId);
        for (const uid of activeUsers) {
            if (uid !== userId) {
                this.sendNotification(uid, 'Status Updated', `Project ${p.code} status changed to ${ProjectStatus.ACTIVE}`, 'STATUS_UPDATE', `/project/${p.id}`);
            }
        }

        const safeUpdates = deepCopySafe({
            status: ProjectStatus.ACTIVE,
            currentStageName: 'QC/Polish',
            currentPercentComplete: 90,
            date_completed: null,
            date_picked_up: null,
            projectEndGoldPriceSnapshot: null,
            projectEndGoldPriceCapturedAt: null,
            last_status_change_at: now(),
            last_status_change_by: userId,
            progress: newProgress
        });
        await updateDoc(doc(db, 'projects', projectId), safeUpdates);
    }

    async updateProjectGoldComponents(projectId: string, components: GoldComponent[]) {
        if (this.isDemoMode) {
            const idx = this.projects.findIndex(p => p.id === projectId);
            if (idx !== -1) {
                this.projects[idx] = { ...this.projects[idx], goldComponents: components };
                this.notify();
            }
            return;
        }
        const safeUpdates = deepCopySafe({ goldComponents: components });
        await updateDoc(doc(db, 'projects', projectId), safeUpdates);
    }

    async updateProjectDate(projectId: string, field: 'date_picked_up' | 'date_completed', newDate: string, userId: string) {
        const p = this.getProject(projectId);
        if (!p) return;

        const logEntry = {
            id: Math.random().toString(),
            projectId,
            createdById: userId,
            createdAt: now(),
            stageName: 'Date Correction',
            percentComplete: p.currentPercentComplete,
            weightG: 0
        };

        const safeEntry = deepCopySafe(logEntry);

        const safeUpdates = deepCopySafe({
            [field]: newDate,
            progress: [...(p.progress || []), safeEntry]
        });
        await updateDoc(doc(db, 'projects', projectId), safeUpdates);
    }

    async updateProjectLabourCost(projectId: string, amount: number, note: string) {
        const safeUpdates = deepCopySafe({
            labourCostAmount: amount,
            labourCostNote: note,
            labourCostLastUpdatedAt: now()
        });
        await updateDoc(doc(db, 'projects', projectId), safeUpdates);
    }

    async updateServiceStatus(projectId: string, serviceName: string, status: string, userId: string) {
        const p = this.getProject(projectId);
        if (!p) return;
        const canonicalCode = getCanonicalServiceCode(p);
        if (PROJECT_SERVICE_LABELS[canonicalCode] !== serviceName) return;
        const services = (p.services || []).map((s: any) => {
            const normalized = typeof s === 'string' ? createCanonicalService(canonicalCode) : s;
            return { ...normalized, code: canonicalCode, name: undefined, status };
        });

        const activeUsers = (p.assignments || []).filter(a => a.active).map(a => a.userId);
        for (const uid of activeUsers) {
            if (uid !== userId) {
                this.sendNotification(uid, 'Service Updated', `${serviceName} status changed to ${status} in ${p.code}`, 'STATUS_UPDATE', `/project/${p.id}`);
            }
        }

        const safeUpdates = deepCopySafe({ services });
        await updateDoc(doc(db, 'projects', projectId), safeUpdates);
    }

    async updateDesignStage(projectId: string, stage: string, userId: string) {
        const p = this.getProject(projectId);
        if (!p) return;

        const activeUsers = (p.assignments || []).filter(a => a.active).map(a => a.userId);
        for (const uid of activeUsers) {
            if (uid !== userId) {
                this.sendNotification(uid, 'Design Stage Updated', `Design stage changed to ${stage} in ${p.code}`, 'STATUS_UPDATE', `/project/${p.id}`);
            }
        }

        const safeUpdates = deepCopySafe({ designStage: stage });
        await updateDoc(doc(db, 'projects', projectId), safeUpdates);
    }

    async sendToCasting(projectId: string, userId: string, goldComponentIds?: string[]) {
        const p = this.getProject(projectId);
        if (!p) return;
        if (!this.isDemoMode) {
            const active = this.normalizeGoldComponents(p).filter(component => component.state === 'ACTIVE');
            const revisionIds = (goldComponentIds?.length ? goldComponentIds : active.map(component => component.id)).map(id => {
                const component = active.find(candidate => candidate.id === id || candidate.revisionId === id);
                return component?.revisionId || component?.id || id;
            });
            return phase5Api.dispatchCastingPhase5({ operationId: newOperationId(), projectId, revisionIds });
        }
        const event: CastingEvent = {
            id: Math.random().toString(),
            projectId,
            cycleNumber: (p.castingEvents?.length || 0) + 1,
            sentAt: now(),
            goldComponentIds
        };
        const safeUpdates = deepCopySafe({ castingEvents: [...(p.castingEvents || []), event] });
        await updateDoc(doc(db, 'projects', projectId), safeUpdates);
    }

    async receiveCasting(
        projectId: string,
        condition: 'CORRECT' | 'DAMAGED' | 'INCORRECT',
        notes: string,
        receiptLines: Array<{
            revisionId: string;
            weightMg: number;
            supplierRateCentsPerGram?: number;
        }>,
        removedComponents: Array<{ revisionId: string; reason: string }> = []
    ) {
        const p = this.getProject(projectId);
        if (!p || !p.castingEvents?.length) return;

        if (!this.isDemoMode) {
            return phase5Api.recordCastingReceipt({
                operationId: newOperationId(),
                projectId,
                condition,
                notes,
                weights: receiptLines,
                removedComponents
            });
        }

        const events = [...p.castingEvents];
        const last = { ...events[events.length - 1] };
        const componentWeightsMg = Object.fromEntries(
            receiptLines.map(line => [line.revisionId, line.weightMg])
        );
        const componentCosts = condition === 'CORRECT'
            ? receiptLines.map(line => {
                const component = this.normalizeGoldComponents(p).find(
                    candidate => (candidate.revisionId || candidate.id) === line.revisionId
                );
                const supplierRateCentsPerGram = line.supplierRateCentsPerGram || 0;
                return {
                    componentId: component?.id || line.revisionId,
                    revisionId: line.revisionId,
                    label: component?.label || 'Component',
                    castingWeightMg: line.weightMg,
                    supplierRateCentsPerGram,
                    amountCents: Math.round(
                        (line.weightMg * supplierRateCentsPerGram) / 1000
                    )
                };
            })
            : [];
        const overallCastingCostCents = componentCosts.reduce(
            (sum, line) => sum + line.amountCents,
            0
        );

        last.receivedAt = now();
        last.condition = condition;
        last.receivedWeightG = receiptLines.reduce((sum, line) => sum + line.weightMg, 0) / 1000;
        last.componentWeightsMg = componentWeightsMg;
        last.componentCosts = componentCosts;
        last.overallCastingCostCents = overallCastingCostCents;
        last.costingMode = 'REPLACEMENT_LATEST_ONLY';
        last.removedComponents = removedComponents.map(removed => ({
            componentId: removed.revisionId,
            label: this.normalizeGoldComponents(p).find(
                candidate => (candidate.revisionId || candidate.id) === removed.revisionId
            )?.label || 'Component',
            ...removed,
        }));
        last.notes = notes;

        events[events.length - 1] = last;

        const removedIds = new Set(removedComponents.map(component => component.revisionId));
        const updatedGoldComponents = p.goldComponents?.map(component => {
            const revisionId = component.revisionId || component.id;
            if (removedIds.has(revisionId)) {
                const removal = removedComponents.find(candidate => candidate.revisionId === revisionId);
                return {
                    ...component,
                    state: 'REMOVED' as const,
                    removedAt: now(),
                    removalReason: removal?.reason
                };
            }
            const receiptLine = receiptLines.find(line => line.revisionId === revisionId);
            if (!receiptLine) return component;
            const componentCost = componentCosts.find(line => line.revisionId === revisionId);
            return {
                ...component,
                castingReceivedWeightG: receiptLine.weightMg / 1000,
                weightG: receiptLine.weightMg / 1000,
                ...(componentCost ? {
                    pendingInternalCastingCost: {
                        status: 'DRAFT' as const,
                        castingEventId: last.id,
                        supplierRateCentsPerGram: componentCost.supplierRateCentsPerGram,
                        castingWeightMg: componentCost.castingWeightMg,
                        amountCents: componentCost.amountCents,
                        enteredAt: now(),
                        enteredBy: { uid: 'demo-user', name: 'Demo User' },
                        costingMode: 'REPLACEMENT_LATEST_ONLY' as const
                    }
                } : {})
            };
        });

        const safeUpdates = deepCopySafe({
            castingEvents: events,
            ...(updatedGoldComponents ? { goldComponents: updatedGoldComponents } : {})
        });
        await updateDoc(doc(db, 'projects', projectId), safeUpdates);
    }

    // --- Bags & Inventory ---

    getBags(projectId?: string) {
        if (projectId) return this.bags.filter(b => b.projectId === projectId);
        return this.bags;
    }

    getNextBagNumber(projectId: string, projectCode: string): string {
        const projectBags = this.bags.filter(b => b.projectId === projectId);
        if (projectBags.length === 0) {
            return projectCode;
        }

        let maxIndex = -1;
        const cleanProjectCode = projectCode.trim().toLowerCase();

        for (const b of projectBags) {
            const cleanBagNum = b.bagNumber.trim().toLowerCase();
            if (cleanBagNum.startsWith(cleanProjectCode)) {
                const suffix = cleanBagNum.substring(cleanProjectCode.length).toUpperCase();
                if (suffix === "") {
                    maxIndex = Math.max(maxIndex, 0);
                } else if (suffix.length === 1 && suffix >= "A" && suffix <= "Z") {
                    const charCode = suffix.charCodeAt(0);
                    const index = charCode - 65; // 'A' -> 0, 'B' -> 1, 'C' -> 2, etc.
                    maxIndex = Math.max(maxIndex, index);
                }
            }
        }

        const nextIndex = maxIndex + 1;
        if (nextIndex === 0) {
            return projectCode;
        }
        return projectCode + String.fromCharCode(65 + nextIndex);
    }

    getEvidenceImages() {
        return this.evidenceImages;
    }

    getRequests(projectId?: string) {
        if (projectId) return this.requests.filter(r => r.projectId === projectId);
        return this.requests;
    }

    getFulfillmentPreview(requestId: string): Promise<FulfillmentPreview> {
        if (this.isDemoMode) {
            return Promise.resolve({
                requestId,
                specs: this.specs.filter(spec => !spec.location || spec.location === 'Melee').map(spec => ({
                    id: spec.id,
                    label: spec.label,
                    shape: spec.shape || '',
                    sizeMm: spec.sizeMm,
                    ctPerStone: spec.ctPerStone,
                    location: 'TORONTO_MELEE' as const,
                    availablePcs: spec.pcs || 0,
                    maximumIssuePcs: spec.pcs || 0,
                    recommendedIssuePcs: 0,
                    availabilityState: (spec.pcs || 0) > 0 ? 'AVAILABLE' as const : 'OUT_OF_STOCK' as const,
                })),
            });
        }
        return inventoryApi.getFulfillmentPreview(requestId);
    }

    async cancelInventoryRequest(requestId: string) {
        if (this.isDemoMode) {
            const request = this.requests.find(item => item.id === requestId);
            if (request?.status === 'OPEN') request.status = 'CANCELLED';
            this.notify();
            return;
        }
        await inventoryApi.cancelRequest({ operationId: newOperationId(), requestId });
        await this.refreshPrivateInventoryContext();
    }

    async createRequest(req: Partial<IssueRequest>, operationId: string = newOperationId()) {
        if (req.lines) {
            for (const line of req.lines) {
                const spec = this.specs.find(s => s.id === line.specId);
                if (spec && spec.location && spec.location !== 'Melee') {
                    throw new Error(`Request blocked: spec "${spec.label}" is a large stone (${spec.location}) and is not allowed for setter bag requests.`);
                }
            }
        }
        if (this.isDemoMode) {
            const id = 'req-' + Math.random().toString(36).substr(2, 9);
            const safeReq = deepCopySafe({ id, createdAt: now(), status: 'OPEN', requestedAt: now(), ...req });
            this.requests.push(safeReq as any);
            this.notify();
            return;
        }
        if (!this.currentUser) throw new Error('Sign in is required.');
        await inventoryApi.createRequest({
            operationId,
            projectId: req.projectId || '',
            jobNumberSnapshot: req.jobNumberSnapshot,
            lines: req.lines || [],
        });
        await this.refreshPrivateInventoryContext();
    }

    async issueBag(
        projectId: string,
        bagNumber: string,
        items: (BagItem & { sourceLineIndex?: number; explanation?: string })[],
        issuedById: string,
        requestedById: string,
        requestId?: string,
        photo?: string,
        imageSource?: 'Camera' | 'Device Gallery',
        jobNumberSnapshot?: string,
        explanations?: Record<string, string>,
        operationId: string = newOperationId()
    ) {
        const normalizedBagNumber = bagNumber.trim().replace(/\s+/g, ' ');
        if (!requestId) throw new Error('A request is required for Phase 1 bag issue.');
        if (this.isDemoMode) {
            const request = this.requests.find(r => r.id === requestId);
            if (!request || request.status !== 'OPEN') throw new Error('Request is already closed.');
            const positive = items.filter(item => item.issuedPcs > 0);
            const full = items.every((item, index) => item.issuedPcs === request.lines[index]?.requestedPcs && item.specId === request.lines[index]?.specId);
            request.status = full ? 'FULFILLED' : 'PARTIALLY_FULFILLED_CLOSED';
            if (positive.length > 0) {
                this.bags.push({ id: `bag-${operationId}`, bagNumber: normalizedBagNumber, projectId, issuedById, issuedToId: requestedById, issuedAt: now(), status: BagStatus.ISSUED, items: positive });
            }
            this.notify();
            return;
        }
        if (!this.currentUser || this.currentUser.role !== Role.MANAGER) throw new Error('Only Managers can confirm an issue.');
        const positiveItems = items.filter(item => item.issuedPcs > 0);
        let evidencePath: string | undefined;
        if (positiveItems.length > 0) {
            if (!photo?.startsWith('data:')) throw new Error('A new evidence image is required.');
            evidencePath = await uploadInventoryEvidence({ dataUrl: photo, kind: 'issues', uploaderUid: this.currentUser.id, operationId, projectId });
        }
        await inventoryApi.confirmIssue({
            operationId,
            requestId,
            bagNumber: normalizedBagNumber,
            issuedLines: items.map((item, index) => ({
                sourceLineIndex: item.sourceLineIndex ?? index,
                specId: item.specId,
                issuedPcs: item.issuedPcs,
                explanation: item.explanation || explanations?.[item.specId] || '',
            })),
            evidencePath,
            imageSource,
        });
    } // end issueBag

    async submitBagReturn(
        bagNumber: string,
        projectId: string,
        userId: string,
        photo: string,
        returnedLines?: RequestLine[],
        jobNumberSnapshot?: string,
        returnedNotes?: string,
        imageSource?: 'Camera' | 'Device Gallery',
        operationId: string = newOperationId()
    ) {
        const bag = this.bags.find(b => b.bagNumber === bagNumber && b.projectId === projectId);

        if (!this.isDemoMode) {
            if (!this.currentUser || this.currentUser.id !== userId) throw new Error('Return identity does not match the signed-in user.');
            if (!bag) throw new Error('The selected issued bag was not found.');
            if (!photo?.startsWith('data:')) throw new Error('A new return evidence image is required.');
            const evidencePath = await uploadInventoryEvidence({
                dataUrl: photo,
                kind: 'returns',
                uploaderUid: this.currentUser.id,
                operationId,
                projectId,
            });
            await inventoryApi.submitReturn({
                operationId,
                bagId: bag.id,
                projectId,
                evidencePath,
                notes: returnedNotes,
                imageSource,
                returnLines: (returnedLines || []).map(line => ({ specId: line.specId, returnedPcs: line.requestedPcs })),
            });
            await this.refreshPrivateInventoryContext();
            return;
        }

        const txId = 'ret-' + Math.random().toString(36).substring(2, 9);
        const evidenceId = 'ev-' + Math.random().toString(36).substr(2, 9);
        let uploadedPhotoUrl = '';
        let uploadedThumbUrl = '';

        if (photo && photo.startsWith('data:')) {
            const path = `evidence/projects/${projectId}/returns/${txId}_returned_v1.jpg`;
            const thumbPath = `evidence/projects/${projectId}/returns/${txId}_returned_v1_thumb.jpg`;
            try {
                uploadedPhotoUrl = await this.uploadImage(path, photo);
                const thumbBase64 = await generateThumbnail(photo);
                uploadedThumbUrl = await this.uploadImage(thumbPath, thumbBase64);
            } catch (uploadError) {
                console.error("Image upload failed:", uploadError);
                throw new Error("Failed to upload evidence image. Transaction aborted.");
            }
        } else if (photo) {
            uploadedPhotoUrl = photo;
            uploadedThumbUrl = photo;
        }

        const uploaderName = this.getUser(userId)?.name || this.currentUser?.name || 'Setter';
        const targetBagId = bag ? bag.id : ('bag-' + Math.random().toString(36).substring(2, 9));

        const evidenceDoc: EvidenceImage = {
            id: evidenceId,
            projectId,
            transactionId: txId,
            transactionType: 'RETURN',
            bagId: targetBagId,
            bagNumber: bag ? bag.bagNumber : (bagNumber || targetBagId),
            uploaderId: userId,
            uploaderName,
            uploadedAt: now(),
            imageSource: imageSource || 'Camera',
            photoUrl: uploadedPhotoUrl,
            thumbnailUrl: uploadedThumbUrl,
            version: 1,
            transactionStatus: 'PENDING',
            replacementHistory: []
        };

        try {
            if (bag) {
                const lines: BagReturnLine[] = (returnedLines || []).map(rl => {
                    const spec = this.specs.find(s => s.id === rl.specId);
                    const issued = bag.items.find(i => i.specId === rl.specId)?.issuedPcs || 0;
                    const previouslyConfirmed = (bag.returns || [])
                        .filter(r => r.status === 'CONFIRMED')
                        .reduce((sum, r) => sum + (r.lines.find(l => l.specId === rl.specId)?.returnedPcs || 0), 0);

                    return {
                        specId: rl.specId,
                        shape: spec?.shape || 'Unknown',
                        size: String(spec?.sizeMm || 'Unknown'),
                        originalIssuedPcs: issued,
                        previouslyConfirmedPcs: previouslyConfirmed,
                        availableBeforeReturn: issued - previouslyConfirmed,
                        returnedPcs: rl.requestedPcs
                    };
                });

                const returnTx: BagReturnTransaction = {
                    id: txId,
                    projectId,
                    jobNumberSnapshot,
                    bagId: bag.id,
                    bagNumber: bag.bagNumber,
                    setterId: userId,
                    submittedAt: now(),
                    status: 'PENDING',
                    photo: uploadedPhotoUrl,
                    evidenceId: photo ? evidenceId : undefined,
                    notes: returnedNotes,
                    lines
                };

                const currentReturns = bag.returns || [];
                const safeUpdates = deepCopySafe({
                    status: BagStatus.RETURNED_PENDING_COUNT,
                    returnedAt: now(),
                    returnedPhoto: uploadedPhotoUrl,
                    returnedLines,
                    returnedNotes,
                    jobNumberSnapshot,
                    returns: [...currentReturns, returnTx]
                });

                if (this.isDemoMode) {
                    bag.status = BagStatus.RETURNED_PENDING_COUNT;
                    bag.returnedAt = now();
                    bag.returnedPhoto = uploadedPhotoUrl;
                    bag.returnedLines = returnedLines;
                    bag.returnedNotes = returnedNotes;
                    bag.jobNumberSnapshot = jobNumberSnapshot;
                    bag.returns = [...currentReturns, returnTx];
                    if (photo) {
                        this.evidenceImages.push(evidenceDoc);
                    }
                    this.notify();
                } else {
                    await updateDoc(doc(db, 'bags', bag.id), safeUpdates);
                    if (photo) {
                        await setDoc(doc(db, 'evidence', evidenceId), deepCopySafe(evidenceDoc));
                    }
                }
            } else {
                const newBag: DiamondBag = {
                    id: targetBagId,
                    bagNumber: bagNumber || targetBagId,
                    projectId,
                    issuedById: userId,
                    issuedToId: userId,
                    issuedAt: now(),
                    status: BagStatus.RETURNED_PENDING_COUNT,
                    items: [],
                    returnedAt: now(),
                    returnedPhoto: uploadedPhotoUrl,
                    returnedNotes,
                    jobNumberSnapshot
                };

                if (this.isDemoMode) {
                    this.bags.push(newBag);
                    if (photo) {
                        this.evidenceImages.push(evidenceDoc);
                    }
                    this.notify();
                } else {
                    await setDoc(doc(db, 'bags', targetBagId), deepCopySafe(newBag));
                    if (photo) {
                        await setDoc(doc(db, 'evidence', evidenceId), deepCopySafe(evidenceDoc));
                    }
                }
            }
        } catch (dbError) {
            console.error("Database operation failed. Performing compensating deletion of uploaded files.", dbError);
            if (uploadedPhotoUrl && uploadedPhotoUrl.startsWith('http')) {
                await this.deleteUploadedImage(uploadedPhotoUrl);
            }
            if (uploadedThumbUrl && uploadedThumbUrl.startsWith('http')) {
                await this.deleteUploadedImage(uploadedThumbUrl);
            }
            throw dbError;
        }

        // Notify Managers
        const managers = this.getUsers().filter(u => u.role === Role.MANAGER);
        const returner = this.getUser(userId)?.name || 'User';
        for (const m of managers) {
            this.sendNotification(m.id, 'Bag Returned', `${returner} returned Bag #${bagNumber}`, 'RETURN', '/');
        }
    }

    async confirmBagCount(
        bagNumber: string,
        counts: { specId: string, pcs: number }[],
        userId: string,
        mixedReturn?: { totalCt: number, notes: string },
        correctedItems?: BagItem[],
        brokenCounts?: { specId: string, pcs: number }[],
        weighedCarats?: { specId: string, ct: number }[],
        returnTransactionId?: string,
        correctionReason?: string,
        breakageReason?: string,
        operationId: string = newOperationId()
    ) {
        const bag = this.bags.find(b => b.bagNumber === bagNumber);
        if (!bag) {
            throw new Error(`Bag #${bagNumber} not found.`);
        }

        if (!this.isDemoMode) {
            if (!this.currentUser || this.currentUser.role !== Role.MANAGER || this.currentUser.id !== userId) {
                throw new Error('Only the signed-in Manager can confirm a return.');
            }
            if (!returnTransactionId) throw new Error('A pending return transaction is required.');
            if (mixedReturn) throw new Error('Mixed or unsorted returns cannot be confirmed in Phase 1. Correct the return to issued specifications first.');
            if (correctedItems || correctionReason) throw new Error('A physical return mismatch must be corrected before confirmation; Manager overrides are not permitted.');
            if (weighedCarats && weighedCarats.length > 0) throw new Error('Return weight variance cannot override the submitted piece counts in Phase 1.');
            await inventoryApi.confirmReturn({
                operationId,
                bagId: bag.id,
                returnId: returnTransactionId,
                returnLines: counts.map(line => ({ specId: line.specId, returnedPcs: line.pcs })),
                breakageLines: (brokenCounts || []).filter(line => line.pcs > 0).map(line => ({ specId: line.specId, pieces: line.pcs })),
                breakageReason,
            });
            return;
        }

        // Check if photo evidence exists for this return transaction
        const currentReturns = [...(bag.returns || [])];
        let retTx: BagReturnTransaction | undefined;
        if (returnTransactionId) {
            retTx = currentReturns.find(r => r.id === returnTransactionId);
            if (!retTx) {
                throw new Error(`Return transaction ${returnTransactionId} not found in Bag #${bagNumber}.`);
            }
            if (retTx.status === 'CONFIRMED') {
                throw new Error(`Return transaction ${returnTransactionId} is already confirmed.`);
            }
            if (!retTx.photo) {
                throw new Error(`Return confirmation blocked: No photo evidence exists for this return.`);
            }
        }

        // Validate positive counts
        if (retTx) {
            for (const reqLine of retTx.lines) {
                const mgrCount = counts.find(c => c.specId === reqLine.specId)?.pcs ?? 0;
                if (mgrCount < 0) {
                    throw new Error(`Negative counts are not allowed.`);
                }
            }
        }

        // Validate outstanding stock limits
        for (const c of counts) {
            const issuedItem = bag.items.find(i => i.specId === c.specId);
            const issuedPcs = issuedItem?.issuedPcs || 0;

            // Outstanding = Issued - Confirmed Returns
            const confirmedReturned = currentReturns
                .filter(r => r.status === 'CONFIRMED')
                .reduce((sum, r) => sum + (r.lines.find(l => l.specId === c.specId)?.returnedPcs || 0), 0);

            const currentBroken = brokenCounts?.find(b => b.specId === c.specId)?.pcs || 0;

            const outstanding = issuedPcs - confirmedReturned;
            if (c.pcs + currentBroken > outstanding) {
                throw new Error(`Fulfillment limit exceeded: returning ${c.pcs} pcs but outstanding is only ${outstanding} pcs.`);
            }
        }

        if (returnTransactionId) {
            const retIndex = currentReturns.findIndex(r => r.id === returnTransactionId);
            if (retIndex >= 0) {
                const originalTx = currentReturns[retIndex];
                const updatedLines = originalTx.lines.map(line => {
                    const spec = this.specs.find(s => s.id === line.specId);
                    const mgrCount = counts.find(c => c.specId === line.specId)?.pcs ?? 0;
                    const currentBroken = brokenCounts?.find(b => b.specId === line.specId)?.pcs || 0;
                    const weighedEntry = weighedCarats?.find(w => w.specId === line.specId);
                    const confirmedCt = weighedEntry ? weighedEntry.ct : (mgrCount * (spec?.ctPerStone || 0));
                    return {
                        ...line,
                        setterEstimatedPcs: line.setterEstimatedPcs !== undefined ? line.setterEstimatedPcs : line.returnedPcs,
                        setterEstimatedCt: line.setterEstimatedCt !== undefined ? line.setterEstimatedCt : (line.returnedPcs * (spec?.ctPerStone || 0)),
                        confirmedPcs: mgrCount,
                        confirmedCt: confirmedCt,
                        confirmedBrokenPcs: currentBroken,
                        returnedPcs: mgrCount // for backward compatibility
                    };
                });

                const isCorrected = updatedLines.some(l => l.confirmedPcs !== l.setterEstimatedPcs);

                currentReturns[retIndex] = {
                    ...originalTx,
                    status: 'CONFIRMED',
                    managerId: userId,
                    confirmedAt: now(),
                    lines: updatedLines,
                    correctingManagerId: isCorrected ? userId : undefined,
                    correctionTimestamp: isCorrected ? now() : undefined,
                    correctionReason: isCorrected ? (correctionReason || 'Adjusted by Manager') : undefined
                };
            }
        }

        const hasPendingReturns = currentReturns.some(r => r.status === 'PENDING');
        const newStatus = hasPendingReturns ? BagStatus.RETURNED_PENDING_COUNT : BagStatus.COUNTED_CONFIRMED;

        const updates: any = {
            status: newStatus,
            returns: currentReturns
        };

        if (correctedItems) {
            updates.items = correctedItems;
        }

        if (this.isDemoMode) {
            // Demo mode execution
            bag.status = newStatus;
            bag.returns = currentReturns;
            if (correctedItems) bag.items = correctedItems;
            if (returnTransactionId) {
                const ev = this.evidenceImages.find(e => e.transactionId === returnTransactionId);
                if (ev) {
                    ev.transactionStatus = 'CONFIRMED';
                }
            }

            if (mixedReturn) {
                await this.createInventoryMovement({
                    type: InventoryMovementType.RETURN_MIXED,
                    createdById: userId,
                    referenceProjectId: bag.projectId,
                    referenceBagNumber: bagNumber,
                    notes: mixedReturn.notes,
                    lines: [{
                        specId: 'MIXED-UNSORTED',
                        ct: mixedReturn.totalCt
                    }],
                    location: this.getUser(userId)?.location || this.currentUser?.location || 'Toronto'
                });
            } else {
                const lines = counts.map(c => {
                    const spec = this.specs.find(s => s.id === c.specId);
                    return {
                        specId: c.specId,
                        pcs: c.pcs,
                        ct: c.pcs * (spec?.ctPerStone || 0)
                    };
                }).filter(l => l.pcs > 0);

                if (lines.length > 0) {
                    await this.createInventoryMovement({
                        type: InventoryMovementType.RETURN,
                        createdById: userId,
                        referenceProjectId: bag.projectId,
                        referenceBagNumber: bagNumber,
                        lines: lines,
                        location: this.getUser(userId)?.location || this.currentUser?.location || 'Toronto'
                    });
                }
            }

            // Atomic Breakage Movement (Demo Mode)
            if (brokenCounts && brokenCounts.length > 0) {
                const brokenLines = brokenCounts.map(b => {
                    const spec = this.specs.find(s => s.id === b.specId);
                    return {
                        specId: b.specId,
                        pcs: b.pcs,
                        ct: b.pcs * (spec?.ctPerStone || 0)
                    };
                }).filter(l => l.pcs > 0);

                if (brokenLines.length > 0) {
                    await this.createInventoryMovement({
                        type: InventoryMovementType.BROKEN_OUT,
                        createdById: userId,
                        referenceProjectId: bag.projectId,
                        referenceBagNumber: bagNumber,
                        notes: `Stones broken during return verification of Bag #${bagNumber}.`,
                        lines: brokenLines,
                        location: this.getUser(userId)?.location || this.currentUser?.location || 'Toronto'
                    });
                }
            }

            if (newStatus === BagStatus.COUNTED_CONFIRMED) {
                const itemsToProcess = bag.items;
                for (const item of itemsToProcess) {
                    const totalReturned = currentReturns.filter(r => r.status === 'CONFIRMED').reduce((sum, r) => sum + (r.lines.find(l => l.specId === item.specId)?.returnedPcs || 0), 0);
                    const brokenPcs = brokenCounts?.find(b => b.specId === item.specId)?.pcs || 0;
                    const usedPcs = item.issuedPcs - totalReturned - brokenPcs;
                    if (usedPcs > 0) {
                        const spec = this.specs.find(s => s.id === item.specId);
                        const specCost = spec?.defaultCostPerCtUsd || 0;
                        const ctPerStone = spec?.ctPerStone || 0;
                        const usedCt = usedPcs * ctPerStone;

                        const txId = `tx-used-${bag.id}-${item.specId}`;
                        const transaction: DiamondLedgerTransaction = {
                            id: txId,
                            createdAt: now(),
                            createdById: userId,
                            referenceProjectId: bag.projectId,
                            referenceBagNumber: bagNumber,
                            specId: item.specId,
                            color: spec?.color || 'White',
                            quantity: -usedPcs,
                            carats: -usedCt,
                            movementType: 'used',
                            unitCost: specCost,
                            totalValue: usedCt * specCost,
                            notes: `Stones used in production for Bag #${bagNumber}.`,
                            mainStockChange: 0,
                            wipStockChange: -usedPcs,
                            status: 'active'
                        };
                        this.diamondTransactions.push(transaction);
                    }
                }
            }

            if (weighedCarats && weighedCarats.length > 0) {
                for (const wEntry of weighedCarats) {
                    const returnedCount = counts.find(c => c.specId === wEntry.specId);
                    if (!returnedCount) continue;

                    const spec = this.specs.find(s => s.id === wEntry.specId);
                    const expectedCt = returnedCount.pcs * (spec?.ctPerStone || 0);
                    const delta = +(wEntry.ct - expectedCt).toFixed(6);

                    if (Math.abs(delta) <= 0.001) continue;

                    const txId = `tx-wt-${bag.id}-${wEntry.specId}-${Date.now()}`;
                    const specCost = spec?.defaultCostPerCtUsd || 0;

                    const toleranceTx: DiamondLedgerTransaction = {
                        id: txId,
                        createdAt: now(),
                        createdById: userId,
                        referenceProjectId: bag.projectId,
                        referenceBagNumber: bagNumber,
                        specId: wEntry.specId,
                        color: spec?.color || 'White',
                        quantity: 0,
                        carats: delta,
                        movementType: 'weight_tolerance',
                        unitCost: specCost,
                        totalValue: delta * specCost,
                        notes: `Scale weight variance on Bag #${bagNumber}: weighed ${wEntry.ct.toFixed(4)}ct vs expected ${expectedCt.toFixed(4)}ct (${delta > 0 ? '+' : ''}${delta.toFixed(4)}ct, ${((delta / expectedCt) * 100).toFixed(2)}%).`,
                        mainStockChange: 0,
                        wipStockChange: 0,
                        status: 'active'
                    };
                    this.diamondTransactions.push(toleranceTx);
                }
            }
            this.notify();
        } else {
            // Production Mode: Firestore Transaction
            await runTransaction(db, async (transaction) => {
                const bagRef = doc(db, 'bags', bag.id);
                const bagSnap = await transaction.get(bagRef);
                if (!bagSnap.exists()) {
                    throw new Error(`Bag document not found: ${bag.id}`);
                }
                const currentBagData = bagSnap.data() as DiamondBag;

                if (returnTransactionId) {
                    const evCollectionRef = collection(db, 'evidence');
                    const q = query(evCollectionRef, where('transactionId', '==', returnTransactionId));
                    const querySnapshot = await getDocs(q);
                    if (!querySnapshot.empty) {
                        const docId = querySnapshot.docs[0].id;
                        transaction.update(doc(db, 'evidence', docId), { transactionStatus: 'CONFIRMED' });
                    }
                }

                transaction.update(bagRef, deepCopySafe(updates));

                if (mixedReturn) {
                    await this.createInventoryMovement({
                        type: InventoryMovementType.RETURN_MIXED,
                        createdById: userId,
                        referenceProjectId: bag.projectId,
                        referenceBagNumber: bagNumber,
                        notes: mixedReturn.notes,
                        lines: [{
                            specId: 'MIXED-UNSORTED',
                            ct: mixedReturn.totalCt
                        }],
                        location: this.getUser(userId)?.location || this.currentUser?.location || 'Toronto'
                    }, transaction);
                } else {
                    const lines = counts.map(c => {
                        const spec = this.specs.find(s => s.id === c.specId);
                        return {
                            specId: c.specId,
                            pcs: c.pcs,
                            ct: c.pcs * (spec?.ctPerStone || 0)
                        };
                    }).filter(l => l.pcs > 0);

                    if (lines.length > 0) {
                        await this.createInventoryMovement({
                            type: InventoryMovementType.RETURN,
                            createdById: userId,
                            referenceProjectId: bag.projectId,
                            referenceBagNumber: bagNumber,
                            lines: lines,
                            location: this.getUser(userId)?.location || this.currentUser?.location || 'Toronto'
                        }, transaction);
                    }
                }

                // Atomic Breakage Movement (Production Mode)
                if (brokenCounts && brokenCounts.length > 0) {
                    const brokenLines = brokenCounts.map(b => {
                        const spec = this.specs.find(s => s.id === b.specId);
                        return {
                            specId: b.specId,
                            pcs: b.pcs,
                            ct: b.pcs * (spec?.ctPerStone || 0)
                        };
                    }).filter(l => l.pcs > 0);

                    if (brokenLines.length > 0) {
                        await this.createInventoryMovement({
                            type: InventoryMovementType.BROKEN_OUT,
                            createdById: userId,
                            referenceProjectId: bag.projectId,
                            referenceBagNumber: bagNumber,
                            notes: `Stones broken during return verification of Bag #${bagNumber}.`,
                            lines: brokenLines,
                            location: this.getUser(userId)?.location || this.currentUser?.location || 'Toronto'
                        }, transaction);
                    }
                }

                if (newStatus === BagStatus.COUNTED_CONFIRMED) {
                    const itemsToProcess = currentBagData.items;
                    for (const item of itemsToProcess) {
                        const totalReturned = currentReturns.filter(r => r.status === 'CONFIRMED').reduce((sum, r) => sum + (r.lines.find(l => l.specId === item.specId)?.returnedPcs || 0), 0);
                        const brokenPcs = brokenCounts?.find(b => b.specId === item.specId)?.pcs || 0;
                        const usedPcs = item.issuedPcs - totalReturned - brokenPcs;
                        if (usedPcs > 0) {
                            const spec = this.specs.find(s => s.id === item.specId);
                            const specCost = spec?.defaultCostPerCtUsd || 0;
                            const ctPerStone = spec?.ctPerStone || 0;
                            const usedCt = usedPcs * ctPerStone;

                            const txId = `tx-used-${bag.id}-${item.specId}`;
                            const usedTx: DiamondLedgerTransaction = {
                                id: txId,
                                createdAt: now(),
                                createdById: userId,
                                referenceProjectId: bag.projectId,
                                referenceBagNumber: bagNumber,
                                specId: item.specId,
                                color: spec?.color || 'White',
                                quantity: -usedPcs,
                                carats: -usedCt,
                                movementType: 'used',
                                unitCost: specCost,
                                totalValue: usedCt * specCost,
                                notes: `Stones used in production for Bag #${bagNumber}.`,
                                mainStockChange: 0,
                                wipStockChange: -usedPcs,
                                status: 'active'
                            };
                            transaction.set(doc(db, 'diamond_transactions', txId), deepCopySafe(usedTx));
                        }
                    }
                }

                if (weighedCarats && weighedCarats.length > 0) {
                    for (const wEntry of weighedCarats) {
                        const returnedCount = counts.find(c => c.specId === wEntry.specId);
                        if (!returnedCount) continue;

                        const spec = this.specs.find(s => s.id === wEntry.specId);
                        const expectedCt = returnedCount.pcs * (spec?.ctPerStone || 0);
                        const delta = +(wEntry.ct - expectedCt).toFixed(6);

                        if (Math.abs(delta) <= 0.001) continue;

                        const txId = `tx-wt-${bag.id}-${wEntry.specId}-${Date.now()}`;
                        const specCost = spec?.defaultCostPerCtUsd || 0;

                        const toleranceTx: DiamondLedgerTransaction = {
                            id: txId,
                            createdAt: now(),
                            createdById: userId,
                            referenceProjectId: bag.projectId,
                            referenceBagNumber: bagNumber,
                            specId: wEntry.specId,
                            color: spec?.color || 'White',
                            quantity: 0,
                            carats: delta,
                            movementType: 'weight_tolerance',
                            unitCost: specCost,
                            totalValue: delta * specCost,
                            notes: `Scale weight variance on Bag #${bagNumber}: weighed ${wEntry.ct.toFixed(4)}ct vs expected ${expectedCt.toFixed(4)}ct (${delta > 0 ? '+' : ''}${delta.toFixed(4)}ct, ${((delta / expectedCt) * 100).toFixed(2)}%).`,
                            mainStockChange: 0,
                            wipStockChange: 0,
                            status: 'active'
                        };
                        transaction.set(doc(db, 'diamond_transactions', txId), deepCopySafe(toleranceTx));
                    }
                }
            });

            await this.runLedgerAuditAndNotify();
        }

        // Notify on return discrepancies (broken stones)
        const setter = this.getUser(bag.issuedToId);
        const returnerName = setter?.name || 'Setter';
        let totalBroken = 0;
        const specsBroken: string[] = [];
        const itemsToProcess = correctedItems || bag.items;

        for (const item of itemsToProcess) {
            const brokenPcs = brokenCounts?.find(b => b.specId === item.specId)?.pcs || 0;
            if (brokenPcs > 0) {
                totalBroken += brokenPcs;
                const specLabel = this.specs.find(s => s.id === item.specId)?.label || item.specId;
                specsBroken.push(`${brokenPcs} pcs of ${specLabel}`);
            }
        }

        if (totalBroken > 0) {
            const managers = this.getUsers().filter(u => u.role === Role.MANAGER);
            for (const m of managers) {
                const notifId = `notif-broken-bag-${bagNumber}-${m.id}`;
                await this.sendNotification(
                    m.id,
                    'Broken Stones Reported',
                    `Bag #${bagNumber} returned by ${returnerName} has ${totalBroken} broken stones: ${specsBroken.join(', ')}.`,
                    'RETURN',
                    '/reports',
                    notifId,
                    bag.projectId
                );
            }
        }

        if (correctedItems) {
            const managers = this.getUsers().filter(u => u.role === Role.MANAGER);
            for (const m of managers) {
                const notifId = `notif-corrected-bag-${bagNumber}-${m.id}`;
                await this.sendNotification(
                    m.id,
                    'Bag Return Corrected',
                    `Bag #${bagNumber} return items were corrected by manager during count confirmation.`,
                    'SYSTEM',
                    '/reports',
                    notifId,
                    bag.projectId
                );
            }
        }

        this.notify();
    }

    getInventoryMovements() { return this.movements.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); }

    // Enrich a raw movement line so that BOTH measurements are always persisted
    // coherently at write time:
    //   • averageWeightSnapshot = catalog ct/stone captured now (immutable history)
    //   • ct = FULL-PRECISION carat magnitude, tied to pieces unless the entry is
    //     explicitly weight-authoritative (Add Stock → Weight mode) or a
    //     carat-only bucket (MIXED-UNSORTED / pcs-less line).
    // This is the central guarantee that pieces and carats can never drift.
    private enrichMovementLine(line: InventoryLine, weightAuthoritative: boolean): InventoryLine {
        const spec = this.specs.find(s => s.id === line.specId);
        const snapshot = resolveAvgWeight(line, spec);
        const pcs = line.pcs || 0;
        const hasExactCt = line.ct !== undefined && line.ct !== null && line.ct !== 0;
        const isCaratOnly = line.specId === MIXED_UNSORTED_SPEC_ID || (pcs === 0 && hasExactCt);

        let ct: number;
        if (isCaratOnly || (weightAuthoritative && hasExactCt)) {
            // Preserve the exact entered/authoritative carat weight.
            ct = roundCt(line.ct as number);
        } else {
            // Pieces are authoritative: derive full-precision carats from the
            // snapshot. Overrides any display-rounded ct supplied by the UI.
            ct = roundCt(pcs * snapshot);
        }

        return {
            ...line,
            pcs: line.pcs,
            ct,
            averageWeightSnapshot: snapshot > 0 ? snapshot : undefined,
        };
    }

    async createInventoryMovement(mov: Partial<InventoryMovement> & { weightAuthoritative?: boolean }, tx?: any) {
        if (!this.isDemoMode) {
            if (tx) throw new Error('Client-side inventory transactions are disabled. Use a protected Phase 1 backend operation.');
            if (!this.currentUser || this.currentUser.role !== Role.MANAGER) throw new Error('Only Managers can record inventory movements.');
            await inventoryApi.recordMovement({
                ...mov,
                operationId: mov.operationId || newOperationId(),
                createdById: this.currentUser.id,
            });
            return;
        }
        const id = mov.id || 'mov-' + Math.random().toString(36).substr(2, 9);
        const weightAuthoritative = !!mov.weightAuthoritative;

        // Persist coherent, snapshot-backed lines and keep the weight-authority
        // marker so future reads know when stored carats are intentional.
        const enrichedLines = (mov.lines || []).map(l =>
            l.specId ? this.enrichMovementLine(l, weightAuthoritative) : l
        );
        const { weightAuthoritative: _omit, ...movRest } = mov;
        const safeMov = deepCopySafe({
            id,
            createdAt: now(),
            ...movRest,
            weightAuthoritative: weightAuthoritative || undefined,
            lines: enrichedLines,
        });
        if (this.isDemoMode) {
            this.movements.push(safeMov as any);
        } else {
            if (tx) {
                tx.set(doc(db, 'movements', id), safeMov);
            } else {
                await setDoc(doc(db, 'movements', id), safeMov);
            }
        }

        // Automatically log ledger transactions (kept in lock-step with movements)
        if (enrichedLines.length > 0) {
            for (const line of enrichedLines) {
                if (!line.specId) continue;

                const spec = this.specs.find(s => s.id === line.specId);
                const specCost = line.costPerCtUsd || spec?.defaultCostPerCtUsd || 0;
                const snapshot = resolveAvgWeight(line, spec);

                const linePcs = line.pcs || 0;
                const lineCt = line.ct || 0; // already full-precision from enrichment
                const totalValue = roundCt(lineCt * specCost);

                let mainStockChange = 0;
                let wipStockChange = 0;
                let movementType: DiamondLedgerTransaction['movementType'] = 'adjusted';
                let qty = linePcs;
                let cts = lineCt;

                const type = mov.type;

                if (type === InventoryMovementType.SHIPMENT_IN) {
                    movementType = 'added';
                    mainStockChange = linePcs;
                    wipStockChange = 0;
                } else if (type === InventoryMovementType.ISSUE) {
                    movementType = 'assigned';
                    mainStockChange = -linePcs;
                    wipStockChange = linePcs;
                    qty = -linePcs;
                    cts = -lineCt;
                } else if (type === InventoryMovementType.RETURN || type === InventoryMovementType.BULK_RETURN_INTAKE) {
                    movementType = 'returned';
                    mainStockChange = linePcs;
                    wipStockChange = -linePcs;
                } else if (type === InventoryMovementType.RETURN_MIXED) {
                    movementType = 'returned';
                    mainStockChange = 0;
                    wipStockChange = 0;
                } else if (type === InventoryMovementType.MANUAL_ADJUSTMENT) {
                    movementType = 'adjusted';
                    mainStockChange = linePcs;
                    wipStockChange = 0;
                } else if (type === InventoryMovementType.INVENTORY_CORRECTION) {
                    // Signed correction: line.pcs / line.ct carry the (already signed)
                    // delta between previous and new balance.
                    movementType = 'corrected';
                    mainStockChange = linePcs;
                    wipStockChange = 0;
                    qty = linePcs;
                    cts = lineCt;
                } else if (type === InventoryMovementType.BROKEN_OUT) {
                    movementType = 'broken';
                    if (mov.referenceProjectId) {
                        mainStockChange = 0;
                        wipStockChange = -linePcs;
                        qty = -linePcs;
                        cts = -lineCt;
                    } else {
                        mainStockChange = -linePcs;
                        wipStockChange = 0;
                        qty = -linePcs;
                        cts = -lineCt;
                    }
                }

                const color = spec?.color || 'White';
                const txId = `tx-mov-${id}-${line.specId || 'mixed'}`;

                const transaction: DiamondLedgerTransaction = {
                    id: txId,
                    createdAt: safeMov.createdAt,
                    createdById: safeMov.createdById || 'system',
                    referenceProjectId: mov.referenceProjectId,
                    referenceBagNumber: mov.referenceBagNumber,
                    specId: line.specId,
                    color,
                    quantity: qty,
                    carats: roundCt(cts),
                    movementType,
                    unitCost: specCost,
                    totalValue,
                    averageWeightSnapshot: snapshot > 0 ? snapshot : undefined,
                    notes: mov.notes || `${movementType.toUpperCase()} transaction from movement.`,
                    mainStockChange,
                    wipStockChange,
                    status: 'active'
                };

                if (this.isDemoMode) {
                    this.diamondTransactions.push(transaction);
                } else {
                    if (tx) {
                        tx.set(doc(db, 'diamond_transactions', txId), deepCopySafe(transaction));
                    } else {
                        await setDoc(doc(db, 'diamond_transactions', txId), deepCopySafe(transaction));
                    }
                }

                // Phase 1: Update the spec document's pcs and ct cache (if Melee spec)
                const isMelee = !spec || !spec.location || spec.location === 'Melee';
                if (isMelee) {
                    let mainCaratChange = 0;
                    if (mainStockChange !== 0) {
                        mainCaratChange = cts;
                    }
                    if (this.isDemoMode) {
                        const s = this.specs.find(sp => sp.id === line.specId);
                        if (s) {
                            s.pcs = (s.pcs || 0) + mainStockChange;
                            s.ct = roundCt((s.ct || 0) + mainCaratChange);
                        }
                    } else {
                        const specRef = doc(db, 'specs', line.specId);
                        if (tx) {
                            tx.update(specRef, {
                                pcs: increment(mainStockChange),
                                ct: increment(mainCaratChange)
                            });
                        } else {
                            await updateDoc(specRef, {
                                pcs: increment(mainStockChange),
                                ct: increment(mainCaratChange)
                            });
                        }
                    }
                }
            }
        }

        // 1. Notify Managers on Diamond Receive Completed
        if (mov.type === InventoryMovementType.SHIPMENT_IN && enrichedLines.length > 0) {
            const managers = this.getUsers().filter(u => u.role === Role.MANAGER);
            const creator = this.getUser(mov.createdById || '')?.name || 'System';
            const totalPcs = enrichedLines.reduce((sum, l) => sum + (l.pcs || 0), 0);
            const totalCt = enrichedLines.reduce((sum, l) => sum + (l.ct || 0), 0);
            const label = enrichedLines.length === 1 && enrichedLines[0].specId
                ? (this.specs.find(s => s.id === enrichedLines[0].specId)?.label || 'Diamonds')
                : 'Diamonds';

            for (const m of managers) {
                const notifId = `notif-receive-${id}-${m.id}`;
                await this.sendNotification(
                    m.id,
                    'Diamonds Received',
                    `${creator} completed diamond receive: ${totalPcs} pcs (${Number(totalCt.toFixed(3))} ct) of ${label}.`,
                    'STATUS_UPDATE',
                    '/reports',
                    notifId,
                    undefined,
                    { totalPcs, totalCt, label }
                );
            }
        }

        // 2. Run Ledger Audit for Negative Stock Check
        if (!tx) {
            await this.runLedgerAuditAndNotify();
        }

        this.notify();
    }

    // Movement records are immutable. Firestore rules block all `update` on
    // /movements. This method is retained only to surface a clear error if any
    // caller still references it — the caller must be updated to use a create-only
    // correction movement (INVENTORY_CORRECTION) instead.
    updateInventoryMovement(_mov: InventoryMovement): never {
        throw new Error(
            'Movement records are immutable. updateInventoryMovement is disabled. ' +
            'Use applyInventoryCorrection to create an audited INVENTORY_CORRECTION movement instead.'
        );
    }

    getLedgerTransactions(): DiamondLedgerTransaction[] {
        const activeTxs = this.diamondTransactions.filter(t => t.status === 'active');
        const txMap = new Set(activeTxs.map(t => t.id));

        const virtualTxs: DiamondLedgerTransaction[] = [];

        this.movements.forEach(m => {
            m.lines.forEach(l => {
                if (!l.specId) return;

                const txId = `tx-mov-${m.id}-${l.specId}`;
                if (txMap.has(txId)) return;

                const spec = this.specs.find(s => s.id === l.specId);
                const specCost = l.costPerCtUsd || spec?.defaultCostPerCtUsd || 0;
                const snapshot = resolveAvgWeight(l, spec);
                const linePcs = l.pcs || 0;
                const lineCt = resolveLineCarats(m, l, spec);
                const totalValue = roundCt(lineCt * specCost);

                let mainStockChange = 0;
                let wipStockChange = 0;
                let movementType: DiamondLedgerTransaction['movementType'] = 'adjusted';
                let qty = linePcs;
                let cts = lineCt;

                const type = m.type;

                if (type === InventoryMovementType.SHIPMENT_IN) {
                    movementType = 'added';
                    mainStockChange = linePcs;
                    wipStockChange = 0;
                } else if (type === InventoryMovementType.ISSUE) {
                    movementType = 'assigned';
                    mainStockChange = -linePcs;
                    wipStockChange = linePcs;
                    qty = -linePcs;
                    cts = -lineCt;
                } else if (type === InventoryMovementType.RETURN || type === InventoryMovementType.BULK_RETURN_INTAKE) {
                    movementType = 'returned';
                    mainStockChange = linePcs;
                    wipStockChange = -linePcs;
                } else if (type === InventoryMovementType.RETURN_MIXED) {
                    movementType = 'returned';
                    mainStockChange = 0;
                    wipStockChange = 0;
                } else if (type === InventoryMovementType.MANUAL_ADJUSTMENT) {
                    movementType = 'adjusted';
                    mainStockChange = linePcs;
                    wipStockChange = 0;
                } else if (type === InventoryMovementType.INVENTORY_CORRECTION) {
                    movementType = 'corrected';
                    mainStockChange = linePcs;
                    wipStockChange = 0;
                } else if (type === InventoryMovementType.BROKEN_OUT) {
                    movementType = 'broken';
                    if (m.referenceProjectId) {
                        mainStockChange = 0;
                        wipStockChange = -linePcs;
                        qty = -linePcs;
                        cts = -lineCt;
                    } else {
                        mainStockChange = -linePcs;
                        wipStockChange = 0;
                        qty = -linePcs;
                        cts = -lineCt;
                    }
                }

                virtualTxs.push({
                    id: txId,
                    createdAt: m.createdAt,
                    createdById: m.createdById || 'system',
                    referenceProjectId: m.referenceProjectId,
                    referenceBagNumber: m.referenceBagNumber,
                    specId: l.specId,
                    color: spec?.color || 'White',
                    quantity: qty,
                    carats: roundCt(cts),
                    movementType,
                    unitCost: specCost,
                    totalValue,
                    averageWeightSnapshot: snapshot > 0 ? snapshot : undefined,
                    notes: m.notes || `Legacy ${movementType} transaction.`,
                    mainStockChange,
                    wipStockChange,
                    status: 'active'
                });
            });
        });

        const completedProjects = this.projects.filter(p => p.status === ProjectStatus.CLOSED || p.status === ProjectStatus.REVIEW);
        completedProjects.forEach(p => {
            const bags = this.getBags(p.id);
            bags.forEach(bag => {
                bag.items.forEach(item => {
                    const txId = `tx-used-${bag.id}-${item.specId}`;
                    if (txMap.has(txId)) return;

                    const projectMovements = this.movements.filter(m => m.referenceProjectId === p.id && m.referenceBagNumber === bag.bagNumber);
                    const returnedPcs = projectMovements
                        .filter(m => m.type === InventoryMovementType.RETURN || m.type === InventoryMovementType.BULK_RETURN_INTAKE)
                        .reduce((acc, m) => acc + m.lines.filter(l => l.specId === item.specId).reduce((sum, l) => sum + (l.pcs || 0), 0), 0);

                    const brokenPcs = projectMovements
                        .filter(m => m.type === InventoryMovementType.BROKEN_OUT)
                        .reduce((acc, m) => acc + m.lines.filter(l => l.specId === item.specId).reduce((sum, l) => sum + (l.pcs || 0), 0), 0);

                    const usedPcs = item.issuedPcs - returnedPcs - brokenPcs;

                    if (usedPcs > 0) {
                        const spec = this.specs.find(s => s.id === item.specId);
                        const specCost = spec?.defaultCostPerCtUsd || 0;
                        const ctPerStone = spec?.ctPerStone || 0;
                        const usedCt = usedPcs * ctPerStone;

                        virtualTxs.push({
                            id: txId,
                            createdAt: p.date_completed || p.date_picked_up || p.createdAt,
                            createdById: 'system',
                            referenceProjectId: p.id,
                            referenceBagNumber: bag.bagNumber,
                            specId: item.specId,
                            color: spec?.color || 'White',
                            quantity: -usedPcs,
                            carats: -usedCt,
                            movementType: 'used',
                            unitCost: specCost,
                            totalValue: usedCt * specCost,
                            notes: `Legacy used in production for Bag #${bag.bagNumber}.`,
                            mainStockChange: 0,
                            wipStockChange: -usedPcs,
                            status: 'active'
                        });
                    }
                });
            });
        });

        const allTxs = [...activeTxs, ...virtualTxs];
        return allTxs.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }

    getSpecStockBalance(specId: string, color: string = 'White') {
        const txs = this.getLedgerTransactions();
        const main = txs.filter(t => t.specId === specId && t.color === color).reduce((acc, t) => acc + t.mainStockChange, 0);
        const wip = txs.filter(t => t.specId === specId && t.color === color).reduce((acc, t) => acc + t.wipStockChange, 0);
        return { main, wip, total: main + wip };
    }

    async logDiamondTransaction(tx: Omit<DiamondLedgerTransaction, 'id' | 'createdAt' | 'status'>) {
        if (!this.isDemoMode) {
            throw new Error('Direct ledger writes are disabled. Use a protected inventory operation.');
        }
        const id = 'tx-' + Math.random().toString(36).substr(2, 9);
        const newTx: DiamondLedgerTransaction = {
            id,
            createdAt: now(),
            status: 'active',
            ...tx
        };
        const safeTx = deepCopySafe(newTx);
        if (this.isDemoMode) {
            this.diamondTransactions.push(safeTx);
        } else {
            await setDoc(doc(db, 'diamond_transactions', id), safeTx);
        }
        this.notify();
    }

    async editLedgerTransaction(txId: string, updatedFields: Partial<Omit<DiamondLedgerTransaction, 'id' | 'createdAt' | 'status'>>, userId: string) {
        if (!this.isDemoMode) {
            throw new Error('Historical ledger records are immutable. Apply a reversing and replacement correction instead.');
        }
        const tx = this.diamondTransactions.find(t => t.id === txId);
        if (!tx) {
            const allTxs = this.getLedgerTransactions();
            const virtualTx = allTxs.find(t => t.id === txId);
            if (!virtualTx) throw new Error("Transaction not found");

            const newTxId = 'tx-' + Math.random().toString(36).substr(2, 9);
            const newTx: DiamondLedgerTransaction = {
                ...virtualTx,
                ...updatedFields,
                id: newTxId,
                createdAt: now(),
                status: 'active',
                originalTxId: txId
            };
            const safeTx = deepCopySafe(newTx);
            if (this.isDemoMode) {
                this.diamondTransactions.push(safeTx);
            } else {
                await setDoc(doc(db, 'diamond_transactions', newTxId), safeTx);
            }
            await this.addSystemLog('INVENTORY', `Virtual transaction materialized and edited by manager. New: ${newTxId}`);
            this.notify();
            return;
        }

        const newTxId = 'tx-' + Math.random().toString(36).substr(2, 9);

        if (this.isDemoMode) {
            tx.status = 'edited';
            tx.editedById = userId;
            tx.editedAt = now();
        } else {
            await updateDoc(doc(db, 'diamond_transactions', txId), {
                status: 'edited',
                editedById: userId,
                editedAt: now()
            });
        }

        const newTx: DiamondLedgerTransaction = {
            ...tx,
            ...updatedFields,
            id: newTxId,
            createdAt: now(),
            status: 'active',
            originalTxId: txId
        };

        const safeTx = deepCopySafe(newTx);
        if (this.isDemoMode) {
            this.diamondTransactions.push(safeTx);
        } else {
            await setDoc(doc(db, 'diamond_transactions', newTxId), safeTx);
        }

        await this.addSystemLog('INVENTORY', `Transaction edited by manager. Old: ${txId}, New: ${newTxId}`);
        this.notify();
    }

    async deleteLedgerTransaction(txId: string, userId: string) {
        if (!this.isDemoMode) {
            throw new Error('Historical ledger records cannot be deleted. Apply a reversing and replacement correction instead.');
        }
        const tx = this.diamondTransactions.find(t => t.id === txId);
        if (!tx) {
            const allTxs = this.getLedgerTransactions();
            const virtualTx = allTxs.find(t => t.id === txId);
            if (!virtualTx) throw new Error("Transaction not found");

            const newTxId = 'tx-' + Math.random().toString(36).substr(2, 9);
            const newTx: DiamondLedgerTransaction = {
                ...virtualTx,
                id: newTxId,
                status: 'deleted',
                editedById: userId,
                editedAt: now()
            };
            const safeTx = deepCopySafe(newTx);
            if (this.isDemoMode) {
                this.diamondTransactions.push(safeTx);
            } else {
                await setDoc(doc(db, 'diamond_transactions', newTxId), safeTx);
            }
            await this.addSystemLog('INVENTORY', `Virtual transaction deleted (tombstone written) by manager: ${txId}`);
            this.notify();
            return;
        }

        if (this.isDemoMode) {
            tx.status = 'deleted';
            tx.editedById = userId;
            tx.editedAt = now();
        } else {
            await updateDoc(doc(db, 'diamond_transactions', txId), {
                status: 'deleted',
                editedById: userId,
                editedAt: now()
            });
        }

        await this.addSystemLog('INVENTORY', `Transaction deleted by manager: ${txId}`);
        this.notify();
    }

    // ── Single reconciled source of truth for Current Stock ────────────────────
    // Pieces and carats are summed with a SHARED, snapshot-based per-line ratio
    // (see inventoryMath.computeLineDelta) so they can never drift, then passed
    // through normalizeBalance which enforces every data invariant:
    //   • 0 pieces ⇒ 0 carats (except the MIXED-UNSORTED carat-only bucket)
    //   • negatives clamped + flagged, sub-epsilon float residue snapped to 0.
    // Every page that shows Current Stock / Estimated Value MUST read this.
    getInventorySummary(location: string = 'Melee'): InventorySummaryItem[] {
        const raw = new Map<string, { pcs: number; ct: number }>();

        this.movements.forEach(m => {
            m.lines.forEach(l => {
                if (!l.specId) return;

                // MIXED-UNSORTED only belongs to Melee
                if (l.specId === MIXED_UNSORTED_SPEC_ID) {
                    if (location !== 'Melee') return;
                } else {
                    const spec = this.specs.find(s => s.id === l.specId);
                    const specLocation = spec?.location || 'Melee';
                    if (specLocation !== location) return;
                }

                const spec = this.specs.find(s => s.id === l.specId);
                const { pieceDelta, caratDelta } = computeLineDelta(m, l, spec);

                const current = raw.get(l.specId) || { pcs: 0, ct: 0 };
                current.pcs += pieceDelta;
                current.ct = roundCt(current.ct + caratDelta);
                raw.set(l.specId, current);
            });
        });

        return Array.from(raw.entries()).map(([specId, data]) => {
            const spec = this.specs.find(s => s.id === specId) || { id: specId, label: 'Unknown', sizeMm: 0, ctPerStone: 0, defaultCostPerCtUsd: 0 };
            const norm = normalizeBalance(data, specId);
            const displayCt = calculateCurrentStockCarats(specId, norm.pcs, spec.ctPerStone || 0, norm.ct);
            return {
                spec,
                pcs: norm.pcs,
                ct: displayCt,
                estimatedValueUsd: estimatedValue(displayCt, spec.defaultCostPerCtUsd || 0),
                negativePieces: norm.negativePieces,
                negativeCarats: norm.negativeCarats,
            };
        });
    }

    // ── Controlled, manager-only Inventory Correction ──────────────────────────
    // Replaces the old silent "Quick Stock Adjustment" (editStock). Instead of
    // overwriting a balance, it writes ONE auditable INVENTORY_CORRECTION movement
    // whose signed line delta moves the balance from previous → new. Pieces and
    // carats are corrected together in the same transaction, so they can never
    // diverge. Only managers may call this.
    async applyInventoryCorrection(input: InventoryCorrectionInput) {
        const manager = this.getUser(input.managerId) || this.currentUser;
        if (!manager || manager.role !== Role.MANAGER) {
            throw new Error('Inventory corrections may only be performed by a manager.');
        }
        if (!input.reason || !input.reason.trim()) {
            throw new Error('A correction reason is required.');
        }

        const spec = this.specs.find(s => s.id === input.specId);
        if (!spec) throw new Error('Diamond specification not found.');

        const snapshot = spec.ctPerStone || 0;

        // Resolve target balance based on the entry mode, keeping pieces & carats
        // coherent (pieces authoritative unless the correction is weight-based).
        let targetPcs: number;
        let targetCt: number;
        if (input.mode === 'WEIGHT') {
            targetCt = roundCt(input.newCt);
            targetPcs = snapshot > 0 ? Math.round(targetCt / snapshot) : input.newPcs;
        } else {
            targetPcs = Math.round(input.newPcs);
            targetCt = roundCt(targetPcs * snapshot);
        }
        if (targetPcs < 0) throw new Error('Corrected pieces cannot be negative.');
        if (targetCt < 0) throw new Error('Corrected carat weight cannot be negative.');

        if (this.isDemoMode) {
            const current = this.getInventorySummary(input.location).find(s => s.spec.id === input.specId);
            const currentPcs = current?.pcs || 0;
            const currentCt = current?.ct || 0;
            const pieceDelta = targetPcs - currentPcs;
            const caratDelta = roundCt(targetCt - currentCt);

            if (pieceDelta === 0 && Math.abs(caratDelta) < 0.0005) return; // no-op

            await this.createInventoryMovement({
                type: InventoryMovementType.INVENTORY_CORRECTION,
                createdById: input.managerId,
                weightAuthoritative: input.mode === 'WEIGHT',
                notes: `Inventory Correction by ${manager.name}: ${currentPcs}pc/${currentCt.toFixed(3)}ct → ${targetPcs}pc/${targetCt.toFixed(3)}ct. Reason: ${input.reason.trim()}`,
                lines: [{
                    specId: input.specId,
                    pcs: pieceDelta,
                    ct: caratDelta,
                    averageWeightSnapshot: snapshot > 0 ? snapshot : undefined,
                }],
                location: input.location,
            });

            await this.addSystemLog(
                'INVENTORY_CORRECTION',
                `${manager.name} corrected ${spec.label} @ ${input.location}: ${currentPcs}pc/${currentCt.toFixed(3)}ct → ${targetPcs}pc/${targetCt.toFixed(3)}ct (${input.reason.trim()})`
            );
            return;
        }

        await inventoryApi.applyCorrection({
            operationId: newOperationId(),
            specId: input.specId,
            reason: input.reason.trim(),
            mode: input.mode,
            previousPcs: input.previousPcs,
            previousCt: input.previousCt,
            targetPcs,
            targetCt,
            reconciliation: input.reconciliation,
        });
        return;

        // Production / Firestore Mode: Run inside a true transaction to prevent concurrent correction drift
        const lockId = `corr_${input.specId}_${input.location}_${input.previousPcs}_${input.previousCt}_${input.newPcs}_${input.newCt}`.replace(/\s+/g, '_');

        await runTransaction(db, async (tx) => {
            // 1. Read uniqueness lock doc to prevent double-submit/concurrency race
            const lockRef = doc(db, 'uniqueness_locks', lockId);
            const lockDoc = await tx.get(lockRef);
            if (lockDoc.exists()) {
                throw new Error('This discrepancy correction has already been applied.');
            }

            // 2. Read manager document to enforce permissions at DB level
            const managerRef = doc(db, 'users', input.managerId);
            const managerDoc = await tx.get(managerRef);
            if (!managerDoc.exists() || managerDoc.data()?.role !== 'Manager') {
                throw new Error('Inventory corrections may only be performed by a manager.');
            }
            const managerData = managerDoc.data();

            // 3. Read the latest spec document to get fresh authoritative stock values
            const specRef = doc(db, 'specs', input.specId);
            const specDoc = await tx.get(specRef);
            if (!specDoc.exists()) {
                throw new Error('Diamond specification not found.');
            }
            const specData = specDoc.data();

            const currentPcs = specData.pcs || 0;
            const currentCt = specData.ct || 0;

            // 4. Validate that the discrepancy audit remains fresh (reject stale targets)
            if (currentPcs !== input.previousPcs || Math.abs(currentCt - input.previousCt) > 0.0005) {
                throw new Error('Stale discrepancy data. The inventory balance has changed since the audit. Please refresh and try again.');
            }

            const pieceDelta = targetPcs - currentPcs;
            const caratDelta = roundCt(targetCt - currentCt);

            // If no-op, just write the lock and exit to satisfy idempotency
            if (pieceDelta === 0 && Math.abs(caratDelta) < 0.0005) {
                tx.set(lockRef, {
                    createdAt: serverTimestamp(),
                    appliedBy: input.managerId,
                    reason: input.reason.trim(),
                    status: 'no_op_completed'
                });
                return;
            }

            // 5. Write the uniqueness lock document
            tx.set(lockRef, {
                createdAt: serverTimestamp(),
                appliedBy: input.managerId,
                reason: input.reason.trim(),
                status: 'completed'
            });

            // 6. Write the movement delta document
            const movId = 'mov-' + Math.random().toString(36).substr(2, 9);
            const enrichedLines = [{
                specId: input.specId,
                pcs: pieceDelta,
                ct: caratDelta,
                averageWeightSnapshot: snapshot > 0 ? snapshot : undefined,
            }];

            const safeMov = deepCopySafe({
                id: movId,
                createdAt: now(),
                createdById: input.managerId,
                type: InventoryMovementType.INVENTORY_CORRECTION,
                weightAuthoritative: input.mode === 'WEIGHT',
                notes: `Inventory Correction by ${managerData.name}: ${currentPcs}pc/${currentCt.toFixed(3)}ct → ${targetPcs}pc/${targetCt.toFixed(3)}ct. Reason: ${input.reason.trim()}`,
                lines: enrichedLines,
                location: input.location,
                reversesCorrectionId: input.reversesCorrectionId || undefined,
                reversesTransactionId: input.reversesTransactionId || undefined,
                replacementCorrectionId: input.replacementCorrectionId || undefined,
            });
            tx.set(doc(db, 'movements', movId), safeMov);

            // 7. Write the diamond ledger transaction document
            const txId = `tx-mov-${movId}-${input.specId}`;
            const specCost = specData.defaultCostPerCtUsd || 0;
            const totalValue = roundCt(caratDelta * specCost);

            const transaction: DiamondLedgerTransaction = {
                id: txId,
                createdAt: safeMov.createdAt,
                createdById: input.managerId,
                specId: input.specId,
                color: specData.color || 'White',
                quantity: pieceDelta,
                carats: roundCt(caratDelta),
                movementType: 'corrected',
                unitCost: specCost,
                totalValue,
                averageWeightSnapshot: snapshot > 0 ? snapshot : undefined,
                notes: safeMov.notes,
                mainStockChange: pieceDelta,
                wipStockChange: 0,
                status: 'active',
                reversesCorrectionId: input.reversesCorrectionId || undefined,
                reversesTransactionId: input.reversesTransactionId || undefined,
                replacementCorrectionId: input.replacementCorrectionId || undefined,
            };
            tx.set(doc(db, 'diamond_transactions', txId), deepCopySafe(transaction));

            // 8. Update the spec document's pcs & ct cache
            const isMelee = !specData.location || specData.location === 'Melee';
            if (isMelee) {
                tx.update(specRef, {
                    pcs: currentPcs + pieceDelta,
                    ct: roundCt(currentCt + caratDelta)
                });
            }

            // 9. Record system log
            const logId = 'log-' + Math.random().toString(36).substr(2, 9);
            tx.set(doc(db, 'system_logs', logId), {
                id: logId,
                action: 'INVENTORY_CORRECTION',
                userId: input.managerId,
                createdAt: now(),
                details: `${managerData.name} corrected ${specData.label} @ ${input.location}: ${currentPcs}pc/${currentCt.toFixed(3)}ct → ${targetPcs}pc/${targetCt.toFixed(3)}ct (${input.reason.trim()})`
            });
        });
    }

    // ── Reconciliation: audit + safe repair of historical balances ─────────────
    // Computes the RAW (un-normalized) ledger balance per spec so we can compare
    // it against the invariants and see residue that read-time normalization would
    // otherwise hide. Returns a map keyed by specId.
    private getRawSpecBalances(location: string = 'Melee'): Map<string, { pcs: number; ct: number }> {
        const raw = new Map<string, { pcs: number; ct: number }>();
        this.movements.forEach(m => {
            m.lines.forEach(l => {
                if (!l.specId) return;
                if (l.specId === MIXED_UNSORTED_SPEC_ID) {
                    if (location !== 'Melee') return;
                } else {
                    const spec = this.specs.find(s => s.id === l.specId);
                    if ((spec?.location || 'Melee') !== location) return;
                }
                const spec = this.specs.find(s => s.id === l.specId);
                const { pieceDelta, caratDelta } = computeLineDelta(m, l, spec);
                const cur = raw.get(l.specId) || { pcs: 0, ct: 0 };
                cur.pcs += pieceDelta;
                cur.ct = roundCt(cur.ct + caratDelta);
                raw.set(l.specId, cur);
            });
        });
        return raw;
    }

    // Dry-run audit: classify every balance discrepancy without writing anything.
    getInventoryAudit(locations?: string[]): ReconcileResult {
        const locs = locations && locations.length
            ? locations
            : Array.from(new Set(['Melee', ...(this.settings.inventoryLocations || [])]));
        const issues: ReconcileIssue[] = [];
        let scannedSpecs = 0;

        for (const location of locs) {
            const raw = this.getRawSpecBalances(location);

            // Check for specs with no movements but non-zero balance (stale seeded stock)
            this.specs.forEach(spec => {
                if ((spec.location || 'Melee') !== location) return;
                if (spec.id === MIXED_UNSORTED_SPEC_ID) return;
                if (!raw.has(spec.id) && ((spec.pcs || 0) > 0 || (spec.ct || 0) > 0.0005)) {
                    const base = {
                        specId: spec.id,
                        specLabel: spec.label,
                        location,
                        currentPcs: spec.pcs || 0,
                        currentCt: spec.ct || 0,
                        resolvedPcs: 0,
                        resolvedCt: 0
                    };
                    issues.push({
                        ...base,
                        type: 'UNABLE_TO_RECONCILE_SAFELY',
                        autoRepairable: false,
                        detail: `No movement history exists for this spec, but spec has stock (${spec.pcs}pcs / ${spec.ct}ct). Unable to reconcile safely.`
                    });
                }
            });

            raw.forEach((bal, specId) => {
                scannedSpecs++;
                if (specId === MIXED_UNSORTED_SPEC_ID) return; // carat-only bucket is exempt
                const spec = this.specs.find(s => s.id === specId);
                const norm = normalizeBalance(bal, specId);
                const label = spec?.label || specId;
                const base = {
                    specId,
                    specLabel: label,
                    location,
                    currentPcs: spec?.pcs || 0, // Stored cached value in spec document
                    currentCt: spec?.ct || 0,
                    resolvedPcs: norm.pcs,     // Expected transaction-derived value
                    resolvedCt: norm.ct
                };

                // Check for Cache Drift (displayed stock differs from transaction ledger)
                if (spec && (spec.pcs !== norm.pcs || Math.abs((spec.ct || 0) - norm.ct) > 0.0005)) {
                    issues.push({
                        ...base,
                        type: 'CACHE_DRIFT',
                        autoRepairable: false,
                        detail: `Cached stock (${spec.pcs}pc / ${spec.ct}ct) differs from transaction ledger (${norm.pcs}pc / ${norm.ct}ct).`
                    });
                }

                const zeroPcs = Math.abs(bal.pcs) < 1e-6;
                if (zeroPcs && bal.ct > 0.0005) {
                    issues.push({ ...base, type: 'ZERO_PCS_NONZERO_CT', autoRepairable: false, detail: `0 pcs but ${bal.ct.toFixed(4)} ct remaining — stale carats, safe to zero.` });
                } else if (zeroPcs && bal.ct < -0.0005) {
                    issues.push({ ...base, type: 'ZERO_PCS_NEGATIVE_CT', autoRepairable: false, detail: `0 pcs but ${bal.ct.toFixed(4)} ct (negative) — safe to zero.` });
                } else if (bal.pcs < -1e-6) {
                    issues.push({ ...base, type: 'NEGATIVE_PCS', autoRepairable: false, detail: `Negative piece balance (${bal.pcs}). Requires manager review.` });
                } else if (bal.ct < -0.0005) {
                    issues.push({ ...base, type: 'NEGATIVE_CT', autoRepairable: false, detail: `Negative carat balance (${bal.ct.toFixed(4)}). Requires manager review.` });
                } else if (bal.pcs > 0 && bal.ct <= 0.0005) {
                    issues.push({ ...base, type: 'POSITIVE_PCS_ZERO_CT', autoRepairable: false, detail: `${bal.pcs} pcs but ~0 ct. Requires manager review.` });
                }
            });
        }

        const autoRepaired: ReconcileIssue[] = []; // Disable auto-repair
        const needsManagerReview = issues;
        return { scannedSpecs, issues, autoRepaired, needsManagerReview };
    }

    // Purely dynamic fresh Firestore reader for Inventory Reconciliation (does not trust client-side cached collections)
    async getInventoryAuditFresh(locations?: string[]): Promise<ReconcileResult> {
        if (this.isDemoMode) {
            return this.getInventoryAudit(locations);
        }

        // Phase 2 replaces this legacy browser-side reader. The protected
        // callable paginates the specification page and reads source history on
        // the backend, so inventory history never has to be loaded into a tab.
        const audit = await inventoryApi.runReconciliationAudit({ location: 'TORONTO_MELEE', dryRun: true });
        return audit as unknown as ReconcileResult;

        /* Retired Phase 1 client-side implementation. Kept below temporarily
         * only as a historical reference while the Phase 2 service rolls out;
         * it is unreachable in every runtime path. */
        const movsSnap = await getDocs(collection(db, 'movements'));
        const specsSnap = await getDocs(collection(db, 'specs'));

        const freshMovements = movsSnap.docs.map(d => ({ ...d.data(), id: d.id })) as InventoryMovement[];
        const freshSpecs = specsSnap.docs.map(d => ({ ...d.data(), id: d.id })) as DiamondSpec[];

        const locs = locations && locations.length
            ? locations
            : Array.from(new Set(['Melee', ...(this.settings.inventoryLocations || [])]));
        const issues: ReconcileIssue[] = [];
        let scannedSpecs = 0;

        for (const location of locs) {
            const raw = new Map<string, { pcs: number; ct: number }>();
            freshMovements.forEach(m => {
                m.lines.forEach(l => {
                    if (!l.specId) return;
                    if (l.specId === MIXED_UNSORTED_SPEC_ID) {
                        if (location !== 'Melee') return;
                    } else {
                        const spec = freshSpecs.find(s => s.id === l.specId);
                        if ((spec?.location || 'Melee') !== location) return;
                    }
                    const spec = freshSpecs.find(s => s.id === l.specId);
                    const { pieceDelta, caratDelta } = computeLineDelta(m, l, spec);
                    const cur = raw.get(l.specId) || { pcs: 0, ct: 0 };
                    cur.pcs += pieceDelta;
                    cur.ct = roundCt(cur.ct + caratDelta);
                    raw.set(l.specId, cur);
                });
            });

            // Check for specs with no movements but non-zero balance (stale seeded stock)
            freshSpecs.forEach(spec => {
                if ((spec.location || 'Melee') !== location) return;
                if (spec.id === MIXED_UNSORTED_SPEC_ID) return;
                if (!raw.has(spec.id) && ((spec.pcs || 0) > 0 || (spec.ct || 0) > 0.0005)) {
                    const base = {
                        specId: spec.id,
                        specLabel: spec.label,
                        location,
                        currentPcs: spec.pcs || 0,
                        currentCt: spec.ct || 0,
                        resolvedPcs: 0,
                        resolvedCt: 0
                    };
                    issues.push({
                        ...base,
                        type: 'UNABLE_TO_RECONCILE_SAFELY',
                        autoRepairable: false,
                        detail: `No movement history exists for this spec, but spec has stock (${spec.pcs}pcs / ${spec.ct}ct). Unable to reconcile safely.`
                    });
                }
            });

            raw.forEach((bal, specId) => {
                scannedSpecs++;
                if (specId === MIXED_UNSORTED_SPEC_ID) return;
                const spec = freshSpecs.find(s => s.id === specId);
                const norm = normalizeBalance(bal, specId);
                const label = spec?.label || specId;
                const base = {
                    specId,
                    specLabel: label,
                    location,
                    currentPcs: spec?.pcs || 0,
                    currentCt: spec?.ct || 0,
                    resolvedPcs: norm.pcs,
                    resolvedCt: norm.ct
                };

                if (spec && (spec.pcs !== norm.pcs || Math.abs((spec.ct || 0) - norm.ct) > 0.0005)) {
                    issues.push({
                        ...base,
                        type: 'CACHE_DRIFT',
                        autoRepairable: false,
                        detail: `Cached stock (${spec.pcs}pc / ${spec.ct}ct) differs from transaction ledger (${norm.pcs}pc / ${norm.ct}ct).`
                    });
                }

                const zeroPcs = Math.abs(bal.pcs) < 1e-6;
                if (zeroPcs && bal.ct > 0.0005) {
                    issues.push({ ...base, type: 'ZERO_PCS_NONZERO_CT', autoRepairable: false, detail: `0 pcs but ${bal.ct.toFixed(4)} ct remaining — stale carats, safe to zero.` });
                } else if (zeroPcs && bal.ct < -0.0005) {
                    issues.push({ ...base, type: 'ZERO_PCS_NEGATIVE_CT', autoRepairable: false, detail: `0 pcs but ${bal.ct.toFixed(4)} ct (negative) — safe to zero.` });
                } else if (bal.pcs < -1e-6) {
                    issues.push({ ...base, type: 'NEGATIVE_PCS', autoRepairable: false, detail: `Negative piece balance (${bal.pcs}). Requires manager review.` });
                } else if (bal.ct < -0.0005) {
                    issues.push({ ...base, type: 'NEGATIVE_CT', autoRepairable: false, detail: `Negative carat balance (${bal.ct.toFixed(4)}). Requires manager review.` });
                } else if (bal.pcs > 0 && bal.ct <= 0.0005) {
                    issues.push({ ...base, type: 'POSITIVE_PCS_ZERO_CT', autoRepairable: false, detail: `${bal.pcs} pcs but ~0 ct. Requires manager review.` });
                }
            });
        }

        const autoRepaired: ReconcileIssue[] = [];
        const needsManagerReview = issues;
        return { scannedSpecs, issues, autoRepaired, needsManagerReview };
    }

    async reconcileInventory(userId: string, opts?: { autoRepair?: boolean; locations?: string[] }): Promise<ReconcileResult> {
        throw new Error('Automatic inventory correction is disabled. All discrepancy corrections must be applied individually.');
    }

    // --- Config & Gold ---

    getSpecs() {
        return [...this.specs].sort((a, b) => a.sizeMm - b.sizeMm);
    }
    async addSpec(spec: DiamondSpec) {
        const safeSpec = deepCopySafe({
            ...spec,
            location: spec.location || 'Melee',
            pcs: spec.pcs ?? 0,
            ct: spec.ct ?? 0,
            stockVersion: spec.stockVersion ?? 0,
        });
        await setDoc(doc(db, 'specs', spec.id), safeSpec);
    }
    async updateSpecs(specs: DiamondSpec[]) {
        for (const s of specs) {
            const safeSpec = deepCopySafe(s);
            await updateDoc(doc(db, 'specs', s.id), safeSpec);
        }
    }

    async updateSpec(id: string, spec: Partial<DiamondSpec>) {
        const safeSpec = deepCopySafe(spec);
        if (this.isDemoMode) {
            const idx = this.specs.findIndex(s => s.id === id);
            if (idx !== -1) {
                this.specs[idx] = { ...this.specs[idx], ...safeSpec };
            }
        } else {
            await updateDoc(doc(db, 'specs', id), safeSpec);
        }
        this.notify();
    }

    hasLocationAccess(user: User | null, itemLocation?: string): boolean {
        if (!user) return false;
        if (!user.location || user.location.toLowerCase() === 'both' || user.location.trim() === '') {
            return true;
        }
        if (!itemLocation || itemLocation.toLowerCase() === 'melee') {
            return true;
        }
        if (user.location.toLowerCase() === 'toronto' && itemLocation.toLowerCase() === 'miami') {
            return false;
        }
        if (user.location.toLowerCase() === 'miami' && itemLocation.toLowerCase() === 'toronto') {
            return false;
        }
        return user.location.toLowerCase() === itemLocation.toLowerCase();
    }

    async dispatchNoteMentions(text: string, itemId: string, location: string, itemName: string) {
        const managers = this.getUsers().filter(u => u.role === Role.MANAGER);
        const userNames = managers.map(u => u.name);
        userNames.sort((a, b) => b.length - a.length);

        if (userNames.length === 0) return;

        const regexStr = `@(${userNames.map(n => n.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|')}|[A-Za-z0-9_]+)`;
        const regex = new RegExp(regexStr, 'g');
        const matches = text.match(regex) || [];

        const currentUser = this.currentUser;
        const authorName = currentUser?.name || 'A user';

        for (const matchText of matches) {
            const name = matchText.substring(1).trim();
            const matchedManager = managers.find(m => m.name.toLowerCase() === name.toLowerCase());
            if (matchedManager) {
                await this.sendNotification(
                    matchedManager.id,
                    'Inventory Note Mention',
                    `${authorName} mentioned you in an inventory note for ${itemName}`,
                    'MENTION',
                    `/inventory?openNote=${itemId}&loc=${location}`
                );
            }
        }
    }

    async clearSpecs(keepIds: string[] = []) {
        if (!this.isDemoMode) {
            throw new Error('Bulk specification deletion is disabled while Phase 1 inventory integrity controls are active.');
        }
        const batch = writeBatch(db);
        for (const s of this.specs) {
            if (!keepIds.includes(s.id)) {
                batch.delete(doc(db, 'specs', s.id));
            }
        }
        await batch.commit();
    }

    async deleteSpec(id: string) {
        const spec = this.specs.find(s => s.id === id);
        const label = spec ? spec.label : 'Unknown Spec';

        if (!this.isDemoMode) {
            throw new Error('Specification deletion is disabled because historical inventory records reference this specification.');
        }
        this.specs = this.specs.filter(s => s.id !== id);

        // Keeping movements collection completely immutable. Deleting/modifying historical movements is blocked.

        // Log movement to Global Activity feed
        await this.createInventoryMovement({
            type: InventoryMovementType.MELEE_SPEC_DELETE,
            createdById: this.currentUser?.id || 'system',
            notes: `Deleted Melee Specification: ${label}`,
            lines: [],
            location: this.currentUser?.location || 'Toronto'
        });

        // Log to System Logs
        await this.addSystemLog('DELETE_SPEC', `Deleted diamond spec: ${label}`);

        this.notify();
    }

    getDiamonds() {
        return [...this.diamonds];
    }
    async addDiamond(diamond: Diamond) {
        const safeDiamond = deepCopySafe(diamond);
        if (this.isDemoMode) {
            this.diamonds.push(safeDiamond);
        } else {
            await setDoc(doc(db, 'diamonds', diamond.id), safeDiamond);
        }

        await this.createInventoryMovement({
            type: InventoryMovementType.DIAMOND_ADD,
            createdById: this.currentUser?.id || 'system',
            notes: `Added ${diamond.shape} (${diamond.size}ct, Color: ${diamond.color || 'N/A'}, Clarity: ${diamond.clarity || 'N/A'}) to ${diamond.location} stock. Cabinet: ${diamond.place || 'N/A'}${diamond.certNumber ? `, Report: ${diamond.certNumber}` : ''}`,
            lines: [{ ct: diamond.size }],
            location: diamond.location
        });
        this.notify();
    }

    async updateDiamond(id: string, diamond: Partial<Diamond>) {
        const oldDia = this.diamonds.find(d => d.id === id);
        const safeDiamond = deepCopySafe(diamond);

        if (oldDia && diamond.location !== undefined && diamond.location !== oldDia.location) {
            const auditEntry = {
                id: 'audit-' + Math.random().toString(36).substr(2, 9),
                action: 'transferred',
                timestamp: now(),
                userId: this.currentUser?.id || 'system',
                userName: this.currentUser?.name || 'System',
                userRole: this.currentUser?.role || 'SYSTEM',
                prevValue: oldDia.location,
                newValue: diamond.location,
                location: diamond.location
            };
            safeDiamond.noteAuditTrail = [...(oldDia.noteAuditTrail || []), auditEntry];
        }

        if (this.isDemoMode) {
            const idx = this.diamonds.findIndex(d => d.id === id);
            if (idx !== -1) {
                this.diamonds[idx] = { ...this.diamonds[idx], ...safeDiamond };
            }
        } else {
            await updateDoc(doc(db, 'diamonds', id), safeDiamond);
        }

        if (oldDia) {
            const changes: string[] = [];
            if (diamond.sold !== undefined && diamond.sold !== oldDia.sold) {
                changes.push(`Status: ${oldDia.sold || 'AVAILABLE'} ➔ ${diamond.sold || 'AVAILABLE'}`);
            }
            if (diamond.mountLoose !== undefined && diamond.mountLoose !== oldDia.mountLoose) {
                changes.push(`Mounting: ${oldDia.mountLoose || 'LOOSE'} ➔ ${diamond.mountLoose || 'LOOSE'}`);
            }
            if (diamond.place !== undefined && diamond.place !== oldDia.place) {
                changes.push(`Cabinet: ${oldDia.place || 'N/A'} ➔ ${diamond.place || 'N/A'}`);
            }
            if (diamond.code !== undefined && diamond.code !== oldDia.code) {
                changes.push(`Item Code: ${oldDia.code || 'N/A'} ➔ ${diamond.code || 'N/A'}`);
            }
            if (diamond.location !== undefined && diamond.location !== oldDia.location) {
                changes.push(`Location: ${oldDia.location} ➔ ${diamond.location}`);
            }
            if (diamond.notes !== undefined && diamond.notes !== oldDia.notes) {
                changes.push(`Note updated`);
            }

            if (changes.length > 0) {
                await this.createInventoryMovement({
                    type: InventoryMovementType.DIAMOND_UPDATE,
                    createdById: this.currentUser?.id || 'system',
                    notes: `Updated ${oldDia.shape} (${oldDia.size}ct${oldDia.certNumber ? `, Report: ${oldDia.certNumber}` : ''}): ${changes.join(', ')}`,
                    lines: [{ ct: oldDia.size }],
                    location: diamond.location || oldDia.location
                });
            }
        }
        this.notify();
    }

    async deleteDiamond(id: string) {
        const oldDia = this.diamonds.find(d => d.id === id);
        if (this.isDemoMode) {
            this.diamonds = this.diamonds.filter(d => d.id !== id);
        } else {
            await deleteDoc(doc(db, 'diamonds', id));
        }

        if (oldDia) {
            await this.createInventoryMovement({
                type: InventoryMovementType.DIAMOND_DELETE,
                createdById: this.currentUser?.id || 'system',
                notes: `Deleted ${oldDia.shape} (${oldDia.size}ct, Report: ${oldDia.certNumber || 'N/A'}) from ${oldDia.location} stock`,
                lines: [{ ct: oldDia.size }],
                location: oldDia.location
            });
        }
        this.notify();
    }

    getBands() { return this.bands; }
    async updateBands(bands: DiamondPriceBand[]) {
        for (const b of bands) {
            const safeBand = deepCopySafe(b);
            await setDoc(doc(db, 'bands', b.id), safeBand);
        }
    }

    async deleteBand(id: string) {
        await deleteDoc(doc(db, 'bands', id));
    }

    async clearBands() {
        const batch = writeBatch(db);
        for (const b of this.bands) {
            batch.delete(doc(db, 'bands', b.id));
        }
        await batch.commit();
    }

    getSettings() { return this.settings; }
    async updateSettings(s: GlobalSettings) {
        const safeSettings = deepCopySafe(s);
        await setDoc(doc(db, 'settings', 'global'), safeSettings);
    }

    getLiveGoldPrice() { return this.liveGoldPrice; }

    async toggleGoldPriceMode(manual: boolean) {
        if (this.liveGoldPrice) {
            const safePrice = deepCopySafe({ ...this.liveGoldPrice, isManual: manual });
            await setDoc(doc(db, 'settings', 'gold_price'), safePrice);
        }
    }

    async fetchAndCacheGoldPrice(force: boolean = false) {
        if (this.currentUser?.role !== Role.MANAGER) return null;
        if (!force && this.liveGoldPrice?.isManual) return this.liveGoldPrice;

        const GRAMS_PER_OUNCE = 31.1034768;
        const GOLD_API_KEY = 'goldapi-il23ismkzq9u0u-io';

        let pricePerOunce = 0;
        let changePercent = 0;
        let changeAmount = 0;

        // 1. Attempt GoldAPI.io
        if (GOLD_API_KEY) {
            try {
                const response = await fetch('https://www.goldapi.io/api/XAU/CAD', {
                    method: 'GET',
                    headers: { 'x-access-token': GOLD_API_KEY, 'Content-Type': 'application/json' }
                });
                if (response.ok) {
                    const data = await response.json();
                    pricePerOunce = data.price;
                    changePercent = data.chp;
                    changeAmount = data.ch;
                }
            } catch (e) { console.warn("GoldAPI failed", e); }
        }

        // 2. Fallback: Data-ASG with CORS Proxy to bypass blocking
        if (pricePerOunce === 0) {
            try {
                const response = await fetch('https://corsproxy.io/?' + encodeURIComponent('https://data-asg.goldprice.org/dbXRates/CAD'));
                if (response.ok) {
                    const data = await response.json();
                    if (data.items && data.items.length > 0) {
                        const item = data.items[0];
                        pricePerOunce = item.xauPrice;
                        changePercent = item.pcXau;
                        changeAmount = item.chgXau;
                    }
                }
            } catch (e) { console.warn("Fallback ASG failed", e); }
        }

        // 3. Fallback: Gold-API.com (USD -> CAD)
        if (pricePerOunce === 0) {
            try {
                const response = await fetch('https://api.gold-api.com/price/XAU');
                if (response.ok) {
                    const data = await response.json();
                    if (data.price) {
                        const usdPrice = data.price;
                        pricePerOunce = usdPrice * this.settings.usdToCadMultiplier;
                        changePercent = 0;
                        changeAmount = 0;
                    }
                }
            } catch (e) { console.warn("Fallback Gold-API failed", e); }
        }

        try {
            if (pricePerOunce > 0) {
                const pricePerGram = pricePerOunce / GRAMS_PER_OUNCE;
                const changePerGram = changeAmount / GRAMS_PER_OUNCE;

                const cache: GoldPriceCache = {
                    price: parseFloat(pricePerGram.toFixed(2)),
                    currency: 'CAD',
                    lastUpdated: now(),
                    change: parseFloat(changePerGram.toFixed(2)),
                    changePercent: parseFloat(changePercent.toFixed(2)),
                    isManual: false
                };

                const safeCache = deepCopySafe(cache);
                await setDoc(doc(db, 'settings', 'gold_price'), safeCache);
                this.liveGoldPrice = cache;
                this.notify();
                return cache;
            } else {
                if (this.liveGoldPrice) {
                    const updated = { ...this.liveGoldPrice, error: "Market data unavailable." };
                    const safeUpdated = deepCopySafe(updated);
                    await setDoc(doc(db, 'settings', 'gold_price'), safeUpdated);
                }
            }
        } catch (e: any) {
            console.error("Error saving gold price", e);
        }
        return this.liveGoldPrice;
    }

    // --- Reports ---

    public normalizeGoldComponents(p: Project): GoldComponent[] {
        if (p.goldComponents && p.goldComponents.length > 0) {
            return p.goldComponents;
        }
        if (p.goldType || p.goldPurity) {
            const weights = (p.progress || []).map(prog => prog.weightG).filter(w => w !== undefined && w !== null && w > 0) as number[];
            const weightG = weights.length > 0 ? Math.max(...weights) : 0;
            return [{
                id: 'legacy-component',
                label: 'Main Piece',
                type: p.goldType || 'Unknown',
                purity: p.goldPurity || 'Unknown',
                weightG: weightG
            }];
        }
        return [];
    }

    getProjectCostSummary(projectId: string, finalWeightFallback?: number): ProjectCostSummary {
        const p = this.getProject(projectId);
        if (!p) return { totalCaratsUsed: 0, totalBrokenCarats: 0, totalDiamondCostCad: 0, labourCost: 0, automatedSetterCost: 0, goldCost: 0, totalProjectCostCad: 0, initialWeightG: 0, finalWeightG: 0, goldLossG: 0, breakdown: [], isLocked: false, usedPurePricePerGram: 0, usedRatio: 0 };

        const isLocked = !!p.pickupPricingSnapshot || ((p.status === ProjectStatus.CLOSED || p.status === ProjectStatus.REVIEW) && !!p.projectEndGoldPriceSnapshot);

        const goldPricePerGram = p.pickupPricingSnapshot
            ? p.pickupPricingSnapshot.priceCentsPerGram / 100
            : (isLocked ? (p.projectEndGoldPriceSnapshot || 0) : (this.liveGoldPrice?.price || 0));

        const components = this.normalizeGoldComponents(p).filter(component => component.state === 'ACTIVE');
        const goldBreakdown: GoldCostBreakdownItem[] = [];
        let totalGoldCost = 0;
        let totalInitialWeightG = 0;

        components.forEach(comp => {
            let compPurityRatio = 0;
            if (isLocked) {
                if (comp.ratioSnapshot !== undefined) {
                    compPurityRatio = comp.ratioSnapshot;
                } else if (p.goldPurityRatioSnapshot && components.length === 1 && comp.id === 'legacy-component') {
                    compPurityRatio = p.goldPurityRatioSnapshot;
                } else {
                    compPurityRatio = this.settings.purityMapping?.[comp.purity] || 0;
                }
            } else {
                compPurityRatio = this.settings.purityMapping?.[comp.purity] || 0;
            }

            let compGoldPrice = goldPricePerGram;
            if (isLocked && comp.goldPriceSnapshot !== undefined) {
                compGoldPrice = comp.goldPriceSnapshot;
            }

            let weight = p.pickupPricingSnapshot && comp.finalWeightMg
                ? comp.finalWeightMg / 1000
                : (comp.castingWeightMg !== undefined ? comp.castingWeightMg / 1000 : (comp.weightG || 0));
            if (comp.id === 'legacy-component' && weight === 0 && finalWeightFallback) {
                weight = finalWeightFallback;
            }

            totalInitialWeightG += weight;
            const compCost = weight * compPurityRatio * compGoldPrice;
            totalGoldCost += compCost;

            goldBreakdown.push({
                componentId: comp.id,
                label: comp.label,
                type: comp.type,
                purity: comp.purity,
                weightG: weight,
                ratioUsed: compPurityRatio,
                calculatedCostCad: compCost,
                purePriceAtTime: compGoldPrice
            });
        });

        const weights = (p.progress || []).map(prog => prog.weightG).filter(w => w !== undefined && w !== null && w > 0) as number[];
        const legacyMaxWeight = weights.length > 0 ? Math.max(...weights) : 0;
        const componentFinalWeightG = components.reduce((sum, component) => sum + ((component.finalWeightMg || 0) / 1000), 0);
        const finalWeightG = componentFinalWeightG > 0 ? componentFinalWeightG : (finalWeightFallback !== undefined ? finalWeightFallback : (weights.length > 0 ? weights[weights.length - 1] : 0));

        const initialWeightG = totalInitialWeightG > 0 ? totalInitialWeightG : legacyMaxWeight;
        const goldLossG = initialWeightG > 0 && finalWeightG > 0 ? initialWeightG - finalWeightG : 0;

        const pickupClientGoldChargeCad = p.pickupPricingSnapshot ? p.pickupPricingSnapshot.totalClientGoldChargeCents / 100 : undefined;
        const goldCost = pickupClientGoldChargeCad !== undefined
            ? pickupClientGoldChargeCad
            : (isLocked && p.finalGoldCostCalculated !== undefined ? p.finalGoldCostCalculated : totalGoldCost);
        const internalCastingCostCad = components.reduce((sum, component) => sum + ((component.internalCastingCost?.amountCents || 0) / 100), 0);
        const usedRatio = p.goldPurityRatioSnapshot || (components.length === 1 ? (this.settings.purityMapping?.[components[0].purity] || 0) : 0);

        const bags = this.getBags(projectId);
        const movements = this.getInventoryMovements().filter(m => m.referenceProjectId === projectId);
        const brokenMoves = movements.filter(m => m.type === InventoryMovementType.BROKEN_OUT);

        const breakdown = this.specs.map(spec => {
            let eligibleIssued = 0;
            let returnedPcsSum = 0;
            let totalIssued = 0;

            bags.forEach(b => {
                const issuedInBag = b.items.find(i => i.specId === spec.id)?.issuedPcs || 0;
                totalIssued += issuedInBag;

                const hasConfirmedReturn = b.status === BagStatus.COUNTED_CONFIRMED || (b.returns || []).some(r => r.status === 'CONFIRMED');
                if (hasConfirmedReturn) {
                    eligibleIssued += issuedInBag;

                    if (b.returns && b.returns.some(r => r.status === 'CONFIRMED')) {
                        returnedPcsSum += b.returns.filter(r => r.status === 'CONFIRMED').reduce((sum, r) => sum + (r.lines.find(l => l.specId === spec.id)?.returnedPcs || 0), 0);
                    } else if (b.returnedLines && b.status === BagStatus.COUNTED_CONFIRMED) {
                        returnedPcsSum += b.returnedLines.find(l => l.specId === spec.id)?.requestedPcs || 0;
                    }
                }
            });

            const broken = brokenMoves.reduce((acc, m) => acc + m.lines.filter(l => l.specId === spec.id).reduce((sum, l) => sum + (l.pcs || 0), 0), 0);

            let usedPcs = eligibleIssued - returnedPcsSum - broken;
            let brokenPcs = broken;

            // Apply manual overrides if they exist
            const override = p.diamondUsageOverrides?.[spec.id];
            if (override) {
                if (override.usedPcs !== undefined) usedPcs = override.usedPcs;
                if (override.brokenPcs !== undefined) brokenPcs = override.brokenPcs;
            }

            const specCost = spec.defaultCostPerCtUsd || 0;
            const ctPerStone = spec.ctPerStone || 0;
            const costUsd = usedPcs * ctPerStone * specCost;
            const grossUsedPcs = totalIssued - returnedPcsSum;

            return {
                spec,
                issuedPcs: totalIssued,
                returnedPcs: returnedPcsSum,
                grossUsedPcs: grossUsedPcs,
                brokenPcs: brokenPcs,
                usedPcs: usedPcs,
                costUsd: costUsd
            };
        }).filter(b => b.issuedPcs > 0 || b.grossUsedPcs > 0 || p.diamondUsageOverrides?.[b.spec.id]);

        const totalDiamondCostUsd = breakdown.reduce((acc, b) => acc + b.costUsd, 0);
        const usdToCadMultiplier = isLocked && p.usdToCadMultiplierSnapshot ? p.usdToCadMultiplierSnapshot : this.settings.usdToCadMultiplier;
        // Always calculate diamond cost dynamically so catalog updates retroactively apply to all projects
        const totalDiamondCostCad = totalDiamondCostUsd * usdToCadMultiplier;

        console.log(`[Costing] Project ${projectId}: totalDiamondCostUsd=${totalDiamondCostUsd}, multiplier=${usdToCadMultiplier}, totalDiamondCostCad=${totalDiamondCostCad}`);

        const designJewellerCost = p.labourCostAmount || 0;
        const totalStonesSet = breakdown.reduce((acc, b) => acc + b.usedPcs, 0);
        const setterCostPerSetPieceCad = isLocked && p.setterCostPerSetPieceCadSnapshot ? p.setterCostPerSetPieceCadSnapshot : (this.settings.setterCostPerSetPieceCad || 3);
        // Always calculate setter cost dynamically
        const automatedSetterCost = totalStonesSet * setterCostPerSetPieceCad;

        return {
            totalCaratsUsed: breakdown.reduce((acc, b) => acc + (b.usedPcs * (b.spec.ctPerStone || 0)), 0),
            totalBrokenCarats: breakdown.reduce((acc, b) => acc + (b.brokenPcs * (b.spec.ctPerStone || 0)), 0),
            totalDiamondCostCad,
            labourCost: designJewellerCost,
            automatedSetterCost,
            goldCost,
            internalCastingCostCad,
            pickupClientGoldChargeCad,
            totalProjectCostCad: (internalCastingCostCad > 0 ? internalCastingCostCad : goldCost) + totalDiamondCostCad + designJewellerCost + automatedSetterCost,
            initialWeightG,
            finalWeightG,
            goldLossG,
            breakdown,
            goldBreakdown,
            isLocked,
            usedPurePricePerGram: goldPricePerGram,
            usedRatio: usedRatio
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Weekly Report — fresh Firestore reads, correct net-balance formula,
    // and durable persistence to the weekly_reports collection.
    //
    // FORMULA (per spec, per colour):
    //   opening   = sum of all owned-stock changes BEFORE the week start.
    //   comeIn    = SHIPMENT_IN + positive ADJUSTMENT movements during the week.
    //   issued    = ISSUE movements during the week (reduces main stock).
    //   returned  = RETURN movements during the week (restores main stock).
    //   used      = USED (confirmed stone consumption) during the week.
    //   broken    = BROKEN_OUT during the week.
    //   adjustments = net of all ADJUSTMENT movements (signed) during the week.
    //   closing   = opening + comeIn − issued + returned − used − broken
    //               + netAdjustments
    //             = opening + Σ(ownedStockChange) for all week txs
    //
    // Opening and closing are derived from the owned-stock change signal
    // (mainStockChange + wipStockChange), which equals the net change in total
    // company-owned diamonds regardless of location (main shelf vs. setter WIP).
    // ─────────────────────────────────────────────────────────────────────────
    async generateWeeklyReport(start: Date, end: Date, userId: string): Promise<WeeklyReportSnapshot> {
        // --- 1. Fresh Firestore reads (bypass in-memory cache) ---
        let freshMovements: InventoryMovement[];
        let freshSpecs: DiamondSpec[];

        if (this.isDemoMode) {
            // Demo mode: use the in-memory cache (no Firestore in demo)
            freshMovements = [...this.movements];
            freshSpecs = [...this.specs];
        } else {
            const [movsSnap, specsSnap] = await Promise.all([
                getDocs(collection(db, 'movements')),
                getDocs(collection(db, 'specs')),
            ]);
            freshMovements = movsSnap.docs.map(d => ({ ...d.data(), id: d.id })) as InventoryMovement[];
            freshSpecs = specsSnap.docs.map(d => ({ ...d.data(), id: d.id })) as DiamondSpec[];
        }

        const startMs = start.getTime();
        const endMs = end.getTime();

        // --- 2. Rebuild ledger transactions from fresh movements ---
        // Uses the same computeLineDelta logic as getInventoryAuditFresh so the
        // figures are guaranteed consistent with the reconciliation audit.
        interface LedgerEntry {
            specId: string;
            color: string;
            createdAt: string;
            movementType: 'added' | 'assigned' | 'returned' | 'used' | 'broken' | 'adjusted';
            quantity: number;  // signed pieces delta
            carats: number;    // signed carats delta
            ownedChange: number; // net owned (main + wip) piece delta
        }

        const ledger: LedgerEntry[] = [];

        freshMovements.forEach(m => {
            m.lines.forEach(l => {
                if (!l.specId || l.specId === MIXED_UNSORTED_SPEC_ID) return;
                const spec = freshSpecs.find(s => s.id === l.specId);
                const { pieceDelta, caratDelta } = computeLineDelta(m, l, spec);
                const type = m.type;

                let movementType: LedgerEntry['movementType'];
                let ownedChange = 0;

                if (type === InventoryMovementType.SHIPMENT_IN) {
                    movementType = 'added';
                    ownedChange = Math.abs(pieceDelta);
                } else if (type === InventoryMovementType.ISSUE) {
                    movementType = 'assigned';
                    ownedChange = 0; // issue moves stone to WIP; net owned unchanged
                } else if (type === InventoryMovementType.RETURN || type === InventoryMovementType.BULK_RETURN_INTAKE) {
                    movementType = 'returned';
                    ownedChange = 0; // return moves stone from WIP back to shelf; net owned unchanged
                } else if (type === InventoryMovementType.BROKEN_OUT) {
                    movementType = 'broken';
                    ownedChange = -Math.abs(pieceDelta); // reduces owned inventory
                } else if (type === InventoryMovementType.MANUAL_ADJUSTMENT || type === InventoryMovementType.INVENTORY_CORRECTION) {
                    movementType = 'adjusted';
                    ownedChange = pieceDelta; // already signed
                } else {
                    // RETURN_MIXED, DIAMOND_ADD, etc. — treat as an additive adjustment
                    movementType = 'adjusted';
                    ownedChange = pieceDelta;
                }

                ledger.push({
                    specId: l.specId,
                    color: spec?.color || 'White',
                    createdAt: m.createdAt,
                    movementType,
                    quantity: pieceDelta,
                    carats: caratDelta,
                    ownedChange,
                });
            });
        });

        // --- 3. Compute per-spec report lines ---
        const lines: WeeklyReportLine[] = freshSpecs
            .filter(spec => spec.id !== MIXED_UNSORTED_SPEC_ID)
            .map(spec => {
                const specId = spec.id;
                const color = spec.color || 'White';

                const specEntries = ledger.filter(e => e.specId === specId && e.color === color);

                // Opening: sum of all ownedChange strictly before week start
                const openingPcs = specEntries
                    .filter(e => new Date(e.createdAt).getTime() < startMs)
                    .reduce((acc, e) => acc + e.ownedChange, 0);
                const openingCt = roundCt(openingPcs * (spec.ctPerStone || 0));

                // Week entries
                const weekEntries = specEntries.filter(e => {
                    const t = new Date(e.createdAt).getTime();
                    return t >= startMs && t <= endMs;
                });

                const comeInPcs = weekEntries
                    .filter(e => e.movementType === 'added')
                    .reduce((acc, e) => acc + e.ownedChange, 0);
                const comeInCt = roundCt(comeInPcs * (spec.ctPerStone || 0));

                const issuedPcs = weekEntries
                    .filter(e => e.movementType === 'assigned')
                    .reduce((acc, e) => acc + Math.abs(e.quantity), 0);
                const issuedCt = roundCt(issuedPcs * (spec.ctPerStone || 0));

                const returnedPcs = weekEntries
                    .filter(e => e.movementType === 'returned')
                    .reduce((acc, e) => acc + Math.abs(e.quantity), 0);
                const returnedCt = roundCt(returnedPcs * (spec.ctPerStone || 0));

                const usedPcs = weekEntries
                    .filter(e => e.movementType === 'used')
                    .reduce((acc, e) => acc + Math.abs(e.quantity), 0);
                const usedCt = roundCt(usedPcs * (spec.ctPerStone || 0));

                const brokenPcs = weekEntries
                    .filter(e => e.movementType === 'broken')
                    .reduce((acc, e) => acc + Math.abs(e.quantity), 0);
                const brokenCt = roundCt(brokenPcs * (spec.ctPerStone || 0));

                // Net adjustments (signed)
                const adjustmentsPcs = weekEntries
                    .filter(e => e.movementType === 'adjusted')
                    .reduce((acc, e) => acc + e.quantity, 0);

                // Closing = opening + net ownedChange across ALL entries up to endMs
                const closingPcs = specEntries
                    .filter(e => new Date(e.createdAt).getTime() <= endMs)
                    .reduce((acc, e) => acc + e.ownedChange, 0);
                const closingCt = roundCt(Math.max(0, closingPcs) * (spec.ctPerStone || 0));

                return {
                    spec,
                    openingPcs: Math.max(0, Math.round(openingPcs)),
                    openingCt,
                    comeInPcs,
                    comeInCt,
                    issuedPcs,
                    issuedCt,
                    returnedPcs,
                    returnedCt,
                    usedPcs,
                    usedCt,
                    brokenPcs,
                    brokenCt,
                    adjustmentsPcs: Math.round(adjustmentsPcs),
                    closingPcs: Math.max(0, Math.round(closingPcs)),
                    closingCt,
                };
            })
            .filter(line =>
                line.openingPcs > 0 || line.comeInPcs > 0 || line.issuedPcs > 0 ||
                line.returnedPcs > 0 || line.usedPcs > 0 || line.brokenPcs > 0 ||
                line.closingPcs > 0
            );

        // --- 4. Build the snapshot and persist to Firestore ---
        const reportId = 'rep-' + Math.random().toString(36).substr(2, 9);
        const report: WeeklyReportSnapshot = {
            id: reportId,
            weekStartDate: start.toISOString(),
            weekEndDate: end.toISOString(),
            createdAt: now(),
            createdById: userId,
            lines,
        };

        if (!this.isDemoMode) {
            await setDoc(doc(db, 'weekly_reports', reportId), deepCopySafe(report));
        } else {
            this.weeklyReports.push(report);
        }

        return report;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Diamond Usage Override — display-only cost adjustment with full audit trail.
    //
    // Overrides do NOT alter any movement or ledger record; they only affect the
    // numbers shown in the PDF cost breakdown. Every change is logged to
    // system_logs so that the before/after values are permanently recorded.
    // ─────────────────────────────────────────────────────────────────────────
    async applyDiamondUsageOverride(
        projectId: string,
        specId: string,
        usedPcs: number | undefined,
        brokenPcs: number | undefined,
        managerId: string,
        reason: string
    ): Promise<void> {
        const manager = this.getUser(managerId) || this.currentUser;
        if (!manager || manager.role !== Role.MANAGER) {
            throw new Error('Diamond usage overrides may only be applied by a manager.');
        }
        if (!reason || !reason.trim()) {
            throw new Error('A reason is required for diamond usage overrides.');
        }

        const project = this.getProject(projectId);
        if (!project) throw new Error('Project not found.');

        const spec = this.specs.find(s => s.id === specId);
        const specLabel = spec?.label || specId;

        // Capture the previous value for the audit log
        const previousOverride = project.diamondUsageOverrides?.[specId];
        const previousUsed = previousOverride?.usedPcs;
        const previousBroken = previousOverride?.brokenPcs;

        const newOverrides = {
            ...(project.diamondUsageOverrides || {}),
            [specId]: {
                usedPcs: usedPcs !== undefined && !isNaN(usedPcs) ? usedPcs : undefined,
                brokenPcs: brokenPcs !== undefined && !isNaN(brokenPcs) ? brokenPcs : undefined,
            },
        };

        // Write the override to the project document
        await updateDoc(doc(db, 'projects', projectId), {
            diamondUsageOverrides: deepCopySafe(newOverrides),
        });

        // Write an immutable system log entry recording the change
        const logDetail =
            `Manager ${manager.name} overrode diamond usage for ${specLabel} ` +
            `on project ${project.code}. ` +
            `Before: used=${previousUsed ?? 'unset'} broken=${previousBroken ?? 'unset'}. ` +
            `After:  used=${usedPcs ?? 'unset'} broken=${brokenPcs ?? 'unset'}. ` +
            `Reason: ${reason.trim()}`;

        await this.addSystemLog('DIAMOND_USAGE_OVERRIDE', logDetail);
    }

    getWeeklyReports() { return this.weeklyReports; }
    getTransactions(projectId: string) { return this.transactions; }
    async verifyTransaction(txId: string, verification: any) { }
    async recoverUnknownSpecs() {
        const missingSpecIds = new Set<string>();
        const specDataMap = new Map<string, { pcs: number, ct: number }>();

        // Find all referenced spec IDs
        this.movements.forEach(m => m.lines.forEach(l => {
            if (l.specId && !this.specs.find(s => s.id === l.specId)) {
                missingSpecIds.add(l.specId);
                if (l.pcs && l.ct) {
                    const current = specDataMap.get(l.specId) || { pcs: 0, ct: 0 };
                    current.pcs += l.pcs;
                    current.ct += l.ct;
                    specDataMap.set(l.specId, current);
                }
            }
        }));
        this.bags.forEach(b => b.items.forEach(i => {
            if (i.specId && !this.specs.find(s => s.id === i.specId)) {
                missingSpecIds.add(i.specId);
            }
        }));
        this.requests.forEach(r => r.lines.forEach(l => {
            if (l.specId && !this.specs.find(s => s.id === l.specId)) {
                missingSpecIds.add(l.specId);
            }
        }));

        let recovered = 0;
        for (const specId of missingSpecIds) {
            const data = specDataMap.get(specId);
            let ctPerStone = 0;
            let sizeMm = 0;
            let label = 'Recovered Spec';

            if (data && data.pcs > 0) {
                ctPerStone = parseFloat((data.ct / data.pcs).toFixed(4));
                // Reverse engineer sizeMm: ctPerStone = (sizeMm^3) * 0.0037
                sizeMm = parseFloat(Math.cbrt(ctPerStone / 0.0037).toFixed(2));
                label = `RD ${sizeMm}mm (Recovered)`;
            }

            const newSpec: DiamondSpec = {
                id: specId,
                label,
                sizeMm,
                shape: 'RD',
                ctPerStone,
                defaultCostPerCtUsd: 0,
                isOverride: false
            };

            const safeSpec = deepCopySafe(newSpec);
            await setDoc(doc(db, 'specs', specId), safeSpec);
            recovered++;
        }
        return recovered;
    }

    async generateSpecsFromBands() {
        const bands = this.getBands().filter(b => b.active);
        let created = 0;
        let updated = 0;

        for (const band of bands) {
            // Generate sizes from minMm to maxMm by stepMm
            // Use a small epsilon to avoid floating point issues
            for (let size = band.minMm; size <= band.maxMm + 0.001; size += band.stepMm) {
                const sizeMm = parseFloat(size.toFixed(2));
                const existingSpec = this.specs.find(s => s.sizeMm === sizeMm);

                if (existingSpec) {
                    const updates: any = {};
                    if (!existingSpec.isOverride && existingSpec.defaultCostPerCtUsd !== band.pricePerCtUsd) {
                        updates.defaultCostPerCtUsd = band.pricePerCtUsd;
                    }
                    if (!existingSpec.ctPerStone) {
                        updates.ctPerStone = parseFloat(((sizeMm ** 3) * 0.0037).toFixed(4));
                    }

                    if (Object.keys(updates).length > 0) {
                        const safeUpdates = deepCopySafe(updates);
                        await updateDoc(doc(db, 'specs', existingSpec.id), safeUpdates);
                        updated++;
                    }
                } else {
                    // Create new spec
                    const ctPerStone = parseFloat(((sizeMm ** 3) * 0.0037).toFixed(4));
                    const newSpec: DiamondSpec = {
                        id: 'spec-' + Math.random().toString(36).substr(2, 9),
                        label: `RD ${sizeMm}mm`,
                        sizeMm: sizeMm,
                        shape: 'RD',
                        ctPerStone: ctPerStone,
                        defaultCostPerCtUsd: band.pricePerCtUsd,
                        isOverride: false,
                        location: 'Melee',
                        pcs: 0,
                        ct: 0,
                        stockVersion: 0,
                    };
                    const safeSpec = deepCopySafe(newSpec);
                    await setDoc(doc(db, 'specs', newSpec.id), safeSpec);
                    created++;
                }
            }
        }
        return { created, updated };
    }
    async correctEvidence(evidenceId: string, newPhotoBase64: string, imageSource: 'Camera' | 'Device Gallery', reason: string, managerId: string) {
        if (!this.isDemoMode) {
            throw new Error('Submitted inventory evidence is immutable and cannot be replaced.');
        }
        let ev: EvidenceImage | undefined;
        if (this.isDemoMode) {
            ev = this.evidenceImages.find(e => e.id === evidenceId);
        } else {
            const docSnap = await getDoc(doc(db, 'evidence', evidenceId));
            if (docSnap.exists()) {
                ev = docSnap.data() as EvidenceImage;
            }
        }

        if (!ev) throw new Error("Evidence record not found.");

        const newVersion = ev.version + 1;
        const projectId = ev.projectId;
        const transactionId = ev.transactionId;
        const transactionType = ev.transactionType;
        const bagNumber = ev.bagNumber;

        let uploadedPhotoUrl = '';
        let uploadedThumbUrl = '';

        if (newPhotoBase64 && newPhotoBase64.startsWith('data:')) {
            const path = `evidence/projects/${projectId}/${transactionType === 'ISSUE' ? 'issues' : 'returns'}/${bagNumber}_${transactionId}_v${newVersion}.jpg`;
            const thumbPath = `evidence/projects/${projectId}/${transactionType === 'ISSUE' ? 'issues' : 'returns'}/${bagNumber}_${transactionId}_v${newVersion}_thumb.jpg`;

            try {
                uploadedPhotoUrl = await this.uploadImage(path, newPhotoBase64);
                const thumbBase64 = await generateThumbnail(newPhotoBase64);
                uploadedThumbUrl = await this.uploadImage(thumbPath, thumbBase64);
            } catch (uploadError) {
                console.error("Image upload failed:", uploadError);
                throw new Error("Failed to upload corrected image. Correction aborted.");
            }
        }

        const managerName = this.getUser(managerId)?.name || this.currentUser?.name || 'Manager';
        const replacement: EvidenceReplacement = {
            replacedAt: now(),
            replacedById: managerId,
            replacedByName: managerName,
            reason,
            photoUrl: ev.photoUrl,
            thumbnailUrl: ev.thumbnailUrl,
            imageSource: ev.imageSource
        };

        const updatedHistory = [...(ev.replacementHistory || []), replacement];

        try {
            if (this.isDemoMode) {
                ev.photoUrl = uploadedPhotoUrl;
                ev.thumbnailUrl = uploadedThumbUrl;
                ev.imageSource = imageSource;
                ev.version = newVersion;
                ev.replacementHistory = updatedHistory;

                if (transactionType === 'ISSUE') {
                    const bag = this.bags.find(b => b.id === transactionId);
                    if (bag) {
                        bag.issuedPhoto = uploadedPhotoUrl;
                    }
                } else {
                    const bag = this.bags.find(b => b.id === ev!.bagId);
                    if (bag) {
                        const retTx = bag.returns?.find(r => r.id === transactionId);
                        if (retTx) {
                            retTx.photo = uploadedPhotoUrl;
                        }
                        if (bag.returnedPhoto === ev.photoUrl) {
                            bag.returnedPhoto = uploadedPhotoUrl;
                        }
                    }
                }
                this.notify();
            } else {
                await updateDoc(doc(db, 'evidence', evidenceId), {
                    photoUrl: uploadedPhotoUrl,
                    thumbnailUrl: uploadedThumbUrl,
                    imageSource,
                    version: newVersion,
                    replacementHistory: updatedHistory
                });

                if (transactionType === 'ISSUE') {
                    await updateDoc(doc(db, 'bags', transactionId), { issuedPhoto: uploadedPhotoUrl });
                } else {
                    const bag = this.bags.find(b => b.id === ev!.bagId);
                    if (bag) {
                        const currentReturns = [...(bag.returns || [])];
                        const retIndex = currentReturns.findIndex(r => r.id === transactionId);
                        if (retIndex >= 0) {
                            currentReturns[retIndex] = {
                                ...currentReturns[retIndex],
                                photo: uploadedPhotoUrl
                            };
                        }
                        const updates: any = { returns: currentReturns };
                        if (bag.returnedPhoto === ev.photoUrl) {
                            updates.returnedPhoto = uploadedPhotoUrl;
                        }
                        await updateDoc(doc(db, 'bags', bag.id), updates);
                    }
                }
            }

            await this.addSystemLog('INVENTORY', `Manager ${managerName} corrected evidence image for Bag #${bagNumber} (${transactionType}). Reason: ${reason}`);
        } catch (dbError) {
            console.error("Database operation failed. Performing compensating deletion of uploaded files.", dbError);
            if (uploadedPhotoUrl && uploadedPhotoUrl.startsWith('http')) {
                await this.deleteUploadedImage(uploadedPhotoUrl);
            }
            if (uploadedThumbUrl && uploadedThumbUrl.startsWith('http')) {
                await this.deleteUploadedImage(uploadedThumbUrl);
            }
            throw dbError;
        }
    }

    getStages() { return this.stages; }
}

export const store = new StoreService();
