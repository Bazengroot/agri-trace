/**
 * Database Types - Generated from Supabase schema
 *
 * These types match the PostgreSQL schema defined in:
 * supabase/migrations/00001_initial_schema.sql
 *
 * They provide type safety for all database operations.
 */

// ═══════════════════════════════════════════════════════════════════════
// ENUM TYPES
// ═══════════════════════════════════════════════════════════════════════

export type OrgStatus = 'active' | 'suspended' | 'archived';

export type UserRole =
  | 'super_admin'
  | 'audit_admin'
  | 'auditor'
  | 'farm_manager'
  | 'supervisor'
  | 'viewer';

export type UserStatus = 'active' | 'inactive' | 'suspended';

export type FarmType =
  | 'broiler'
  | 'layer'
  | 'broiler_breeder'
  | 'layer_breeder'
  | 'hatchery'
  | 'feed_mill'
  | 'livestock'
  | 'other';

export type FarmStatus = 'active' | 'inactive' | 'under_audit';

export type HouseStatus = 'active' | 'inactive' | 'maintenance' | 'depopulated';

export type LivestockType =
  | 'broiler'
  | 'layer'
  | 'breeder'
  | 'turkey'
  | 'duck'
  | 'pig'
  | 'cattle'
  | 'other';

export type TemplateStatus = 'draft' | 'active' | 'archived' | 'deprecated';

export type AuditType =
  | 'farm_compliance'
  | 'biosecurity'
  | 'animal_welfare'
  | 'feed_safety'
  | 'internal_control'
  | 'sop_compliance'
  | 'other';

export type ResponseType = 'choice' | 'numeric' | 'percent' | 'rating' | 'date' | 'text';

export type ScoringType = 'compliance' | 'numeric' | 'rating' | 'informational';

export type AuditStatus =
  | 'draft'
  | 'scheduled'
  | 'assigned'
  | 'in_progress'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'closed'
  | 'cancelled';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type Severity = 'critical' | 'major' | 'minor' | 'observation';

export type FindingStatus =
  | 'open'
  | 'assigned'
  | 'in_progress'
  | 'submitted'
  | 'verified'
  | 'closed'
  | 'overdue'
  | 'rejected';

export type CAStatus =
  | 'open'
  | 'assigned'
  | 'in_progress'
  | 'submitted_for_verification'
  | 'verified'
  | 'rejected'
  | 'closed';

export type VerificationStatus = 'pending' | 'approved' | 'rejected' | 'reopened';

export type EvidenceType =
  | 'photo'
  | 'video'
  | 'pdf'
  | 'excel'
  | 'word'
  | 'document'
  | 'other';

export type NotificationType =
  | 'audit_assigned'
  | 'audit_scheduled'
  | 'finding_created'
  | 'ca_assigned'
  | 'ca_due_soon'
  | 'ca_overdue'
  | 'ca_submitted'
  | 'verification_required'
  | 'finding_closed'
  | 'audit_completed';

// ═══════════════════════════════════════════════════════════════════════
// TABLE TYPES
// ═══════════════════════════════════════════════════════════════════════

export interface Organization {
  id: string;
  name: string;
  code: string;
  description: string | null;
  status: OrgStatus;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  organization_id: string;
  full_name: string;
  email: string;
  role: UserRole;
  phone: string | null;
  avatar_url: string | null;
  farm_id: string | null;
  status: UserStatus;
  created_at: string;
  updated_at: string;
}

export interface Farm {
  id: string;
  organization_id: string;
  farm_code: string;
  farm_name: string;
  farm_type: FarmType;
  location: {
    address?: string;
    gps_lat?: number;
    gps_lng?: number;
    province?: string;
    district?: string;
  };
  region: string | null;
  manager_id: string | null;
  status: FarmStatus;
  created_at: string;
  updated_at: string;
}

export interface FarmHouse {
  id: string;
  farm_id: string;
  house_code: string;
  house_name: string;
  capacity: number;
  livestock_type: LivestockType;
  status: HouseStatus;
  created_at: string;
  updated_at: string;
}

