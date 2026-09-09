/**
 * Finding Service
 * Complete CAPA-style finding management with workflow enforcement
 */

import { supabase } from '../../lib/supabase';
import type { Finding, InsertFinding, UpdateFinding, FindingStatus, Severity, RiskLevel } from '../../types/database';

export interface FindingFilters {
  organization_id?: string;
  farm_id?: string;
  audit_id?: string;
  status?: FindingStatus;
  severity?: Severity;
  risk_level?: RiskLevel;
  created_by?: string;
  assigned_to?: string;
  category?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface FindingListResponse {
  data: Finding[];
  total: number;
  page: number;
  pageSize: number;
}

export interface FindingMetrics {
  total: number;
  open: number;
  critical: number;
  major: number;
  minor: number;
  observation: number;
  overdue: number;
  dueThisWeek: number;
  closed: number;
  averageClosureTime: number; // in days
}

/**
 * List findings with comprehensive filtering
 */
export async function listFindings(
  filters: FindingFilters = {}
): Promise<FindingListResponse> {
  const {
    organization_id,
    farm_id,
    audit_id,
    status,
    severity,
    risk_level,
    created_by,
    assigned_to,
    category,
    date_from,
    date_to,
    search,
    page = 1,
    pageSize = 20,
  } = filters;

  let query = supabase
    .from('findings')
    .select(`
      *,
      audit:audits(
        id,
        audit_number,
        farm_id,
        farms(id, farm_name, farm_code, organization_id)
      ),
      creator:profiles!created_by(id, full_name, email),
      assignee:profiles!assigned_to(id, full_name, email)
    `, { count: 'exact' });

  // Apply filters
  if (organization_id) {
    query = query.eq('audit.farms.organization_id', organization_id);
  }
  if (farm_id) {
    query = query.eq('audit.farm_id', farm_id);
  }
  if (audit_id) {
    query = query.eq('audit_id', audit_id);
  }
  if (status) {
    query = query.eq('status', status);
  }
  if (severity) {
    query = query.eq('severity', severity);
  }
  if (risk_level) {
    query = query.eq('risk_level', risk_level);
  }
  if (created_by) {
    query = query.eq('created_by', created_by);
  }
  if (assigned_to) {
    query = query.eq('assigned_to', assigned_to);
  }
  if (category) {
    query = query.eq('category', category);
  }
  if (date_from) {
    query = query.gte('created_at', date_from);
  }
  if (date_to) {
    query = query.lte('created_at', date_to);
  }
  if (search) {
    query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%,finding_number.ilike.%${search}%`);
  }

  // Apply pagination
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to).order('created_at', { ascending: false });

  const { data: findings, error, count } = await query;

  if (error) {
    throw new Error(`Failed to list findings: ${error.message}`);
  }

  return {
    data: (findings || []) as any,
    total: count || 0,
    page,
    pageSize,
  };
}

/**
 * Get finding by ID with full details
 */
export async function getFinding(id: string): Promise<Finding | null> {
  const { data, error } = await supabase
    .from('findings')
    .select(`
      *,
      audit:audits(
        *,
        farm:farms(*),
        template:audit_templates(*)
      ),
      creator:profiles!created_by(*),
      assignee:profiles!assigned_to(*),
      corrective_actions:corrective_actions(
        *,
        assignee:profiles!assigned_to(*),
        verifier:profiles!verified_by(*)
      ),
      evidence:evidence(*)
    `)
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to get finding: ${error.message}`);
  }

  return data as any;
}

/**
 * Generate finding number using database function
 */
export async function generateFindingNumber(auditId: string): Promise<string> {
  const { data, error } = await (supabase.rpc as any)('generate_finding_number', {
    p_audit_id: auditId,
  });

  if (error) {
    throw new Error(`Failed to generate finding number: ${error.message}`);
  }

  return data as string;
}

/**
 * Create new finding
 */
