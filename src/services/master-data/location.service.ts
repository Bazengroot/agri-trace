/**
 * Location Service
 * Handles CRUD operations for locations
 */

import { supabase } from '../../lib/supabase';

export interface Location {
  id: string;
  name: string;
  region: string;
  province: string;
}

export interface LocationListResponse {
  data: Location[];
  total: number;
}

/**
 * List all locations
 */
export async function listLocations(): Promise<LocationListResponse> {
  const { data, error, count } = await supabase
    .from('locations')
    .select('*', { count: 'exact' })
    .order('name');

  if (error) {
    throw new Error(`Failed to list locations: ${error.message}`);
  }

  return {
    data: (data || []) as Location[],
    total: count || 0,
  };
}

/**
 * Create new location
 */
export async function createLocation(location: Omit<Location, 'id'>): Promise<Location> {
  const { data, error } = await (supabase.from('locations') as any)
    .insert(location)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create location: ${error.message}`);
  }

  return data as Location;
}

/**
 * Update location
 */
export async function updateLocation(id: string, updates: Partial<Omit<Location, 'id'>>): Promise<Location> {
  const { data, error } = await (supabase.from('locations') as any)
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update location: ${error.message}`);
  }

  return data as Location;
}

/**
 * Delete location
 */
export async function deleteLocation(id: string): Promise<void> {
  const { error } = await supabase
    .from('locations')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to delete location: ${error.message}`);
  }
}
