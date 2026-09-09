/**
 * Corrective Action Service
 * Complete CAPA workflow management for corrective actions
 */

import { supabase } from '../../lib/supabase';
import type { CorrectiveAction, InsertCorrectiveAction, UpdateCorrectiveAction, CAStatus, VerificationStatus } from '../../types/database';

export interface CorrectiveActionFilters {
  finding_id?: string;
  status?: CAStatus;
  verification_status?: VerificationStatus;
  responsible_person?: string;
  verified_by?: string;
  due_date_from?: string;
  due_date_to?: string;
  overdue?: boolean;
  page?: number;
  pageSize?: number;
}

export interface CorrectiveActionListResponse {
  data: CorrectiveAction[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * List corrective actions with filtering
 */
export async function listCorrectiveActions(
  filters: CorrectiveActionFilters = {}
): Promise<CorrectiveActionListResponse> {
  const {
    finding_id,
    status,
    verification_status,
    responsible_person,
    verified_by,
    due_date_from,
    due_date_to,
    overdue,
    page = 1,
    pageSize = 20,
  } = filters;

  let query = supabase
    .from('corrective_actions')
    .select(`
      *,
      finding:findings(
        id,
        finding_number,
        title,
        severity,
        audit:audits(
          id,
          audit_number,
          farm:farms(id, farm_name, organization_id)
        )
      ),
      assignee:profiles!responsible_person(id, full_name, email),
      verifier:profiles!verified_by(id, full_name, email)
    `, { count: 'exact' });

  // Apply filters
  if (finding_id) {
    query = query.eq('finding_id', finding_id);
  }
  if (status) {
    query = query.eq('status', status);
  }
  if (verification_status) {
    query = query.eq('verification_status', verification_status);
  }
  if (responsible_person) {
    query = query.eq('responsible_person', responsible_person);
  }
  if (verified_by) {
    query = query.eq('verified_by', verified_by);
  }
  if (due_date_from) {
    query = query.gte('due_date', due_date_from);
  }
  if (due_date_to) {
    query = query.lte('due_date', due_date_to);
  }
  if (overdue) {
    const now = new Date().toISOString();
    query = query.lt('due_date', now).neq('status', 'closed');
  }

  // Apply pagination
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to).order('due_date', { ascending: true });

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to list corrective actions: ${error.message}`);
  }

  return {
    data: (data || []) as any,
    total: count || 0,
    page,
    pageSize,
  };
}

/**
 * Get corrective action by ID
 */
export async function getCorrectiveAction(id: string): Promise<CorrectiveAction | null> {
  const { data, error } = await supabase
    .from('corrective_actions')
    .select(`
      *,
      finding:findings(
        *,
        audit:audits(*, farm:farms(*))
      ),
      assignee:profiles!responsible_person(*),
      verifier:profiles!verified_by(*),
      evidence:evidence(*)
    `)
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to get corrective action: ${error.message}`);
  }

  return data as any;
}

/**
 * Create new corrective action
 */
export async function createCorrectiveAction(
  ca: InsertCorrectiveAction
): Promise<CorrectiveAction> {
  const { data, error } = await (supabase.from('corrective_actions') as any)
    .insert(ca)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create corrective action: ${error.message}`);
  }

  // Log activity
  await logCAActivity(data.id, 'created', null, data);

  return data as CorrectiveAction;
}

/**
 * Update corrective action with workflow validation
 */
export async function updateCorrectiveAction(
  id: string,
  updates: UpdateCorrectiveAction,
  userId: string
): Promise<CorrectiveAction> {
  // Get current CA
  const { data: current } = await (supabase.from('corrective_actions') as any)
    .select('*')
    .eq('id', id)
    .single();

  if (!current) {
    throw new Error('Corrective action not found');
  }

  // Validate status transitions
  if (updates.status && updates.status !== current.status) {
    validateCAStatusTransition(current.status, updates.status);
  }

  // Set completed_at if status is closed
  if (updates.status === 'closed') {
    updates.completed_at = new Date().toISOString();
  }

  const { data, error } = await (supabase.from('corrective_actions') as any)
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update corrective action: ${error.message}`);
  }

  // Log activity
  await logCAActivity(id, 'updated', current, data);

  return data as CorrectiveAction;
}

/**
 * Assign corrective action
 */
export async function assignCorrectiveAction(
  id: string,
  responsiblePerson: string,
  dueDate: string
): Promise<CorrectiveAction> {
  return updateCorrectiveAction(id, {
    responsible_person: responsiblePerson,
    due_date: dueDate,
    status: 'assigned',
  }, responsiblePerson);
}

/**
 * Start work on corrective action
 */
export async function startCorrectiveAction(id: string, userId: string): Promise<CorrectiveAction> {
  return updateCorrectiveAction(id, {
    status: 'in_progress',
    started_at: new Date().toISOString(),
  }, userId);
}

/**
 * Submit corrective action for verification
 */
export async function submitCorrectiveAction(id: string, userId: string): Promise<CorrectiveAction> {
  return updateCorrectiveAction(id, {
    status: 'submitted_for_verification',
    submitted_at: new Date().toISOString(),
  }, userId);
}

/**
 * Verify corrective action
 */
