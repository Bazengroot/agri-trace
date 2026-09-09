-- Phase 1: Supabase Database Foundation
-- AgriTrace Audit - Farm Audit Management System
-- Migration: 00001_initial_schema.sql
--
-- This migration creates the normalized relational schema for
-- enterprise farm auditing. Designed for multi-organization,
-- multi-farm scalability with proper RLS-ready structure.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. EXTENSIONS
-- ═══════════════════════════════════════════════════════════════════════

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- Enable updated_at trigger helper
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Helper to auto-create updated_at triggers
create or replace function public.create_updated_at_trigger(table_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  execute format(
    'create trigger set_updated_at before update on public.%I
     for each row execute procedure public.handle_updated_at()',
    table_name
  );
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. ENUM TYPES
-- ═══════════════════════════════════════════════════════════════════════

create type public.org_status as enum ('active', 'suspended', 'archived');

create type public.user_role as enum (
  'super_admin',
  'audit_admin',
  'auditor',
  'farm_manager',
  'supervisor',
  'viewer'
);

create type public.user_status as enum ('active', 'inactive', 'suspended');

create type public.farm_type as enum (
  'broiler',
  'layer',
  'broiler_breeder',
  'layer_breeder',
  'hatchery',
  'feed_mill',
  'livestock',
  'other'
);

create type public.farm_status as enum ('active', 'inactive', 'under_audit');

create type public.house_status as enum ('active', 'inactive', 'maintenance', 'depopulated');

create type public.livestock_type as enum (
  'broiler',
  'layer',
  'breeder',
  'turkey',
  'duck',
  'pig',
  'cattle',
  'other'
);

create type public.template_status as enum ('draft', 'active', 'archived', 'deprecated');

create type public.audit_type as enum (
  'farm_compliance',
  'biosecurity',
  'animal_welfare',
  'feed_safety',
  'internal_control',
  'sop_compliance',
  'other'
);

create type public.response_type as enum (
  'choice',
  'numeric',
  'percent',
  'rating',
  'date',
  'text'
);

create type public.scoring_type as enum ('compliance', 'numeric', 'rating', 'informational');

create type public.audit_status as enum (
  'draft',
  'scheduled',
  'in_progress',
  'submitted',
  'under_review',
  'completed',
  'cancelled'
);

create type public.risk_level as enum ('low', 'medium', 'high', 'critical');

create type public.severity as enum ('critical', 'major', 'minor', 'observation');

create type public.finding_status as enum (
  'open',
  'action_required',
  'in_progress',
  'submitted_for_verification',
  'verified',
  'closed',
  'rejected'
);

create type public.ca_status as enum (
  'open',
  'in_progress',
  'submitted_for_verification',
  'verified',
  'rejected',
  'closed'
);

create type public.verification_status as enum (
  'pending',
  'approved',
  'rejected',
  'reopened'
);

create type public.evidence_type as enum (
  'photo',
  'video',
  'pdf',
  'excel',
  'word',
  'document',
  'other'
);

create type public.notification_type as enum (
  'audit_assigned',
  'audit_scheduled',
  'finding_created',
  'ca_assigned',
  'ca_due_soon',
  'ca_overdue',
  'ca_submitted',
  'verification_required',
  'finding_closed',
  'audit_completed'
);

-- ═══════════════════════════════════════════════════════════════════════
-- 3. TABLES
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- 3.1 organizations
-- ─────────────────────────────────────────────────────────────────────
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  description text,
  status public.org_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint organizations_name_not_empty check (char_length(name) >= 2),
  constraint organizations_code_not_empty check (char_length(code) >= 2)
);

create index idx_organizations_status on public.organizations (status);
create index idx_organizations_code on public.organizations (code);

select public.create_updated_at_trigger('organizations');

