
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
  onboarding?: {
    needsOnboarding: boolean;
    completedAt?: string;
    skippedAt?: string;
  };
}

export interface DiamondSpec {
  id: string;
  label: string;
  sizeMm: number;
  shape?: string;
  ctPerStone: number;
  defaultCostPerCtUsd: number;
  isOverride?: boolean;
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

export interface CastingEvent {
  id: string;
  projectId: string;
  cycleNumber: number;
  sentAt: string;
  receivedAt?: string;
  condition?: 'CORRECT' | 'DAMAGED' | 'INCORRECT';
  receivedWeightG?: number;
  notes?: string;
}

export interface Project {
  id: string;
  code: string;
  pieceName: string;
  clientName?: string;
  priority: Priority;
  status: ProjectStatus;
  dueDate: string;
  createdAt: string;
  
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
  goldType?: 'Yellow' | 'White' | 'Rose';
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
}

export interface CostBreakdownItem {
  spec: DiamondSpec;
  grossUsedPcs: number;
  brokenPcs: number;
  usedPcs: number;
  costUsd: number;
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
  
  finalWeightG: number;
  breakdown: CostBreakdownItem[];
  
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
  BULK_RETURN_INTAKE = 'BULK_RETURN_INTAKE'
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
export type NotificationType = 'ASSIGNMENT' | 'REQUEST' | 'RETURN' | 'SYSTEM' | 'HANDOFF';

export interface AppNotification {
  id: string;
  userId: string; // Recipient
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  read: boolean;
  createdAt: string;
}
