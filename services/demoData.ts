
import { 
  User, Role, Project, ProjectStatus, Priority, BagStatus, 
  DiamondSpec, GlobalSettings, NotificationType 
} from '../types';

const now = () => new Date().toISOString();
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();
const daysFromNow = (n: number) => new Date(Date.now() + n * 86400000).toISOString();

export const MOCK_USERS: User[] = [
  { id: 'demo-manager-1', name: 'Steve Jobs', email: 'steve@daniels.com', role: Role.MANAGER, active: true },
  { id: 'demo-manager-2', name: 'Alexander the Great', email: 'alexander@daniels.com', role: Role.MANAGER, active: true },
  { id: 'demo-jeweller-1', name: 'Leonardo da Vinci', email: 'leo@daniels.com', role: Role.JEWELLER, active: true },
  { id: 'demo-setter-1', name: 'Elon Musk', email: 'elon@daniels.com', role: Role.SETTER, active: true },
  { id: 'demo-designer-1', name: 'Michelangelo', email: 'mike@daniels.com', role: Role.DESIGNER, active: true },
  { id: 'demo-system-1', name: 'Ada Lovelace', email: 'ada@daniels.com', role: Role.MANAGER, active: true },
];

export const MOCK_SPECS: DiamondSpec[] = [
  { id: 'spec-rd-08', label: 'RD 0.8mm', sizeMm: 0.8, ctPerStone: 0.003, defaultCostPerCtUsd: 450 },
  { id: 'spec-rd-10', label: 'RD 1.0mm', sizeMm: 1.0, ctPerStone: 0.005, defaultCostPerCtUsd: 480 },
  { id: 'spec-rd-12', label: 'RD 1.2mm', sizeMm: 1.2, ctPerStone: 0.008, defaultCostPerCtUsd: 520 },
  { id: 'spec-rd-15', label: 'RD 1.5mm', sizeMm: 1.5, ctPerStone: 0.015, defaultCostPerCtUsd: 580 },
  { id: 'spec-rd-20', label: 'RD 2.0mm', sizeMm: 2.0, ctPerStone: 0.03, defaultCostPerCtUsd: 650 },
  { id: 'spec-bag-2x1', label: 'BAG 2.0x1.0mm', sizeMm: 1.5, ctPerStone: 0.02, defaultCostPerCtUsd: 750 },
  { id: 'spec-rd-18', label: 'RD 1.8mm', sizeMm: 1.8, ctPerStone: 0.022, defaultCostPerCtUsd: 620 },
  { id: 'spec-rd-25', label: 'RD 2.5mm', sizeMm: 2.5, ctPerStone: 0.055, defaultCostPerCtUsd: 820 },
];

