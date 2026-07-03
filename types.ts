
export interface GoldPriceCache {
  price: number;
  currency: string;
  lastUpdated: string; // ISO String
  error?: string; // Optional error message explaining staleness
  change?: number; // Daily change value
  changePercent?: number; // Daily change percentage
  isManual?: boolean; // New: true if set by user, false if from API
}

export enum Role {
  MANAGER = 'Manager',
  SETTER = 'Setter',
  JEWELLER = 'Jeweller',
  DESIGNER = 'Designer',
  SALES_REP = 'Sales_Rep'
}

export enum ProjectStatus {
  ACTIVE = 'Active',
  REVIEW = 'Review', // Completed Production, Awaiting Pickup
  CLOSED = 'Closed', // Picked Up
  AWAITING_MANAGER = 'Awaiting_Manager' // Legacy/Blocked
}

export enum BagStatus {
  ISSUED = 'Issued',
  RETURNED_PENDING_COUNT = 'Returned_Pending_Count',
  COUNTED_CONFIRMED = 'Counted_Confirmed'
}

export enum Priority {
  NORMAL = 'Normal',
  RUSH = 'Rush',
  LOW = 'Low'
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  setterColor?: string;
  profilePhoto?: string;
  password?: string;
  active: boolean;
  theme?: 'light' | 'dark';
  onboarding?: {
    needsOnboarding: boolean;
    completedAt?: string;
    skippedAt?: string;
  };
  location?: string;
}

export interface InventoryNote {
  text: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  lastEditedAt: string;
  edited: boolean;
}

export interface NoteAuditEntry {
  id: string;
  action: 'created' | 'edited' | 'deleted' | 'restored' | 'transferred';
  timestamp: string;
  userId: string;
  userName: string;
  userRole: string;
  prevValue: string;
  newValue: string;
  location: string;
}

export interface DiamondSpec {
  id: string;
  label: string;
  sizeMm: number;
  shape?: string;
  ctPerStone: number;
  defaultCostPerCtUsd: number;
  isOverride?: boolean;
  color?: string; // New: "White", "Yellow", "Blue", etc.
  location?: string; // e.g. 'Active' — undefined/absent means Melee
  inventoryNote?: InventoryNote;
  noteAuditTrail?: NoteAuditEntry[];
}

export interface Diamond {
  id: string;
  location: string;
  shape: string;
  size: number;
  color: string;
  clarity: string;
  cut: string;
  certNumber: string;
  measurements: string;
  mountLoose: string;
  place: string;
  stocktake: string;
  code: string;
  sold: string;
  notes?: string;
  inventoryNote?: InventoryNote;
  noteAuditTrail?: NoteAuditEntry[];
}

export interface DiamondPriceBand {
  id: string;
  name: string;
  minMm: number;
  maxMm: number;
  stepMm: number;
  pricePerCtUsd: number;
  active: boolean;
}

export interface ProgressStage {
  id: string;
  name: string;
  percentValue: number;
}

export interface ProjectAssignment {
  userId: string;
  assignedAt: string;
  active: boolean;
}

export interface ProjectService {
  name: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  updatedAt?: string;
  updatedBy?: string;
}

export interface ProjectNote {
  id: string;
  projectId: string;
  createdById: string;
  createdAt: string;
  note: string;
  attachment?: string;
  type?: 'DESIGN' | 'GENERAL';
}

export interface ProjectProgress {
  id: string;
  projectId: string;
  createdById: string;
  createdAt: string;
  stageName: string;
  percentComplete: number;
  weightG?: number; // Mandatory weight capture
  handoffToUserId?: string;
}

export interface GoldComponent {
  id: string; // Unique UUID
  label: string; // User-defined, e.g., "Top Piece", "Band"
  type: string; // "Yellow", "White", "Rose", "Platinum"
  purity: string; // "10k", "14k", "18k", "22k", etc.
  weightG?: number; // Added post-casting
  ratioSnapshot?: number; // Snapshot on project complete
  goldPriceSnapshot?: number; // Snapshot on project complete
}

export interface CastingEvent {
  id: string;
  projectId: string;
  goldComponentIds?: string[];
  cycleNumber: number;
  sentAt: string;
  receivedAt?: string;
  condition?: 'CORRECT' | 'DAMAGED' | 'INCORRECT';
  receivedWeightG?: number;
  notes?: string;
}

