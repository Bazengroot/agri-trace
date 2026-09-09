// @ts-nocheck
/**
 * Notification Service
 * Manages user notifications for audit-related events
 */

import { supabase } from '../../lib/supabase';

export type NotificationType =
  | 'audit_assigned'
  | 'audit_scheduled'
  | 'audit_submitted'
  | 'audit_returned'
  | 'audit_approved'
  | 'audit_revised'
  | 'finding_assigned'
  | 'ca_due'
  | 'ca_overdue'
  | 'ca_submitted'
  | 'ca_rejected'
  | 'ca_verified';

export interface Notification {
  organization_id: string;
  user_id: string | null; // null means broadcast to role-based users
  role?: string; // for role-based notifications
  type: NotificationType;
  title: string;
  message: string;
  related_entity?: string;
  related_id?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
}

export interface NotificationFilters {
  user_id?: string;
  type?: string;
  is_read?: boolean;
  priority?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Create a notification
 */
export async function createNotification(notification: Notification): Promise<void> {
  // If user_id is null and role is specified, create notifications for all users with that role
  if (!notification.user_id && notification.role) {
    const { data: users, error: usersError } = await supabase
      .from('profiles')
      .select('id')
      .eq('organization_id', notification.organization_id)
      .eq('role', notification.role)
      .eq('status', 'active');

    if (usersError) {
      throw new Error(`Failed to get users for role: ${usersError.message}`);
    }

    // Create notification for each user
    const notifications = (users || []).map(user => ({
      organization_id: notification.organization_id,
      user_id: user.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      related_entity: notification.related_entity || null,
      related_id: notification.related_id || null,
      priority: notification.priority || 'medium',
      is_read: false,
      created_at: new Date().toISOString(),
    }));

    if (notifications.length > 0) {
      const { error } = await supabase
        .from('notifications')
        .insert(notifications);

      if (error) {
        throw new Error(`Failed to create notifications: ${error.message}`);
      }
    }
  } else {
    // Create single notification
    const { error } = await supabase
      .from('notifications')
      .insert({
        organization_id: notification.organization_id,
        user_id: notification.user_id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        related_entity: notification.related_entity || null,
        related_id: notification.related_id || null,
        priority: notification.priority || 'medium',
        is_read: false,
        created_at: new Date().toISOString(),
      });

    if (error) {
      throw new Error(`Failed to create notification: ${error.message}`);
    }
  }
}

/**
 * Create multiple notifications
 */
export async function createNotifications(notifications: Notification[]): Promise<void> {
  for (const notification of notifications) {
    await createNotification(notification);
  }
}

/**
 * Get notifications for a user
 */
export async function getNotifications(filters: NotificationFilters = {}): Promise<any[]> {
  let query = supabase
    .from('notifications')
    .select('*');

  if (filters.user_id) {
    query = query.eq('user_id', filters.user_id);
  }

  if (filters.type) {
    query = query.eq('type', filters.type);
  }

  if (filters.is_read !== undefined) {
    query = query.eq('is_read', filters.is_read);
  }

  if (filters.priority) {
    query = query.eq('priority', filters.priority);
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
    throw new Error(`Failed to get notifications: ${error.message}`);
  }

  return data || [];
}

/**
 * Get unread notification count
 */
export async function getUnreadCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) {
    throw new Error(`Failed to get unread count: ${error.message}`);
  }

  return count || 0;
}

/**
 * Mark notification as read
 */
export async function markAsRead(notificationId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq('id', notificationId);

  if (error) {
    throw new Error(`Failed to mark notification as read: ${error.message}`);
  }
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllAsRead(userId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) {
    throw new Error(`Failed to mark all notifications as read: ${error.message}`);
  }
}

/**
 * Delete notification
 */
export async function deleteNotification(notificationId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', notificationId);

  if (error) {
    throw new Error(`Failed to delete notification: ${error.message}`);
  }
}

/**
 * Delete old notifications (cleanup)
 */
export async function deleteOldNotifications(daysOld: number = 90): Promise<void> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  const { error } = await supabase
    .from('notifications')
    .delete()
    .lt('created_at', cutoffDate.toISOString())
    .eq('is_read', true);

  if (error) {
    throw new Error(`Failed to delete old notifications: ${error.message}`);
  }
}

