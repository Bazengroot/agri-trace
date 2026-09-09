// @ts-nocheck
/**
 * Approval Workflow Service
 * Manages the audit approval process: submit → review → approve/return → close
 */

import { supabase } from '../../lib/supabase';
import type { Audit } from '../../types/database';

export interface ApprovalAction {
  auditId: string;
  reviewerId: string;
  action: 'approve' | 'return';
  comments?: string;
}

export interface RevisionLog {
  auditId: string;
  auditorId: string;
  changes: string;
  timestamp: string;
}

/**
 * Submit audit for review
 */
export async function submitForReview(auditId: string, auditorId: string): Promise<Audit> {
  const { data: audit, error: fetchError } = await supabase
    .from('audits')
    .select('*')
    .eq('id', auditId)
    .single();

  if (fetchError || !audit) {
    throw new Error('Audit not found');
  }

  if (audit.status !== 'in_progress') {
    throw new Error('Audit must be in progress to submit for review');
  }

  const { data, error } = await supabase
    .from('audits')
    .update({
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      submitted_by: auditorId,
    })
    .eq('id', auditId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to submit audit: ${error.message}`);
  }

  // Log the submission
  await logAuditTrail({
    audit_id: auditId,
    user_id: auditorId,
    action: 'submit_for_review',
    entity_type: 'audit',
    entity_id: auditId,
    old_value: { status: 'in_progress' },
    new_value: { status: 'submitted' },
  });

  // Create notification for audit admins
  await createNotification({
    organization_id: audit.organization_id,
    user_id: null, // Will be sent to all audit admins
    type: 'audit_submitted',
    title: 'Audit Submitted for Review',
    message: `Audit ${audit.audit_number} has been submitted for review`,
    related_entity: 'audit',
    related_id: auditId,
  });

  return data;
}

/**
 * Review audit (approve or return)
 */
export async function reviewAudit(action: ApprovalAction): Promise<Audit> {
  const { data: audit, error: fetchError } = await supabase
    .from('audits')
    .select('*')
    .eq('id', action.auditId)
    .single();

  if (fetchError || !audit) {
    throw new Error('Audit not found');
  }

  if (audit.status !== 'submitted') {
    throw new Error('Audit must be submitted to review');
  }

  let newStatus: string;
  let trailAction: string;

  if (action.action === 'approve') {
    newStatus = 'approved';
    trailAction = 'approve';
  } else if (action.action === 'return') {
    if (!action.comments || action.comments.trim() === '') {
      throw new Error('Comments are required when returning an audit');
    }
    newStatus = 'returned';
    trailAction = 'return';
  } else {
    throw new Error('Invalid action');
  }

  const { data, error } = await supabase
    .from('audits')
    .update({
      status: newStatus,
      reviewed_at: new Date().toISOString(),
      reviewed_by: action.reviewerId,
      review_comments: action.comments || null,
    })
    .eq('id', action.auditId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to review audit: ${error.message}`);
  }

  // Log the review
  await logAuditTrail({
    audit_id: action.auditId,
    user_id: action.reviewerId,
    action: trailAction,
    entity_type: 'audit',
    entity_id: action.auditId,
    old_value: { status: 'submitted' },
    new_value: { status: newStatus, comments: action.comments },
  });

  // Create notification for auditor
  const notificationType = action.action === 'approve' ? 'audit_approved' : 'audit_returned';
  const notificationTitle = action.action === 'approve' ? 'Audit Approved' : 'Audit Returned for Revision';
  const notificationMessage = action.action === 'approve'
    ? `Audit ${audit.audit_number} has been approved`
    : `Audit ${audit.audit_number} has been returned for revision: ${action.comments}`;

  await createNotification({
    organization_id: audit.organization_id,
    user_id: audit.auditor_id,
    type: notificationType,
    title: notificationTitle,
    message: notificationMessage,
    related_entity: 'audit',
    related_id: action.auditId,
  });

  // If approved, finalize the audit
  if (action.action === 'approve') {
    await finalizeAudit(action.auditId, action.reviewerId);
  }

  return data;
}

/**
 * Finalize audit (make responses, scores, and evidence immutable)
 */