export interface RepairItem {
  stoneSize: string;
  quantity: number;
}

export interface RepairDetails {
  date: string;
  items: RepairItem[];
  totalQuantity: number;
  report: string;
}

export enum RepairType {
  DIAMOND_SETTING = 'Diamond Setting Repair',
  WATCH = 'Watch Repair',
  RING_RESIZING = 'Ring Resizing',
  BROKEN_PIECE = 'Broken Piece Repair',
  GENERAL = 'General Repair'
}

export enum RepairStatus {
  INTAKE = 'Intake',
  IN_PROGRESS = 'In Progress',
  WAITING_FOR_PARTS = 'Waiting for Parts',
  SENT_OUT = 'Sent Out',
  RECEIVED_BACK = 'Received Back',
  READY_FOR_PICKUP = 'Ready for Pickup',
  COMPLETED = 'Completed',
  CANCELLED = 'Cancelled'
}

export interface RepairFinancials {
  labourCostCad?: number;
  goldUsedG?: number;
  goldCostCad?: number;
  diamondPieces?: number;
  diamondCarats?: number;
  diamondCostCad?: number;
  outsourcedCostCad?: number;
  materialCostCad?: number;
  clientChargeCad?: number;
  noCharge?: boolean;
  noChargeReason?: string;
}

export interface RepairDetailsV2 {
  type: RepairType;
  status: RepairStatus;
  submittedDate: string;
  completedDate?: string;
  customName?: string;
  vendorName?: string;
  outsourced?: boolean;
  issueNotes?: string;
  repairNotes?: string;
  internalNotes?: string;
  customerNotes?: string;
  sizeFrom?: string;
  sizeTo?: string;
  damageType?: string;
  diamondItems?: RepairItem[];
  beforeImage?: string;
  afterImage?: string;
  financials: RepairFinancials;
}

export interface RepairCostSummary {
  isRepair: boolean;
  repairType?: RepairType | string;
  repairStatus?: RepairStatus | string;
  totalInternalCostCad: number;
  finalClientChargeCad: number;
  profitLossCad: number;
  noCharge: boolean;
  noChargeReason?: string;
  labourCostCad: number;
  goldUsedG: number;
  goldCostCad: number;
  diamondPieces: number;
  diamondCarats: number;
  diamondCostCad: number;
  outsourcedCostCad: number;
  materialCostCad: number;
  outsourced: boolean;
}

export interface Project {
  id: string;
  code: string;
  pieceName: string;
  clientName?: string;
  clientPhone?: string;
  priority: Priority;
  status: ProjectStatus;
  dueDate: string;
  createdAt: string;
  
  isQuickRepair?: boolean;
  repairDetails?: RepairDetails;
  repair?: RepairDetailsV2;
  
  // Lifecycle Dates
  date_completed?: string; // When moved to Review
  date_picked_up?: string; // When moved to Closed
  last_status_change_at?: string;
  last_status_change_by?: string;

  salesRepId?: string;
  assignedSetterId?: string; // Legacy
  assignments: ProjectAssignment[];
  services: ProjectService[];
  currentStageName: string;
  currentPercentComplete: number;
  designStage?: string;
  castingEvents?: CastingEvent[];
  projectPhotos?: string[];
  projectPhotoIds?: string[];
  designLogs?: ProjectNote[];
  progress: ProjectProgress[];
  workDetails?: string;
  
  // -- Financials & Metals --
  goldComponents?: GoldComponent[]; // Auto-migrated list of gold parts
  goldType?: 'Yellow' | 'White' | 'Rose' | 'Platinum';
  goldPurity?: string; // '10k', '14k', etc.
  goldPurityRatioSnapshot?: number; // The specific ratio used (e.g. 0.585)
  
  labourCostAmount?: number; // Represents Design/Jeweller cost
  labourCostNote?: string;
  labourCostLastUpdatedAt?: string;
  
  // Snapshot at completion
  // Stores the PURE GOLD (24k) price per gram in CAD at the moment of closing
  projectEndGoldPriceSnapshot?: number; 
  projectEndGoldPriceCapturedAt?: string;
  finalGoldCostCalculated?: number; // The final calculated cost (Price * Ratio * Weight)
  
  usdToCadMultiplierSnapshot?: number;
  setterCostPerSetPieceCadSnapshot?: number;
  finalDiamondCostCalculated?: number;
  finalSetterCostCalculated?: number;