/**
 * Get notification statistics
 */
export async function getNotificationStats(userId: string): Promise<any> {
  const { data, error } = await supabase
    .from('notifications')
    .select('type, is_read, priority')
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to get notification stats: ${error.message}`);
  }

  const notifications = data || [];

  const total = notifications.length;
  const unread = notifications.filter(n => !n.is_read).length;
  const read = total - unread;

  const byType = notifications.reduce((acc, n) => {
    acc[n.type] = (acc[n.type] || 0) + 1;
    return acc;
  }, {});

  const byPriority = notifications.reduce((acc, n) => {
    acc[n.priority] = (acc[n.priority] || 0) + 1;
    return acc;
  }, {});

  return {
    total,
    unread,
    read,
    byType,
    byPriority,
  };
}

/**
 * Create audit-related notifications
 */
export async function notifyAuditAssigned(
  organizationId: string,
  auditorId: string,
  auditNumber: string,
  farmName: string
): Promise<void> {
  await createNotification({
    organization_id: organizationId,
    user_id: auditorId,
    type: 'audit_assigned',
    title: 'New Audit Assigned',
    message: `You have been assigned to audit ${auditNumber} at ${farmName}`,
    related_entity: 'audit',
    related_id: auditNumber,
    priority: 'medium',
  });
}

export async function notifyAuditSubmitted(
  organizationId: string,
  auditNumber: string,
  farmName: string
): Promise<void> {
  await createNotification({
    organization_id: organizationId,
    user_id: null,
    role: 'audit_admin',
    type: 'audit_submitted',
    title: 'Audit Submitted for Review',
    message: `Audit ${auditNumber} at ${farmName} has been submitted for review`,
    related_entity: 'audit',
    related_id: auditNumber,
    priority: 'medium',
  });
}

export async function notifyAuditApproved(
  organizationId: string,
  auditorId: string,
  auditNumber: string
): Promise<void> {
  await createNotification({
    organization_id: organizationId,
    user_id: auditorId,
    type: 'audit_approved',
    title: 'Audit Approved',
    message: `Audit ${auditNumber} has been approved`,
    related_entity: 'audit',
    related_id: auditNumber,
    priority: 'low',
  });
}

export async function notifyAuditReturned(
  organizationId: string,
  auditorId: string,
  auditNumber: string,
  comments: string
): Promise<void> {
  await createNotification({
    organization_id: organizationId,
    user_id: auditorId,
    type: 'audit_returned',
    title: 'Audit Returned for Revision',
    message: `Audit ${auditNumber} has been returned for revision. Comments: ${comments}`,
    related_entity: 'audit',
    related_id: auditNumber,
    priority: 'high',
  });
}

export async function notifyFindingAssigned(
  organizationId: string,
  assigneeId: string,
  findingNumber: string,
  auditNumber: string
): Promise<void> {
  await createNotification({
    organization_id: organizationId,
    user_id: assigneeId,
    type: 'finding_assigned',
    title: 'Finding Assigned',
    message: `Finding ${findingNumber} from audit ${auditNumber} has been assigned to you`,
    related_entity: 'finding',
    related_id: findingNumber,
    priority: 'medium',
  });
}

export async function notifyCorrectiveActionDue(
  organizationId: string,
  responsibleId: string,
  caNumber: string,
  dueDate: string
): Promise<void> {
  await createNotification({
    organization_id: organizationId,
    user_id: responsibleId,
    type: 'ca_due',
    title: 'Corrective Action Due Soon',
    message: `Corrective action ${caNumber} is due on ${dueDate}`,
    related_entity: 'corrective_action',
    related_id: caNumber,
    priority: 'high',
  });
}

export async function notifyCorrectiveActionOverdue(
  organizationId: string,
  responsibleId: string,
  caNumber: string,
  dueDate: string
): Promise<void> {
  await createNotification({
    organization_id: organizationId,
    user_id: responsibleId,
    type: 'ca_overdue',
    title: 'Corrective Action Overdue',
    message: `Corrective action ${caNumber} was due on ${dueDate} and is now overdue`,
    related_entity: 'corrective_action',
    related_id: caNumber,
    priority: 'urgent',
  });
}