async function finalizeAudit(auditId: string, reviewerId: string): Promise<void> {
  const { data: audit, error: fetchError } = await supabase
    .from('audits')
    .select('*')
    .eq('id', auditId)
    .single();

  if (fetchError || !audit) {
    throw new Error('Audit not found');
  }

  // Mark audit as finalized
  const { error: updateError } = await supabase
    .from('audits')
    .update({
      finalized_at: new Date().toISOString(),
      finalized_by: reviewerId,
    })
    .eq('id', auditId);

  if (updateError) {
    throw new Error(`Failed to finalize audit: ${updateError.message}`);
  }

  // Log finalization
  await logAuditTrail({
    audit_id: auditId,
    user_id: reviewerId,
    action: 'finalize',
    entity_type: 'audit',
    entity_id: auditId,
    old_value: { status: 'approved' },
    new_value: { status: 'approved', finalized: true },
  });
}

/**
 * Revise returned audit
 */
export async function reviseAudit(
  auditId: string,
  auditorId: string,
  changes: string
): Promise<Audit> {
  const { data: audit, error: fetchError } = await supabase
    .from('audits')
    .select('*')
    .eq('id', auditId)
    .single();

  if (fetchError || !audit) {
    throw new Error('Audit not found');
  }

  if (audit.status !== 'returned') {
    throw new Error('Audit must be returned to revise');
  }

  if (audit.auditor_id !== auditorId) {
    throw new Error('Only the assigned auditor can revise the audit');
  }

  const { data, error } = await supabase
    .from('audits')
    .update({
      status: 'in_progress',
      revision_count: (audit.revision_count || 0) + 1,
    })
    .eq('id', auditId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to revise audit: ${error.message}`);
  }

  // Log the revision
  await logAuditTrail({
    audit_id: auditId,
    user_id: auditorId,
    action: 'revise',
    entity_type: 'audit',
    entity_id: auditId,
    old_value: { status: 'returned' },
    new_value: { status: 'in_progress', changes },
  });

  // Create notification for audit admins
  await createNotification({
    organization_id: audit.organization_id,
    user_id: null,
    type: 'audit_revised',
    title: 'Audit Revised',
    message: `Audit ${audit.audit_number} has been revised and is ready for re-review`,
    related_entity: 'audit',
    related_id: auditId,
  });

  return data;
}

/**
 * Close audit (after approval)
 */
export async function closeAudit(auditId: string, userId: string): Promise<Audit> {
  const { data: audit, error: fetchError } = await supabase
    .from('audits')
    .select('*')
    .eq('id', auditId)
    .single();

  if (fetchError || !audit) {
    throw new Error('Audit not found');
  }

  if (audit.status !== 'approved') {
    throw new Error('Audit must be approved to close');
  }

  if (!audit.finalized_at) {
    throw new Error('Audit must be finalized before closing');
  }

  const { data, error } = await supabase
    .from('audits')
    .update({
      status: 'closed',
      closed_at: new Date().toISOString(),
      closed_by: userId,
    })
    .eq('id', auditId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to close audit: ${error.message}`);
  }

  // Log closure
  await logAuditTrail({
    audit_id: auditId,
    user_id: userId,
    action: 'close',
    entity_type: 'audit',
    entity_id: auditId,
    old_value: { status: 'approved' },
    new_value: { status: 'closed' },
  });

  return data;
}

/**
 * Check if audit can be modified
 */
export async function canModifyAudit(auditId: string): Promise<boolean> {
  const { data: audit, error } = await supabase
    .from('audits')
    .select('status, finalized_at')
    .eq('id', auditId)
    .single();

  if (error || !audit) {
    return false;
  }

  // Cannot modify if finalized
  if (audit.finalized_at) {
    return false;
  }

  // Can only modify if in draft, scheduled, assigned, in_progress, or returned status
  const modifiableStatuses = ['draft', 'scheduled', 'assigned', 'in_progress', 'returned'];
  return modifiableStatuses.includes(audit.status);
}

/**
 * Check if audit responses can be modified
 */
export async function canModifyResponses(auditId: string): Promise<boolean> {
  return canModifyAudit(auditId);
}

/**
 * Check if evidence can be modified
 */
export async function canModifyEvidence(auditId: string): Promise<boolean> {
  return canModifyAudit(auditId);
}

/**
 * Get approval history for an audit
 */
export async function getApprovalHistory(auditId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('audit_trail')
    .select(`
      *,
      user:profiles(id, full_name, email)
    `)
    .eq('audit_id', auditId)
    .in('action', ['submit_for_review', 'approve', 'return', 'revise', 'finalize', 'close'])
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to get approval history: ${error.message}`);
  }

  return data || [];
}

// Helper functions (will be implemented in audit-trail and notification services)
async function logAuditTrail(log: any): Promise<void> {
  await supabase.from('audit_trail').insert(log);
}

async function createNotification(notification: any): Promise<void> {
  await supabase.from('notifications').insert(notification);
}