export async function createFinding(
  finding: Omit<InsertFinding, 'finding_number'> & { audit_id: string }
): Promise<Finding> {
  // Generate finding number
  const finding_number = await generateFindingNumber(finding.audit_id);

  const insertData: InsertFinding = {
    ...finding,
    finding_number,
  };

  const { data, error } = await (supabase.from('findings') as any)
    .insert(insertData)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create finding: ${error.message}`);
  }

  // Log activity
  await logFindingActivity(data.id, 'created', null, data);

  return data as Finding;
}

/**
 * Update finding with workflow validation
 */
export async function updateFinding(
  id: string,
  updates: UpdateFinding,
  userId: string
): Promise<Finding> {
  // Get current finding
  const { data: current } = await (supabase.from('findings') as any)
    .select('*')
    .eq('id', id)
    .single();

  if (!current) {
    throw new Error('Finding not found');
  }

  // Validate status transitions
  if (updates.status && updates.status !== current.status) {
    validateStatusTransition(current.status, updates.status);
  }

  // Set closed_at if status is closed
  if (updates.status === 'closed') {
    updates.closed_at = new Date().toISOString();
  }

  const { data, error } = await (supabase.from('findings') as any)
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update finding: ${error.message}`);
  }

  // Log activity
  await logFindingActivity(id, 'updated', current, data);

  return data as Finding;
}

/**
 * Assign finding to a person
 */
export async function assignFinding(
  id: string,
  assignedTo: string,
  dueDate: string
): Promise<Finding> {
  return updateFinding(id, {
    assigned_to: assignedTo,
    due_date: dueDate,
    status: 'assigned',
  }, assignedTo);
}

/**
 * Start work on finding
 */
export async function startFinding(id: string, userId: string): Promise<Finding> {
  return updateFinding(id, {
    status: 'in_progress',
    started_at: new Date().toISOString(),
  }, userId);
}

/**
 * Submit finding for verification
 */
export async function submitFinding(id: string, userId: string): Promise<Finding> {
  return updateFinding(id, {
    status: 'submitted',
    submitted_at: new Date().toISOString(),
  }, userId);
}

/**
 * Verify finding (close it)
 */
export async function verifyFinding(
  id: string,
  verifierId: string,
  verificationComment: string
): Promise<Finding> {
  return updateFinding(id, {
    status: 'verified',
    verified_by: verifierId,
    verified_at: new Date().toISOString(),
    verification_comment: verificationComment,
  }, verifierId);
}

/**
 * Close finding
 */
export async function closeFinding(id: string, userId: string): Promise<Finding> {
  return updateFinding(id, {
    status: 'closed',
    closed_at: new Date().toISOString(),
  }, userId);
}

/**
 * Reopen finding
 */
export async function reopenFinding(id: string, userId: string, reason: string): Promise<Finding> {
  return updateFinding(id, {
    status: 'open',
    reopened_at: new Date().toISOString(),
    reopened_by: userId,
    reopen_reason: reason,
  }, userId);
}

/**
 * Validate status transitions
 */
function validateStatusTransition(current: FindingStatus, next: FindingStatus): void {
  const validTransitions: Record<FindingStatus, FindingStatus[]> = {
    open: ['assigned', 'in_progress'],
    assigned: ['in_progress', 'open'],
    in_progress: ['submitted', 'assigned'],
    submitted: ['verified', 'in_progress'],
    verified: ['closed', 'submitted'],
    closed: ['open'], // Can reopen
    overdue: ['in_progress', 'assigned'],
    rejected: ['open', 'assigned'], // Can be reassigned
  };

  if (!validTransitions[current]?.includes(next)) {
    throw new Error(`Invalid status transition from ${current} to ${next}`);
  }
}

/**
 * Get overdue findings
 */
export async function getOverdueFindings(organizationId?: string): Promise<Finding[]> {
  const now = new Date().toISOString();

  let query = supabase
    .from('findings')
    .select(`
      *,
      audit:audits(
        id,
        audit_number,
        farm:farms(id, farm_name, organization_id)
      ),
      assignee:profiles!assigned_to(id, full_name, email)
    `)
    .lt('due_date', now)
    .in('status', ['open', 'assigned', 'in_progress']);

  if (organizationId) {
    query = query.eq('audit.farms.organization_id', organizationId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to get overdue findings: ${error.message}`);
  }

  return (data || []) as any;
}

/**
 * Get findings due this week
 */
export async function getFindingsDueThisWeek(organizationId?: string): Promise<Finding[]> {
  const now = new Date();
  const weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() + 7);

  let query = supabase
    .from('findings')
    .select(`
      *,
      audit:audits(
        id,
        audit_number,
        farm:farms(id, farm_name, organization_id)
      ),
      assignee:profiles!assigned_to(id, full_name, email)
    `)
    .gte('due_date', now.toISOString())
    .lte('due_date', weekEnd.toISOString())
    .in('status', ['open', 'assigned', 'in_progress']);

  if (organizationId) {
    query = query.eq('audit.farms.organization_id', organizationId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to get findings due this week: ${error.message}`);
  }

  return (data || []) as any;
}

