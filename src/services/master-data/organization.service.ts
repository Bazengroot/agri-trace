/**
 * Organization Service
 * Handles CRUD operations for organizations with soft delete support
 */

import { supabase } from '../../lib/supabase';
import type { Organization, InsertOrganization, UpdateOrganization } from '../../types/database';

export interface OrganizationFilters {
  status?: 'active' | 'suspended' | 'archived';
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface OrganizationListResponse {
  data: Organization[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * List organizations with filtering, search, and pagination
 */
export async function listOrganizations(
  filters: OrganizationFilters = {}
): Promise<OrganizationListResponse> {
  const { status, search, page = 1, pageSize = 20 } = filters;

  let query = supabase
    .from('organizations')
    .select('*', { count: 'exact' });

  // Apply status filter
  if (status) {
    query = query.eq('status', status);
  }

  // Apply search filter
  if (search) {
    query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%`);
  }

  // Apply pagination
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to).order('name');

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to list organizations: ${error.message}`);
  }

  return {
    data: data || [],
    total: count || 0,
    page,
    pageSize,
  };
}

/**
 * Get organization by ID
 */
export async function getOrganization(id: string): Promise<Organization | null> {
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw new Error(`Failed to get organization: ${error.message}`);
  }

  return data;
}

/**
 * Create new organization
 */
export async function createOrganization(
  org: InsertOrganization
): Promise<Organization> {
  // Check for duplicate code
  const { data: existing } = await supabase
    .from('organizations')
    .select('id')
    .eq('code', org.code)
    .single();

  if (existing) {
    throw new Error(`Organization with code "${org.code}" already exists`);
  }

  const { data, error } = await supabase
    .from('organizations')
    .insert(org as any)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create organization: ${error.message}`);
  }

  return data as Organization;
}

/**
 * Update organization
 */
export async function updateOrganization(
  id: string,
  updates: UpdateOrganization
): Promise<Organization> {
  // Check for duplicate code if code is being updated
  if (updates.code) {
    const { data: existing } = await supabase
      .from('organizations')
      .select('id')
      .eq('code', updates.code)
      .neq('id', id)
      .single();

    if (existing) {
      throw new Error(`Organization with code "${updates.code}" already exists`);
    }
  }

  const { data, error } = await (supabase
    .from('organizations') as any)
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update organization: ${error.message}`);
  }

  return data as Organization;
}

/**
 * Soft delete organization (set status to 'archived')
 * Organizations are never physically deleted due to historical references
 */
export async function deactivateOrganization(id: string): Promise<void> {
  // Check if organization has active farms
  const { count } = await supabase
    .from('farms')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', id)
    .eq('status', 'active');

  if (count && count > 0) {
    throw new Error(
      `Cannot deactivate organization with ${count} active farm(s). Deactivate all farms first.`
    );
  }

  const { error } = await (supabase
    .from('organizations') as any)
    .update({ status: 'archived' })
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to deactivate organization: ${error.message}`);
  }
}

/**
 * Reactivate organization
 */
export async function activateOrganization(id: string): Promise<void> {
  const { error } = await (supabase
    .from('organizations') as any)
    .update({ status: 'active' })
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to activate organization: ${error.message}`);
  }
}

/**
 * Suspend organization
 */
export async function suspendOrganization(id: string): Promise<void> {
  const { error } = await (supabase
    .from('organizations') as any)
    .update({ status: 'suspended' })
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to suspend organization: ${error.message}`);
  }
}

/**
 * Get organization statistics
 */
export async function getOrganizationStats(id: string): Promise<{
  farms: number;
  users: number;
  audits: number;
  activeAudits: number;
}> {
  const [farmsResult, usersResult, auditsResult] = await Promise.all([
    supabase
      .from('farms')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', id),
    supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', id),
    supabase
      .from('audits')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', id),
  ]);

  const { count: activeAuditsCount } = await supabase
    .from('audits')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', id)
    .in('status', ['scheduled', 'in_progress']);

  return {
    farms: farmsResult.count || 0,
    users: usersResult.count || 0,
    audits: auditsResult.count || 0,
    activeAudits: activeAuditsCount || 0,
  };
}