  // Manual overrides for diamond usage in reports
  diamondUsageOverrides?: {
    [specId: string]: {
      usedPcs?: number;
      brokenPcs?: number;
    }
  };
}

export interface BagReturnLine {
  specId: string;
  shape: string;
  size: string;
  originalIssuedPcs: number;
  previouslyConfirmedPcs: number;
  availableBeforeReturn: number;
  returnedPcs: number;
}

export interface BagReturnTransaction {
  id: string;
  projectId: string;
  jobNumberSnapshot?: string;
  bagId: string;
  bagNumber: string;
  setterId: string;
  submittedAt: string;
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED';
  photo: string;
  notes?: string;
  lines: BagReturnLine[];
  managerId?: string;
  confirmedAt?: string;
  evidenceId?: string;
}

export interface BagItem {
  specId: string;
  issuedPcs: number;
}

export interface DiamondBag {
  id: string;
  bagNumber: string;
  projectId: string;
  issuedToId: string;
  issuedById: string;
  issuedAt: string;
  status: BagStatus;
  items: BagItem[];
  issuedPhoto?: string;
  returnedPhoto?: string;
  returnedAt?: string;
  returnedLines?: RequestLine[];
  returnedNotes?: string;
  jobNumberSnapshot?: string;
  returns?: BagReturnTransaction[];
  evidenceId?: string;
}

export interface RequestLine {
  specId: string;
  requestedPcs: number;
}

export interface IssueRequest {
  id: string;
  projectId: string;
  requestedById: string;
  requestedAt: string;
  status: 'OPEN' | 'FULFILLED';
  lines: RequestLine[];
  jobNumberSnapshot?: string;
}

export interface CostBreakdownItem {
  spec: DiamondSpec;
  issuedPcs: number;
  returnedPcs: number;
  grossUsedPcs: number;
  brokenPcs: number;
  usedPcs: number;
  costUsd: number;
}

export interface GoldCostBreakdownItem {
  componentId: string;
  label: string;
  type: string;
  purity: string;
  weightG: number;
  ratioUsed: number;
  calculatedCostCad: number;
  purePriceAtTime: number;
}

export interface ProjectCostSummary {
  totalCaratsUsed: number;
  totalBrokenCarats: number;
  totalDiamondCostCad: number;
  
  // New Financials
  labourCost: number; // Manual Design/Jeweller cost
  automatedSetterCost: number; // New: Auto-calculated
  goldCost: number;
  totalProjectCostCad: number;
  
  initialWeightG: number;
  finalWeightG: number;
  goldLossG: number;
  breakdown: CostBreakdownItem[];
  goldBreakdown?: GoldCostBreakdownItem[]; // Granular gold cost breakdown
  
  // Meta for UI display
  isLocked: boolean;
  usedPurePricePerGram: number;
  usedRatio: number;
}

export enum InventoryMovementType {
  ISSUE = 'ISSUE',
  RETURN = 'RETURN',
  RETURN_MIXED = 'RETURN_MIXED',
  SHIPMENT_IN = 'SHIPMENT_IN',
  BROKEN_OUT = 'BROKEN_OUT',
  BULK_RETURN_INTAKE = 'BULK_RETURN_INTAKE',
  DIAMOND_ADD = 'DIAMOND_ADD',
  DIAMOND_UPDATE = 'DIAMOND_UPDATE',
  DIAMOND_DELETE = 'DIAMOND_DELETE',
  MELEE_SPEC_DELETE = 'MELEE_SPEC_DELETE',
  MANUAL_ADJUSTMENT = 'MANUAL_ADJUSTMENT'
}

export interface InventoryLine {
  specId?: string;
  pcs?: number;
  ct: number;
  costPerCtUsd?: number;
}

export interface InventoryMovement {
  id: string;
  type: InventoryMovementType;
  createdAt: string;
  createdById: string;
  referenceProjectId?: string;
  referenceBagNumber?: string;
  referenceSetterId?: string;
  supplier?: string;
  invoiceNo?: string;
  notes?: string;
  lines: InventoryLine[];
  location?: string;
}

