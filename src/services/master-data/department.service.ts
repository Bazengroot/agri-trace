/**
 * Department Service
 * Handles CRUD operations for departments
 */

import { supabase } from '../../lib/supabase';

export interface Department {
  id: string;
  name: string;
  head: string;
}

export interface DepartmentListResponse {
  data: Department[];
  total: number;
}

/**
 * List all departments
 */
export async function listDepartments(): Promise<DepartmentListResponse> {
  const { data, error, count } = await supabase
    .from('departments')
    .select('*', { count: 'exact' })
    .order('name');

  if (error) {
    throw new Error(`Failed to list departments: ${error.message}`);
  }

  return {
    data: (data || []) as Department[],
    total: count || 0,
  };
}

/**
 * Create new department
 */
export async function createDepartment(department: Omit<Department, 'id'>): Promise<Department> {
  const { data, error } = await (supabase.from('departments') as any)
    .insert(department)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create department: ${error.message}`);
  }

  return data as Department;
}

/**
 * Update department
 */
export async function updateDepartment(id: string, updates: Partial<Omit<Department, 'id'>>): Promise<Department> {
  const { data, error } = await (supabase.from('departments') as any)
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update department: ${error.message}`);
  }

  return data as Department;
}

/**
 * Delete department
 */
export async function deleteDepartment(id: string): Promise<void> {
  const { error } = await supabase
    .from('departments')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to delete department: ${error.message}`);
  }
}
