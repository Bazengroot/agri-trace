// @ts-nocheck
/**
 * Audit Trail Service
 * Comprehensive logging of all audit-related activities for compliance and traceability
 */

import { supabase } from '../../lib/supabase';

export interface AuditTrailEntry {
  audit_id?: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  old_value?: any;
  new_value?: any;
  metadata?: any;
}

export interface AuditTrailFilters {
  audit_id?: string;
  user_id?: string;
  action?: string;
  entity_type?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Log an audit trail entry
 */
export async function logAuditTrail(entry: AuditTrailEntry): Promise<void> {
  const { error } = await supabase
    .from('audit_trail')
    .insert({
      audit_id: entry.audit_id,
      user_id: entry.user_id,
      action: entry.action,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      old_value: entry.old_value || null,
      new_value: entry.new_value || null,
      metadata: entry.metadata || null,
      created_at: new Date().toISOString(),
    });

  if (error) {
    console.error('Failed to log audit trail:', error);
    throw new Error(`Failed to log audit trail: ${error.message}`);
  }
}

/**
 * Log multiple audit trail entries in bulk
 */
export async function logAuditTrailBulk(entries: AuditTrailEntry[]): Promise<void> {
  const records = entries.map(entry => ({
    audit_id: entry.audit_id,
    user_id: entry.user_id,
    action: entry.action,
    entity_type: entry.entity_type,
    entity_id: entry.entity_id,
    old_value: entry.old_value || null,
    new_value: entry.new_value || null,
    metadata: entry.metadata || null,
    created_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('audit_trail')
    .insert(records);

  if (error) {
    console.error('Failed to log audit trail bulk:', error);
    throw new Error(`Failed to log audit trail bulk: ${error.message}`);
  }
}

/**
 * Get audit trail entries with filtering
 */
export async function getAuditTrail(filters: AuditTrailFilters = {}): Promise<any[]> {
  let query = supabase
    .from('audit_trail')
    .select(`
      *,
      user:profiles(id, full_name, email, role)
    `);

  if (filters.audit_id) {
    query = query.eq('audit_id', filters.audit_id);
  }

  if (filters.user_id) {
    query = query.eq('user_id', filters.user_id);
  }

  if (filters.action) {
    query = query.eq('action', filters.action);
  }

  if (filters.entity_type) {
    query = query.eq('entity_type', filters.entity_type);
  }

  if (filters.date_from) {
    query = query.gte('created_at', filters.date_from);
  }

  if (filters.date_to) {
    query = query.lte('created_at', filters.date_to);
  }

  const page = filters.page || 1;
  const pageSize = filters.pageSize || 50;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  query = query
    .order('created_at', { ascending: false })
    .range(from, to);

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to get audit trail: ${error.message}`);
  }

  return data || [];
}

/**
 * Get audit trail count
 */
export async function getAuditTrailCount(filters: AuditTrailFilters = {}): Promise<number> {
  let query = supabase
    .from('audit_trail')
    .select('*', { count: 'exact', head: true });

  if (filters.audit_id) {
    query = query.eq('audit_id', filters.audit_id);
  }

  if (filters.user_id) {
    query = query.eq('user_id', filters.user_id);
  }

  if (filters.action) {
    query = query.eq('action', filters.action);
  }

  if (filters.entity_type) {
    query = query.eq('entity_type', filters.entity_type);
  }

  if (filters.date_from) {
    query = query.gte('created_at', filters.date_from);
  }

  if (filters.date_to) {
    query = query.lte('created_at', filters.date_to);
  }

  const { count, error } = await query;

  if (error) {
    throw new Error(`Failed to get audit trail count: ${error.message}`);
  }

  return count || 0;
}

/**
 * Get audit trail for a specific audit
 */
export async function getAuditTrailForAudit(auditId: string): Promise<any[]> {
  return getAuditTrail({ audit_id: auditId });
}

/**
 * Get user activity log
 */
export async function getUserActivityLog(userId: string, days: number = 30): Promise<any[]> {
  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - days);

  return getAuditTrail({
    user_id: userId,
    date_from: dateFrom.toISOString(),
  });
}

/**
 * Get audit trail statistics
 */
export async function getAuditTrailStats(auditId?: string): Promise<any> {
  let query = supabase
    .from('audit_trail')
    .select('action, entity_type, user_id');

  if (auditId) {
    query = query.eq('audit_id', auditId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to get audit trail stats: ${error.message}`);
  }

  const entries = data || [];

  // Count by action
  const actionCounts = entries.reduce((acc, entry) => {
    acc[entry.action] = (acc[entry.action] || 0) + 1;
    return acc;
  }, {});

  // Count by entity type
  const entityTypeCounts = entries.reduce((acc, entry) => {
    acc[entry.entity_type] = (acc[entry.entity_type] || 0) + 1;
    return acc;
  }, {});

  // Count by user
  const userCounts = entries.reduce((acc, entry) => {
    acc[entry.user_id] = (acc[entry.user_id] || 0) + 1;
    return acc;
  }, {});

  return {
    totalEntries: entries.length,
    actionCounts,
    entityTypeCounts,
    userCounts,
  };
}

/**
 * Log common audit actions
 */
export async function logAuditAction(
  auditId: string,
  userId: string,
  action: string,
  oldValue?: any,
  newValue?: any
): Promise<void> {
  await logAuditTrail({
    audit_id: auditId,
    user_id: userId,
    action,
    entity_type: 'audit',
    entity_id: auditId,
    old_value: oldValue,
    new_value: newValue,
  });
}

/**
 * Log finding action
 */
export async function logFindingAction(
  auditId: string,
  userId: string,
  action: string,
  findingId: string,
  oldValue?: any,
  newValue?: any
): Promise<void> {
  await logAuditTrail({
    audit_id: auditId,
    user_id: userId,
    action,
    entity_type: 'finding',
    entity_id: findingId,
    old_value: oldValue,
    new_value: newValue,
  });
}

/**
 * Log corrective action
 */
export async function logCorrectiveActionLog(
  auditId: string,
  userId: string,
  action: string,
  caId: string,
  oldValue?: any,
  newValue?: any
): Promise<void> {
  await logAuditTrail({
    audit_id: auditId,
    user_id: userId,
    action,
    entity_type: 'corrective_action',
    entity_id: caId,
    old_value: oldValue,
    new_value: newValue,
  });
}

/**
 * Log evidence action
 */
export async function logEvidenceAction(
  auditId: string,
  userId: string,
  action: string,
  evidenceId: string,
  oldValue?: any,
  newValue?: any
): Promise<void> {
  await logAuditTrail({
    audit_id: auditId,
    user_id: userId,
    action,
    entity_type: 'evidence',
    entity_id: evidenceId,
    old_value: oldValue,
    new_value: newValue,
  });
}

/**
 * Log response change
 */
export async function logResponseChange(
  auditId: string,
  userId: string,
  responseId: string,
  oldValue: any,
  newValue: any
): Promise<void> {
  await logAuditTrail({
    audit_id: auditId,
    user_id: userId,
    action: 'update_response',
    entity_type: 'response',
    entity_id: responseId,
    old_value: oldValue,
    new_value: newValue,
  });
}

/**
 * Export audit trail to CSV
 */
export async function exportAuditTrailToCSV(auditId: string): Promise<string> {
  const entries = await getAuditTrailForAudit(auditId);

  const headers = ['Timestamp', 'User', 'Action', 'Entity Type', 'Entity ID', 'Old Value', 'New Value'];
  const rows = entries.map(entry => [
    entry.created_at,
    entry.user?.full_name || entry.user_id,
    entry.action,
    entry.entity_type,
    entry.entity_id,
    JSON.stringify(entry.old_value || ''),
    JSON.stringify(entry.new_value || ''),
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  return csvContent;
}
