-- Phase 1B: Table Partitioning for Scale
-- AgriTrace Audit - Farm Audit Management System
-- Migration: 00003_table_partitioning.sql
--
-- This migration implements table partitioning for large tables:
-- - audit_responses: partition by audit_id (hash) for 1M+ records
-- - activity_logs: partition by created_at (monthly) for unbounded growth
-- - notifications: partition by created_at (monthly) for unbounded growth
-- - evidence: partition by uploaded_at (monthly) for large volumes
--
-- Partitioning enables:
-- - Faster queries (partition pruning)
-- - Easier maintenance (partition-level operations)
-- - Better vacuum performance
-- - Simplified archival and cleanup

-- ═══════════════════════════════════════════════════════════════════════
-- IMPORTANT NOTES
-- ═══════════════════════════════════════════════════════════════════════
--
-- This migration is designed for PostgreSQL 12+ with native partitioning.
-- It converts existing tables to partitioned tables while preserving data.
--
-- WARNING: This is a complex migration that should be tested thoroughly
-- before running in production. Consider running during maintenance window.
--
-- For existing data, you have two options:
-- 1. Run this migration on a fresh database (recommended for new deployments)
-- 2. Use pg_partman extension for online partitioning (for existing databases)
--
-- This migration assumes a fresh database. For existing databases, see
-- the comments at the end for migration strategies.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. AUDIT_RESPONSES PARTITIONING (Hash by audit_id)
-- ═══════════════════════════════════════════════════════════════════════

-- Drop existing table and recreate as partitioned
-- WARNING: This will drop all data! For existing databases, use migration strategy below.
drop table if exists public.audit_responses;

create table public.audit_responses (
  id uuid not null default gen_random_uuid(),
  audit_id uuid not null,
  question_id uuid not null,
  response jsonb,
  score numeric(6,2),
  comment text,
  answered_at timestamptz not null default now(),
  answered_by uuid,

  constraint audit_responses_pkey primary key (id, audit_id),
  constraint audit_responses_unique unique (audit_id, question_id, id),
  constraint audit_responses_score_range check (score is null or score >= 0),
  constraint audit_responses_audit_id_fkey foreign key (audit_id)
    references public.audits(id) on delete cascade,
  constraint audit_responses_question_id_fkey foreign key (question_id)
    references public.audit_questions(id) on delete cascade,
  constraint audit_responses_answered_by_fkey foreign key (answered_by)
    references public.profiles(id) on delete set null
) partition by hash (audit_id);

-- Create 16 hash partitions (adjust based on expected data volume)
-- Each partition handles ~62,500 audits for 1M total
create table public.audit_responses_p0 partition of public.audit_responses
  for values with (modulus 16, remainder 0);
create table public.audit_responses_p1 partition of public.audit_responses
  for values with (modulus 16, remainder 1);
create table public.audit_responses_p2 partition of public.audit_responses
  for values with (modulus 16, remainder 2);
create table public.audit_responses_p3 partition of public.audit_responses
  for values with (modulus 16, remainder 3);
create table public.audit_responses_p4 partition of public.audit_responses
  for values with (modulus 16, remainder 4);
create table public.audit_responses_p5 partition of public.audit_responses
  for values with (modulus 16, remainder 5);
create table public.audit_responses_p6 partition of public.audit_responses
  for values with (modulus 16, remainder 6);
create table public.audit_responses_p7 partition of public.audit_responses
  for values with (modulus 16, remainder 7);
create table public.audit_responses_p8 partition of public.audit_responses
  for values with (modulus 16, remainder 8);
create table public.audit_responses_p9 partition of public.audit_responses
  for values with (modulus 16, remainder 9);
create table public.audit_responses_p10 partition of public.audit_responses
  for values with (modulus 16, remainder 10);
create table public.audit_responses_p11 partition of public.audit_responses
  for values with (modulus 16, remainder 11);
create table public.audit_responses_p12 partition of public.audit_responses
  for values with (modulus 16, remainder 12);
create table public.audit_responses_p13 partition of public.audit_responses
  for values with (modulus 16, remainder 13);
