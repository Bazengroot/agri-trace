/**
 * Authentication Service
 *
 * Handles all authentication operations using Supabase Auth.
 * Replaces demo authentication with real, secure authentication.
 */

import { supabase } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';
import type { Profile, UserRole } from '../types/database';

export interface AuthState {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface SignUpData {
  email: string;
  password: string;
  fullName: string;
  role: UserRole;
  organizationId: string;
  farmId?: string;
}

export interface AuthResponse {
  success: boolean;
  user?: User;
  profile?: Profile;
  error?: string;
}

/**
 * Sign in with email and password
 */
export async function signIn(credentials: LoginCredentials): Promise<AuthResponse> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: credentials.email,
      password: credentials.password,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data.user) {
      return { success: false, error: 'No user returned from authentication' };
    }

    // Fetch user profile
    const profile = await getProfile(data.user.id);

    return {
      success: true,
      user: data.user,
      profile: profile || undefined,
    };
  } catch (error) {
    console.error('Sign in error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Sign up new user
 */
export async function signUp(data: SignUpData): Promise<AuthResponse> {
  try {
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          full_name: data.fullName,
          role: data.role,
          organization_id: data.organizationId,
          farm_id: data.farmId,
        },
      },
    });

    if (authError) {
      return { success: false, error: authError.message };
    }

    if (!authData.user) {
      return { success: false, error: 'No user returned from sign up' };
    }

    // Create profile record
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: authData.user.id,
        organization_id: data.organizationId,
        full_name: data.fullName,
        email: data.email,
        role: data.role,
        phone: null,
        avatar_url: null,
        farm_id: data.farmId || null,
        status: 'active',
      } as any);

    if (profileError) {
      console.error('Profile creation error:', profileError);
      // Auth succeeded but profile creation failed
      return {
        success: true,
        user: authData.user,
        error: 'Account created but profile setup failed. Please contact support.',
      };
    }

    const profile = await getProfile(authData.user.id);

    return {
      success: true,
      user: authData.user,
      profile: profile || undefined,
    };
  } catch (error) {
    console.error('Sign up error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Sign out current user
 */
export async function signOut(): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.auth.signOut();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Sign out error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Get current session
 */
export async function getSession(): Promise<Session | null> {
  try {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      console.error('Get session error:', error);
      return null;
    }

    return data.session;
  } catch (error) {
    console.error('Get session error:', error);
    return null;
  }
}

/**
 * Get current user
 */
export async function getCurrentUser(): Promise<User | null> {
  try {
    const { data, error } = await supabase.auth.getUser();

    if (error) {
      console.error('Get user error:', error);
      return null;
    }

    return data.user;
  } catch (error) {
    console.error('Get user error:', error);
    return null;
  }
}

/**
 * Get user profile
 */
export async function getProfile(userId: string): Promise<Profile | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Get profile error:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Get profile error:', error);
    return null;
  }
}

/**
 * Update user profile
 */
export async function updateProfile(
  userId: string,
  updates: Partial<Profile>
): Promise<{ success: boolean; profile?: Profile; error?: string }> {
  try {
    const { data, error } = await (supabase
      .from('profiles') as any)
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, profile: data as Profile };
  } catch (error) {
    console.error('Update profile error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Request password reset
 */
export async function requestPasswordReset(email: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Password reset request error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Update password (after reset)
 */
export async function updatePassword(newPassword: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Password update error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Subscribe to auth state changes
 */
export function onAuthStateChange(
  callback: (event: string, session: Session | null) => void
): () => void {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(callback);

  return () => {
    subscription.unsubscribe();
  };
}

/**
 * Check if user has specific role
 */
export function hasRole(profile: Profile | null, roles: UserRole[]): boolean {
  if (!profile) return false;
  return roles.includes(profile.role);
}

/**
 * Check if user is admin (super_admin or audit_admin)
 */
export function isAdmin(profile: Profile | null): boolean {
  return hasRole(profile, ['super_admin', 'audit_admin']);
}

/**
 * Check if user is auditor (any audit role)
 */
export function isAuditor(profile: Profile | null): boolean {
  return hasRole(profile, ['super_admin', 'audit_admin', 'auditor']);
}

/**
 * Check if user can access specific farm
 */
export function canAccessFarm(profile: Profile | null, farmId: string): boolean {
  if (!profile) return false;

  // Admins can access all farms
  if (isAdmin(profile)) return true;

  // Farm managers and supervisors can only access their assigned farm
  if (profile.role === 'farm_manager' || profile.role === 'supervisor') {
    return profile.farm_id === farmId;
  }

  // Auditors can access farms they're assigned to (checked via audits table)
  // This is handled by RLS policies
  return true;
}

/**
 * Get user's accessible farm IDs
 */
export async function getAccessibleFarmIds(profile: Profile | null): Promise<string[]> {
  if (!profile) return [];

  // Admins can access all farms in their organization
  if (isAdmin(profile)) {
    const { data } = await (supabase
      .from('farms') as any)
      .select('id')
      .eq('organization_id', profile.organization_id);

    return data?.map((f: any) => f.id) || [];
  }

  // Farm managers and supervisors can only access their assigned farm
  if (profile.role === 'farm_manager' || profile.role === 'supervisor') {
    return profile.farm_id ? [profile.farm_id] : [];
  }

  // Auditors can access farms they're assigned to via audits
  const { data } = await (supabase
    .from('audits') as any)
    .select('farm_id')
    .eq('auditor_id', profile.id);

  return data?.map((a: any) => a.farm_id) || [];
}
