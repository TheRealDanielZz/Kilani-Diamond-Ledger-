
import { 
  collection, doc, getDoc, getDocs, setDoc, updateDoc, 
  onSnapshot, query, where, orderBy, addDoc, deleteDoc,
  serverTimestamp
} from 'firebase/firestore';
import { 
  signInWithEmailAndPassword, signOut, sendPasswordResetEmail, 
  onAuthStateChanged, createUserWithEmailAndPassword, updateProfile,
  getAuth,
  User as FirebaseUser
} from 'firebase/auth';
import { initializeApp, deleteApp, FirebaseApp } from 'firebase/app';
import { db, auth, firebaseConfig } from './firebase';
import { 
  User, Project, Role, ProjectStatus, DiamondBag, IssueRequest, 
  InventoryMovement, DiamondSpec, GoldPriceCache, GlobalSettings, 
  ProjectCostSummary, WeeklyReportSnapshot, ProgressStage,
  DiamondPriceBand, BagStatus, InventoryMovementType,
  TransactionStatus, VerificationOutcome, ProjectTransaction,
  InventorySummaryItem, InventoryLine, BagItem, CastingEvent, ProjectNote, ProjectAssignment,
  AppNotification, NotificationType
} from '../types';

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
        return obj.map(v => deepCopySafe(v, seen));
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
    purityMapping: { '10k': 0.417, '14k': 0.585, '18k': 0.750, '21k': 0.875 },
    goldWidget: { enabled: true, refreshIntervalMinutes: 30, showPerGram: true }
  };
  private weeklyReports: WeeklyReportSnapshot[] = [];
  private transactions: ProjectTransaction[] = [];
  private notifications: AppNotification[] = [];
  
  private liveGoldPrice: GoldPriceCache | null = null;
  private currentUser: User | null = null;
  private listeners: (() => void)[] = [];
  private unsubscribes: (() => void)[] = [];
  
  // Stages Configuration
  private stages: ProgressStage[] = [
    { id: 's1', name: 'Intake', percentValue: 10 },
    { id: 's2', name: 'CAD/Design', percentValue: 30 },
    { id: 's3', name: 'Casting/Raw', percentValue: 50 },
    { id: 's4', name: 'Pre-Polish', percentValue: 60 },
    { id: 's5', name: 'Setting', percentValue: 80 },
    { id: 's6', name: 'Final Polish', percentValue: 90 },
    { id: 's7', name: 'Complete', percentValue: 100 }
  ];

  constructor() {}

  async init() {
    // Setup listeners
    const collections = ['users', 'projects', 'bags', 'requests', 'movements', 'specs', 'bands', 'weekly_reports', 'transactions', 'notifications'];
    
    collections.forEach(col => {
       this.unsubscribes.push(onSnapshot(collection(db, col), (snap) => {
           const data = snap.docs.map(d => d.data());
           if (col === 'users') this.users = data as User[];
           if (col === 'projects') this.projects = data as Project[];
           if (col === 'bags') this.bags = data as DiamondBag[];
           if (col === 'requests') this.requests = data as IssueRequest[];
           if (col === 'movements') this.movements = data as InventoryMovement[];
           if (col === 'specs') this.specs = data as DiamondSpec[];
           if (col === 'bands') this.bands = data as DiamondPriceBand[];
           if (col === 'weekly_reports') this.weeklyReports = data as WeeklyReportSnapshot[];
           if (col === 'transactions') this.transactions = data as ProjectTransaction[];
           if (col === 'notifications') this.notifications = data as AppNotification[];
           
           this.notify();
       }));
    });

    // Settings
    this.unsubscribes.push(onSnapshot(doc(db, 'settings', 'global'), (snap) => {
        if (snap.exists()) this.settings = snap.data() as GlobalSettings;
        this.notify();
    }));

    // Gold Price
    this.unsubscribes.push(onSnapshot(doc(db, 'settings', 'gold_price'), (snap) => {
        if (snap.exists()) this.liveGoldPrice = snap.data() as GoldPriceCache;
        this.notify();
    }));

    // Auth
    await new Promise<void>(resolve => {
        onAuthStateChanged(auth, async (u) => {
            if (u) {
                const found = this.users.find(us => us.email.toLowerCase() === u.email?.toLowerCase());
                this.currentUser = found || {
                    id: 'temp', name: u.displayName || 'User', email: u.email || '', role: Role.SETTER, active: true
                };
            } else {
                this.currentUser = null;
            }
            this.notify();
            resolve();
        });
    });
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

  // --- Auth & User ---

  async login(email: string, password?: string) {
      if (!password) throw new Error("Password required");
      await signInWithEmailAndPassword(auth, email, password);
      return this.currentUser;
  }

  async logout() {
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
         await setDoc(doc(db, 'users', id), { ...safeUser, id });
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
         
         await setDoc(doc(db, 'users', uid), finalUser);

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
      await updateDoc(doc(db, 'users', user.id), { ...safeUser });
  }
  
  async deleteUser(id: string) {
      // Note: This only deletes from Firestore. 
      // Deleting from Auth requires Admin SDK or user context.
      // For client-side, consider using an 'active: false' flag instead.
      await deleteDoc(doc(db, 'users', id));
  }

  async updateCurrentUserProfile(data: Partial<User>) {
      if (!this.currentUser) return;
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
          .filter(n => n.userId === userId)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async sendNotification(userId: string, title: string, message: string, type: NotificationType, link?: string) {
      const id = 'notif-' + Math.random().toString(36).substr(2, 9);
      const notification: AppNotification = {
          id,
          userId,
          type,
          title,
          message,
          link,
          read: false,
          createdAt: now()
      };
      await setDoc(doc(db, 'notifications', id), notification);
  }

  async markNotificationRead(id: string) {
      await updateDoc(doc(db, 'notifications', id), { read: true });
  }

  async markAllNotificationsRead(userId: string) {
      const unread = this.notifications.filter(n => n.userId === userId && !n.read);
      const batchPromises = unread.map(n => updateDoc(doc(db, 'notifications', n.id), { read: true }));
      await Promise.all(batchPromises);
  }

  // --- Projects ---

  getProjects() { return this.projects; }
  getProject(id: string) { return this.projects.find(p => p.id === id); }

  async createProject(project: Partial<Project>, assigneeIds: string[]) {
      const id = 'proj-' + Math.random().toString(36).substr(2, 9);
      const assignments = assigneeIds.map(uid => ({ userId: uid, assignedAt: now(), active: true }));
      
      const newProject: Project = {
          id,
          createdAt: now(),
          status: ProjectStatus.ACTIVE,
          currentStageName: 'Intake',
          currentPercentComplete: 10,
          assignments,
          services: [],
          progress: [],
          ...project as any
      };
      
      const safeProject = deepCopySafe(newProject);
      await setDoc(doc(db, 'projects', id), safeProject);

      // Notify Assignees
      for (const userId of assigneeIds) {
          this.sendNotification(userId, 'New Assignment', `You have been assigned to ${newProject.code}`, 'ASSIGNMENT', `/project/${id}`);
      }

      return newProject;
  }

  async deleteProject(id: string) {
      await deleteDoc(doc(db, 'projects', id));
  }

  async updateProject(project: Project) {
      await updateDoc(doc(db, 'projects', project.id), { ...project });
  }

  async assignUser(projectId: string, userId: string) {
      const p = this.getProject(projectId);
      if (!p) return;
      const exists = p.assignments.some(a => a.userId === userId && a.active);
      let newAssignments;
      if (exists) {
        newAssignments = p.assignments.map(a => a.userId === userId ? { ...a, active: false } : a);
      } else {
        newAssignments = [...p.assignments, { userId, assignedAt: now(), active: true }];
        // Notify the newly assigned user
        this.sendNotification(userId, 'New Assignment', `You have been assigned to ${p.code}`, 'ASSIGNMENT', `/project/${projectId}`);
      }
      await updateDoc(doc(db, 'projects', projectId), { assignments: newAssignments });
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
          handoffToUserId: toUserId
      });
      const p = this.getProject(projectId);
      if (p && !p.assignments.some(a => a.userId === toUserId && a.active)) {
         await this.assignUser(projectId, toUserId);
      }
      
      // Notify the recipient
      this.sendNotification(
          toUserId, 
          'Project Handoff', 
          `${this.getUser(fromUserId)?.name} handed off ${p?.code} to you.`, 
          'HANDOFF', 
          `/project/${projectId}`
      );
  }

  async addProgress(progress: any) {
      const p = this.getProject(progress.projectId);
      if (!p) return;
      
      const safeProgress = deepCopySafe(progress);
      const newProgress = [...(p.progress || []), safeProgress];
      
      const updates: any = { progress: newProgress };
      if (progress.stageName && progress.stageName !== 'Handoff') {
          updates.currentStageName = progress.stageName;
          updates.currentPercentComplete = progress.percentComplete;
      }

      await updateDoc(doc(db, 'projects', p.id), updates);
  }

  async addProjectNote(note: ProjectNote) {
      const p = this.getProject(note.projectId);
      if (!p) return;
      const newNotes = [...(p.designLogs || []), note];
      await updateDoc(doc(db, 'projects', p.id), { designLogs: newNotes });
  }

  async addProjectPhoto(projectId: string, base64: string) {
      const p = this.getProject(projectId);
      if (!p) return;
      const newPhotos = [...(p.projectPhotos || []), base64];
      const newIds = [...(p.projectPhotoIds || []), Math.random().toString()];
      await updateDoc(doc(db, 'projects', projectId), { projectPhotos: newPhotos, projectPhotoIds: newIds });
  }

  async deleteProjectPhoto(projectId: string, index: number) {
      const p = this.getProject(projectId);
      if (!p || !p.projectPhotos) return;
      const newPhotos = [...p.projectPhotos];
      newPhotos.splice(index, 1);
      const newIds = p.projectPhotoIds ? [...p.projectPhotoIds] : [];
      if(newIds.length > index) newIds.splice(index, 1);
      
      await updateDoc(doc(db, 'projects', projectId), { projectPhotos: newPhotos, projectPhotoIds: newIds });
  }

  async completeProject(projectId: string, finalWeight: number, userId: string) {
      const p = this.getProject(projectId);
      if (!p) return;
      
      const goldPrice = this.liveGoldPrice?.price || 0;
      
      await updateDoc(doc(db, 'projects', projectId), { 
          status: ProjectStatus.REVIEW, 
          currentStageName: 'Complete',
          currentPercentComplete: 100,
          date_completed: now(),
          last_status_change_at: now(),
          last_status_change_by: userId,
          projectEndGoldPriceSnapshot: goldPrice,
          projectEndGoldPriceCapturedAt: now(),
      });
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

      await updateDoc(doc(db, 'projects', projectId), {
          status: ProjectStatus.CLOSED,
          date_picked_up: now(),
          last_status_change_at: now(),
          last_status_change_by: userId,
          progress: newProgress
      });
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

      await updateDoc(doc(db, 'projects', projectId), {
          status: ProjectStatus.ACTIVE,
          currentStageName: 'Final Polish', 
          currentPercentComplete: 90,
          date_completed: null, 
          date_picked_up: null,
          projectEndGoldPriceSnapshot: null, 
          projectEndGoldPriceCapturedAt: null,
          last_status_change_at: now(),
          last_status_change_by: userId,
          progress: newProgress
      });
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
      
      await updateDoc(doc(db, 'projects', projectId), {
          [field]: newDate,
          progress: [...(p.progress || []), safeEntry]
      });
  }

  async updateProjectLabourCost(projectId: string, amount: number, note: string) {
      await updateDoc(doc(db, 'projects', projectId), { 
          labourCostAmount: amount,
          labourCostNote: note,
          labourCostLastUpdatedAt: now()
      });
  }

  async updateServiceStatus(projectId: string, serviceName: string, status: string, userId: string) {
      const p = this.getProject(projectId);
      if (!p) return;
      const services = p.services.map(s => s.name === serviceName ? { ...s, status } : s);
      await updateDoc(doc(db, 'projects', projectId), { services });
  }

  async updateDesignStage(projectId: string, stage: string, userId: string) {
      await updateDoc(doc(db, 'projects', projectId), { designStage: stage });
  }

  async sendToCasting(projectId: string, userId: string) {
      const p = this.getProject(projectId);
      if(!p) return;
      const event: CastingEvent = {
          id: Math.random().toString(),
          projectId,
          cycleNumber: (p.castingEvents?.length || 0) + 1,
          sentAt: now()
      };
      await updateDoc(doc(db, 'projects', projectId), { castingEvents: [...(p.castingEvents||[]), event] });
  }

  async receiveCasting(projectId: string, condition: any, weight: number, notes: string, userId: string) {
      const p = this.getProject(projectId);
      if(!p || !p.castingEvents?.length) return;
      
      const events = [...p.castingEvents];
      const last = { ...events[events.length - 1] };
      last.receivedAt = now();
      last.condition = condition;
      last.receivedWeightG = weight;
      last.notes = notes;
      
      events[events.length - 1] = last;
      
      await updateDoc(doc(db, 'projects', projectId), { castingEvents: events });
      
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

  getRequests(projectId?: string) {
      if (projectId) return this.requests.filter(r => r.projectId === projectId);
      return this.requests;
  }

  async createRequest(req: Partial<IssueRequest>) {
      const id = 'req-' + Math.random().toString(36).substr(2, 9);
      await setDoc(doc(db, 'requests', id), {
          id,
          createdAt: now(),
          status: 'OPEN',
          requestedAt: now(),
          ...req
      });

      // Notify Managers
      const projectCode = this.getProject(req.projectId || '')?.code || 'Unknown';
      const requestor = this.getUser(req.requestedById || '')?.name || 'User';
      const managers = this.getUsers().filter(u => u.role === Role.MANAGER);
      
      for (const m of managers) {
          this.sendNotification(m.id, 'New Request', `${requestor} requested diamonds for ${projectCode}`, 'REQUEST', '/');
      }
  }

  async issueBag(projectId: string, bagNumber: string, items: BagItem[], issuedById: string, requestedById: string, requestId?: string, photo?: string) {
      const id = 'bag-' + Math.random().toString(36).substr(2, 9);
      const bag: DiamondBag = {
          id,
          bagNumber,
          projectId,
          issuedById,
          issuedToId: requestedById,
          issuedAt: now(),
          status: BagStatus.ISSUED,
          items,
          issuedPhoto: photo
      };
      
      await setDoc(doc(db, 'bags', id), bag);
      
      if (requestId) {
          await updateDoc(doc(db, 'requests', requestId), { status: 'FULFILLED' });
      }

      const movementItems = items.map(i => {
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
          lines: movementItems
      });

      // Notify Recipient
      this.sendNotification(
          requestedById, 
          'Bag Issued', 
          `Bag #${bagNumber} issued to you for project ${this.getProject(projectId)?.code}`, 
          'ASSIGNMENT', 
          `/project/${projectId}`
      );
  }

  async submitBagReturn(bagNumber: string, userId: string, photo: string) {
      const bag = this.bags.find(b => b.bagNumber === bagNumber && b.status === BagStatus.ISSUED);
      if (!bag) throw new Error("Bag not found or not issued");
      
      await updateDoc(doc(db, 'bags', bag.id), { 
          status: BagStatus.RETURNED_PENDING_COUNT,
          returnedAt: now(),
          returnedPhoto: photo
      });

      // Notify Managers
      const managers = this.getUsers().filter(u => u.role === Role.MANAGER);
      const returner = this.getUser(userId)?.name || 'User';
      for (const m of managers) {
          this.sendNotification(m.id, 'Bag Returned', `${returner} returned Bag #${bagNumber}`, 'RETURN', '/');
      }
  }

  async confirmBagCount(bagNumber: string, counts: {specId: string, pcs: number}[], userId: string, mixedReturn?: {totalCt: number, notes: string}) {
      const bag = this.bags.find(b => b.bagNumber === bagNumber);
      if (!bag) return;

      await updateDoc(doc(db, 'bags', bag.id), { status: BagStatus.COUNTED_CONFIRMED });
      
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
              }]
          });
      } else {
          const lines = counts.map(c => {
              const spec = this.specs.find(s => s.id === c.specId);
              return {
                  specId: c.specId,
                  pcs: c.pcs,
                  ct: c.pcs * (spec?.ctPerStone || 0)
              };
          });
          
          await this.createInventoryMovement({
              type: InventoryMovementType.RETURN,
              createdById: userId,
              referenceProjectId: bag.projectId,
              referenceBagNumber: bagNumber,
              lines: lines
          });
      }
  }

  getInventoryMovements() { return this.movements.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); }

  async createInventoryMovement(mov: Partial<InventoryMovement>) {
      const id = 'mov-' + Math.random().toString(36).substr(2, 9);
      await setDoc(doc(db, 'movements', id), {
          id,
          createdAt: now(),
          ...mov
      });
  }
  
  async updateInventoryMovement(mov: InventoryMovement) {
      await updateDoc(doc(db, 'movements', mov.id), { ...mov });
  }

  getInventorySummary(): InventorySummaryItem[] {
      const summary = new Map<string, {pcs: number, ct: number}>();
      
      this.movements.forEach(m => {
          m.lines.forEach(l => {
              if (!l.specId) return;
              const current = summary.get(l.specId) || {pcs: 0, ct: 0};
              
              if (m.type === InventoryMovementType.SHIPMENT_IN || m.type === InventoryMovementType.RETURN || m.type === InventoryMovementType.RETURN_MIXED || m.type === InventoryMovementType.BULK_RETURN_INTAKE) {
                  current.pcs += l.pcs || 0;
                  current.ct += l.ct || 0;
              } else {
                  current.pcs -= l.pcs || 0;
                  current.ct -= l.ct || 0;
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
          }]
      });
  }

  // --- Config & Gold ---

  getSpecs() { return this.specs; }
  async addSpec(spec: DiamondSpec) { await setDoc(doc(db, 'specs', spec.id), spec); }
  async updateSpecs(specs: DiamondSpec[]) { 
      for(const s of specs) {
          await updateDoc(doc(db, 'specs', s.id), { ...s });
      }
  }

  getBands() { return this.bands; }
  async updateBands(bands: DiamondPriceBand[]) {
      for(const b of bands) {
          await setDoc(doc(db, 'bands', b.id), b);
      }
  }
  
  getSettings() { return this.settings; }
  async updateSettings(s: GlobalSettings) { await setDoc(doc(db, 'settings', 'global'), s); }

  getLiveGoldPrice() { return this.liveGoldPrice; }
  
  async toggleGoldPriceMode(manual: boolean) {
      if (this.liveGoldPrice) {
          await setDoc(doc(db, 'settings', 'gold_price'), { ...this.liveGoldPrice, isManual: manual });
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
              
              await setDoc(doc(db, 'settings', 'gold_price'), cache);
              this.liveGoldPrice = cache;
              this.notify();
              return cache;
          } else {
              if (this.liveGoldPrice) {
                  const updated = { ...this.liveGoldPrice, error: "Market data unavailable." };
                  await setDoc(doc(db, 'settings', 'gold_price'), updated);
              }
          }
      } catch (e: any) {
          console.error("Error saving gold price", e);
      }
      return this.liveGoldPrice;
  }

  // --- Reports ---

  getProjectCostSummary(projectId: string): ProjectCostSummary {
      const p = this.getProject(projectId);
      if (!p) return { totalCaratsUsed: 0, totalBrokenCarats: 0, totalDiamondCostCad: 0, labourCost: 0, automatedSetterCost: 0, goldCost: 0, totalProjectCostCad: 0, finalWeightG: 0, breakdown: [], isLocked: false, usedPurePricePerGram: 0, usedRatio: 0 };

      const isLocked = (p.status === ProjectStatus.CLOSED || p.status === ProjectStatus.REVIEW) && !!p.projectEndGoldPriceSnapshot;
      
      const goldPricePerGram = isLocked ? (p.projectEndGoldPriceSnapshot || 0) : (this.liveGoldPrice?.price || 0);
      const purityRatio = p.goldPurity ? (this.settings.purityMapping?.[p.goldPurity] || 0.585) : 0;
      const finalWeightG = p.progress.reduce((max, prog) => prog.weightG ? prog.weightG : max, 0);
      const goldCost = goldPricePerGram * purityRatio * finalWeightG;

      const bags = this.getBags(projectId);
      const movements = this.getInventoryMovements().filter(m => m.referenceProjectId === projectId);
      const brokenMoves = movements.filter(m => m.type === InventoryMovementType.BROKEN_OUT);
      const totalBrokenCarats = brokenMoves.reduce((acc, m) => acc + m.lines.reduce((a,l)=>a+l.ct,0), 0);
      
      const breakdown = this.specs.map(spec => {
          const issued = bags.reduce((acc, b) => acc + (b.items.find(i => i.specId === spec.id)?.issuedPcs || 0), 0);
          const returned = movements.filter(m => m.type === InventoryMovementType.RETURN).reduce((acc, m) => acc + (m.lines.find(l => l.specId === spec.id)?.pcs || 0), 0);
          const broken = brokenMoves.reduce((acc, m) => acc + (m.lines.find(l => l.specId === spec.id)?.pcs || 0), 0);
          const usedPcs = issued - returned - broken;
          return {
              spec,
              grossUsedPcs: usedPcs + broken,
              brokenPcs: broken,
              usedPcs: usedPcs,
              costUsd: (usedPcs * spec.ctPerStone) * spec.defaultCostPerCtUsd
          };
      }).filter(b => b.grossUsedPcs > 0);

      const totalDiamondCostUsd = breakdown.reduce((acc, b) => acc + b.costUsd, 0);
      const totalDiamondCostCad = totalDiamondCostUsd * this.settings.usdToCadMultiplier;
      
      const designJewellerCost = p.labourCostAmount || 0;
      const totalStonesSet = breakdown.reduce((acc, b) => acc + b.usedPcs, 0);
      const automatedSetterCost = totalStonesSet * (this.settings.setterCostPerSetPieceCad || 3);

      return {
          totalCaratsUsed: breakdown.reduce((acc, b) => acc + (b.usedPcs * b.spec.ctPerStone), 0),
          totalBrokenCarats,
          totalDiamondCostCad,
          labourCost: designJewellerCost,
          automatedSetterCost,
          goldCost,
          totalProjectCostCad: goldCost + totalDiamondCostCad + designJewellerCost + automatedSetterCost,
          finalWeightG,
          breakdown,
          isLocked,
          usedPurePricePerGram: goldPricePerGram,
          usedRatio: purityRatio
      };
  }

  generateWeeklyReport(start: Date, end: Date, userId: string): WeeklyReportSnapshot {
      const lines = this.getInventorySummary().map(s => ({
          spec: s.spec,
          openingPcs: s.pcs,
          openingCt: s.ct,
          comeInPcs: 0,
          comeInCt: 0,
          issuedPcs: 0,
          issuedCt: 0,
          returnedPcs: 0,
          returnedCt: 0,
          adjustmentsPcs: 0,
          closingPcs: s.pcs,
          closingCt: s.ct
      }));

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
  generateSpecsFromBands() { return { created: 0, updated: 0 }; }
  getStages() { return this.stages; }
}

export const store = new StoreService();