export const MOCK_PROJECTS: Project[] = [
  // 1 — CLOSED / Complete
  {
    id: 'proj-demo-001',
    code: 'KDL-2026-041',
    pieceName: '18k Pavé Diamond Eternity Ring',
    clientName: 'Maison Éclat',
    priority: Priority.RUSH,
    status: ProjectStatus.CLOSED,
    dueDate: daysAgo(3),
    createdAt: daysAgo(18),
    assignments: [
      { userId: 'demo-manager-1', assignedAt: daysAgo(18), active: true },
      { userId: 'demo-jeweller-1', assignedAt: daysAgo(18), active: true }
    ],
    services: [{ code: 'CUSTOM_MAKE', status: 'COMPLETED' }],
    currentStageName: 'Complete',
    currentPercentComplete: 100,
    goldType: 'Yellow',
    goldPurity: '18k',
    goldPurityRatioSnapshot: 0.750,
    progress: [
      { id: 'prog-1', projectId: 'proj-demo-001', createdById: 'demo-manager-1', createdAt: daysAgo(16), stageName: 'Intake', percentComplete: 10, weightG: 8.2 },
      { id: 'prog-2', projectId: 'proj-demo-001', createdById: 'demo-jeweller-1', createdAt: daysAgo(10), stageName: 'Casting', percentComplete: 40, weightG: 9.1 },
      { id: 'prog-2b', projectId: 'proj-demo-001', createdById: 'demo-jeweller-1', createdAt: daysAgo(6), stageName: 'Setting', percentComplete: 75, weightG: 8.9 },
      { id: 'prog-2c', projectId: 'proj-demo-001', createdById: 'demo-manager-1', createdAt: daysAgo(3), stageName: 'Complete', percentComplete: 100, weightG: 8.7 },
    ],
    finalGoldCostCalculated: 8420,
    finalDiamondCostCalculated: 6800,
    finalSetterCostCalculated: 1200,
  },
  // 2 — ACTIVE / Setting
  {
    id: 'proj-demo-002',
    code: 'KDL-2026-042',
    pieceName: 'White Gold Baguette Tennis Bracelet',
    clientName: 'Bijoux Prestige',
    priority: Priority.NORMAL,
    status: ProjectStatus.ACTIVE,
    dueDate: daysFromNow(5),
    createdAt: daysAgo(12),
    assignments: [
      { userId: 'demo-setter-1', assignedAt: daysAgo(9), active: true }
    ],
    services: [{ code: 'CUSTOM_MAKE', status: 'IN_PROGRESS' }],
    currentStageName: 'Setting',
    currentPercentComplete: 65,
    goldType: 'White',
    goldPurity: '18k',
    goldPurityRatioSnapshot: 0.750,
    progress: [
      { id: 'prog-3', projectId: 'proj-demo-002', createdById: 'demo-setter-1', createdAt: daysAgo(7), stageName: 'Setting', percentComplete: 65, weightG: 22.4 }
    ]
  },
  // 3 — ACTIVE / Intake
  {
    id: 'proj-demo-003',
    code: 'KDL-2026-043',
    pieceName: 'VVS Round Brilliant Necklace',
    clientName: 'Private Client',
    priority: Priority.RUSH,
    status: ProjectStatus.ACTIVE,
    dueDate: daysFromNow(2),
    createdAt: daysAgo(4),
    assignments: [
      { userId: 'demo-jeweller-1', assignedAt: daysAgo(4), active: true }
    ],
    services: [{ code: 'CUSTOM_MAKE', status: 'PENDING' }],
    currentStageName: 'Intake',
    currentPercentComplete: 10,
    goldType: 'Yellow',
    goldPurity: '14k',
    goldPurityRatioSnapshot: 0.585,
    progress: [
      { id: 'prog-3b', projectId: 'proj-demo-003', createdById: 'demo-jeweller-1', createdAt: daysAgo(4), stageName: 'Intake', percentComplete: 10, weightG: 14.8 }
    ]
  },
  // 4 — AWAITING_MANAGER
  {
    id: 'proj-demo-004',
    code: 'KDL-2026-044',
    pieceName: 'Rose Gold Halo Engagement Ring',
    clientName: 'Al Faysal Jewellers',
    priority: Priority.LOW,
    status: ProjectStatus.AWAITING_MANAGER,
    dueDate: daysFromNow(14),
    createdAt: daysAgo(2),
    assignments: [],
    services: [{ code: 'ENGAGEMENT', status: 'PENDING' }],
    currentStageName: 'Intake',
    currentPercentComplete: 0,
    goldType: 'Rose',
    goldPurity: '18k',
    goldPurityRatioSnapshot: 0.750,
    progress: []
  },
  // 5 — REVIEW / QC
  {
    id: 'proj-demo-005',
    code: 'KDL-2026-045',
    pieceName: 'Custom Yellow Diamond Brooch',
    clientName: 'Étoile Designs',
    priority: Priority.NORMAL,
    status: ProjectStatus.REVIEW,
    dueDate: daysFromNow(1),
    createdAt: daysAgo(25),
    assignments: [
      { userId: 'demo-designer-1', assignedAt: daysAgo(25), active: true }
    ],
    services: [{ code: 'CUSTOM_MAKE', status: 'COMPLETED' }],
    currentStageName: 'QC/Polish',
    currentPercentComplete: 90,
    goldType: 'Yellow',
    goldPurity: '18k',
    goldPurityRatioSnapshot: 0.750,
    progress: [
      { id: 'prog-4', projectId: 'proj-demo-005', createdById: 'demo-designer-1', createdAt: daysAgo(3), stageName: 'QC/Polish', percentComplete: 90, weightG: 31.5 }
    ]
  },
  // 6 — ACTIVE / Pre-Polish
  {
    id: 'proj-demo-006',
    code: 'KDL-2026-046',
    pieceName: '14k Micro-Pavé Stackable Band',
    clientName: 'The Gem Vault',
    priority: Priority.NORMAL,
    status: ProjectStatus.ACTIVE,
    dueDate: daysFromNow(8),
    createdAt: daysAgo(10),
    assignments: [
      { userId: 'demo-setter-1', assignedAt: daysAgo(8), active: true },
      { userId: 'demo-jeweller-1', assignedAt: daysAgo(8), active: true },
    ],
    services: [{ code: 'CUSTOM_MAKE', status: 'IN_PROGRESS' }],
    currentStageName: 'Pre-Polish',
    currentPercentComplete: 40,
    goldType: 'Yellow',
    goldPurity: '14k',
    goldPurityRatioSnapshot: 0.585,
    progress: [
      { id: 'prog-5', projectId: 'proj-demo-006', createdById: 'demo-setter-1', createdAt: daysAgo(6), stageName: 'Pre-Polish', percentComplete: 40, weightG: 4.1 }
    ]
  },
  // 7 — ACTIVE / Setting 70%
  {
    id: 'proj-demo-007',
    code: 'KDL-2026-047',
    pieceName: 'Platinum 3-Stone Solitaire',
    clientName: 'Couture Fine Jewelry',
    priority: Priority.RUSH,
    status: ProjectStatus.ACTIVE,
    dueDate: daysFromNow(3),
    createdAt: daysAgo(14),
    assignments: [
      { userId: 'demo-jeweller-1', assignedAt: daysAgo(12), active: true },
    ],
    services: [{ code: 'CUSTOM_MAKE', status: 'IN_PROGRESS' }],
    currentStageName: 'Setting',
    currentPercentComplete: 70,
    goldType: 'White',
    goldPurity: '950',
    goldPurityRatioSnapshot: 0.95,
    progress: [
      { id: 'prog-6', projectId: 'proj-demo-007', createdById: 'demo-jeweller-1', createdAt: daysAgo(4), stageName: 'Setting', percentComplete: 70, weightG: 7.3 }
    ]
  },
  // 8 — CLOSED / Complete
  {
    id: 'proj-demo-008',
    code: 'KDL-2026-048',
    pieceName: '18k Cuban Link Chain (Diamond Cut)',
    clientName: 'Khalid & Sons',
    priority: Priority.NORMAL,
    status: ProjectStatus.CLOSED,
    dueDate: daysAgo(7),
    createdAt: daysAgo(30),
    assignments: [
      { userId: 'demo-manager-2', assignedAt: daysAgo(30), active: true },
      { userId: 'demo-setter-1', assignedAt: daysAgo(28), active: true },
    ],
    services: [{ code: 'CUSTOM_MAKE', status: 'COMPLETED' }],
    currentStageName: 'Complete',
    currentPercentComplete: 100,
    goldType: 'Yellow',
    goldPurity: '18k',
    goldPurityRatioSnapshot: 0.750,
    progress: [
      { id: 'prog-7', projectId: 'proj-demo-008', createdById: 'demo-manager-2', createdAt: daysAgo(28), stageName: 'Intake', percentComplete: 10, weightG: 182 },
      { id: 'prog-8', projectId: 'proj-demo-008', createdById: 'demo-setter-1', createdAt: daysAgo(20), stageName: 'Casting', percentComplete: 40, weightG: 196 },
      { id: 'prog-9', projectId: 'proj-demo-008', createdById: 'demo-setter-1', createdAt: daysAgo(12), stageName: 'Setting', percentComplete: 75, weightG: 192 },
      { id: 'prog-10', projectId: 'proj-demo-008', createdById: 'demo-manager-2', createdAt: daysAgo(7), stageName: 'Complete', percentComplete: 100, weightG: 189 },
    ],
    finalGoldCostCalculated: 104500,
    finalDiamondCostCalculated: 28400,
    finalSetterCostCalculated: 6200,
  },
  // 9 — ACTIVE / Setting / Multi-Gold
  {
    id: 'proj-demo-009',
    code: 'KDL-2026-049',
    pieceName: 'Two-Tone Diamond Pendant',
    clientName: 'Elmwood Boutique',
    priority: Priority.NORMAL,
    status: ProjectStatus.ACTIVE,
    dueDate: daysFromNow(6),
    createdAt: daysAgo(5),
    assignments: [
      { userId: 'demo-setter-1', assignedAt: daysAgo(4), active: true },
    ],
    services: [{ code: 'CUSTOM_MAKE', status: 'IN_PROGRESS' }],
    currentStageName: 'Setting',
    currentPercentComplete: 30,
    goldType: 'Yellow',
    goldPurity: '14k',
    goldPurityRatioSnapshot: 0.585,
    goldComponents: [
      { id: 'comp-1', label: 'Main Base', type: 'Yellow', purity: '18k', weightG: 8.5 },
      { id: 'comp-2', label: 'Diamond Setting', type: 'White', purity: '14k', weightG: 4.0 }
    ],
    castingEvents: [
      { id: 'cast-1', projectId: 'proj-demo-009', cycleNumber: 1, sentAt: daysAgo(4), receivedAt: daysAgo(3), receivedWeightG: 12.5, notes: 'Multi-component casting received.' }
    ],
    progress: [
      { id: 'prog-11', projectId: 'proj-demo-009', createdById: 'demo-setter-1', createdAt: daysAgo(3), stageName: 'Setting', percentComplete: 30, weightG: 12.5 }
    ]
  },
];

