/**
 * User Service
 * Handles CRUD operations for user profiles
 */

import { supabase } from '../../lib/supabase';
import type { Profile, UserRole, UserStatus } from '../../types/database';

export interface UserFilters {
  organization_id?: string;
  role?: UserRole;
  status?: UserStatus;
  farm_id?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface UserListResponse {
  data: Profile[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * List users with filtering, search, and pagination
 */
export async function listUsers(
  filters: UserFilters = {}
): Promise<UserListResponse> {
  const { organization_id, role, status, farm_id, search, page = 1, pageSize = 20 } = filters;

  let query = supabase
    .from('profiles')
    .select(`
      *,
      organization:organizations(id, name, code),
      farm:farms(id, farm_name, farm_code)
    `, { count: 'exact' });

  // Apply filters
  if (organization_id) {
    query = query.eq('organization_id', organization_id);
  }
  if (role) {
    query = query.eq('role', role);
  }
  if (status) {
    query = query.eq('status', status);
  }
  if (farm_id) {
    query = query.eq('farm_id', farm_id);
  }
  if (search) {
    query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
  }

  // Apply pagination
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to).order('full_name');

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to list users: ${error.message}`);
  }

  return {
    data: data || [],
    total: count || 0,
    page,
    pageSize,
  };
}

/**
 * Get user by ID
 */
export async function getUser(id: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select(`
      *,
      organization:organizations(id, name, code),
      farm:farms(id, farm_name, farm_code)
    `)
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to get user: ${error.message}`);
  }

  return data as any;
}

/**
 * Get user by email
 */
export async function getUserByEmail(email: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('email', email)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to get user by email: ${error.message}`);
  }

  return data;
}

/**
 * Create new user profile
 * Note: This creates a profile record. The actual auth user must be created via Supabase Auth
 */
export async function createUser(
  profile: Omit<Profile, 'id' | 'created_at' | 'updated_at'>
): Promise<Profile> {
  // Check for duplicate email
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', profile.email)
    .single();

  if (existing) {
    throw new Error(`User with email "${profile.email}" already exists`);
  }

  const { data, error } = await (supabase.from('profiles') as any)
    .insert(profile)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create user: ${error.message}`);
  }

  return data as Profile;
}

/**
 * Update user profile
 */
export async function updateUser(
  id: string,
  updates: Partial<Omit<Profile, 'id' | 'created_at'>>
): Promise<Profile> {
  // Check for duplicate email if email is being updated
  if (updates.email) {
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', updates.email)
      .neq('id', id)
      .single();

    if (existing) {
      throw new Error(`User with email "${updates.email}" already exists`);
    }
  }

  const { data, error } = await (supabase.from('profiles') as any)
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update user: ${error.message}`);
  }

  return data as Profile;
}

/**
 * Deactivate user (set status to 'inactive')
 * Users are never physically deleted due to historical references
 */
export async function deactivateUser(id: string): Promise<void> {
  const { error } = await (supabase.from('profiles') as any)
    .update({ status: 'inactive' })
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to deactivate user: ${error.message}`);
  }
}

/**
 * Activate user
 */
export async function activateUser(id: string): Promise<void> {
  const { error } = await (supabase.from('profiles') as any)
    .update({ status: 'active' })
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to activate user: ${error.message}`);
  }
}

/**
 * Suspend user
 */
export async function suspendUser(id: string): Promise<void> {
  const { error } = await (supabase.from('profiles') as any)
    .update({ status: 'suspended' })
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to suspend user: ${error.message}`);
  }
}

/**
 * Update user role
 */
export async function updateUserRole(id: string, role: UserRole): Promise<Profile> {
  return updateUser(id, { role });
}

/**
 * Assign farm to user (for farm managers/supervisors)
 */
export async function assignFarmToUser(userId: string, farmId: string | null): Promise<Profile> {
  return updateUser(userId, { farm_id: farmId });
}

/**
 * Get users by organization
 */
export async function getUsersByOrganization(organizationId: string): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .order('full_name');

  if (error) {
    throw new Error(`Failed to get users by organization: ${error.message}`);
  }

  return data || [];
}

/**
 * Get users by role
 */
export async function getUsersByRole(
  organizationId: string,
  role: UserRole
): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('role', role)
    .eq('status', 'active')
    .order('full_name');

  if (error) {
    throw new Error(`Failed to get users by role: ${error.message}`);
  }

  return data || [];
}

/**
 * Get farm managers
 */
export async function getFarmManagers(organizationId: string): Promise<Profile[]> {
  return getUsersByRole(organizationId, 'farm_manager');
}

/**
 * Get auditors
 */
export async function getAuditors(organizationId: string): Promise<Profile[]> {
  return getUsersByRole(organizationId, 'auditor');
}

/**
 * Get user statistics
 */
export async function getUserStats(organizationId: string): Promise<{
  total: number;
  active: number;
  byRole: Record<UserRole, number>;
}> {
  const { data, error } = await (supabase.from('profiles') as any)
    .select('role, status')
    .eq('organization_id', organizationId);

  if (error) {
    throw new Error(`Failed to get user stats: ${error.message}`);
  }

  const users = (data || []) as Array<{ role: string; status: string }>;
  const total = users.length;
  const active = users.filter((u) => u.status === 'active').length;

  const byRole: Record<UserRole, number> = {
    super_admin: 0,
    audit_admin: 0,
    auditor: 0,
    farm_manager: 0,
    supervisor: 0,
    viewer: 0,
  };

  users.forEach((u) => {
    byRole[u.role as UserRole]++;
  });

  return {
    total,
    active,
    byRole,
  };
}
