/**
 * Supabase Client
 *
 * Centralized Supabase client for the application.
 * Uses environment variables for configuration.
 *
 * Environment variables required:
 * - VITE_SUPABASE_URL: Your Supabase project URL
 * - VITE_SUPABASE_ANON_KEY: Your Supabase anonymous key
 *
 * IMPORTANT: Never expose the service-role key in frontend code.
 * The anon key is safe to expose as it respects RLS policies.
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

// Validate environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
// Support both legacy ANON_KEY and newer PUBLISHABLE_KEY naming conventions
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl) {
  console.warn(
    '⚠️ VITE_SUPABASE_URL is not set. Database operations will fail.\n' +
    'Please set VITE_SUPABASE_URL in your .env file.'
  );
}

if (!supabaseAnonKey) {
  console.warn(
    '⚠️ Supabase key is not set. Database operations will fail.\n' +
    'Please set VITE_SUPABASE_PUBLISHABLE_KEY or VITE_SUPABASE_ANON_KEY in your .env file.'
  );
}

// Create Supabase client with typed database schema
export const supabase = createClient<Database>(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
    db: {
      schema: 'public',
    },
    global: {
      headers: {
        'x-client-info': 'agritrace-audit/1.0.0',
      },
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  }
);

/**
 * Check if Supabase is properly configured
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

/**
 * Get current user session
 */
export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error('Error getting session:', error);
    return null;
  }
  return data.session;
}

/**
 * Get current user
 */
export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    console.error('Error getting user:', error);
    return null;
  }
  return data.user;
}

/**
 * Sign in with email and password
 */
export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error('Sign in error:', error);
    return { success: false, error: error.message };
  }

  return { success: true, user: data.user, session: data.session };
}

/**
 * Sign out
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('Sign out error:', error);
    return { success: false, error: error.message };
  }
  return { success: true };
}

/**
 * Subscribe to auth state changes
 */
export function onAuthStateChange(callback: (event: string, session: any) => void) {
  return supabase.auth.onAuthStateChange(callback);
}

/**
 * Upload file to storage
 */
export async function uploadFile(
  bucket: string,
  path: string,
  file: File,
  options?: { cacheControl?: string; upsert?: boolean }
) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file, {
      cacheControl: options?.cacheControl || '3600',
      upsert: options?.upsert || false,
    });

  if (error) {
    console.error('Upload error:', error);
    return { success: false, error: error.message };
  }

  return { success: true, path: data.path };
}

/**
 * Get public URL for a file
 */
export function getPublicUrl(bucket: string, path: string) {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Delete file from storage
 */
export async function deleteFile(bucket: string, paths: string[]) {
  const { error } = await supabase.storage.from(bucket).remove(paths);

  if (error) {
    console.error('Delete error:', error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

// Export the Database type for use in other files
export type { Database };