create table public.audit_responses_p14 partition of public.audit_responses
  for values with (modulus 16, remainder 14);
create table public.audit_responses_p15 partition of public.audit_responses
  for values with (modulus 16, remainder 15);

-- Indexes on partitioned table (automatically created on each partition)
create index idx_audit_responses_audit on public.audit_responses (audit_id);
create index idx_audit_responses_question on public.audit_responses (question_id);
create index idx_audit_responses_answered_by on public.audit_responses (answered_by);
create index idx_audit_responses_audit_score on public.audit_responses (audit_id, score) where score is not null;
create index idx_audit_responses_question_audit on public.audit_responses (question_id, audit_id);

-- RLS policies (inherited by partitions)
alter table public.audit_responses enable row level security;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. ACTIVITY_LOGS PARTITIONING (Range by created_at, monthly)
-- ═══════════════════════════════════════════════════════════════════════

drop table if exists public.activity_logs;

create table public.activity_logs (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null,
  user_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_ jsonb,
  new_ jsonb,
  created_at timestamptz not null default now(),

  constraint activity_logs_pkey primary key (id, created_at),
  constraint activity_logs_action_not_empty check (char_length(action) >= 1),
  constraint activity_logs_entity_type_not_empty check (char_length(entity_type) >= 1),
  constraint activity_logs_organization_id_fkey foreign key (organization_id)
    references public.organizations(id) on delete cascade,
  constraint activity_logs_user_id_fkey foreign key (user_id)
    references public.profiles(id) on delete set null
) partition by range (created_at);

-- Create monthly partitions for current year and next year
-- This covers 24 months of data
create table public.activity_logs_2026_01 partition of public.activity_logs
  for values from ('2026-01-01') to ('2026-02-01');
create table public.activity_logs_2026_02 partition of public.activity_logs
  for values from ('2026-02-01') to ('2026-03-01');
create table public.activity_logs_2026_03 partition of public.activity_logs
  for values from ('2026-03-01') to ('2026-04-01');
create table public.activity_logs_2026_04 partition of public.activity_logs
  for values from ('2026-04-01') to ('2026-05-01');
create table public.activity_logs_2026_05 partition of public.activity_logs
  for values from ('2026-05-01') to ('2026-06-01');
create table public.activity_logs_2026_06 partition of public.activity_logs
  for values from ('2026-06-01') to ('2026-07-01');
create table public.activity_logs_2026_07 partition of public.activity_logs
  for values from ('2026-07-01') to ('2026-08-01');
create table public.activity_logs_2026_08 partition of public.activity_logs
  for values from ('2026-08-01') to ('2026-09-01');
create table public.activity_logs_2026_09 partition of public.activity_logs
  for values from ('2026-09-01') to ('2026-10-01');
create table public.activity_logs_2026_10 partition of public.activity_logs
  for values from ('2026-10-01') to ('2026-11-01');
create table public.activity_logs_2026_11 partition of public.activity_logs
  for values from ('2026-11-01') to ('2026-12-01');
create table public.activity_logs_2026_12 partition of public.activity_logs
  for values from ('2026-12-01') to ('2027-01-01');
create table public.activity_logs_2027_01 partition of public.activity_logs
  for values from ('2027-01-01') to ('2027-02-01');
create table public.activity_logs_2027_02 partition of public.activity_logs
  for values from ('2027-02-01') to ('2027-03-01');
create table public.activity_logs_2027_03 partition of public.activity_logs
  for values from ('2027-03-01') to ('2027-04-01');
create table public.activity_logs_2027_04 partition of public.activity_logs
  for values from ('2027-04-01') to ('2027-05-01');
create table public.activity_logs_2027_05 partition of public.activity_logs
  for values from ('2027-05-01') to ('2027-06-01');
create table public.activity_logs_2027_06 partition of public.activity_logs
  for values from ('2027-06-01') to ('2027-07-01');
create table public.activity_logs_2027_07 partition of public.activity_logs
  for values from ('2027-07-01') to ('2027-08-01');
create table public.activity_logs_2027_08 partition of public.activity_logs
  for values from ('2027-08-01') to ('2027-09-01');