export const MOCK_SETTINGS: GlobalSettings = {
    usdToCadMultiplier: 1.35,
    setterCostPerSetPieceCad: 3,
    purityMapping: { '10k': 0.417, '14k': 0.585, '18k': 0.750, '19k': 0.79, '21k': 0.875, '950': 0.95 },
    goldWidget: { enabled: true, refreshIntervalMinutes: 30, showPerGram: true }
};

export const MOCK_BAGS = [
    {
        id: 'bag-demo-1',
        bagNumber: 'BAG-101',
        projectId: 'proj-demo-002',
        issuedToId: 'demo-setter-1',
        issuedById: 'demo-manager-1',
        issuedAt: daysAgo(7),
        status: BagStatus.ISSUED,
        items: [{ specId: 'spec-rd-12', issuedPcs: 480, returnedPcs: 0 }]
    },
    {
        id: 'bag-demo-2',
        bagNumber: 'BAG-102',
        projectId: 'proj-demo-003',
        issuedToId: 'demo-jeweller-1',
        issuedById: 'demo-manager-1',
        issuedAt: daysAgo(3),
        status: BagStatus.ISSUED,
        items: [{ specId: 'spec-rd-15', issuedPcs: 120, returnedPcs: 0 }, { specId: 'spec-rd-20', issuedPcs: 48, returnedPcs: 0 }]
    },
    {
        id: 'bag-demo-3',
        bagNumber: 'BAG-099',
        projectId: 'proj-demo-006',
        issuedToId: 'demo-setter-1',
        issuedById: 'demo-manager-2',
        issuedAt: daysAgo(6),
        status: BagStatus.ISSUED,
        items: [{ specId: 'spec-rd-08', issuedPcs: 600, returnedPcs: 0 }, { specId: 'spec-rd-10', issuedPcs: 200, returnedPcs: 0 }]
    },
];

export const MOCK_REQUESTS = [
    {
        id: 'req-demo-1',
        projectId: 'proj-demo-003',
        requestedById: 'demo-jeweller-1',
        requestedAt: daysAgo(1),
        status: 'OPEN',
        lines: [{ specId: 'spec-rd-15', requestedPcs: 85 }]
    },
    {
        id: 'req-demo-2',
        projectId: 'proj-demo-007',
        requestedById: 'demo-jeweller-1',
        requestedAt: daysAgo(2),
        status: 'OPEN',
        lines: [{ specId: 'spec-rd-25', requestedPcs: 6 }]
    },
];
