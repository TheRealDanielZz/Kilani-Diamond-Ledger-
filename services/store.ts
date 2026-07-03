
import { 
  collection, doc, getDoc, getDocs, setDoc, updateDoc, 
  onSnapshot, query, where, orderBy, addDoc, deleteDoc,
  serverTimestamp, arrayUnion, writeBatch
} from 'firebase/firestore';
import { 
  signInWithEmailAndPassword, signOut, sendPasswordResetEmail, 
  onAuthStateChanged, createUserWithEmailAndPassword, updateProfile,
  getAuth, updateEmail, updatePassword,
  User as FirebaseUser
} from 'firebase/auth';
import { initializeApp, deleteApp, FirebaseApp } from 'firebase/app';
import { ref, uploadString, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, auth, storage, firebaseConfig } from './firebase';
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

  constructor() {}

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
          if (u.email) {
              const usersRef = collection(db, 'users');
              const q = query(usersRef, where('email', '==', u.email));
              const querySnapshot = await getDocs(q);
              
              if (!querySnapshot.empty) {
                  let selectedDoc = querySnapshot.docs[0];
                  
                  // If duplicates exist (e.g., a legacy temp-ID and a new Auth UID),
                  // prefer the legacy one (which has the projects) and delete the auto-created duplicate.
                  if (querySnapshot.docs.length > 1) {
                      const originalDoc = querySnapshot.docs.find(d => d.id !== u.uid);
                      if (originalDoc) {
                          selectedDoc = originalDoc;
                          // Clean up the accidental duplicate
                          await deleteDoc(doc(db, 'users', u.uid)).catch(console.error);
                      }
                  }
                  
                  this.currentUser = selectedDoc.data() as User;
                  return;
              }
          } else {
              // Fallback if no email
              const userDoc = await getDoc(doc(db, 'users', u.uid));
              if (userDoc.exists()) {
                  this.currentUser = userDoc.data() as User;
                  return;
              }
          }

          // Auto-create missing profile
          const isOwner = u.email?.toLowerCase() === 'kilanimedia@gmail.com';
          const newUser: User = {
              id: u.uid,
              name: u.displayName || (u.email ? u.email.split('@')[0] : 'User'),
              email: u.email || '',
              role: isOwner ? Role.MANAGER : Role.SETTER,
              active: true
          };
          const safeNewUser = deepCopySafe(newUser);
          await setDoc(doc(db, 'users', u.uid), safeNewUser);
          this.currentUser = newUser;
      } catch (e) {
          console.error("Error fetching/creating user profile", e);
          if (!this.currentUser) {
              this.currentUser = {
                  id: u.uid, name: u.displayName || 'User', email: u.email || '', role: Role.SETTER, active: true
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
                
                // --- Emergency Patch for Large Projects ---
                // Automatically find and scrub projects that might be approaching the 1MB limit
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

      const collections = ['users', 'projects', 'bags', 'requests', 'movements', 'specs', 'bands', 'weekly_reports', 'transactions', 'notifications', 'system_logs', 'diamond_transactions', 'diamonds'];
      
      collections.forEach(col => {
         this.unsubscribes.push(onSnapshot(collection(db, col), (snap) => {
             const data = snap.docs.map(d => ({ ...d.data(), id: d.id }));
             if (col === 'users') {
                 this.users = data as User[];
                 if (this.currentUser) {
                     const updatedUser = this.users.find(u => u.id === this.currentUser!.id);
                     if (updatedUser) this.currentUser = updatedUser;
                 }
             }
             if (col === 'projects') this.projects = data as Project[];
             if (col === 'bags') this.bags = data as DiamondBag[];
             if (col === 'requests') this.requests = data as IssueRequest[];
             if (col === 'movements') this.movements = data as InventoryMovement[];
             if (col === 'specs') this.specs = data as DiamondSpec[];
             if (col === 'bands') this.bands = data as DiamondPriceBand[];
             if (col === 'weekly_reports') this.weeklyReports = data as WeeklyReportSnapshot[];
             if (col === 'transactions') this.transactions = data as ProjectTransaction[];
             if (col === 'notifications') this.notifications = data as AppNotification[];
             if (col === 'system_logs') this.systemLogs = data as SystemLog[];
             if (col === 'diamond_transactions') this.diamondTransactions = data as DiamondLedgerTransaction[];
             if (col === 'diamonds') this.diamonds = data as Diamond[];
             
             this.notify();
         }, (error) => {
             console.error(`Error listening to ${col}:`, error);
         }));
      });

      // Settings
      this.unsubscribes.push(onSnapshot(doc(db, 'settings', 'global'), (snap) => {
          if (snap.exists()) {
              const data = snap.data() as Partial<GlobalSettings>;
              this.settings = {
                  ...this.settings,
                  ...data,
                  purityMapping: {
                      ...this.settings.purityMapping,
                      ...(data.purityMapping || {})
                  },
                  goldWidget: {
                      ...this.settings.goldWidget,
                      ...(data.goldWidget || {})
                  }
              } as GlobalSettings;
          }
          this.notify();
      }, (error) => console.error("Error listening to settings:", error)));

      // Gold Price
      this.unsubscribes.push(onSnapshot(doc(db, 'settings', 'gold_price'), (snap) => {
          if (snap.exists()) this.liveGoldPrice = snap.data() as GoldPriceCache;
          this.notify();
      }, (error) => console.error("Error listening to gold_price:", error)));

      // Evidence (Only Managers are authorized to subscribe)
      if (this.currentUser?.role === Role.MANAGER) {
          this.unsubscribes.push(onSnapshot(collection(db, 'evidence'), (snap) => {
              this.evidenceImages = snap.docs.map(d => ({ ...d.data(), id: d.id })) as EvidenceImage[];
              this.notify();
          }, (error) => {
              console.error("Error listening to evidence:", error);
          }));
      } else {
          this.evidenceImages = [];
      }
  }

  private clearListeners() {
      this.unsubscribes.forEach(unsub => unsub());
      this.unsubscribes = [];
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

  getSystemLogs() { return this.systemLogs.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); }
  
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
      const user = this.getUser(userId);
      const userRole = user?.role;
      return this.notifications
          .filter(n => n.userId === userId || (n.role && n.role === userRole))
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
          type,
          title,
          message,
          link,
          read: false,
          createdAt: now(),
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
      await setDoc(doc(db, 'notifications', id), safeNotification);
  }

  async markNotificationRead(id: string) {
      if (this.isDemoMode) {
          const n = this.notifications.find(notif => notif.id === id);
          if (n) {
              n.read = true;
              this.notify();
          }
          return;
      }
      const safeUpdates = deepCopySafe({ read: true });
      await updateDoc(doc(db, 'notifications', id), safeUpdates);
  }

  async markAllNotificationsRead(userId: string) {
      if (this.isDemoMode) {
          const user = this.getUser(userId);
          const userRole = user?.role;
          this.notifications.forEach(n => {
              if (n.userId === userId || (n.role && n.role === userRole)) {
                  n.read = true;
              }
          });
          this.notify();
          return;
      }
      const user = this.getUser(userId);
      const userRole = user?.role;
      const unread = this.notifications.filter(n => (n.userId === userId || (n.role && n.role === userRole)) && !n.read);
      const safeUpdates = deepCopySafe({ read: true });
      const batchPromises = unread.map(n => updateDoc(doc(db, 'notifications', n.id), safeUpdates));
      await Promise.all(batchPromises);
  }

  async deleteNotification(id: string) {
      if (this.isDemoMode) {
          this.notifications = this.notifications.filter(n => n.id !== id);
          this.notify();
          return;
      }
      const { deleteDoc } = await import('firebase/firestore');
      await deleteDoc(doc(db, 'notifications', id));
      this.notifications = this.notifications.filter(n => n.id !== id);
      this.notify();
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
      return (project.services || []).map((service: any) => typeof service === 'string' ? service : service.name).filter(Boolean);
  }

  isRepairProject(project: Project) {
      return !!project.repair || !!project.repairDetails || !!project.isQuickRepair || this.getServiceNames(project).includes('Repair');
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
           services: [],
           progress: [],
           goldPurityRatioSnapshot: ratioSnapshot,
           ...project as any,
           assignments, // MUST be after spread to prevent overwrite
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
          services: [{ name: 'Repair', status: serviceStatus as 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' }],
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

      const existingServices = (p.services || []).filter((s: any) => (typeof s === 'string' ? s : s.name) !== 'Repair');
      const normalizedServices = [
          ...existingServices.map((s: any) => typeof s === 'string' ? { name: s, status: 'PENDING' as const } : s),
          { name: 'Repair', status: serviceStatus as 'PENDING' | 'IN_PROGRESS' | 'COMPLETED', updatedAt: now(), updatedBy: userId }
      ];

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
          services: [{ name: 'Repair', status: 'COMPLETED' }],
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
       const updatePayload: any = { assignments: safeAssignments };
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
       await this.addProgress({
           id: Math.random().toString(),
           projectId,
           createdById: fromUserId,
           createdAt: now(),
           stageName: 'Handoff',
           percentComplete: 0,
           weightG: weight,
           handoffToUserId: toUserId,
           note: note
       });
       const p = this.getProject(projectId);
       if (!p) return;
       
       let assignments = [...(p.assignments || [])];
       
       // Unassign fromUserId
       assignments = assignments.map(a => a.userId === fromUserId ? { ...a, active: false } : a);
       
       // Assign toUserId
       const toUserExists = assignments.some(a => a.userId === toUserId);
       if (toUserExists) {
          assignments = assignments.map(a => a.userId === toUserId ? { ...a, active: true } : a);
       } else {
          assignments.push({ userId: toUserId, assignedAt: now(), active: true });
       }
       
       const safeAssignments = deepCopySafe(assignments);

       // Sync legacy assignedSetterId for handoff target
       const updatePayload: any = { assignments: safeAssignments };
       const toUser = this.getUser(toUserId);
       if (toUser && (toUser.role === Role.SETTER || toUser.role === Role.JEWELLER)) {
           updatePayload.assignedSetterId = toUserId;
       }

       await updateDoc(doc(db, 'projects', projectId), updatePayload);

       // Validate handoff integrity
       const updatedActiveIds = assignments.filter(a => a.active).map(a => a.userId);
       if (!updatedActiveIds.includes(toUserId)) {
           console.error('[ASSIGNMENT INTEGRITY] Handoff failed: toUser not active after handoff', { projectId, toUserId });
       }
       if (updatedActiveIds.includes(fromUserId)) {
           console.warn('[ASSIGNMENT INTEGRITY] Handoff warning: fromUser still active after handoff', { projectId, fromUserId });
       }
       
       // Notify the recipient
       this.sendNotification(
           toUserId, 
           'Project Handoff', 
           `${this.getUser(fromUserId)?.name} handed off ${p.code} to you.`, 
           'HANDOFF', 
           `/project/${projectId}`
       );
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
          updateDoc(doc(db, 'projects', p.id), { assignments: deepCopySafe(p.assignments) })
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
      if(newIds.length > index) newIds.splice(index, 1);
      
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
      
      const goldPrice = this.liveGoldPrice?.price || 0;
      
      // Calculate all costs based on current settings before locking
      // Pass finalWeight as fallback for legacy components
      const currentCostSummary = this.getProjectCostSummary(projectId, finalWeight);
      const calculatedGoldCost = currentCostSummary.goldCost;
      const finalDiamondCostCalculated = currentCostSummary.totalDiamondCostCad;
      const finalSetterCostCalculated = currentCostSummary.automatedSetterCost;
      
      let ratio = p.goldPurityRatioSnapshot || 0;
      if (!ratio && p.goldPurity) {
          ratio = this.settings.purityMapping?.[p.goldPurity] || 0;
      }
      
      const activeUsers = (p.assignments || []).filter(a => a.active).map(a => a.userId);
      for (const uid of activeUsers) {
          if (uid !== userId) {
              this.sendNotification(uid, 'Status Updated', `Project ${p.code} status changed to ${ProjectStatus.REVIEW}`, 'STATUS_UPDATE', `/project/${p.id}`);
          }
      }

      const components = this.normalizeGoldComponents(p);
      const updatedComponents = components.map(c => ({
          ...c,
          ratioSnapshot: this.settings.purityMapping?.[c.purity] || 0,
          goldPriceSnapshot: goldPrice
      }));

      const safeUpdates = deepCopySafe({ 
          status: ProjectStatus.REVIEW, 
          currentStageName: 'Complete',
          currentPercentComplete: 100,
          date_completed: now(),
          last_status_change_at: now(),
          last_status_change_by: userId,
          projectEndGoldPriceSnapshot: goldPrice,
          projectEndGoldPriceCapturedAt: now(),
          goldPurityRatioSnapshot: ratio, // Legacy support
          goldComponents: updatedComponents,
          finalGoldCostCalculated: calculatedGoldCost,
          usdToCadMultiplierSnapshot: this.settings.usdToCadMultiplier,
          setterCostPerSetPieceCadSnapshot: this.settings.setterCostPerSetPieceCad,
          finalDiamondCostCalculated: finalDiamondCostCalculated,
          finalSetterCostCalculated: finalSetterCostCalculated
      });
      await updateDoc(doc(db, 'projects', projectId), safeUpdates);
  }

  async confirmProjectPickup(projectId: string, userId: string) {
      const p = this.getProject(projectId);
      if (!p) throw new Error("Project not found in store");

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
      const services = (p.services || []).map((s: any) => {
          const normalized = typeof s === 'string' ? { name: s, status: 'PENDING' as const } : s;
          return normalized.name === serviceName ? { ...normalized, status } : normalized;
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
      if(!p) return;
      const event: CastingEvent = {
          id: Math.random().toString(),
          projectId,
          cycleNumber: (p.castingEvents?.length || 0) + 1,
          sentAt: now(),
          goldComponentIds
      };
      const safeUpdates = deepCopySafe({ castingEvents: [...(p.castingEvents||[]), event] });
      await updateDoc(doc(db, 'projects', projectId), safeUpdates);
  }

  async receiveCasting(projectId: string, condition: any, weight: number, notes: string, userId: string, componentWeights?: Record<string, number>) {
      const p = this.getProject(projectId);
      if(!p || !p.castingEvents?.length) return;
      
      const events = [...p.castingEvents];
      const last = { ...events[events.length - 1] };
      
      let receivedWeight = weight;
      if (componentWeights && Object.keys(componentWeights).length > 0) {
          receivedWeight = Object.values(componentWeights).reduce((sum, w) => sum + (w || 0), 0);
      }

      last.receivedAt = now();
      last.condition = condition;
      last.receivedWeightG = receivedWeight;
      last.notes = notes;
      
      events[events.length - 1] = last;
      
      let updatedGoldComponents = p.goldComponents;
      if (componentWeights && updatedGoldComponents) {
          updatedGoldComponents = updatedGoldComponents.map(c => {
             if (componentWeights[c.id] !== undefined) {
                 return { ...c, weightG: componentWeights[c.id] };
             }
             return c;
          });
      }
      
      const safeUpdates = deepCopySafe({ 
          castingEvents: events,
          ...(updatedGoldComponents ? { goldComponents: updatedGoldComponents } : {})
      });
      await updateDoc(doc(db, 'projects', projectId), safeUpdates);
      
      if (condition === 'CORRECT') {
          await this.updateDesignStage(projectId, 'Ready for Production', userId);
      } else {
          await this.updateDesignStage(projectId, 'Casting Received (Issue)', userId);
      }
  }

  // --- Bags & Inventory ---

  getBags(projectId?: string) {
      if (projectId) return this.bags.filter(b => b.projectId === projectId);
      return this.bags;
  }

  getEvidenceImages() {
      return this.evidenceImages;
  }

  getRequests(projectId?: string) {
      if (projectId) return this.requests.filter(r => r.projectId === projectId);
      return this.requests;
  }

  async createRequest(req: Partial<IssueRequest>) {
      const id = 'req-' + Math.random().toString(36).substr(2, 9);
      const safeReq = deepCopySafe({
          id,
          createdAt: now(),
          status: 'OPEN',
          requestedAt: now(),
          ...req
      });
       if (this.isDemoMode) {
           this.requests.push(safeReq as any);
           this.notify();
           return;
       }
      await setDoc(doc(db, 'requests', id), safeReq);

      // Notify Managers
      const projectCode = this.getProject(req.projectId || '')?.code || 'Unknown';
      const requestor = this.getUser(req.requestedById || '')?.name || 'User';
      const managers = this.getUsers().filter(u => u.role === Role.MANAGER);
      
      for (const m of managers) {
          this.sendNotification(m.id, 'New Request', `${requestor} requested diamonds for ${projectCode}`, 'REQUEST', '/');
      }
  }

  async issueBag(
      projectId: string, 
      bagNumber: string, 
      items: BagItem[], 
      issuedById: string, 
      requestedById: string, 
      requestId?: string, 
      photo?: string,
      imageSource?: 'Camera' | 'Device Gallery',
      jobNumberSnapshot?: string
  ) {
      // Merge duplicate specIds into a single clean list
      const mergedItemsMap = new Map<string, number>();
      for (const item of items) {
          mergedItemsMap.set(item.specId, (mergedItemsMap.get(item.specId) || 0) + item.issuedPcs);
      }
      const mergedItems: BagItem[] = Array.from(mergedItemsMap.entries()).map(([specId, issuedPcs]) => ({ specId, issuedPcs }));

      const id = 'bag-' + Math.random().toString(36).substr(2, 9);
      const evidenceId = 'ev-' + Math.random().toString(36).substr(2, 9);
      let uploadedPhotoUrl = '';
      let uploadedThumbUrl = '';

      if (photo && photo.startsWith('data:')) {
          const path = `evidence/projects/${projectId}/issues/${bagNumber}_issued_v1.jpg`;
          const thumbPath = `evidence/projects/${projectId}/issues/${bagNumber}_issued_v1_thumb.jpg`;
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

      const uploaderName = this.getUser(issuedById)?.name || this.currentUser?.name || 'Manager';
      const evidenceDoc: EvidenceImage = {
          id: evidenceId,
          projectId,
          transactionId: id,
          transactionType: 'ISSUE',
          bagId: id,
          bagNumber,
          uploaderId: issuedById,
          uploaderName,
          uploadedAt: now(),
          imageSource: imageSource || 'Camera',
          photoUrl: uploadedPhotoUrl,
          thumbnailUrl: uploadedThumbUrl,
          version: 1,
          transactionStatus: BagStatus.ISSUED,
          replacementHistory: []
      };

      const bag: DiamondBag = {
          id,
          bagNumber,
          projectId,
          issuedById,
          issuedToId: requestedById,
          issuedAt: now(),
          status: BagStatus.ISSUED,
          items: mergedItems,
          issuedPhoto: uploadedPhotoUrl,
          evidenceId: photo ? evidenceId : undefined,
          jobNumberSnapshot
      };

      try {
          if (this.isDemoMode) {
              this.bags.push(bag);
              if (photo) {
                  this.evidenceImages.push(evidenceDoc);
              }
              this.notify();
          } else {
              const safeBag = deepCopySafe(bag);
              await setDoc(doc(db, 'bags', id), safeBag);
              if (photo) {
                  await setDoc(doc(db, 'evidence', evidenceId), deepCopySafe(evidenceDoc));
              }
          }

          if (requestId) {
              if (this.isDemoMode) {
                  const req = this.requests.find(r => r.id === requestId);
                  if (req) req.status = 'FULFILLED';
              } else {
                  const safeUpdates = deepCopySafe({ status: 'FULFILLED' });
                  await updateDoc(doc(db, 'requests', requestId), safeUpdates);
              }
          }

          const movementItems = mergedItems.map(i => {
              const spec = this.specs.find(s => s.id === i.specId);
              return {
                  specId: i.specId,
                  pcs: i.issuedPcs,
                  ct: i.issuedPcs * (spec?.ctPerStone || 0)
              };
          });

          await this.createInventoryMovement({
              type: InventoryMovementType.ISSUE,
              createdById: issuedById,
              referenceProjectId: projectId,
              referenceBagNumber: bagNumber,
              lines: movementItems,
              location: this.getUser(issuedById)?.location || this.currentUser?.location || 'Toronto'
          });

          // Notify Recipient
          this.sendNotification(
              requestedById, 
              'Bag Issued', 
              `Bag #${bagNumber} issued to you for project ${this.getProject(projectId)?.code}`, 
              'ASSIGNMENT', 
              `/project/${projectId}`
          );

      } catch (dbError) {
          console.error("Database operation failed. Performing compensating deletion of uploaded files.", dbError);
          if (uploadedPhotoUrl && uploadedPhotoUrl.startsWith('http')) {
              await this.deleteUploadedImage(uploadedPhotoUrl);
          }
          if (uploadedThumbUrl && uploadedThumbUrl.startsWith('http')) {
              await this.deleteUploadedImage(uploadedThumbUrl);
          }
          throw dbError;
      } // end catch
  } // end issueBag

   async submitBagReturn(
      bagNumber: string, 
      projectId: string,
      userId: string, 
      photo: string,
      returnedLines?: RequestLine[],
      jobNumberSnapshot?: string,
      returnedNotes?: string,
      imageSource?: 'Camera' | 'Device Gallery'
  ) {
      const bag = this.bags.find(b => b.bagNumber === bagNumber && b.projectId === projectId);
      
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
      counts: {specId: string, pcs: number}[],
      userId: string,
      mixedReturn?: {totalCt: number, notes: string},
      correctedItems?: BagItem[],
      brokenCounts?: {specId: string, pcs: number}[],
      weighedCarats?: {specId: string, ct: number}[],
      returnTransactionId?: string
  ) {
      const bag = this.bags.find(b => b.bagNumber === bagNumber);
      if (!bag) return;

      // Use bag.returnedLines or correctedItems if available, otherwise bag.items
      const specsToCheck = new Set<string>();
      if (correctedItems) correctedItems.forEach(i => specsToCheck.add(i.specId));
      else if (bag.returnedLines) bag.returnedLines.forEach(l => specsToCheck.add(l.specId));
      else bag.items.forEach(i => specsToCheck.add(i.specId));

      for (const specId of specsToCheck) {
          const returnedPcs = counts.find(c => c.specId === specId)?.pcs || 0;
          const brokenPcs = brokenCounts?.find(b => b.specId === specId)?.pcs || 0;
          const issuedItem = bag.items.find(i => i.specId === specId);
          const issuedPcs = issuedItem?.issuedPcs || 0;

          if (returnedPcs < 0 || brokenPcs < 0) {
              throw new Error(`Counts cannot be negative for ${this.specs.find(s => s.id === specId)?.label || specId}.`);
          }
      }
      
      const currentReturns = [...(bag.returns || [])];
      if (returnTransactionId) {
          const retIndex = currentReturns.findIndex(r => r.id === returnTransactionId);
          if (retIndex >= 0) {
              currentReturns[retIndex] = {
                  ...currentReturns[retIndex],
                  status: 'CONFIRMED',
                  managerId: userId,
                  confirmedAt: now()
              };
          }
      }

      // If there are no more pending returns, the bag is COUNTED_CONFIRMED.
      // Otherwise, keep it RETURNED_PENDING_COUNT.
      const hasPendingReturns = currentReturns.some(r => r.status === 'PENDING');
      const newStatus = hasPendingReturns ? BagStatus.RETURNED_PENDING_COUNT : BagStatus.COUNTED_CONFIRMED;

      const updates: any = { 
          status: newStatus,
          returns: currentReturns 
      };
      
      if (correctedItems) {
          updates.items = correctedItems;
          this.addSystemLog('INVENTORY', `Bag #${bagNumber} items corrected by manager during return verification.`);
      }

      const safeUpdates = deepCopySafe(updates);
      if (this.isDemoMode) {
          bag.status = newStatus;
          bag.returns = currentReturns;
          if (correctedItems) bag.items = correctedItems;
          if (returnTransactionId) {
              const ev = this.evidenceImages.find(e => e.transactionId === returnTransactionId);
              if (ev) {
                  ev.transactionStatus = 'CONFIRMED';
              }
          }
      } else {
          await updateDoc(doc(db, 'bags', bag.id), safeUpdates);
          if (returnTransactionId) {
              try {
                  const evCollectionRef = collection(db, 'evidence');
                  const q = query(evCollectionRef, where('transactionId', '==', returnTransactionId));
                  const querySnapshot = await getDocs(q);
                  if (!querySnapshot.empty) {
                      const docId = querySnapshot.docs[0].id;
                      await updateDoc(doc(db, 'evidence', docId), { transactionStatus: 'CONFIRMED' });
                  }
              } catch (err) {
                  console.error("Error updating evidence transactionStatus on confirmation:", err);
              }
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

          // Log "used" transactions for the actual consumed stones ONLY if the bag is now fully confirmed
          // Wait, the prompt says "Recalculate from the confirmed transaction history after every confirmed Return."
          // And "Do not count new issues too early...". The UI handles Net Used dynamically, so we don't need to manually post a 'used' ledger transaction for each partial return unless we want the ledger to reflect partial usage over time.
          // For now, let's just log the 'returned' transactions. We can post 'used' when the bag closes completely, or skip it since getProjectCostSummary calculates it dynamically.
          // To maintain compatibility, let's post the 'used' transaction if the bag is now COUNTED_CONFIRMED.
          if (newStatus === BagStatus.COUNTED_CONFIRMED) {
              const itemsToProcess = bag.items;
              for (const item of itemsToProcess) {
                  // Total returned across all confirmed returns
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
                  
                  if (this.isDemoMode) {
                      this.diamondTransactions.push(transaction);
                  } else {
                      await setDoc(doc(db, 'diamond_transactions', txId), deepCopySafe(transaction));
                  }
                  }
              }
          }

          // ── Weight-Tolerance Adjustment Transactions ──────────────────────
          // For each spec where the manager entered an actual scale reading,
          // compute delta = weighedCt - expectedCt (pcs × ctPerStone).
          // Any delta > 0.001 ct is logged as a signed 'weight_tolerance'
          // transaction so the ledger stays balanced and auditable.
          if (weighedCarats && weighedCarats.length > 0) {
              for (const wEntry of weighedCarats) {
                  const returnedCount = counts.find(c => c.specId === wEntry.specId);
                  if (!returnedCount) continue;

                  const spec = this.specs.find(s => s.id === wEntry.specId);
                  const expectedCt = returnedCount.pcs * (spec?.ctPerStone || 0);
                  const delta = +(wEntry.ct - expectedCt).toFixed(6);

                  if (Math.abs(delta) <= 0.001) continue; // within acceptable bench tolerance — skip

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
                      quantity: 0,                        // piece count unchanged
                      carats: delta,                      // positive = heavier than expected, negative = lighter
                      movementType: 'weight_tolerance',
                      unitCost: specCost,
                      totalValue: delta * specCost,
                      notes: `Scale weight variance on Bag #${bagNumber}: weighed ${wEntry.ct.toFixed(4)}ct vs expected ${expectedCt.toFixed(4)}ct (${delta > 0 ? '+' : ''}${delta.toFixed(4)}ct, ${((delta / expectedCt) * 100).toFixed(2)}%).`,
                      mainStockChange: 0,
                      wipStockChange: 0,
                      status: 'active'
                  };

                  if (this.isDemoMode) {
                      this.diamondTransactions.push(toleranceTx);
                  } else {
                      await setDoc(doc(db, 'diamond_transactions', txId), deepCopySafe(toleranceTx));
                  }

                  this.addSystemLog(
                      'INVENTORY',
                      `Weight tolerance logged for Bag #${bagNumber} (${spec?.label || wEntry.specId}): ${delta > 0 ? '+' : ''}${delta.toFixed(4)}ct`
                  );
              }
          }
      }

      // 1. Notify on return discrepancies (e.g. broken stones or lost stones)
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

      // 2. Run Ledger Audit for Negative Stock Check
      await this.runLedgerAuditAndNotify();

      this.notify();
  }

  getInventoryMovements() { return this.movements.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); }

  async createInventoryMovement(mov: Partial<InventoryMovement>) {
      const id = mov.id || 'mov-' + Math.random().toString(36).substr(2, 9);
      const safeMov = deepCopySafe({
          id,
          createdAt: now(),
          ...mov
      });
      if (this.isDemoMode) {
          this.movements.push(safeMov as any);
      } else {
          await setDoc(doc(db, 'movements', id), safeMov);
      }

      // Automatically log ledger transactions
      if (mov.lines && mov.lines.length > 0) {
          for (const line of mov.lines) {
              if (!line.specId) continue;
              
              const spec = this.specs.find(s => s.id === line.specId);
              const specCost = line.costPerCtUsd || spec?.defaultCostPerCtUsd || 0;
              const ctPerStone = spec?.ctPerStone || 0;
              
              const linePcs = line.pcs || 0;
              const lineCt = line.ct || (linePcs * ctPerStone);
              const totalValue = lineCt * specCost;
              
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
                  carats: cts,
                  movementType,
                  unitCost: specCost,
                  totalValue,
                  notes: mov.notes || `${movementType.toUpperCase()} transaction from movement.`,
                  mainStockChange,
                  wipStockChange,
                  status: 'active'
              };
              
              if (this.isDemoMode) {
                  this.diamondTransactions.push(transaction);
              } else {
                  await setDoc(doc(db, 'diamond_transactions', txId), deepCopySafe(transaction));
              }
          }
      }

      // 1. Notify Managers on Diamond Receive Completed
      if (mov.type === InventoryMovementType.SHIPMENT_IN && mov.lines && mov.lines.length > 0) {
          const managers = this.getUsers().filter(u => u.role === Role.MANAGER);
          const creator = this.getUser(mov.createdById || '')?.name || 'System';
          const totalPcs = mov.lines.reduce((sum, l) => sum + (l.pcs || 0), 0);
          const totalCt = mov.lines.reduce((sum, l) => sum + (l.ct || 0), 0);
          const label = mov.lines.length === 1 && mov.lines[0].specId 
              ? (this.specs.find(s => s.id === mov.lines[0].specId)?.label || 'Diamonds') 
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
      await this.runLedgerAuditAndNotify();

      this.notify();
  }
  
  async updateInventoryMovement(mov: InventoryMovement) {
      const safeMov = deepCopySafe(mov);
      await updateDoc(doc(db, 'movements', mov.id), safeMov);
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
              const ctPerStone = spec?.ctPerStone || 0;
              const linePcs = l.pcs || 0;
              const lineCt = l.ct || (linePcs * ctPerStone);
              const totalValue = lineCt * specCost;
              
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
                  carats: cts,
                  movementType,
                  unitCost: specCost,
                  totalValue,
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

  getInventorySummary(location: string = 'Melee'): InventorySummaryItem[] {
      const summary = new Map<string, {pcs: number, ct: number}>();

      this.movements.forEach(m => {
          m.lines.forEach(l => {
              if (!l.specId) return;

              // MIXED-UNSORTED only belongs to Melee
              if (l.specId === 'MIXED-UNSORTED') {
                  if (location !== 'Melee') return;
              } else {
                  const spec = this.specs.find(s => s.id === l.specId);
                  const specLocation = spec?.location || 'Melee';
                  if (specLocation !== location) return;
              }

              const current = summary.get(l.specId) || {pcs: 0, ct: 0};

              const spec = this.specs.find(s => s.id === l.specId);
              let lineCt = l.ct;
              // Fallback to calculation only if exact weight is not provided
              if (lineCt === undefined || lineCt === null) {
                  if (l.specId !== 'MIXED-UNSORTED' && spec && spec.ctPerStone) {
                      lineCt = (l.pcs || 0) * spec.ctPerStone;
                  } else {
                      lineCt = 0;
                  }
              }

              if (m.type === InventoryMovementType.SHIPMENT_IN || m.type === InventoryMovementType.RETURN || m.type === InventoryMovementType.RETURN_MIXED || m.type === InventoryMovementType.BULK_RETURN_INTAKE || m.type === InventoryMovementType.MANUAL_ADJUSTMENT) {
                  current.pcs += l.pcs || 0;
                  current.ct += lineCt;
              } else {
                  current.pcs -= l.pcs || 0;
                  current.ct -= lineCt;
              }
              summary.set(l.specId, current);
          });
      });

      return Array.from(summary.entries()).map(([specId, data]) => ({
          spec: this.specs.find(s => s.id === specId) || { id: specId, label: 'Unknown', sizeMm: 0, ctPerStone: 0, defaultCostPerCtUsd: 0 },
          pcs: data.pcs,
          ct: data.ct
      }));
  }
  
  async editStock(specId: string, newPcs: number, userId: string, reason: string) {
      const current = this.getInventorySummary().find(s => s.spec.id === specId);
      const diff = newPcs - (current?.pcs || 0);
      
      if (diff === 0) return;
      
      const spec = this.specs.find(s => s.id === specId);
      
      await this.createInventoryMovement({
          type: diff > 0 ? InventoryMovementType.SHIPMENT_IN : InventoryMovementType.BROKEN_OUT, 
          createdById: userId,
          notes: `Manual Adjustment: ${reason}`,
          lines: [{
              specId,
              pcs: Math.abs(diff),
              ct: Math.abs(diff) * (spec?.ctPerStone || 0)
          }],
          location: spec?.location || this.getUser(userId)?.location || this.currentUser?.location || 'Toronto'
      });
  }

  // --- Config & Gold ---

  getSpecs() { 
      return [...this.specs].sort((a, b) => a.sizeMm - b.sizeMm); 
  }
  async addSpec(spec: DiamondSpec) { 
      const safeSpec = deepCopySafe(spec);
      await setDoc(doc(db, 'specs', spec.id), safeSpec); 
  }
  async updateSpecs(specs: DiamondSpec[]) { 
      for(const s of specs) {
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

      if (this.isDemoMode) {
          this.specs = this.specs.filter(s => s.id !== id);
      } else {
          await deleteDoc(doc(db, 'specs', id)).catch(console.error);
      }

      // Clean up movements referencing this specId
      const movementsToUpdate = this.movements.filter(m => m.lines.some(l => l.specId === id));
      for (const m of movementsToUpdate) {
          const remainingLines = m.lines.filter(l => l.specId !== id);
          if (remainingLines.length === 0) {
              if (this.isDemoMode) {
                  this.movements = this.movements.filter(x => x.id !== m.id);
              } else {
                  await deleteDoc(doc(db, 'movements', m.id)).catch(console.error);
              }
          } else {
              if (this.isDemoMode) {
                  const idx = this.movements.findIndex(x => x.id === m.id);
                  if (idx !== -1) {
                      this.movements[idx] = { ...this.movements[idx], lines: remainingLines };
                  }
              } else {
                  await updateDoc(doc(db, 'movements', m.id), { lines: remainingLines }).catch(console.error);
              }
          }
      }

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
      for(const b of bands) {
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
          } catch(e) { console.warn("GoldAPI failed", e); }
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
          } catch(e) { console.warn("Fallback ASG failed", e); }
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
          } catch(e) { console.warn("Fallback Gold-API failed", e); }
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

      const isLocked = (p.status === ProjectStatus.CLOSED || p.status === ProjectStatus.REVIEW) && !!p.projectEndGoldPriceSnapshot;
      
      const goldPricePerGram = isLocked ? (p.projectEndGoldPriceSnapshot || 0) : (this.liveGoldPrice?.price || 0);
      
      const components = this.normalizeGoldComponents(p);
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

          let weight = comp.weightG || 0;
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
      const finalWeightG = finalWeightFallback !== undefined ? finalWeightFallback : (weights.length > 0 ? weights[weights.length - 1] : 0);
      
      const initialWeightG = totalInitialWeightG > 0 ? totalInitialWeightG : legacyMaxWeight;
      const goldLossG = initialWeightG > 0 && finalWeightG > 0 ? initialWeightG - finalWeightG : 0;

      const goldCost = isLocked && p.finalGoldCostCalculated !== undefined ? p.finalGoldCostCalculated : totalGoldCost;
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
          totalProjectCostCad: goldCost + totalDiamondCostCad + designJewellerCost + automatedSetterCost,
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

  generateWeeklyReport(start: Date, end: Date, userId: string): WeeklyReportSnapshot {
      const txs = this.getLedgerTransactions();
      const specs = this.getSpecs();
      
      const startMs = start.getTime();
      const endMs = end.getTime();
      
      // Calculate lines for each spec
      const lines: WeeklyReportLine[] = specs.map(spec => {
          const specId = spec.id;
          const color = spec.color || 'White';
          
          // 1. Opening stock (sum of changes before start date)
          const openingPcs = txs
              .filter(t => t.specId === specId && t.color === color && new Date(t.createdAt).getTime() < startMs)
              .reduce((acc, t) => acc + t.mainStockChange + t.wipStockChange, 0);
          
          const openingCt = txs
              .filter(t => t.specId === specId && t.color === color && new Date(t.createdAt).getTime() < startMs)
              .reduce((acc, t) => acc + (t.mainStockChange + t.wipStockChange) * (spec.ctPerStone || 0), 0);
              
          // 2. Weekly movements (during the week)
          const weekTxs = txs.filter(t => t.specId === specId && t.color === color && new Date(t.createdAt).getTime() >= startMs && new Date(t.createdAt).getTime() <= endMs);
          
          const comeInPcs = weekTxs
              .filter(t => t.movementType === 'added' || (t.movementType === 'adjusted' && t.quantity > 0))
              .reduce((acc, t) => acc + t.quantity, 0);
          const comeInCt = weekTxs
              .filter(t => t.movementType === 'added' || (t.movementType === 'adjusted' && t.quantity > 0))
              .reduce((acc, t) => acc + t.carats, 0);
              
          const issuedPcs = weekTxs
              .filter(t => t.movementType === 'assigned')
              .reduce((acc, t) => acc + Math.abs(t.quantity), 0);
          const issuedCt = weekTxs
              .filter(t => t.movementType === 'assigned')
              .reduce((acc, t) => acc + Math.abs(t.carats), 0);
              
          const returnedPcs = weekTxs
              .filter(t => t.movementType === 'returned')
              .reduce((acc, t) => acc + t.quantity, 0);
          const returnedCt = weekTxs
              .filter(t => t.movementType === 'returned')
              .reduce((acc, t) => acc + t.carats, 0);
              
          const usedPcs = weekTxs
              .filter(t => t.movementType === 'used')
              .reduce((acc, t) => acc + Math.abs(t.quantity), 0);
          const usedCt = weekTxs
              .filter(t => t.movementType === 'used')
              .reduce((acc, t) => acc + Math.abs(t.carats), 0);
              
          const brokenPcs = weekTxs
              .filter(t => t.movementType === 'broken')
              .reduce((acc, t) => acc + Math.abs(t.quantity), 0);
          const brokenCt = weekTxs
              .filter(t => t.movementType === 'broken')
              .reduce((acc, t) => acc + Math.abs(t.carats), 0);
              
          const adjustmentsPcs = weekTxs
              .filter(t => t.movementType === 'adjusted')
              .reduce((acc, t) => acc + t.quantity, 0);
              
          // 3. Closing owned inventory. Assigned and returned move stones between
          // main stock and WIP; used/broken/lost reduce owned inventory.
          const closingPcs = txs
              .filter(t => t.specId === specId && t.color === color && new Date(t.createdAt).getTime() <= endMs)
              .reduce((acc, t) => acc + t.mainStockChange + t.wipStockChange, 0);
              
          const closingCt = txs
              .filter(t => t.specId === specId && t.color === color && new Date(t.createdAt).getTime() <= endMs)
              .reduce((acc, t) => acc + (t.mainStockChange + t.wipStockChange) * (spec.ctPerStone || 0), 0);
              
          return {
              spec,
              openingPcs,
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
              adjustmentsPcs,
              closingPcs,
              closingCt
          };
      });

      const report: WeeklyReportSnapshot = {
          id: 'rep-' + Math.random().toString(36).substr(2,9),
          weekStartDate: start.toISOString(),
          weekEndDate: end.toISOString(),
          createdAt: now(),
          createdById: userId,
          lines
      };
      
      this.weeklyReports.push(report);
      return report;
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
                      isOverride: false
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