export async function verifyCorrectiveAction(
  id: string,
  verifierId: string,
  verificationComment: string,
  approved: boolean
): Promise<CorrectiveAction> {
  const updates: UpdateCorrectiveAction = {
    verified_by: verifierId,
    verification_date: new Date().toISOString(),
    verification_comment: verificationComment,
    verification_status: approved ? 'approved' : 'rejected',
  };

  if (approved) {
    updates.status = 'closed';
    updates.completed_at = new Date().toISOString();
  } else {
    updates.status = 'in_progress'; // Reopen for rework
  }

  return updateCorrectiveAction(id, updates, verifierId);
}

/**
 * Reopen corrective action
 */
export async function reopenCorrectiveAction(
  id: string,
  userId: string,
  reason: string
): Promise<CorrectiveAction> {
  return updateCorrectiveAction(id, {
    status: 'in_progress',
    verification_status: 'reopened',
    reopened_at: new Date().toISOString(),
    reopened_by: userId,
    reopen_reason: reason,
  }, userId);
}

/**
 * Validate CA status transitions
 */
function validateCAStatusTransition(current: CAStatus, next: CAStatus): void {
  const validTransitions: Record<CAStatus, CAStatus[]> = {
    open: ['assigned', 'in_progress'],
    assigned: ['in_progress', 'open'],
    in_progress: ['submitted_for_verification', 'assigned'],
    submitted_for_verification: ['closed', 'in_progress'],
    verified: ['closed', 'submitted_for_verification'],
    rejected: ['in_progress', 'assigned'],
    closed: ['in_progress'], // Can reopen
  };

  if (!validTransitions[current]?.includes(next)) {
    throw new Error(`Invalid status transition from ${current} to ${next}`);
  }
}

/**
 * Get overdue corrective actions
 */
export async function getOverdueCorrectiveActions(organizationId?: string): Promise<CorrectiveAction[]> {
  const now = new Date().toISOString();

  let query = supabase
    .from('corrective_actions')
    .select(`
      *,
      finding:findings(
        id,
        finding_number,
        title,
        severity,
        audit:audits(
          id,
          audit_number,
          farm:farms(id, farm_name, organization_id)
        )
      ),
      assignee:profiles!responsible_person(id, full_name, email)
    `)
    .lt('due_date', now)
    .neq('status', 'closed');

  if (organizationId) {
    query = query.eq('finding.audit.farm.organization_id', organizationId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to get overdue corrective actions: ${error.message}`);
  }

  return (data || []) as any;
}

/**
 * Get corrective actions by finding
 */
export async function getCorrectiveActionsByFinding(findingId: string): Promise<CorrectiveAction[]> {
  const { data, error } = await supabase
    .from('corrective_actions')
    .select(`
      *,
      assignee:profiles!responsible_person(id, full_name, email),
      verifier:profiles!verified_by(id, full_name, email)
    `)
    .eq('finding_id', findingId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to get corrective actions by finding: ${error.message}`);
  }

  return (data || []) as any;
}

/**
 * Get corrective actions assigned to user
 */
export async function getCorrectiveActionsAssignedToUser(userId: string): Promise<CorrectiveAction[]> {
  const { data, error } = await supabase
    .from('corrective_actions')
    .select(`
      *,
      finding:findings(
        id,
        finding_number,
        title,
        audit:audits(id, audit_number, farm:farms(id, farm_name))
      )
    `)
    .eq('responsible_person', userId)
    .in('status', ['assigned', 'in_progress'])
    .order('due_date', { ascending: true });

  if (error) {
    throw new Error(`Failed to get corrective actions assigned to user: ${error.message}`);
  }

  return (data || []) as any;
}

/**
 * Get corrective action metrics
 */
export async function getCorrectiveActionMetrics(organizationId?: string): Promise<{
  total: number;
  open: number;
  inProgress: number;
  submitted: number;
  closed: number;
  overdue: number;
  averageCompletionTime: number; // in days
}> {
  let query = supabase
    .from('corrective_actions')
    .select('id, status, due_date, created_at, completed_at');

  if (organizationId) {
    query = query.eq('finding.audit.farm.organization_id', organizationId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to get corrective action metrics: ${error.message}`);
  }

  const cas = (data || []) as any[];
  const now = new Date();

  const metrics = {
    total: cas.length,
    open: cas.filter((ca) => ca.status === 'open' || ca.status === 'assigned').length,
    inProgress: cas.filter((ca) => ca.status === 'in_progress').length,
    submitted: cas.filter((ca) => ca.status === 'submitted_for_verification').length,
    closed: cas.filter((ca) => ca.status === 'closed').length,
    overdue: cas.filter(
      (ca) => new Date(ca.due_date) < now && ca.status !== 'closed'
    ).length,
    averageCompletionTime: 0,
  };

  // Calculate average completion time
  const closedCAs = cas.filter((ca) => ca.status === 'closed' && ca.completed_at);
  if (closedCAs.length > 0) {
    const totalDays = closedCAs.reduce((sum, ca) => {
      const created = new Date(ca.created_at);
      const completed = new Date(ca.completed_at);
      const days = (completed.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
      return sum + days;
    }, 0);
    metrics.averageCompletionTime = Math.round((totalDays / closedCAs.length) * 10) / 10;
  }

  return metrics;
}

/**
 * Log corrective action activity
 */
async function logCAActivity(
  caId: string,
  action: string,
  oldData: any | null,
  newData: any
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();

  await (supabase.from('activity_logs') as any).insert({
    organization_id: newData.finding?.audit?.farm?.organization_id || null,
    user_id: user?.id || null,
    action: `corrective_action_${action}`,
    entity_type: 'corrective_action',
    entity_id: caId,
    old_data: oldData,
    new_data: newData,
  });
}