-- ─────────────────────────────────────────────────────────────────────
-- 3.2 profiles (users)
-- ─────────────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key, -- matches auth.users.id
  organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null,
  email text not null,
  role public.user_role not null default 'viewer',
  phone text,
  avatar_url text,
  status public.user_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_email_not_empty check (char_length(email) >= 3),
  constraint profiles_full_name_not_empty check (char_length(full_name) >= 2),
  constraint profiles_phone_format check (phone is null or char_length(phone) >= 6)
);

create unique index idx_profiles_email on public.profiles (lower(email));
create index idx_profiles_organization on public.profiles (organization_id);
create index idx_profiles_role on public.profiles (role);
create index idx_profiles_status on public.profiles (status);

select public.create_updated_at_trigger('profiles');

-- ─────────────────────────────────────────────────────────────────────
-- 3.3 farms
-- ─────────────────────────────────────────────────────────────────────
create table public.farms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  farm_code text not null,
  farm_name text not null,
  farm_type public.farm_type not null default 'other',
  location jsonb not null default '{}'::jsonb,
  region text,
  manager_id uuid references public.profiles(id) on delete set null,
  status public.farm_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint farms_code_unique unique (organization_id, farm_code),
  constraint farms_name_not_empty check (char_length(farm_name) >= 2)
);

create index idx_farms_organization on public.farms (organization_id);
create index idx_farms_manager on public.farms (manager_id);
create index idx_farms_type on public.farms (farm_type);
create index idx_farms_status on public.farms (status);
create index idx_farms_region on public.farms (region);

select public.create_updated_at_trigger('farms');

-- ─────────────────────────────────────────────────────────────────────
-- 3.4 farm_houses
-- ─────────────────────────────────────────────────────────────────────
create table public.farm_houses (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  house_code text not null,
  house_name text not null,
  capacity integer not null default 0,
  livestock_type public.livestock_type not null default 'other',
  status public.house_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint farm_houses_code_unique unique (farm_id, house_code),
  constraint farm_houses_capacity_positive check (capacity >= 0),
  constraint farm_houses_name_not_empty check (char_length(house_name) >= 1)
);

create index idx_farm_houses_farm on public.farm_houses (farm_id);
create index idx_farm_houses_status on public.farm_houses (status);

select public.create_updated_at_trigger('farm_houses');

-- ─────────────────────────────────────────────────────────────────────
-- 3.5 audit_templates
-- ─────────────────────────────────────────────────────────────────────
create table public.audit_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  audit_type public.audit_type not null default 'farm_compliance',
  version text not null default '1.0',
  status public.template_status not null default 'draft',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint audit_templates_version_unique unique (organization_id, name, version),
  constraint audit_templates_name_not_empty check (char_length(name) >= 2)
);

create index idx_audit_templates_org on public.audit_templates (organization_id);
create index idx_audit_templates_type on public.audit_templates (audit_type);
create index idx_audit_templates_status on public.audit_templates (status);

select public.create_updated_at_trigger('audit_templates');

-- ─────────────────────────────────────────────────────────────────────
-- 3.6 audit_categories
-- ─────────────────────────────────────────────────────────────────────
create table public.audit_categories (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.audit_templates(id) on delete cascade,
  name text not null,
  description text,
  sequence integer not null default 0,
  weight numeric(5,2) not null default 1.00,
  created_at timestamptz not null default now(),

  constraint audit_categories_name_not_empty check (char_length(name) >= 2),
  constraint audit_categories_sequence_positive check (sequence >= 0),
  constraint audit_categories_weight_positive check (weight >= 0)
);

create index idx_audit_categories_template on public.audit_categories (template_id);
create index idx_audit_categories_sequence on public.audit_categories (template_id, sequence);

-- ─────────────────────────────────────────────────────────────────────
-- 3.7 audit_questions
-- ─────────────────────────────────────────────────────────────────────
create table public.audit_questions (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.audit_categories(id) on delete cascade,
  question text not null,
  description text,
  response_type public.response_type not null default 'choice',
  scoring_type public.scoring_type not null default 'compliance',
  max_score numeric(6,2) not null default 100.00,
  weight numeric(5,2) not null default 1.00,
  mandatory boolean not null default false,
  evidence_required boolean not null default false,
  sequence integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),

  constraint audit_questions_question_not_empty check (char_length(question) >= 5),
  constraint audit_questions_max_score_positive check (max_score >= 0),
  constraint audit_questions_weight_positive check (weight >= 0),
  constraint audit_questions_sequence_positive check (sequence >= 0)
);

