/**
 * Farm House Service
 * Handles CRUD operations for farm houses with soft delete support
 */

import { supabase } from '../../lib/supabase';
import type { FarmHouse, InsertFarmHouse, UpdateFarmHouse } from '../../types/database';

export interface FarmHouseFilters {
  farm_id?: string;
  status?: 'active' | 'inactive' | 'maintenance' | 'depopulated';
  livestock_type?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface FarmHouseListResponse {
  data: FarmHouse[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * List farm houses with filtering, search, and pagination
 */
export async function listFarmHouses(
  filters: FarmHouseFilters = {}
): Promise<FarmHouseListResponse> {
  const { farm_id, status, livestock_type, search, page = 1, pageSize = 50 } = filters;

  let query = supabase
    .from('farm_houses')
    .select(`
      *,
      farm:farms(id, farm_name, farm_code)
    `, { count: 'exact' });

  // Apply filters
  if (farm_id) {
    query = query.eq('farm_id', farm_id);
  }
  if (status) {
    query = query.eq('status', status);
  }
  if (livestock_type) {
    query = query.eq('livestock_type', livestock_type);
  }
  if (search) {
    query = query.or(`house_name.ilike.%${search}%,house_code.ilike.%${search}%`);
  }

  // Apply pagination
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to).order('house_name');

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to list farm houses: ${error.message}`);
  }

  return {
    data: data || [],
    total: count || 0,
    page,
    pageSize,
  };
}

/**
 * Get farm house by ID
 */
export async function getFarmHouse(id: string): Promise<FarmHouse | null> {
  const { data, error } = await supabase
    .from('farm_houses')
    .select(`
      *,
      farm:farms(id, farm_name, farm_code, organization_id)
    `)
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to get farm house: ${error.message}`);
  }

  return data as any;
}

/**
 * Create new farm house
 */
export async function createFarmHouse(house: InsertFarmHouse): Promise<FarmHouse> {
  // Check for duplicate house code within farm
  const { data: existing } = await supabase
    .from('farm_houses')
    .select('id')
    .eq('farm_id', house.farm_id)
    .eq('house_code', house.house_code)
    .single();

  if (existing) {
    throw new Error(
      `House with code "${house.house_code}" already exists in this farm`
    );
  }

  const { data, error } = await (supabase.from('farm_houses') as any)
    .insert(house)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create farm house: ${error.message}`);
  }

  return data as FarmHouse;
}

/**
 * Update farm house
 */
export async function updateFarmHouse(
  id: string,
  updates: UpdateFarmHouse
): Promise<FarmHouse> {
  // Check for duplicate house code if code is being updated
  if (updates.house_code && updates.farm_id) {
    const { data: existing } = await supabase
      .from('farm_houses')
      .select('id')
      .eq('farm_id', updates.farm_id)
      .eq('house_code', updates.house_code)
      .neq('id', id)
      .single();

    if (existing) {
      throw new Error(
        `House with code "${updates.house_code}" already exists in this farm`
      );
    }
  }

  const { data, error } = await (supabase.from('farm_houses') as any)
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update farm house: ${error.message}`);
  }

  return data as FarmHouse;
}

/**
 * Soft delete farm house (set status to 'inactive')
 * Farm houses are never physically deleted due to potential historical references
 */
export async function deactivateFarmHouse(id: string): Promise<void> {
  const { error } = await (supabase.from('farm_houses') as any)
    .update({ status: 'inactive' })
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to deactivate farm house: ${error.message}`);
  }
}

/**
 * Reactivate farm house
 */
export async function activateFarmHouse(id: string): Promise<void> {
  const { error } = await (supabase.from('farm_houses') as any)
    .update({ status: 'active' })
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to activate farm house: ${error.message}`);
  }
}

/**
 * Set farm house to maintenance
 */
export async function setFarmHouseMaintenance(id: string): Promise<void> {
  const { error } = await (supabase.from('farm_houses') as any)
    .update({ status: 'maintenance' })
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to set farm house to maintenance: ${error.message}`);
  }
}

/**
 * Set farm house to depopulated
 */
export async function setFarmHouseDepopulated(id: string): Promise<void> {
  const { error } = await (supabase.from('farm_houses') as any)
    .update({ status: 'depopulated' })
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to set farm house to depopulated: ${error.message}`);
  }
}

/**
 * Get farm houses by farm
 */
export async function getFarmHousesByFarm(farmId: string): Promise<FarmHouse[]> {
  const { data, error } = await supabase
    .from('farm_houses')
    .select('*')
    .eq('farm_id', farmId)
    .order('house_name');

  if (error) {
    throw new Error(`Failed to get farm houses by farm: ${error.message}`);
  }

  return data || [];
}

/**
 * Get farm house capacity statistics
 */
export async function getFarmHouseCapacityStats(farmId: string): Promise<{
  totalHouses: number;
  activeHouses: number;
  totalCapacity: number;
  activeCapacity: number;
  byLivestockType: Record<string, { count: number; capacity: number }>;
}> {
  const { data, error } = await (supabase.from('farm_houses') as any)
    .select('status, capacity, livestock_type')
    .eq('farm_id', farmId);

  if (error) {
    throw new Error(`Failed to get farm house capacity stats: ${error.message}`);
  }

  const houses = (data || []) as Array<{
    status: string;
    capacity: number;
    livestock_type: string;
  }>;
  const totalHouses = houses.length;
  const activeHouses = houses.filter((h) => h.status === 'active').length;
  const totalCapacity = houses.reduce((sum, h) => sum + h.capacity, 0);
  const activeCapacity = houses
    .filter((h) => h.status === 'active')
    .reduce((sum, h) => sum + h.capacity, 0);

  // Group by livestock type
  const byLivestockType: Record<string, { count: number; capacity: number }> = {};
  houses.forEach((h) => {
    if (!byLivestockType[h.livestock_type]) {
      byLivestockType[h.livestock_type] = { count: 0, capacity: 0 };
    }
    byLivestockType[h.livestock_type].count++;
    byLivestockType[h.livestock_type].capacity += h.capacity;
  });

  return {
    totalHouses,
    activeHouses,
    totalCapacity,
    activeCapacity,
    byLivestockType,
  };
}
