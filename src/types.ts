/* ── Domain types for AgriTrace Audit ─────────────────────────────────── */

export type Role =
  | "SUPER_ADMIN"
  | "AUDIT_ADMIN"
  | "AUDITOR"
  | "FARM_MANAGER"
  | "SUPERVISOR"
  | "VIEWER";

export type FarmType =
  | "Broiler"
  | "Layer"
  | "Broiler Breeder"
  | "Layer Breeder"
  | "Hatchery"
  | "Feed Mill"
  | "Livestock"
  | "Other";

export type AuditStatus =
  | "Draft"
  | "Scheduled"
  | "In Progress"
  | "Submitted"
  | "Under Review"
  | "Completed"
  | "Cancelled";

export type Severity = "Critical" | "Major" | "Minor" | "Observation";
export type RiskLevel = "Low" | "Medium" | "High" | "Critical";
export type RiskBand = "Low" | "Medium" | "High" | "Critical";

export type FindingStatus =
  | "Open"
  | "Action Required"
  | "In Progress"
  | "Submitted for Verification"
  | "Verified"
  | "Closed"
  | "Rejected";

export type CAStatus =
  | "Open"
  | "In Progress"
  | "Submitted for Verification"
  | "Verified"
  | "Rejected"
  | "Closed";

export type DeadlineState = "Completed" | "Overdue" | "Due Soon" | "On Track";

export type QType = "choice" | "numeric" | "percent" | "rating" | "date" | "text";
export type ChoiceValue = "C" | "PC" | "NC" | "NA";
export type AnswerValue = ChoiceValue | number | string;

export type EvidenceType = "Photo" | "Video" | "PDF" | "Excel" | "Word" | "Document" | "Other";

export type NotificationType =
  | "audit_assigned"
  | "audit_scheduled"
  | "finding_created"
  | "ca_assigned"
  | "ca_due_soon"
  | "ca_overdue"
  | "ca_submitted"
  | "verification_required"
  | "finding_closed"
  | "audit_completed";

export type Perm =
  | "dashboard"
  | "manage_master_data"
  | "manage_programs"
  | "schedule_audits"
  | "execute_audits"
  | "manage_findings"
  | "submit_ca"
  | "verify_ca"
  | "view_reports"
  | "manage_users"
  | "manage_settings"
  | "view_logs";

/* ── Entities ─────────────────────────────────────────────────────────── */

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  title: string;
  farmId?: string; // scoped farms for FARM_MANAGER / SUPERVISOR
  color: string; // avatar hue
  active: boolean;
  lastLogin: string;
}

export interface Farm {
  id: string;
  code: string;
  name: string;
  type: FarmType;
  company: string;
  region: string;
  province: string;
  district: string;
  address: string;
  gps: { lat: number; lng: number };
  managerId: string;
  supervisorId: string;
  capacity: number;
  capacityUnit: string;
  houses: number;
  active: boolean;
}

export interface Location {
  id: string;
  name: string;
  region: string;
  province: string;
}

export interface Department {
  id: string;
  name: string;
  head: string;
}

export interface Program {
  id: string;
  code: string;
  name: string;
  auditType: string;
  frequency: "Monthly" | "Quarterly" | "Semi-Annual" | "Annual";
  scope: string;
  applicableFarmTypes: FarmType[];
  standard: string;
  riskLevel: RiskLevel;
  activeFrom: string;
  activeTo: string;
  active: boolean;
}

export interface QuestionRule {
  /** compliant if value <= max, partial if <= partialMax */
  max: number;
  partialMax?: number;
}

export interface Question {
  id: string;
  text: string;
  type: QType;
  requirement?: string;
  reference?: string;
  guidance?: string;
  riskLevel: RiskLevel;
  mandatory: boolean;
  mandatoryEvidence: boolean;
  scored: boolean;
  rule?: QuestionRule;
  unit?: string;
}

export interface Subcategory {
  id: string;
  name: string;
  questions: Question[];
}

export interface Category {
  id: string;
  name: string;
  subcategories: Subcategory[];
}

export interface Template {
  id: string;
  code: string;
  name: string;
  version: string;
  description: string;
  categories: Category[];
}

export interface FindingDraft {
  title: string;
  description: string;
  severity: Severity;
  likelihood: number; // 1-5
  impact: number; // 1-5
  rootCause: string;
  recommendation: string;
  responsibleId: string;
  dueDate: string;
}

export interface Response {
  value: AnswerValue;
  notes?: string;
  evidenceIds: string[];
  findingDraft?: FindingDraft;
  updatedAt: string;
}

export interface Audit {
  id: string;
  code: string;
  programId: string;
  templateId: string;
  farmId: string;
  date: string; // ISO date
  startTime: string;
  endTime: string;
  leadAuditorId: string;
  teamIds: string[];
  scope: string;
  objectives: string;
  riskLevel: RiskLevel;
  status: AuditStatus;
  responses: Record<string, Response>;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  completedAt?: string;
  reviewNotes?: string;
  signedById?: string;
}