/**
 * Get finding metrics for dashboard
 */
export async function getFindingMetrics(organizationId?: string): Promise<FindingMetrics> {
  let query = supabase
    .from('findings')
    .select('id, status, severity, due_date, created_at, closed_at');

  if (organizationId) {
    query = query.eq('audit.farms.organization_id', organizationId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to get finding metrics: ${error.message}`);
  }

  const findings = (data || []) as any[];
  const now = new Date();
  const weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const metrics: FindingMetrics = {
    total: findings.length,
    open: findings.filter((f) => f.status === 'open').length,
    critical: findings.filter((f) => f.severity === 'critical').length,
    major: findings.filter((f) => f.severity === 'major').length,
    minor: findings.filter((f) => f.severity === 'minor').length,
    observation: findings.filter((f) => f.severity === 'observation').length,
    overdue: findings.filter(
      (f) => new Date(f.due_date) < now && ['open', 'assigned', 'in_progress'].includes(f.status)
    ).length,
    dueThisWeek: findings.filter(
      (f) => {
        const dueDate = new Date(f.due_date);
        return dueDate >= now && dueDate <= weekEnd && ['open', 'assigned', 'in_progress'].includes(f.status);
      }
    ).length,
    closed: findings.filter((f) => f.status === 'closed').length,
    averageClosureTime: 0,
  };

  // Calculate average closure time
  const closedFindings = findings.filter((f) => f.status === 'closed' && f.closed_at);
  if (closedFindings.length > 0) {
    const totalDays = closedFindings.reduce((sum, f) => {
      const created = new Date(f.created_at);
      const closed = new Date(f.closed_at);
      const days = (closed.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
      return sum + days;
    }, 0);
    metrics.averageClosureTime = Math.round((totalDays / closedFindings.length) * 10) / 10;
  }

  return metrics;
}

/**
 * Log finding activity
 */
async function logFindingActivity(
  findingId: string,
  action: string,
  oldData: any | null,
  newData: any
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();

  await (supabase.from('activity_logs') as any).insert({
    organization_id: newData.audit?.farms?.organization_id || null,
    user_id: user?.id || null,
    action: `finding_${action}`,
    entity_type: 'finding',
    entity_id: findingId,
    old_data: oldData,
    new_data: newData,
  });
}

/**
 * Get findings by audit
 */
export async function getFindingsByAudit(auditId: string): Promise<Finding[]> {
  const { data, error } = await supabase
    .from('findings')
    .select(`
      *,
      creator:profiles!created_by(id, full_name, email),
      assignee:profiles!assigned_to(id, full_name, email)
    `)
    .eq('audit_id', auditId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to get findings by audit: ${error.message}`);
  }

  return (data || []) as any;
}

/**
 * Get findings by farm
 */
export async function getFindingsByFarm(farmId: string): Promise<Finding[]> {
  const { data, error } = await supabase
    .from('findings')
    .select(`
      *,
      audit:audits(id, audit_number),
      creator:profiles!created_by(id, full_name, email),
      assignee:profiles!assigned_to(id, full_name, email)
    `)
    .eq('audit.farm_id', farmId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to get findings by farm: ${error.message}`);
  }

  return (data || []) as any;
}

/**
 * Get findings assigned to user
 */
export async function getFindingsAssignedToUser(userId: string): Promise<Finding[]> {
  const { data, error } = await supabase
    .from('findings')
    .select(`
      *,
      audit:audits(
        id,
        audit_number,
        farm:farms(id, farm_name)
      )
    `)
    .eq('assigned_to', userId)
    .in('status', ['assigned', 'in_progress'])
    .order('due_date', { ascending: true });

  if (error) {
    throw new Error(`Failed to get findings assigned to user: ${error.message}`);
  }

  return (data || []) as any;
}