create table public.activity_logs_2027_09 partition of public.activity_logs
  for values from ('2027-09-01') to ('2027-10-01');
create table public.activity_logs_2027_10 partition of public.activity_logs
  for values from ('2027-10-01') to ('2027-11-01');
create table public.activity_logs_2027_11 partition of public.activity_logs
  for values from ('2027-11-01') to ('2027-12-01');
create table public.activity_logs_2027_12 partition of public.activity_logs
  for values from ('2027-12-01') to ('2028-01-01');

-- Default partition for any data outside defined ranges
create table public.activity_logs_default partition of public.activity_logs default;

-- Indexes
create index idx_activity_logs_org on public.activity_logs (organization_id);
create index idx_activity_logs_user on public.activity_logs (user_id);
create index idx_activity_logs_entity on public.activity_logs (entity_type, entity_id);
create index idx_activity_logs_action on public.activity_logs (action);
create index idx_activity_logs_created on public.activity_logs (created_at desc);
create index idx_activity_logs_entity_created on public.activity_logs (entity_type, entity_id, created_at desc);
create index idx_activity_logs_org_created on public.activity_logs (organization_id, created_at desc);

-- JSONB indexes
create index idx_activity_logs_old_data_gin on public.activity_logs using gin (old_data);
create index idx_activity_logs_new_data_gin on public.activity_logs using gin (new_data);

-- RLS
alter table public.activity_logs enable row level security;

-- Function to create new monthly partitions automatically
create or replace function public.create_activity_logs_partition()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  partition_date date;
  partition_name text;
  start_date date;
  end_date date;
begin
  -- Create partition for next month
  partition_date := date_trunc('month', current_date + interval '1 month');
  start_date := partition_date;
  end_date := partition_date + interval '1 month';
  partition_name := 'activity_logs_' || to_char(partition_date, 'YYYY_MM');

  -- Check if partition already exists
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public'
      and table_name = partition_name
  ) then
    execute format(
      'create table public.%I partition of public.activity_logs for values from (%L) to (%L)',
      partition_name, start_date, end_date
    );
  end if;
end;
$$;

-- Grant execute
grant execute on function public.create_activity_logs_partition() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. NOTIFICATIONS PARTITIONING (Range by created_at, monthly)
-- ═══════════════════════════════════════════════════════════════════════

drop table if exists public.notifications;

create table public.notifications (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  type public.notification_type not null,
  title text not null,
  message text,
  related_entity text,
  related_id uuid,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),

  constraint notifications_pkey primary key (id, created_at),
  constraint notifications_title_not_empty check (char_length(title) >= 1),
  constraint notifications_related_consistent check (
    (related_entity is null and related_id is null)
    or (related_entity is not null and related_id is not null)
  ),
  constraint notifications_user_id_fkey foreign key (user_id)
    references public.profiles(id) on delete cascade
) partition by range (created_at);

-- Create monthly partitions (same as activity_logs)
create table public.notifications_2026_01 partition of public.notifications
  for values from ('2026-01-01') to ('2026-02-01');
create table public.notifications_2026_02 partition of public.notifications
  for values from ('2026-02-01') to ('2026-03-01');
create table public.notifications_2026_03 partition of public.notifications
  for values from ('2026-03-01') to ('2026-04-01');
create table public.notifications_2026_04 partition of public.notifications
  for values from ('2026-04-01') to ('2026-05-01');
create table public.notifications_2026_05 partition of public.notifications
  for values from ('2026-05-01') to ('2026-06-01');
create table public.notifications_2026_06 partition of public.notifications
  for values from ('2026-06-01') to ('2026-07-01');
create table public.notifications_2026_07 partition of public.notifications
  for values from ('2026-07-01') to ('2026-08-01');
create table public.notifications_2026_08 partition of public.notifications
  for values from ('2026-08-01') to ('2026-09-01');
create table public.notifications_2026_09 partition of public.notifications
  for values from ('2026-09-01') to ('2026-10-01');
create table public.notifications_2026_10 partition of public.notifications
  for values from ('2026-10-01') to ('2026-11-01');