create index idx_audit_questions_category on public.audit_questions (category_id);
create index idx_audit_questions_sequence on public.audit_questions (category_id, sequence);
create index idx_audit_questions_active on public.audit_questions (active);

-- ─────────────────────────────────────────────────────────────────────
-- 3.8 audits
-- ─────────────────────────────────────────────────────────────────────
create table public.audits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  audit_number text not null,
  farm_id uuid not null references public.farms(id) on delete restrict,
  template_id uuid not null references public.audit_templates(id) on delete restrict,
  auditor_id uuid references public.profiles(id) on delete set null,
  scheduled_date date not null,
  started_at timestamptz,
  completed_at timestamptz,
  status public.audit_status not null default 'draft',
  overall_score numeric(5,2),
  risk_level public.risk_level not null default 'medium',
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint audits_number_unique unique (organization_id, audit_number),
  constraint audits_score_range check (overall_score is null or (overall_score >= 0 and overall_score <= 100)),
  constraint audits_dates_consistent check (
    started_at is null
    or completed_at is null
    or completed_at >= started_at
  )
);

create index idx_audits_organization on public.audits (organization_id);
create index idx_audits_farm on public.audits (farm_id);
create index idx_audits_auditor on public.audits (auditor_id);
create index idx_audits_template on public.audits (template_id);
create index idx_audits_status on public.audits (status);
create index idx_audits_scheduled on public.audits (scheduled_date);
create index idx_audits_risk on public.audits (risk_level);

select public.create_updated_at_trigger('audits');

-- ─────────────────────────────────────────────────────────────────────
-- 3.9 audit_responses
-- ─────────────────────────────────────────────────────────────────────
create table public.audit_responses (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits(id) on delete cascade,
  question_id uuid not null references public.audit_questions(id) on delete cascade,
  response jsonb,
  score numeric(6,2),
  comment text,
  answered_at timestamptz not null default now(),
  answered_by uuid references public.profiles(id) on delete set null,

  constraint audit_responses_unique unique (audit_id, question_id),
  constraint audit_responses_score_range check (score is null or score >= 0)
);

create index idx_audit_responses_audit on public.audit_responses (audit_id);
create index idx_audit_responses_question on public.audit_responses (question_id);
create index idx_audit_responses_answered_by on public.audit_responses (answered_by);

-- ─────────────────────────────────────────────────────────────────────
-- 3.10 findings
-- ─────────────────────────────────────────────────────────────────────
create table public.findings (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits(id) on delete cascade,
  finding_number text not null,
  category text not null,
  title text not null,
  description text,
  severity public.severity not null default 'minor',
  risk_level public.risk_level not null default 'medium',
  root_cause text,
  recommendation text,
  status public.finding_status not null default 'open',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint findings_number_unique unique (audit_id, finding_number),
  constraint findings_title_not_empty check (char_length(title) >= 3)
);

create index idx_findings_audit on public.findings (audit_id);
create index idx_findings_severity on public.findings (severity);
create index idx_findings_status on public.findings (status);
create index idx_findings_risk on public.findings (risk_level);
create index idx_findings_created_by on public.findings (created_by);

select public.create_updated_at_trigger('findings');

-- ─────────────────────────────────────────────────────────────────────
-- 3.11 corrective_actions
-- ─────────────────────────────────────────────────────────────────────
create table public.corrective_actions (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid not null references public.findings(id) on delete cascade,
  action text not null,
  responsible_person uuid references public.profiles(id) on delete set null,
  due_date date not null,
  completed_at timestamptz,
  status public.ca_status not null default 'open',
  verification_status public.verification_status not null default 'pending',
  verified_by uuid references public.profiles(id) on delete set null,
  verification_date timestamptz,
  verification_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint corrective_actions_action_not_empty check (char_length(action) >= 5),
  constraint corrective_actions_verification_consistent check (
    (verification_status = 'pending' and verified_by is null and verification_date is null)
    or (verification_status in ('approved', 'rejected', 'reopened') and verified_by is not null and verification_date is not null)
  )
);

