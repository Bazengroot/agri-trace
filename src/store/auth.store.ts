/**
 * Authentication Store
 *
 * Manages authentication state using Supabase Auth.
 * Replaces demo authentication with real, secure authentication.
 */

import { create } from 'zustand';
import type { User, Session } from '@supabase/supabase-js';
import type { Profile, UserRole } from '../types/database';
import * as authService from '../services/auth.service';

interface AuthState {
  // State
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  initialized: boolean;

  // Actions
  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  signUp: (data: authService.SignUpData) => Promise<{ success: boolean; error?: string }>;
  refreshProfile: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<{ success: boolean; error?: string }>;
  requestPasswordReset: (email: string) => Promise<{ success: boolean; error?: string }>;
  updatePassword: (newPassword: string) => Promise<{ success: boolean; error?: string }>;

  // Helpers
  isAuthenticated: () => boolean;
  hasRole: (roles: UserRole[]) => boolean;
  isAdmin: () => boolean;
  isAuditor: () => boolean;
  canAccessFarm: (farmId: string) => boolean;
}

export const useAuthStore = create<AuthState>()(
    (set: any, get: any) => ({
      // Initial state
      user: null,
      profile: null,
      session: null,
      loading: false,
      initialized: false,

      // Initialize auth state on app load
      initialize: async () => {
        try {
          set({ loading: true });

          // Get current session
          const session = await authService.getSession();

          if (session?.user) {
            // Get user profile
            const profile = await authService.getProfile(session.user.id);

            set({
              user: session.user,
              profile,
              session,
              loading: false,
              initialized: true,
            });
          } else {
            set({
              user: null,
              profile: null,
              session: null,
              loading: false,
              initialized: true,
            });
          }

          // Subscribe to auth state changes
          authService.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' && session?.user) {
              const profile = await authService.getProfile(session.user.id);
              set({
                user: session.user,
                profile,
                session,
              });
            } else if (event === 'SIGNED_OUT') {
              set({
                user: null,
                profile: null,
                session: null,
              });
            } else if (event === 'TOKEN_REFRESHED' && session) {
              set({ session });
            } else if (event === 'USER_UPDATED' && session?.user) {
              const profile = await authService.getProfile(session.user.id);
              set({
                user: session.user,
                profile,
                session,
              });
            }
          });
        } catch (error) {
          console.error('Auth initialization error:', error);
          set({ loading: false, initialized: true });
        }
      },

      // Login
      login: async (email: string, password: string) => {
        try {
          set({ loading: true });

          const result = await authService.signIn({ email, password });

          if (result.success && result.user) {
            set({
              user: result.user,
              profile: result.profile || null,
              loading: false,
            });
            return { success: true };
          } else {
            set({ loading: false });
            return { success: false, error: result.error || 'Login failed' };
          }
        } catch (error) {
          console.error('Login error:', error);
          set({ loading: false });
          return { success: false, error: 'An unexpected error occurred' };
        }
      },

      // Logout
      logout: async () => {
        try {
          set({ loading: true });

          const result = await authService.signOut();

          if (result.success) {
            set({
              user: null,
              profile: null,
              session: null,
              loading: false,
            });
          } else {
            set({ loading: false });
            console.error('Logout error:', result.error);
          }
        } catch (error) {
          console.error('Logout error:', error);
          set({ loading: false });
        }
      },

      // Sign up
      signUp: async (data: authService.SignUpData) => {
        try {
          set({ loading: true });

          const result = await authService.signUp(data);

          if (result.success && result.user) {
            set({
              user: result.user,
              profile: result.profile || null,
              loading: false,
            });
            return { success: true };
          } else {
            set({ loading: false });
            return { success: false, error: result.error || 'Sign up failed' };
          }
        } catch (error) {
          console.error('Sign up error:', error);
          set({ loading: false });
          return { success: false, error: 'An unexpected error occurred' };
        }
      },

      // Refresh profile from database
      refreshProfile: async () => {
        const { user } = get();
        if (!user) return;

        try {
          const profile = await authService.getProfile(user.id);
          set({ profile });
        } catch (error) {
          console.error('Refresh profile error:', error);
        }
      },

      // Update profile
      updateProfile: async (updates: Partial<Profile>) => {
        const { user } = get();
        if (!user) {
          return { success: false, error: 'Not authenticated' };
        }

        try {
          const result = await authService.updateProfile(user.id, updates);

          if (result.success && result.profile) {
            set({ profile: result.profile });
            return { success: true };
          } else {
            return { success: false, error: result.error || 'Update failed' };
          }
        } catch (error) {
          console.error('Update profile error:', error);
          return { success: false, error: 'An unexpected error occurred' };
        }
      },

      // Request password reset
      requestPasswordReset: async (email: string) => {
        try {
          return await authService.requestPasswordReset(email);
        } catch (error) {
          console.error('Password reset request error:', error);
          return { success: false, error: 'An unexpected error occurred' };
        }
      },

      // Update password (after reset)
      updatePassword: async (newPassword: string) => {
        try {
          return await authService.updatePassword(newPassword);
        } catch (error) {
          console.error('Password update error:', error);
          return { success: false, error: 'An unexpected error occurred' };
        }
      },

      // Check if user is authenticated
      isAuthenticated: () => {
        const { user, profile } = get();
        return !!user && !!profile && profile.status === 'active';
      },

      // Check if user has specific role
      hasRole: (roles: UserRole[]) => {
        const { profile } = get();
        return authService.hasRole(profile, roles);
      },

      // Check if user is admin
      isAdmin: () => {
        const { profile } = get();
        return authService.isAdmin(profile);
      },

      // Check if user is auditor
      isAuditor: () => {
        const { profile } = get();
        return authService.isAuditor(profile);
      },

      // Check if user can access specific farm
      canAccessFarm: (farmId: string) => {
        const { profile } = get();
        return authService.canAccessFarm(profile, farmId);
      },
    })
);

// Hook for accessing auth state
export const useAuth = () => useAuthStore();

// Hook for accessing user profile
export const useProfile = () => useAuthStore((state) => state.profile);

// Hook for checking authentication
export const useIsAuthenticated = () => useAuthStore((state) => state.isAuthenticated());

// Hook for checking admin role
export const useIsAdmin = () => useAuthStore((state) => state.isAdmin());

// Hook for checking auditor role
export const useIsAuditor = () => useAuthStore((state) => state.isAuditor());