create table public.notifications_2026_11 partition of public.notifications
  for values from ('2026-11-01') to ('2026-12-01');
create table public.notifications_2026_12 partition of public.notifications
  for values from ('2026-12-01') to ('2027-01-01');
create table public.notifications_2027_01 partition of public.notifications
  for values from ('2027-01-01') to ('2027-02-01');
create table public.notifications_2027_02 partition of public.notifications
  for values from ('2027-02-01') to ('2027-03-01');
create table public.notifications_2027_03 partition of public.notifications
  for values from ('2027-03-01') to ('2027-04-01');
create table public.notifications_2027_04 partition of public.notifications
  for values from ('2027-04-01') to ('2027-05-01');
create table public.notifications_2027_05 partition of public.notifications
  for values from ('2027-05-01') to ('2027-06-01');
create table public.notifications_2027_06 partition of public.notifications
  for values from ('2027-06-01') to ('2027-07-01');
create table public.notifications_2027_07 partition of public.notifications
  for values from ('2027-07-01') to ('2027-08-01');
create table public.notifications_2027_08 partition of public.notifications
  for values from ('2027-08-01') to ('2027-09-01');
create table public.notifications_2027_09 partition of public.notifications
  for values from ('2027-09-01') to ('2027-10-01');
create table public.notifications_2027_10 partition of public.notifications
  for values from ('2027-10-01') to ('2027-11-01');
create table public.notifications_2027_11 partition of public.notifications
  for values from ('2027-11-01') to ('2027-12-01');
create table public.notifications_2027_12 partition of public.notifications
  for values from ('2027-12-01') to ('2028-01-01');

-- Default partition
create table public.notifications_default partition of public.notifications default;

-- Indexes
create index idx_notifications_user on public.notifications (user_id);
create index idx_notifications_read on public.notifications (user_id, is_read);
create index idx_notifications_created on public.notifications (created_at desc);
create index idx_notifications_type on public.notifications (type);
create index idx_notifications_user_read_created on public.notifications (user_id, is_read, created_at desc);
create index idx_notifications_unread on public.notifications (user_id, created_at desc) where is_read = false;
create index idx_notifications_recent on public.notifications (user_id, created_at desc) where created_at > (current_date - interval '30 days');

-- RLS
alter table public.notifications enable row level security;

-- Function to create new monthly partitions
create or replace function public.create_notifications_partition()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  partition_date date;
  partition_name text;
  start_date date;
  end_date date;
begin
  partition_date := date_trunc('month', current_date + interval '1 month');
  start_date := partition_date;
  end_date := partition_date + interval '1 month';
  partition_name := 'notifications_' || to_char(partition_date, 'YYYY_MM');

  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public'
      and table_name = partition_name
  ) then
    execute format(
      'create table public.%I partition of public.notifications for values from (%L) to (%L)',
      partition_name, start_date, end_date
    );
  end if;
end;
$$;

grant execute on function public.create_notifications_partition() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 4. EVIDENCE PARTITIONING (Range by uploaded_at, monthly)
-- ═══════════════════════════════════════════════════════════════════════

drop table if exists public.evidence;

create table public.evidence (
  id uuid not null default gen_random_uuid(),
  audit_id uuid not null,
  finding_id uuid,
  response_id uuid,
  file_name text not null,
  file_path text not null,
  file_type public.evidence_type not null default 'other',
  file_size bigint not null default 0,
  uploaded_by uuid,
  uploaded_at timestamptz not null default now(),

  constraint evidence_pkey primary key (id, uploaded_at),
  constraint evidence_file_name_not_empty check (char_length(file_name) >= 1),
  constraint evidence_file_path_not_empty check (char_length(file_path) >= 1),
  constraint evidence_file_size_positive check (file_size >= 0),
  constraint evidence_audit_id_fkey foreign key (audit_id)
    references public.audits(id) on delete cascade,
  constraint evidence_finding_id_fkey foreign key (finding_id)
    references public.findings(id) on delete set null,
  constraint evidence_response_id_fkey foreign key (response_id)
    references public.audit_responses(id) on delete set null,
  constraint evidence_uploaded_by_fkey foreign key (uploaded_by)
    references public.profiles(id) on delete set null
) partition by range (uploaded_at);