export interface Evidence {
  id: string;
  code: string;
  auditId: string;
  questionId?: string;
  findingId?: string;
  uploadedById: string;
  uploadedAt: string;
  type: EvidenceType;
  fileName: string;
  description: string;
  imageUrl?: string; // photo preview
}

export interface Finding {
  id: string;
  code: string;
  auditId: string;
  farmId: string;
  categoryId: string;
  questionId: string;
  title: string;
  description: string;
  evidenceIds: string[];
  severity: Severity;
  likelihood: number;
  impact: number;
  rootCause: string;
  recommendation: string;
  responsibleId: string;
  createdAt: string;
  dueDate: string;
  status: FindingStatus;
}

export interface CorrectiveAction {
  id: string;
  code: string;
  findingId: string;
  action: string;
  rootCause: string;
  responsibleId: string;
  targetDate: string;
  completionDate?: string;
  status: CAStatus;
  evidenceIds: string[];
  verificationNotes?: string;
  verifiedById?: string;
  verifiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  audience: Role[]; // roles that see it
  userIds?: string[]; // or specific users
  link?: string;
  read: boolean;
  createdAt: string;
}

export interface ActivityLog {
  id: string;
  userId: string;
  action: string;
  record: string;
  detail: string;
  at: string;
  device: string;
}

export interface Settings {
  scoreValues: { C: number; PC: number; NC: number };
  thresholds: { excellent: number; good: number; needsImprovement: number };
  dueSoonDays: number;
  defaultCADays: number;
  riskBands: { lowMax: number; mediumMax: number; highMax: number }; // likelihood x impact
}

export interface DB {
  v: number;
  users: User[];
  farms: Farm[];
  locations: Location[];
  departments: Department[];
  programs: Program[];
  templates: Template[];
  audits: Audit[];
  findings: Finding[];
  correctiveActions: CorrectiveAction[];
  evidence: Evidence[];
  notifications: AppNotification[];
  activityLogs: ActivityLog[];
  settings: Settings;
}

/* ── Static vocabularies & permission matrix ──────────────────────────── */

export const ROLES: Role[] = ["SUPER_ADMIN", "AUDIT_ADMIN", "AUDITOR", "FARM_MANAGER", "SUPERVISOR", "VIEWER"];

export const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  AUDIT_ADMIN: "Audit Admin",
  AUDITOR: "Auditor",
  FARM_MANAGER: "Farm Manager",
  SUPERVISOR: "Supervisor",
  VIEWER: "Viewer",
};

export const ROLE_PERMS: Record<Role, Perm[]> = {
  SUPER_ADMIN: [
    "dashboard", "manage_master_data", "manage_programs", "schedule_audits",
    "execute_audits", "manage_findings", "submit_ca", "verify_ca",
    "view_reports", "manage_users", "manage_settings", "view_logs",
  ],
  AUDIT_ADMIN: [
    "dashboard", "manage_master_data", "manage_programs", "schedule_audits",
    "execute_audits", "manage_findings", "verify_ca", "view_reports", "view_logs",
  ],
  AUDITOR: ["dashboard", "schedule_audits", "execute_audits", "manage_findings", "verify_ca", "view_reports"],
  FARM_MANAGER: ["dashboard", "submit_ca", "view_reports"],
  SUPERVISOR: ["dashboard", "submit_ca", "view_reports"],
  VIEWER: ["dashboard", "view_reports"],
};

export const FARM_TYPES: FarmType[] = [
  "Broiler", "Layer", "Broiler Breeder", "Layer Breeder", "Hatchery", "Feed Mill", "Livestock", "Other",
];

export const AUDIT_STATUSES: AuditStatus[] = [
  "Draft", "Scheduled", "In Progress", "Submitted", "Under Review", "Completed", "Cancelled",
];

export const SEVERITIES: Severity[] = ["Critical", "Major", "Minor", "Observation"];
export const FINDING_STATUSES: FindingStatus[] = [
  "Open", "Action Required", "In Progress", "Submitted for Verification", "Verified", "Closed", "Rejected",
];
export const CA_STATUSES: CAStatus[] = [
  "Open", "In Progress", "Submitted for Verification", "Verified", "Rejected", "Closed",
];
export const EVIDENCE_TYPES: EvidenceType[] = ["Photo", "Video", "PDF", "Excel", "Word", "Document", "Other"];
export const RISK_LEVELS: RiskLevel[] = ["Low", "Medium", "High", "Critical"];

export const CHOICE_OPTIONS: { value: ChoiceValue; label: string; short: string }[] = [
  { value: "C", label: "Compliant", short: "C" },
  { value: "PC", label: "Partially Compliant", short: "PC" },
  { value: "NC", label: "Non-Compliant", short: "NC" },
  { value: "NA", label: "Not Applicable", short: "N/A" },
];
