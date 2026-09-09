/**
 * Audit Service
 * Handles audit lifecycle management, creation, scheduling, and execution
 */

import { supabase } from '../../lib/supabase';
import type { Audit, AuditStatus, InsertAudit, UpdateAudit } from '../../types/database';

export interface AuditFilters {
  organization_id?: string;
  farm_id?: string;
  auditor_id?: string;
  template_id?: string;
  status?: AuditStatus;
  scheduled_date_from?: string;
  scheduled_date_to?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface AuditListResponse {
  data: Audit[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * List audits with filtering, search, and pagination
 */
export async function listAudits(
  filters: AuditFilters = {}
): Promise<AuditListResponse> {
  const {
    organization_id,
    farm_id,
    auditor_id,
    template_id,
    status,
    scheduled_date_from,
    scheduled_date_to,
    search,
    page = 1,
    pageSize = 20,
  } = filters;

  let query = supabase
    .from('audits')
    .select(`
      *,
      farm:farms(id, farm_name, farm_code),
      template:audit_templates(id, name, version),
      auditor:profiles!auditor_id(id, full_name, email)
    `, { count: 'exact' });

  // Apply filters
  if (organization_id) {
    query = query.eq('organization_id', organization_id);
  }
  if (farm_id) {
    query = query.eq('farm_id', farm_id);
  }
  if (auditor_id) {
    query = query.eq('auditor_id', auditor_id);
  }
  if (template_id) {
    query = query.eq('template_id', template_id);
  }
  if (status) {
    query = query.eq('status', status);
  }
  if (scheduled_date_from) {
    query = query.gte('scheduled_date', scheduled_date_from);
  }
  if (scheduled_date_to) {
    query = query.lte('scheduled_date', scheduled_date_to);
  }
  if (search) {
    query = query.or(`audit_number.ilike.%${search}%`);
  }

  // Apply pagination
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to).order('scheduled_date', { ascending: false });

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to list audits: ${error.message}`);
  }

  return {
    data: data || [],
    total: count || 0,
    page,
    pageSize,
  };
}

/**
 * Get audit by ID with full details
 */
export async function getAudit(id: string): Promise<Audit | null> {
  const { data, error } = await supabase
    .from('audits')
    .select(`
      *,
      farm:farms(id, farm_name, farm_code, organization_id),
      template:audit_templates(
        id,
        name,
        version,
        categories:audit_categories(
          id,
          name,
          weight,
          questions:audit_questions(*)
        )
      ),
      auditor:profiles!auditor_id(id, full_name, email),
      responses:audit_responses(
        id,
        question_id,
        response,
        score,
        comment,
        answered_at,
        answered_by
      ),
      findings:findings(*),
      comments:audit_comments(
        *,
        user:profiles(id, full_name, email)
      )
    `)
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to get audit: ${error.message}`);
  }

  return data as any;
}

/**
 * Generate audit number using database function
 */
export async function generateAuditNumber(organizationId: string): Promise<string> {
  const { data, error } = await (supabase.rpc as any)('generate_audit_number', {
    p_organization_id: organizationId,
  });

  if (error) {
    throw new Error(`Failed to generate audit number: ${error.message}`);
  }

  return data as string;
}

/**
 * Create new audit
 */
export async function createAudit(audit: InsertAudit): Promise<Audit> {
  // Generate audit number
  const auditNumber = await generateAuditNumber(audit.organization_id);

  const { data, error } = await (supabase.from('audits') as any)
    .insert({
      ...audit,
      audit_number: auditNumber,
      status: 'draft',
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create audit: ${error.message}`);
  }

  return data as Audit;
}

/**
 * Update audit
 */
export async function updateAudit(id: string, updates: UpdateAudit): Promise<Audit> {
  const { data, error } = await (supabase.from('audits') as any)
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update audit: ${error.message}`);
  }

  return data as Audit;
}

/**
 * Schedule audit (Draft → Scheduled)
 */
export async function scheduleAudit(id: string): Promise<Audit> {
  const audit = await getAudit(id);
  if (!audit) {
    throw new Error('Audit not found');
  }

  if (audit.status !== 'draft') {
    throw new Error(`Cannot schedule audit with status "${audit.status}"`);
  }

  return updateAudit(id, { status: 'scheduled' });
}

/**
 * Assign auditor (Scheduled → Assigned)
 */
export async function assignAuditor(id: string, auditorId: string): Promise<Audit> {
  const audit = await getAudit(id);
  if (!audit) {
    throw new Error('Audit not found');
  }

  if (audit.status !== 'scheduled') {
    throw new Error(`Cannot assign auditor to audit with status "${audit.status}"`);
  }

  return updateAudit(id, {
    auditor_id: auditorId,
    status: 'assigned',
  });
}

/**
 * Start audit execution (Assigned → In Progress)
 */
export async function startAudit(id: string): Promise<Audit> {
  const audit = await getAudit(id);
  if (!audit) {
    throw new Error('Audit not found');
  }

  if (audit.status !== 'assigned') {
    throw new Error(`Cannot start audit with status "${audit.status}"`);
  }

  return updateAudit(id, {
    status: 'in_progress',
    started_at: new Date().toISOString(),
  });
}