create index idx_corrective_actions_finding on public.corrective_actions (finding_id);
create index idx_corrective_actions_responsible on public.corrective_actions (responsible_person);
create index idx_corrective_actions_status on public.corrective_actions (status);
create index idx_corrective_actions_due_date on public.corrective_actions (due_date);
create index idx_corrective_actions_verification on public.corrective_actions (verification_status);

select public.create_updated_at_trigger('corrective_actions');

-- ─────────────────────────────────────────────────────────────────────
-- 3.12 evidence
-- ─────────────────────────────────────────────────────────────────────
create table public.evidence (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits(id) on delete cascade,
  finding_id uuid references public.findings(id) on delete set null,
  response_id uuid references public.audit_responses(id) on delete set null,
  file_name text not null,
  file_path text not null,
  file_type public.evidence_type not null default 'other',
  file_size bigint not null default 0,
  uploaded_by uuid references public.profiles(id) on delete set null,
  uploaded_at timestamptz not null default now(),

  constraint evidence_file_name_not_empty check (char_length(file_name) >= 1),
  constraint evidence_file_path_not_empty check (char_length(file_path) >= 1),
  constraint evidence_file_size_positive check (file_size >= 0)
);

create index idx_evidence_audit on public.evidence (audit_id);
create index idx_evidence_finding on public.evidence (finding_id);
create index idx_evidence_response on public.evidence (response_id);
create index idx_evidence_uploaded_by on public.evidence (uploaded_by);
create index idx_evidence_uploaded_at on public.evidence (uploaded_at desc);

-- ─────────────────────────────────────────────────────────────────────
-- 3.13 audit_comments
-- ─────────────────────────────────────────────────────────────────────
create table public.audit_comments (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  comment text not null,
  created_at timestamptz not null default now(),

  constraint audit_comments_not_empty check (char_length(comment) >= 1)
);

create index idx_audit_comments_audit on public.audit_comments (audit_id);
create index idx_audit_comments_user on public.audit_comments (user_id);
create index idx_audit_comments_created on public.audit_comments (created_at desc);

-- ─────────────────────────────────────────────────────────────────────
-- 3.14 notifications
-- ─────────────────────────────────────────────────────────────────────
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type public.notification_type not null,
  title text not null,
  message text,
  related_entity text,
  related_id uuid,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),

  constraint notifications_title_not_empty check (char_length(title) >= 1),
  constraint notifications_related_consistent check (
    (related_entity is null and related_id is null)
    or (related_entity is not null and related_id is not null)
  )
);

create index idx_notifications_user on public.notifications (user_id);
create index idx_notifications_read on public.notifications (user_id, is_read);
create index idx_notifications_created on public.notifications (created_at desc);
create index idx_notifications_type on public.notifications (type);

-- ─────────────────────────────────────────────────────────────────────
-- 3.15 activity_logs
-- ─────────────────────────────────────────────────────────────────────
create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now(),

  constraint activity_logs_action_not_empty check (char_length(action) >= 1),
  constraint activity_logs_entity_type_not_empty check (char_length(entity_type) >= 1)
);

create index idx_activity_logs_org on public.activity_logs (organization_id);
create index idx_activity_logs_user on public.activity_logs (user_id);
create index idx_activity_logs_entity on public.activity_logs (entity_type, entity_id);
create index idx_activity_logs_action on public.activity_logs (action);
create index idx_activity_logs_created on public.activity_logs (created_at desc);

-- ═══════════════════════════════════════════════════════════════════════
-- 4. VIEWS (read-optimized)
-- ═══════════════════════════════════════════════════════════════════════