export interface AuditTemplate {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  audit_type: AuditType;
  version: string;
  status: TemplateStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditCategory {
  id: string;
  template_id: string;
  name: string;
  description: string | null;
  sequence: number;
  weight: number;
  created_at: string;
}

export interface AuditQuestion {
  id: string;
  category_id: string;
  question: string;
  description: string | null;
  response_type: ResponseType;
  scoring_type: ScoringType;
  max_score: number;
  weight: number;
  mandatory: boolean;
  evidence_required: boolean;
  sequence: number;
  active: boolean;
  created_at: string;
}

export interface Audit {
  id: string;
  organization_id: string;
  audit_number: string;
  farm_id: string;
  template_id: string;
  auditor_id: string | null;
  scheduled_date: string;
  started_at: string | null;
  completed_at: string | null;
  status: AuditStatus;
  overall_score: number | null;
  risk_level: RiskLevel;
  summary: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditResponse {
  id: string;
  audit_id: string;
  question_id: string;
  response: any; // JSONB - flexible response structure
  score: number | null;
  comment: string | null;
  answered_at: string;
  answered_by: string | null;
}

export interface Finding {
  id: string;
  audit_id: string;
  finding_number: string;
  category: string;
  title: string;
  description: string | null;
  severity: Severity;
  risk_level: RiskLevel;
  root_cause: string | null;
  recommendation: string | null;
  status: FindingStatus;
  assigned_to: string | null;
  due_date: string | null;
  started_at: string | null;
  submitted_at: string | null;
  closed_at: string | null;
  verified_by: string | null;
  verified_at: string | null;
  verification_comment: string | null;
  reopened_at: string | null;
  reopened_by: string | null;
  reopen_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CorrectiveAction {
  id: string;
  finding_id: string;
  action: string;
  responsible_person: string | null;
  due_date: string;
  started_at: string | null;
  submitted_at: string | null;
  completed_at: string | null;
  status: CAStatus;
  verification_status: VerificationStatus;
  verified_by: string | null;
  verification_date: string | null;
  verification_comment: string | null;
  reopened_at: string | null;
  reopened_by: string | null;
  reopen_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface Evidence {
  id: string;
  audit_id: string;
  finding_id: string | null;
  response_id: string | null;
  file_name: string;
  file_path: string;
  file_type: EvidenceType;
  file_size: number;
  uploaded_by: string | null;
  uploaded_at: string;
}

export interface AuditComment {
  id: string;
  audit_id: string;
  user_id: string;
  comment: string;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string | null;
  related_entity: string | null;
  related_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  organization_id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_data: any | null; // JSONB
  new_data: any | null; // JSONB
  created_at: string;
}

// ═══════════════════════════════════════════════════════════════════════
// VIEW TYPES
// ═══════════════════════════════════════════════════════════════════════

export interface AuditSummary {
  id: string;
  audit_number: string;
  status: AuditStatus;
  scheduled_date: string;
  overall_score: number | null;
  risk_level: RiskLevel;
  created_at: string;
  farm_id: string;
  farm_name: string;
  farm_type: FarmType;
  region: string | null;
  template_id: string;
  template_name: string;
  template_version: string;
  auditor_id: string | null;
  auditor_name: string | null;
  auditor_email: string | null;
  findings_count: number;
  open_findings_count: number;
}

export interface FindingSummary {
  id: string;
  finding_number: string;
  title: string;
  severity: Severity;
  risk_level: RiskLevel;
  status: FindingStatus;
  created_at: string;
  audit_id: string;
  audit_number: string;
  farm_id: string;
  farm_name: string;
  created_by_id: string | null;
  created_by_name: string | null;
  ca_count: number;
  open_ca_count: number;
}

export interface OverdueCorrectiveAction extends CorrectiveAction {
  finding_number: string;
  finding_title: string;
  severity: Severity;
  audit_number: string;
  farm_name: string;
  responsible_name: string | null;
  responsible_email: string | null;
}

// ═══════════════════════════════════════════════════════════════════════
// INSERT TYPES (for creating new records)
// ═══════════════════════════════════════════════════════════════════════

export type InsertOrganization = Omit<Organization, 'id' | 'created_at' | 'updated_at'>;
export type InsertProfile = Omit<Profile, 'created_at' | 'updated_at'>;
export type InsertFarm = Omit<Farm, 'id' | 'created_at' | 'updated_at'>;
export type InsertFarmHouse = Omit<FarmHouse, 'id' | 'created_at' | 'updated_at'>;
export type InsertAuditTemplate = Omit<AuditTemplate, 'id' | 'created_at' | 'updated_at'>;
export type InsertAuditCategory = Omit<AuditCategory, 'id' | 'created_at'>;
export type InsertAuditQuestion = Omit<AuditQuestion, 'id' | 'created_at'>;
export type InsertAudit = Omit<Audit, 'id' | 'audit_number' | 'created_at' | 'updated_at'>;
export type InsertAuditResponse = Omit<AuditResponse, 'id' | 'answered_at'>;
export type InsertFinding = Omit<Finding, 'id' | 'created_at' | 'updated_at'>;
export type InsertCorrectiveAction = Omit<CorrectiveAction, 'id' | 'created_at' | 'updated_at'>;
export type InsertEvidence = Omit<Evidence, 'id' | 'uploaded_at'>;
export type InsertAuditComment = Omit<AuditComment, 'id' | 'created_at'>;
export type InsertNotification = Omit<Notification, 'id' | 'created_at'>;
export type InsertActivityLog = Omit<ActivityLog, 'id' | 'created_at'>;

// ═══════════════════════════════════════════════════════════════════════
// UPDATE TYPES (for updating existing records)
// ═══════════════════════════════════════════════════════════════════════

export type UpdateOrganization = Partial<Omit<Organization, 'id' | 'created_at'>>;
export type UpdateProfile = Partial<Omit<Profile, 'id' | 'created_at'>>;
export type UpdateFarm = Partial<Omit<Farm, 'id' | 'created_at'>>;
export type UpdateFarmHouse = Partial<Omit<FarmHouse, 'id' | 'created_at'>>;
export type UpdateAuditTemplate = Partial<Omit<AuditTemplate, 'id' | 'created_at'>>;
export type UpdateAudit = Partial<Omit<Audit, 'id' | 'created_at'>>;
export type UpdateAuditResponse = Partial<Omit<AuditResponse, 'id'>>;
export type UpdateFinding = Partial<Omit<Finding, 'id' | 'created_at'>>;
export type UpdateCorrectiveAction = Partial<Omit<CorrectiveAction, 'id' | 'created_at'>>;
export type UpdateEvidence = Partial<Omit<Evidence, 'id' | 'uploaded_at'>>;
export type UpdateNotification = Partial<Omit<Notification, 'id' | 'created_at'>>;

// ═══════════════════════════════════════════════════════════════════════
// DATABASE SCHEMA (for Supabase client)
// ═══════════════════════════════════════════════════════════════════════

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: Organization;
        Insert: InsertOrganization;
        Update: UpdateOrganization;
      };
      profiles: {
        Row: Profile;
        Insert: InsertProfile;
        Update: UpdateProfile;
      };
      farms: {
        Row: Farm;
        Insert: InsertFarm;
        Update: UpdateFarm;
      };
      farm_houses: {
        Row: FarmHouse;
        Insert: InsertFarmHouse;
        Update: UpdateFarmHouse;
      };
      audit_templates: {
        Row: AuditTemplate;
        Insert: InsertAuditTemplate;
        Update: UpdateAuditTemplate;
      };
      audit_categories: {
        Row: AuditCategory;
        Insert: InsertAuditCategory;
        Update: never; // Categories are typically not updated
      };
      audit_questions: {
        Row: AuditQuestion;
        Insert: InsertAuditQuestion;
        Update: Partial<AuditQuestion>;
      };
      audits: {
        Row: Audit;
        Insert: InsertAudit;
        Update: UpdateAudit;
      };
      audit_responses: {
        Row: AuditResponse;
        Insert: InsertAuditResponse;
        Update: UpdateAuditResponse;
      };
      findings: {
        Row: Finding;
        Insert: InsertFinding;
        Update: UpdateFinding;
      };
      corrective_actions: {
        Row: CorrectiveAction;
        Insert: InsertCorrectiveAction;
        Update: UpdateCorrectiveAction;
      };
      evidence: {
        Row: Evidence;
        Insert: InsertEvidence;
        Update: UpdateEvidence;
      };
      audit_comments: {
        Row: AuditComment;
        Insert: InsertAuditComment;
        Update: never; // Comments are immutable
      };
      notifications: {
        Row: Notification;
        Insert: InsertNotification;
        Update: UpdateNotification;
      };
      activity_logs: {
        Row: ActivityLog;
        Insert: InsertActivityLog;
        Update: never; // Logs are immutable
      };
    };
    Views: {
      v_audit_summary: {
        Row: AuditSummary;
      };
      v_finding_summary: {
        Row: FindingSummary;
      };
      v_overdue_corrective_actions: {
        Row: OverdueCorrectiveAction;
      };
    };
    Functions: {
      generate_audit_number: {
        Args: { p_organization_id: string };
        Returns: string;
      };
      generate_finding_number: {
        Args: { p_audit_id: string };
        Returns: string;
      };
      calculate_audit_score: {
        Args: { p_audit_id: string };
        Returns: number | null;
      };
      is_admin: {
        Args: {};
        Returns: boolean;
      };
      is_auditor: {
        Args: {};
        Returns: boolean;
      };
    };
    Enums: {
      org_status: OrgStatus;
      user_role: UserRole;
      user_status: UserStatus;
      farm_type: FarmType;
      farm_status: FarmStatus;
      house_status: HouseStatus;
      livestock_type: LivestockType;
      template_status: TemplateStatus;
      audit_type: AuditType;
      response_type: ResponseType;
      scoring_type: ScoringType;
      audit_status: AuditStatus;
      risk_level: RiskLevel;
      severity: Severity;
      finding_status: FindingStatus;
      ca_status: CAStatus;
      verification_status: VerificationStatus;
      evidence_type: EvidenceType;
      notification_type: NotificationType;
    };
  };
}