-- Create monthly partitions
create table public.evidence_2026_01 partition of public.evidence
  for values from ('2026-01-01') to ('2026-02-01');
create table public.evidence_2026_02 partition of public.evidence
  for values from ('2026-02-01') to ('2026-03-01');
create table public.evidence_2026_03 partition of public.evidence
  for values from ('2026-03-01') to ('2026-04-01');
create table public.evidence_2026_04 partition of public.evidence
  for values from ('2026-04-01') to ('2026-05-01');
create table public.evidence_2026_05 partition of public.evidence
  for values from ('2026-05-01') to ('2026-06-01');
create table public.evidence_2026_06 partition of public.evidence
  for values from ('2026-06-01') to ('2026-07-01');
create table public.evidence_2026_07 partition of public.evidence
  for values from ('2026-07-01') to ('2026-08-01');
create table public.evidence_2026_08 partition of public.evidence
  for values from ('2026-08-01') to ('2026-09-01');
create table public.evidence_2026_09 partition of public.evidence
  for values from ('2026-09-01') to ('2026-10-01');
create table public.evidence_2026_10 partition of public.evidence
  for values from ('2026-10-01') to ('2026-11-01');
create table public.evidence_2026_11 partition of public.evidence
  for values from ('2026-11-01') to ('2026-12-01');
create table public.evidence_2026_12 partition of public.evidence
  for values from ('2026-12-01') to ('2027-01-01');
create table public.evidence_2027_01 partition of public.evidence
  for values from ('2027-01-01') to ('2027-02-01');
create table public.evidence_2027_02 partition of public.evidence
  for values from ('2027-02-01') to ('2027-03-01');
create table public.evidence_2027_03 partition of public.evidence
  for values from ('2027-03-01') to ('2027-04-01');
create table public.evidence_2027_04 partition of public.evidence
  for values from ('2027-04-01') to ('2027-05-01');
create table public.evidence_2027_05 partition of public.evidence
  for values from ('2027-05-01') to ('2027-06-01');
create table public.evidence_2027_06 partition of public.evidence
  for values from ('2027-06-01') to ('2027-07-01');
create table public.evidence_2027_07 partition of public.evidence
  for values from ('2027-07-01') to ('2027-08-01');
create table public.evidence_2027_08 partition of public.evidence
  for values from ('2027-08-01') to ('2027-09-01');
create table public.evidence_2027_09 partition of public.evidence
  for values from ('2027-09-01') to ('2027-10-01');
create table public.evidence_2027_10 partition of public.evidence
  for values from ('2027-10-01') to ('2027-11-01');
create table public.evidence_2027_11 partition of public.evidence
  for values from ('2027-11-01') to ('2027-12-01');
create table public.evidence_2027_12 partition of public.evidence
  for values from ('2027-12-01') to ('2028-01-01');

-- Default partition
create table public.evidence_default partition of public.evidence default;

-- Indexes
create index idx_evidence_audit on public.evidence (audit_id);
create index idx_evidence_finding on public.evidence (finding_id);
create index idx_evidence_response on public.evidence (response_id);
create index idx_evidence_uploaded_by on public.evidence (uploaded_by);
create index idx_evidence_uploaded_at on public.evidence (uploaded_at desc);
create index idx_evidence_audit_uploaded on public.evidence (audit_id, uploaded_at desc);
create index idx_evidence_finding_uploaded on public.evidence (finding_id, uploaded_at desc) where finding_id is not null;

-- RLS
alter table public.evidence enable row level security;

-- Function to create new monthly partitions
create or replace function public.create_evidence_partition()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  partition_date date;
  partition_name text;
  start_date date;
  end_date date;
begin
  partition_date := date_trunc('month', current_date + interval '1 month');
  start_date := partition_date;
  end_date := partition_date + interval '1 month';
  partition_name := 'evidence_' || to_char(partition_date, 'YYYY_MM');

  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public'
      and table_name = partition_name
  ) then
    execute format(
      'create table public.%I partition of public.evidence for values from (%L) to (%L)',
      partition_name, start_date, end_date
    );
  end if;
