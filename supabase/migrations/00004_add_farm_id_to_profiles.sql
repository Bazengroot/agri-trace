-- Phase 2: Add farm_id to profiles table
-- This allows farm managers and supervisors to be assigned to specific farms

-- Add farm_id column to profiles
alter table public.profiles
add column farm_id uuid references public.farms(id) on delete set null;

-- Add index for farm_id
create index idx_profiles_farm on public.profiles (farm_id);

-- Add constraint: only farm_manager and supervisor can have farm_id
alter table public.profiles
add constraint profiles_farm_role_check check (
  (role in ('farm_manager', 'supervisor') and farm_id is not null)
  or (role not in ('farm_manager', 'supervisor') and farm_id is null)
  or farm_id is null
);

-- Update TypeScript types will be handled separately