export interface GlobalSettings {
  usdToCadMultiplier: number;
  setterCostPerSetPieceCad: number;
  purityMapping?: Record<string, number>; // e.g. {'14k': 0.585}
  goldWidget?: {
    enabled: boolean;
    refreshIntervalMinutes: number;
    showPerGram: boolean;
  };
  inventoryLocations?: string[]; // Custom diamond locations (e.g. ['Toronto', 'Miami']). 'Melee' is always built-in.
}

export interface WeeklyReportLine {
  spec: DiamondSpec;
  openingPcs: number;
  openingCt: number;
  comeInPcs: number;
  comeInCt: number;
  issuedPcs: number;
  issuedCt: number;
  returnedPcs: number;
  returnedCt: number;
  usedPcs?: number;
  usedCt?: number;
  brokenPcs?: number;
  brokenCt?: number;
  adjustmentsPcs: number;
  closingPcs: number;
  closingCt: number;
}

export interface WeeklyReportSnapshot {
  id: string;
  weekStartDate: string;
  weekEndDate: string;
  createdAt: string;
  createdById: string;
  lines: WeeklyReportLine[];
}

export interface DiamondLedgerTransaction {
  id: string;
  createdAt: string;
  createdById: string;
  referenceProjectId?: string;
  referenceBagNumber?: string;
  specId: string;
  color: string; // "White", "Yellow", etc.
  quantity: number; // Positive/Negative (pcs)
  carats: number; // Positive/Negative (ct)
  movementType: 'added' | 'requested' | 'assigned' | 'used' | 'returned' | 'broken' | 'lost' | 'adjusted' | 'weight_tolerance';
  unitCost: number; // Cost per carat (USD)
  totalValue: number; // carats * unitCost
  notes?: string;
  
  // Ledger Location Delta Tracking
  mainStockChange: number; // change to main stock (+/-)
  wipStockChange: number; // change to setter/factory stock (+/-)
  
  // Audit Trail
  status: 'active' | 'edited' | 'deleted';
  originalTxId?: string; // Links to pre-edited transaction
  editedById?: string;
  editedAt?: string;
}

export interface InventorySummaryItem {
  spec: DiamondSpec;
  pcs: number;
  ct: number;
}

// Verification Flow types
export enum TransactionType {
  ISSUE = 'ISSUE',
  RETURN = 'RETURN'
}

export enum TransactionStatus {
  SUBMITTED = 'SUBMITTED',
  VERIFIED = 'VERIFIED'
}

export enum VerificationOutcome {
  CONFIRMED = 'CONFIRMED',
  CORRECTED = 'CORRECTED'
}

export interface TransactionLine {
  specId: string;
  qtyPcs: number;
  qtyCt: number;
}

export interface ProjectTransaction {
  id: string;
  type: TransactionType;
  status: TransactionStatus;
  createdById: string;
  lines: TransactionLine[];
}

export interface TransactionVerificationLine {
  specId: string;
  countedPcs: number;
  countedCt: number;
}

export interface TransactionVerification {
  transactionId: string;
  managerId: string;
  verifiedAt: string;
  outcome: VerificationOutcome;
  reason?: string;
  lines: TransactionVerificationLine[];
}

// Notifications
export type NotificationType = 'ASSIGNMENT' | 'REQUEST' | 'RETURN' | 'SYSTEM' | 'HANDOFF' | 'MENTION' | 'STATUS_UPDATE';

export interface AppNotification {
  id: string;
  userId?: string; // Recipient User ID (optional if role-based)
  role?: Role;     // Recipient Role (optional if user-specific)
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  read: boolean;
  createdAt: string;
  relatedProjectId?: string; // Optional related project
  metadata?: Record<string, any>; // Optional metadata
}

export interface SystemLog {
  id: string;
  createdAt: string;
  createdById: string;
  action: string;
  details: string;
}

export interface EvidenceReplacement {
  replacedAt: string;
  replacedById: string;
  replacedByName: string;
  reason: string;
  photoUrl: string;
  thumbnailUrl: string;
  imageSource: 'Camera' | 'Device Gallery';
}

export interface EvidenceImage {
  id: string;
  projectId: string;
  transactionId: string;
  transactionType: 'ISSUE' | 'RETURN';
  bagId: string;
  bagNumber: string;
  uploaderId: string;
  uploaderName: string;
  uploadedAt: string;
  imageSource: 'Camera' | 'Device Gallery';
  photoUrl: string;
  thumbnailUrl: string;
  version: number;
  transactionStatus: string;
  replacementHistory?: EvidenceReplacement[];
}