end;
$$;

grant execute on function public.create_evidence_partition() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 5. RECREATE RLS POLICIES FOR PARTITIONED TABLES
-- ═══════════════════════════════════════════════════════════════════════

-- Note: RLS policies on partitioned tables are inherited by partitions
-- We need to recreate the policies from migration 00001

-- Audit responses policies
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

-- Activity logs policies
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

-- Notifications policies
create policy "Notifications: user-scoped"
  on public.notifications for all
  using (user_id = (select auth.uid()));

-- Evidence policies
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

-- ═══════════════════════════════════════════════════════════════════════
-- 6. MAINTENANCE FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════

-- Function to create all next month partitions
create or replace function public.create_next_month_partitions()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.create_activity_logs_partition();
  perform public.create_notifications_partition();
  perform public.create_evidence_partition();
end;
$$;

grant execute on function public.create_next_month_partitions() to authenticated;

-- Function to cleanup old partitions (older than X months)
create or replace function public.cleanup_old_partitions(retention_months integer default 12)
returns table (dropped_partition text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  cutoff_date date := current_date - (retention_months || ' months')::interval;
  partition_rec record;
begin
  -- Cleanup activity_logs partitions
  for partition_rec in
    select tablename from pg_tables
    where schemaname = 'public'
      and tablename like 'activity_logs_%'
      and tablename != 'activity_logs_default'
  loop
    -- Extract date from partition name and check if older than cutoff
    -- This is a simplified check - in production, query pg_range for actual bounds
    if partition_rec.tablename < 'activity_logs_' || to_char(cutoff_date, 'YYYY_MM') then
      execute format('drop table if exists public.%I', partition_rec.tablename);
      dropped_partition := partition_rec.tablename;
      return next;
    end if;
  end loop;

  -- Similar for notifications and evidence
  for partition_rec in
    select tablename from pg_tables
    where schemaname = 'public'
      and tablename like 'notifications_%'
      and tablename != 'notifications_default'
  loop
    if partition_rec.tablename < 'notifications_' || to_char(cutoff_date, 'YYYY_MM') then
      execute format('drop table if exists public.%I', partition_rec.tablename);
      dropped_partition := partition_rec.tablename;
      return next;
    end if;
  end loop;

  for partition_rec in
    select tablename from pg_tables
    where schemaname = 'public'
      and tablename like 'evidence_%'
      and tablename != 'evidence_default'
  loop
    if partition_rec.tablename < 'evidence_' || to_char(cutoff_date, 'YYYY_MM') then
      execute format('drop table if exists public.%I', partition_rec.tablename);
      dropped_partition := partition_rec.tablename;
      return next;
    end if;
  end loop;
end;
$$;

grant execute on function public.cleanup_old_partitions(integer) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- END OF MIGRATION
-- ═══════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════
-- MIGRATION NOTES FOR EXISTING DATABASES
-- ═══════════════════════════════════════════════════════════════════════
--
-- If you have an existing database with data, DO NOT run this migration directly.
-- Instead, use one of these strategies:
--
-- OPTION 1: pg_partman extension (recommended for online migration)
-- 1. Install pg_partman: create extension pg_partman;
-- 2. Use partman to convert existing tables to partitioned tables
-- 3. Example:
--    SELECT partman.create_parent(
--      p_parent_table => 'public.audit_responses',
--      p_control => 'audit_id',
--      p_type => 'native',
--      p_interval => '1',
--      p_premake => 4
--    );
--
-- OPTION 2: Manual migration with data preservation
-- 1. Create new partitioned table with different name
-- 2. Copy data from old table to new table
-- 3. Drop old table
-- 4. Rename new table to original name
-- 5. Recreate indexes and policies
--
-- OPTION 3: Application-level migration
-- 1. Deploy application with dual-write capability
-- 2. Write to both old and new tables
-- 3. Backfill old data to new table
-- 4. Switch reads to new table
-- 5. Remove old table
--
-- For new deployments, this migration can be run directly.