-- View: audit summary with related entities
create or replace view public.v_audit_summary as
select
  a.id,
  a.audit_number,
  a.status,
  a.scheduled_date,
  a.overall_score,
  a.risk_level,
  a.created_at,
  f.id as farm_id,
  f.farm_name,
  f.farm_type,
  f.region,
  t.id as template_id,
  t.name as template_name,
  t.version as template_version,
  p.id as auditor_id,
  p.full_name as auditor_name,
  p.email as auditor_email,
  (select count(*) from public.findings fn where fn.audit_id = a.id) as findings_count,
  (select count(*) from public.findings fn
    where fn.audit_id = a.id
    and fn.status not in ('closed', 'verified')) as open_findings_count
from public.audits a
join public.farms f on f.id = a.farm_id
join public.audit_templates t on t.id = a.template_id
left join public.profiles p on p.id = a.auditor_id;

-- View: finding with related entities
create or replace view public.v_finding_summary as
select
  fn.id,
  fn.finding_number,
  fn.title,
  fn.severity,
  fn.risk_level,
  fn.status,
  fn.created_at,
  a.id as audit_id,
  a.audit_number,
  f.id as farm_id,
  f.farm_name,
  p.id as created_by_id,
  p.full_name as created_by_name,
  (select count(*) from public.corrective_actions ca where ca.finding_id = fn.id) as ca_count,
  (select count(*) from public.corrective_actions ca
    where ca.finding_id = fn.id
    and ca.status not in ('closed', 'verified')) as open_ca_count
from public.findings fn
join public.audits a on a.id = fn.audit_id
join public.farms f on f.id = a.farm_id
left join public.profiles p on p.id = fn.created_by;

-- View: overdue corrective actions
create or replace view public.v_overdue_corrective_actions as
select
  ca.*,
  f.finding_number,
  f.title as finding_title,
  f.severity,
  a.audit_number,
  fr.farm_name,
  p.full_name as responsible_name,
  p.email as responsible_email
from public.corrective_actions ca
join public.findings f on f.id = ca.finding_id
join public.audits a on a.id = f.audit_id
join public.farms fr on fr.id = a.farm_id
left join public.profiles p on p.id = ca.responsible_person
where ca.status not in ('closed', 'verified')
  and ca.due_date < current_date;

-- ═══════════════════════════════════════════════════════════════════════
-- 5. STORAGE BUCKETS (Supabase Storage)
-- ═══════════════════════════════════════════════════════════════════════

-- Create storage bucket for audit evidence
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'audit-evidence',
  'audit-evidence',
  false,
  10485760, -- 10 MB
  array['image/jpeg', 'image/png', 'image/gif', 'image/webp',
         'application/pdf',
         'application/vnd.ms-excel',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'video/mp4', 'video/quicktime']
)
on conflict (id) do nothing;

-- Create storage bucket for user avatars
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'user-avatars',
  'user-avatars',
  true,
  2097152, -- 2 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- ═══════════════════════════════════════════════════════════════════════
-- 6. ROW LEVEL SECURITY (RLS) - Basic Policies
-- ═══════════════════════════════════════════════════════════════════════

-- Enable RLS on all tables
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.farms enable row level security;
alter table public.farm_houses enable row level security;
alter table public.audit_templates enable row level security;
alter table public.audit_categories enable row level security;
alter table public.audit_questions enable row level security;
alter table public.audits enable row level security;
alter table public.audit_responses enable row level security;
alter table public.findings enable row level security;
alter table public.corrective_actions enable row level security;
alter table public.evidence enable row level security;
alter table public.audit_comments enable row level security;
alter table public.notifications enable row level security;
alter table public.activity_logs enable row level security;

-- ─────────────────────────────────────────────────────────────────────
-- Helper: check if current user is super_admin or audit_admin
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid())
      and role in ('super_admin', 'audit_admin')
      and status = 'active'
  );
$$;

create or replace function public.is_auditor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid())
      and role in ('super_admin', 'audit_admin', 'auditor')
      and status = 'active'
  );