/**
 * Submit audit for review (In Progress → Submitted)
 */
export async function submitAudit(id: string): Promise<Audit> {
  const audit = await getAudit(id);
  if (!audit) {
    throw new Error('Audit not found');
  }

  if (audit.status !== 'in_progress') {
    throw new Error(`Cannot submit audit with status "${audit.status}"`);
  }

  // Calculate final score
  const score = await calculateAuditScore(id);

  return updateAudit(id, {
    status: 'submitted',
    overall_score: score,
  });
}

/**
 * Review audit (Submitted → Under Review)
 */
export async function startReview(id: string): Promise<Audit> {
  const audit = await getAudit(id);
  if (!audit) {
    throw new Error('Audit not found');
  }

  if (audit.status !== 'submitted') {
    throw new Error(`Cannot review audit with status "${audit.status}"`);
  }

  return updateAudit(id, { status: 'under_review' });
}

/**
 * Approve audit (Under Review → Approved)
 */
export async function approveAudit(id: string, summary?: string): Promise<Audit> {
  const audit = await getAudit(id);
  if (!audit) {
    throw new Error('Audit not found');
  }

  if (audit.status !== 'under_review') {
    throw new Error(`Cannot approve audit with status "${audit.status}"`);
  }

  return updateAudit(id, {
    status: 'approved',
    summary: summary || audit.summary,
  });
}

/**
 * Close audit (Approved → Closed)
 */
export async function closeAudit(id: string): Promise<Audit> {
  const audit = await getAudit(id);
  if (!audit) {
    throw new Error('Audit not found');
  }

  if (audit.status !== 'approved') {
    throw new Error(`Cannot close audit with status "${audit.status}"`);
  }

  return updateAudit(id, {
    status: 'closed',
    completed_at: new Date().toISOString(),
  });
}

/**
 * Cancel audit (any status → Cancelled)
 */
export async function cancelAudit(id: string, reason?: string): Promise<Audit> {
  const audit = await getAudit(id);
  if (!audit) {
    throw new Error('Audit not found');
  }

  if (['closed', 'cancelled'].includes(audit.status)) {
    throw new Error(`Cannot cancel audit with status "${audit.status}"`);
  }

  return updateAudit(id, {
    status: 'cancelled',
    summary: reason ? `${audit.summary || ''}\n\nCancellation reason: ${reason}` : audit.summary,
  });
}

/**
 * Calculate audit score using database function
 */
export async function calculateAuditScore(auditId: string): Promise<number | null> {
  const { data, error } = await (supabase.rpc as any)('calculate_audit_score', {
    p_audit_id: auditId,
  });

  if (error) {
    throw new Error(`Failed to calculate audit score: ${error.message}`);
  }

  return data as number | null;
}

/**
 * Get audits by farm
 */
export async function getAuditsByFarm(farmId: string): Promise<Audit[]> {
  const { data, error } = await supabase
    .from('audits')
    .select(`
      *,
      template:audit_templates(id, name, version),
      auditor:profiles!auditor_id(id, full_name, email)
    `)
    .eq('farm_id', farmId)
    .order('scheduled_date', { ascending: false });

  if (error) {
    throw new Error(`Failed to get audits by farm: ${error.message}`);
  }

  return data || [];
}

/**
 * Get audits by auditor
 */
export async function getAuditsByAuditor(auditorId: string): Promise<Audit[]> {
  const { data, error } = await supabase
    .from('audits')
    .select(`
      *,
      farm:farms(id, farm_name, farm_code),
      template:audit_templates(id, name, version)
    `)
    .eq('auditor_id', auditorId)
    .order('scheduled_date', { ascending: false });

  if (error) {
    throw new Error(`Failed to get audits by auditor: ${error.message}`);
  }

  return data || [];
}

/**
 * Get audit statistics
 */
export async function getAuditStats(organizationId: string): Promise<{
  total: number;
  byStatus: Record<AuditStatus, number>;
  averageScore: number | null;
  completionRate: number;
}> {
  const { data, error } = await (supabase.from('audits') as any)
    .select('status, overall_score')
    .eq('organization_id', organizationId);

  if (error) {
    throw new Error(`Failed to get audit stats: ${error.message}`);
  }

  const audits = (data || []) as Array<{ status: string; overall_score: number | null }>;
  const total = audits.length;

  const byStatus: Record<AuditStatus, number> = {
    draft: 0,
    scheduled: 0,
    assigned: 0,
    in_progress: 0,
    submitted: 0,
    under_review: 0,
    approved: 0,
    closed: 0,
    cancelled: 0,
  };

  audits.forEach((a) => {
    byStatus[a.status as AuditStatus]++;
  });

  const scores = audits
    .map((a) => a.overall_score)
    .filter((s): s is number => s !== null);
  const averageScore =
    scores.length > 0
      ? scores.reduce((sum, s) => sum + s, 0) / scores.length
      : null;

  const closedAudits = byStatus.closed;
  const completionRate = total > 0 ? (closedAudits / total) * 100 : 0;

  return {
    total,
    byStatus,
    averageScore: averageScore !== null ? Math.round(averageScore * 100) / 100 : null,
    completionRate: Math.round(completionRate * 100) / 100,
  };
}
