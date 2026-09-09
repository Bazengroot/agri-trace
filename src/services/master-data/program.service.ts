/**
 * Program Service
 * Handles CRUD operations for audit programs
 */

import { supabase } from '../../lib/supabase';

export interface Program {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  audit_type: string;
  frequency: 'Monthly' | 'Quarterly' | 'Semi-Annual' | 'Annual';
  scope: string;
  applicable_farm_types: string[];
  standard: string;
  risk_level: 'Low' | 'Medium' | 'High' | 'Critical';
  active_from: string;
  active_to: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * List all programs
 */
export async function listPrograms(): Promise<Program[]> {
  const { data, error } = await supabase
    .from('programs')
    .select('*')
    .order('name');

  if (error) {
    throw new Error(`Failed to list programs: ${error.message}`);
  }

  return (data || []) as Program[];
}

/**
 * Create new program
 */
export async function createProgram(program: Omit<Program, 'id' | 'code' | 'created_at' | 'updated_at'>): Promise<Program> {
  // Generate program code
  const code = `PRG-${String(Date.now()).slice(-6)}`;
  
  const { data, error } = await (supabase.from('programs') as any)
    .insert({ ...program, code })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create program: ${error.message}`);
  }

  return data as Program;
}

/**
 * Update program
 */
export async function updateProgram(id: string, updates: Partial<Omit<Program, 'id' | 'created_at' | 'updated_at'>>): Promise<Program> {
  const { data, error } = await (supabase.from('programs') as any)
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update program: ${error.message}`);
  }

  return data as Program;
}

/**
 * Delete program
 */
export async function deleteProgram(id: string): Promise<void> {
  const { error } = await supabase
    .from('programs')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to delete program: ${error.message}`);
  }
}
