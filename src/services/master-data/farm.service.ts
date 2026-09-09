/**
 * Farm Service
 * Handles CRUD operations for farms with soft delete support
 */

import { supabase } from '../../lib/supabase';
import type { Farm, InsertFarm, UpdateFarm } from '../../types/database';

export interface FarmFilters {
  organization_id?: string;
  status?: 'active' | 'inactive' | 'under_audit';
  farm_type?: string;
  region?: string;
  manager_id?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface FarmListResponse {
  data: Farm[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * List farms with filtering, search, and pagination
 */
export async function listFarms(
  filters: FarmFilters = {}
): Promise<FarmListResponse> {
  const {
    organization_id,
    status,
    farm_type,
    region,
    manager_id,
    search,
    page = 1,
    pageSize = 20,
  } = filters;

  let query = supabase
    .from('farms')
    .select(`
      *,
      manager:profiles!manager_id(id, full_name, email)
    `, { count: 'exact' });

  // Apply filters
  if (organization_id) {
    query = query.eq('organization_id', organization_id);
  }
  if (status) {
    query = query.eq('status', status);
  }
  if (farm_type) {
    query = query.eq('farm_type', farm_type);
  }
  if (region) {
    query = query.eq('region', region);
  }
  if (manager_id) {
    query = query.eq('manager_id', manager_id);
  }
  if (search) {
    query = query.or(`farm_name.ilike.%${search}%,farm_code.ilike.%${search}%`);
  }

  // Apply pagination
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to).order('farm_name');

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to list farms: ${error.message}`);
  }

  return {
    data: data || [],
    total: count || 0,
    page,
    pageSize,
  };
}

/**
 * Get farm by ID with related data
 */
export async function getFarm(id: string): Promise<Farm | null> {
  const { data, error } = await supabase
    .from('farms')
    .select(`
      *,
      manager:profiles!manager_id(id, full_name, email),
      organization:organizations(id, name, code),
      houses:farm_houses(*)
    `)
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to get farm: ${error.message}`);
  }

  return data as any;
}

/**
 * Create new farm
 */
export async function createFarm(farm: InsertFarm): Promise<Farm> {
  // Check for duplicate farm code within organization
  const { data: existing } = await supabase
    .from('farms')
    .select('id')
    .eq('organization_id', farm.organization_id)
    .eq('farm_code', farm.farm_code)
    .single();

  if (existing) {
    throw new Error(
      `Farm with code "${farm.farm_code}" already exists in this organization`
    );
  }

  const { data, error } = await (supabase.from('farms') as any)
    .insert(farm)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create farm: ${error.message}`);
  }

  return data as Farm;
}

/**
 * Update farm
 */
export async function updateFarm(id: string, updates: UpdateFarm): Promise<Farm> {
  // Check for duplicate farm code if code is being updated
  if (updates.farm_code && updates.organization_id) {
    const { data: existing } = await supabase
      .from('farms')
      .select('id')
      .eq('organization_id', updates.organization_id)
      .eq('farm_code', updates.farm_code)
      .neq('id', id)
      .single();

    if (existing) {
      throw new Error(
        `Farm with code "${updates.farm_code}" already exists in this organization`
      );
    }
  }

  const { data, error } = await (supabase.from('farms') as any)
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update farm: ${error.message}`);
  }

  return data as Farm;
}

/**
 * Soft delete farm (set status to 'inactive')
 * Farms are never physically deleted due to historical audit references
 */
export async function deactivateFarm(id: string): Promise<void> {
  // Check if farm has active audits
  const { count } = await supabase
    .from('audits')
    .select('*', { count: 'exact', head: true })
    .eq('farm_id', id)
    .in('status', ['scheduled', 'in_progress']);

  if (count && count > 0) {
    throw new Error(
      `Cannot deactivate farm with ${count} active audit(s). Complete or cancel audits first.`
    );
  }

  const { error } = await (supabase.from('farms') as any)
    .update({ status: 'inactive' })
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to deactivate farm: ${error.message}`);
  }
}

/**
 * Reactivate farm
 */
export async function activateFarm(id: string): Promise<void> {
  const { error } = await (supabase.from('farms') as any)
    .update({ status: 'active' })
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to activate farm: ${error.message}`);
  }
}

/**
 * Get farm statistics
 */
export async function getFarmStats(id: string): Promise<{
  houses: number;
  audits: number;
  completedAudits: number;
  activeAudits: number;
  findings: number;
  openFindings: number;
  averageScore: number | null;
}> {
  const [housesResult, auditsResult] = await Promise.all([
    supabase
      .from('farm_houses')
      .select('*', { count: 'exact', head: true })
      .eq('farm_id', id),
    (supabase.from('audits') as any)
      .select('id, status, overall_score')
      .eq('farm_id', id),
  ]);

  const audits = (auditsResult.data || []) as Array<{
    id: string;
    status: string;
    overall_score: number | null;
  }>;
  const completedAudits = audits.filter((a) => a.status === 'completed');
  const activeAudits = audits.filter(
    (a) => a.status === 'scheduled' || a.status === 'in_progress'
  );

  // Get findings for this farm's audits
  const auditIds = audits.map((a) => a.id);
  const findingsResult = auditIds.length > 0
    ? await (supabase.from('findings') as any)
        .select('id, status')
        .in('audit_id', auditIds)
    : { data: [] };

  const findings = (findingsResult.data || []) as Array<{
    id: string;
    status: string;
  }>;
  const openFindings = findings.filter(
    (f) => f.status === 'open' || f.status === 'in_progress'
  );

  // Calculate average score from completed audits
  const scores = completedAudits
    .map((a) => a.overall_score)
    .filter((s): s is number => s !== null);
  const averageScore =
    scores.length > 0
      ? scores.reduce((sum, s) => sum + s, 0) / scores.length
      : null;

  return {
    houses: housesResult.count || 0,
    audits: audits.length,
    completedAudits: completedAudits.length,
    activeAudits: activeAudits.length,
    findings: findings.length,
    openFindings: openFindings.length,
    averageScore: averageScore !== null ? Math.round(averageScore * 100) / 100 : null,
  };
}

/**
 * Get farms by manager
 */
export async function getFarmsByManager(managerId: string): Promise<Farm[]> {
  const { data, error } = await supabase
    .from('farms')
    .select('*')
    .eq('manager_id', managerId)
    .eq('status', 'active')
    .order('farm_name');

  if (error) {
    throw new Error(`Failed to get farms by manager: ${error.message}`);
  }

  return data || [];
}

/**
 * Get regions for an organization
 */
export async function getRegions(organizationId: string): Promise<string[]> {
  const { data, error } = await (supabase.from('farms') as any)
    .select('region')
    .eq('organization_id', organizationId)
    .not('region', 'is', null);

  if (error) {
    throw new Error(`Failed to get regions: ${error.message}`);
  }

  const regions = [...new Set((data || []).map((f: any) => f.region).filter(Boolean))] as string[];
  return regions.sort();
}