$$;

-- ─────────────────────────────────────────────────────────────────────
-- Organizations: readable by all authenticated users in the org
-- ─────────────────────────────────────────────────────────────────────
create policy "Organizations: readable by members"
  on public.organizations for select
  using (
    exists (
      select 1 from public.profiles
      where profiles.organization_id = organizations.id
        and profiles.id = (select auth.uid())
        and profiles.status = 'active'
    )
  );

create policy "Organizations: manageable by admins"
  on public.organizations for all
  using (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────
-- Profiles: readable by org members, self-modifiable
-- ─────────────────────────────────────────────────────────────────────
create policy "Profiles: readable by org members"
  on public.profiles for select
  using (
    organization_id in (
      select organization_id from public.profiles where id = (select auth.uid())
    )
  );

create policy "Profiles: self-update"
  on public.profiles for update
  using (id = (select auth.uid()));

create policy "Profiles: admin-managed"
  on public.profiles for all
  using (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────
-- Farms: scoped to organization
-- ─────────────────────────────────────────────────────────────────────
create policy "Farms: readable by org members"
  on public.farms for select
  using (
    organization_id in (
      select organization_id from public.profiles where id = (select auth.uid())
    )
  );

create policy "Farms: manageable by admins"
  on public.farms for all
  using (
    organization_id in (
      select organization_id from public.profiles where id = (select auth.uid())
    )
    and public.is_admin()
  );

-- ─────────────────────────────────────────────────────────────────────
-- Farm houses: scoped through farm
-- ─────────────────────────────────────────────────────────────────────
create policy "Farm houses: readable by org members"
  on public.farm_houses for select
  using (
    exists (
      select 1 from public.farms f
      join public.profiles p on p.organization_id = f.organization_id
      where f.id = farm_houses.farm_id
        and p.id = (select auth.uid())
        and p.status = 'active'
    )
  );

create policy "Farm houses: manageable by admins"
  on public.farm_houses for all
  using (
    exists (
      select 1 from public.farms f
      join public.profiles p on p.organization_id = f.organization_id
      where f.id = farm_houses.farm_id
        and p.id = (select auth.uid())
        and p.status = 'active'
    )
    and public.is_admin()
  );

-- ─────────────────────────────────────────────────────────────────────
-- Audit templates: readable by org members
-- ─────────────────────────────────────────────────────────────────────
create policy "Audit templates: readable by org members"
  on public.audit_templates for select
  using (
    organization_id in (
      select organization_id from public.profiles where id = (select auth.uid())
    )
  );

create policy "Audit templates: manageable by admins"
  on public.audit_templates for all
  using (
    organization_id in (
      select organization_id from public.profiles where id = (select auth.uid())
    )
    and public.is_admin()
  );

-- ─────────────────────────────────────────────────────────────────────
-- Audit categories & questions: readable by org members
-- ─────────────────────────────────────────────────────────────────────
create policy "Audit categories: readable by org members"
  on public.audit_categories for select
  using (
    exists (
      select 1 from public.audit_templates t
      join public.profiles p on p.organization_id = t.organization_id
      where t.id = audit_categories.template_id
        and p.id = (select auth.uid())
        and p.status = 'active'
    )
  );

create policy "Audit categories: manageable by admins"
  on public.audit_categories for all
  using (public.is_admin());

create policy "Audit questions: readable by org members"
  on public.audit_questions for select
  using (
    exists (
      select 1 from public.audit_categories c
      join public.audit_templates t on t.id = c.template_id
      join public.profiles p on p.organization_id = t.organization_id
      where c.id = audit_questions.category_id
        and p.id = (select auth.uid())
        and p.status = 'active'
    )
  );

create policy "Audit questions: manageable by admins"
  on public.audit_questions for all
  using (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────
-- Audits: readable by auditors (assigned) and org members
-- ─────────────────────────────────────────────────────────────────────
create policy "Audits: readable by assigned or org members"
  on public.audits for select
  using (
    organization_id in (
      select organization_id from public.profiles where id = (select auth.uid())
    )
  );

create policy "Audits: creatable by auditors/admins"
  on public.audits for insert
  with check (
    public.is_auditor()
    and organization_id in (
      select organization_id from public.profiles where id = (select auth.uid())
    )
  );

create policy "Audits: updatable by assigned or admins"
  on public.audits for update
  using (
    (
      auditor_id = (select auth.uid())
      or public.is_admin()
    )
    and organization_id in (
      select organization_id from public.profiles where id = (select auth.uid())
    )
  );

-- ─────────────────────────────────────────────────────────────────────
-- Audit responses: scoped through audit
-- ─────────────────────────────────────────────────────────────────────
create policy "Audit responses: readable by audit participants"
  on public.audit_responses for select
  using (
    exists (
      select 1 from public.audits a
      where a.id = audit_responses.audit_id
        and (a.auditor_id = (select auth.uid()) or public.is_admin())
    )
  );

create policy "Audit responses: insertable by assigned auditor"
  on public.audit_responses for insert
  with check (
    exists (
      select 1 from public.audits a
      where a.id = audit_responses.audit_id
        and a.auditor_id = (select auth.uid())
    )
  );

create policy "Audit responses: updatable by assigned auditor"
  on public.audit_responses for update
  using (
    exists (
      select 1 from public.audits a
      where a.id = audit_responses.audit_id
        and a.auditor_id = (select auth.uid())
    )
  );

-- ─────────────────────────────────────────────────────────────────────
-- Findings: scoped through audit
-- ─────────────────────────────────────────────────────────────────────
create policy "Findings: readable by org members"
  on public.findings for select
  using (
    exists (
      select 1 from public.audits a
      join public.profiles p on p.organization_id = a.organization_id
      where a.id = findings.audit_id
        and p.id = (select auth.uid())
        and p.status = 'active'
    )
  );

create policy "Findings: creatable by auditors"
  on public.findings for insert
  with check (public.is_auditor());

create policy "Findings: updatable by auditors/admins"
  on public.findings for update
  using (public.is_auditor());

-- ─────────────────────────────────────────────────────────────────────
-- Corrective actions: scoped through finding
-- ─────────────────────────────────────────────────────────────────────
create policy "Corrective actions: readable by org members"
  on public.corrective_actions for select
  using (
    exists (
      select 1 from public.findings fn
      join public.audits a on a.id = fn.audit_id
      join public.profiles p on p.organization_id = a.organization_id
      where fn.id = corrective_actions.finding_id
        and p.id = (select auth.uid())
        and p.status = 'active'
    )
  );

create policy "Corrective actions: manageable by auditors/admins"
  on public.corrective_actions for all
  using (public.is_auditor());

-- ─────────────────────────────────────────────────────────────────────
-- Evidence: scoped through audit
-- ─────────────────────────────────────────────────────────────────────
create policy "Evidence: readable by audit participants"
  on public.evidence for select
  using (
    exists (
      select 1 from public.audits a
      join public.profiles p on p.organization_id = a.organization_id
      where a.id = evidence.audit_id
        and p.id = (select auth.uid())
        and p.status = 'active'
    )
  );

create policy "Evidence: insertable by auditors"
  on public.evidence for insert
  with check (public.is_auditor());

create policy "Evidence: deletable by uploader or admins"
  on public.evidence for delete
  using (
    uploaded_by = (select auth.uid())
    or public.is_admin()
  );

-- ─────────────────────────────────────────────────────────────────────
-- Audit comments: scoped through audit
-- ─────────────────────────────────────────────────────────────────────
create policy "Audit comments: readable by org members"
  on public.audit_comments for select
  using (
    exists (
      select 1 from public.audits a
      join public.profiles p on p.organization_id = a.organization_id
      where a.id = audit_comments.audit_id
        and p.id = (select auth.uid())
        and p.status = 'active'
    )
  );

create policy "Audit comments: insertable by org members"
  on public.audit_comments for insert
  with check (
    user_id = (select auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────
-- Notifications: user-scoped
-- ─────────────────────────────────────────────────────────────────────
create policy "Notifications: user-scoped"
  on public.notifications for all
  using (user_id = (select auth.uid()));

-- ─────────────────────────────────────────────────────────────────────
-- Activity logs: org-scoped, immutable for non-admins
-- ─────────────────────────────────────────────────────────────────────
create policy "Activity logs: readable by org members"
  on public.activity_logs for select
  using (
    organization_id in (
      select organization_id from public.profiles where id = (select auth.uid())
    )
  );

create policy "Activity logs: insertable by authenticated users"
  on public.activity_logs for insert
  with check (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid())
        and status = 'active'
    )
  );

-- ─────────────────────────────────────────────────────────────────────
-- Storage policies
-- ─────────────────────────────────────────────────────────────────────

-- Audit evidence: authenticated users can upload, only org members can read
create policy "Evidence uploads: authenticated users"
  on storage.objects for insert
  with check (
    bucket_id = 'audit-evidence'
    and auth.role() = 'authenticated'
  );

create policy "Evidence reads: authenticated users"
  on storage.objects for select
  using (
    bucket_id = 'audit-evidence'
    and auth.role() = 'authenticated'
  );

create policy "Evidence deletes: uploader or admin"
  on storage.objects for delete
  using (
    bucket_id = 'audit-evidence'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.is_admin()
    )
  );

-- Avatars: public read, authenticated upload
create policy "Avatar reads: public"
  on storage.objects for select
  using (bucket_id = 'user-avatars');

create policy "Avatar uploads: authenticated"
  on storage.objects for insert
  with check (
    bucket_id = 'user-avatars'
    and auth.role() = 'authenticated'
  );

create policy "Avatar updates: owner"
  on storage.objects for update
  using (
    bucket_id = 'user-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ═══════════════════════════════════════════════════════════════════════
-- 7. HELPER FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════

-- Generate next audit number for an organization
create or replace function public.generate_audit_number(p_organization_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year int := extract(year from now());
  v_count int;
  v_number text;
begin
  select count(*) + 1 into v_count
  from public.audits
  where organization_id = p_organization_id
    and extract(year from created_at) = v_year;

  v_number := format('AUD-%s-%s', v_year, lpad(v_count::text, 5, '0'));
  return v_number;
end;
$$;

-- Generate next finding number for an audit
create or replace function public.generate_finding_number(p_audit_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  select count(*) + 1 into v_count
  from public.findings
  where audit_id = p_audit_id;

  return format('FND-%s', lpad(v_count::text, 4, '0'));
end;
$$;

-- Calculate audit overall score from responses
create or replace function public.calculate_audit_score(p_audit_id uuid)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_earned numeric := 0;
  v_max numeric := 0;
  v_score numeric;
begin
  select
    coalesce(sum(ar.score * q.weight), 0),
    coalesce(sum(q.max_score * q.weight), 0)
  into v_earned, v_max
  from public.audit_responses ar
  join public.audit_questions q on q.id = ar.question_id
  where ar.audit_id = p_audit_id
    and ar.score is not null;

  if v_max = 0 then
    return null;
  end if;

  v_score := (v_earned / v_max) * 100;
  return round(v_score::numeric, 2);
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 8. GRANTS
-- ═══════════════════════════════════════════════════════════════════════

-- Grant usage to authenticated and anonymous roles
grant usage on schema public to postgres, anon, authenticated, service_role;

-- Grant select on views to authenticated users
grant select on public.v_audit_summary to authenticated;
grant select on public.v_finding_summary to authenticated;
grant select on public.v_overdue_corrective_actions to authenticated;

-- Grant execute on helper functions to authenticated users
grant execute on function public.generate_audit_number(uuid) to authenticated;
grant execute on function public.generate_finding_number(uuid) to authenticated;
grant execute on function public.calculate_audit_score(uuid) to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_auditor() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- END OF MIGRATION
-- ═══════════════════════════════════════════════════════════════════════
