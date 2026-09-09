-- Phase 1A: Database Performance Optimizations
-- AgriTrace Audit - Farm Audit Management System
-- Migration: 00002_performance_optimizations.sql
--
-- This migration adds critical performance optimizations for scale:
-- - Composite indexes for common query patterns
-- - Partial indexes for active records
-- - JSONB indexes for flexible queries
-- - Reporting indexes for analytics
--
-- These optimizations enable the database to handle:
-- - 1,000+ farms
-- - 10,000+ users
-- - 1,000,000+ audit responses
-- - Large evidence volumes

-- ═══════════════════════════════════════════════════════════════════════
-- 1. COMPOSITE INDEXES (Multi-column queries)
-- ═══════════════════════════════════════════════════════════════════════

-- Audits: Dashboard and calendar queries
-- Common pattern: WHERE org_id = ? AND status = ? ORDER BY scheduled_date
create index if not exists idx_audits_org_status_date
  on public.audits (organization_id, status, scheduled_date desc);

-- Audits: Farm-specific queries
-- Common pattern: WHERE farm_id = ? AND status = ? ORDER BY scheduled_date
create index if not exists idx_audits_farm_status_date
  on public.audits (farm_id, status, scheduled_date desc);

-- Audits: Auditor workload queries
-- Common pattern: WHERE auditor_id = ? AND status = ? ORDER BY scheduled_date
create index if not exists idx_audits_auditor_status_date
  on public.audits (auditor_id, status, scheduled_date desc);

-- Findings: Severity and status queries
-- Common pattern: WHERE audit_id = ? AND status = ? AND severity = ?
create index if not exists idx_findings_audit_status_severity
  on public.findings (audit_id, status, severity);

-- Findings: Organization-wide finding queries
-- Common pattern: WHERE org_id = ? (via audit) AND status = ? ORDER BY created_at
create index if not exists idx_findings_status_created
  on public.findings (status, created_at desc);

-- Corrective actions: Overdue queries
-- Common pattern: WHERE status = ? AND due_date < CURRENT_DATE
create index if not exists idx_corrective_actions_status_due
  on public.corrective_actions (status, due_date);

-- Corrective actions: Responsible person queries
-- Common pattern: WHERE responsible_person = ? AND status = ? ORDER BY due_date
create index if not exists idx_corrective_actions_responsible_status
  on public.corrective_actions (responsible_person, status, due_date);

-- Audit responses: Bulk queries
-- Common pattern: WHERE audit_id = ? AND score IS NOT NULL
create index if not exists idx_audit_responses_audit_score
  on public.audit_responses (audit_id, score)
  where score is not null;

-- Audit responses: Question-specific queries
-- Common pattern: WHERE question_id = ? AND audit_id = ?
create index if not exists idx_audit_responses_question_audit
  on public.audit_responses (question_id, audit_id);

-- Evidence: Audit-specific queries
-- Common pattern: WHERE audit_id = ? ORDER BY uploaded_at DESC
create index if not exists idx_evidence_audit_uploaded
  on public.evidence (audit_id, uploaded_at desc);

-- Evidence: Finding-specific queries
-- Common pattern: WHERE finding_id = ? ORDER BY uploaded_at DESC
create index if not exists idx_evidence_finding_uploaded
  on public.evidence (finding_id, uploaded_at desc)
  where finding_id is not null;

-- Notifications: User-specific queries
-- Common pattern: WHERE user_id = ? AND is_read = ? ORDER BY created_at DESC
create index if not exists idx_notifications_user_read_created
  on public.notifications (user_id, is_read, created_at desc);

-- Activity logs: Entity-specific queries
-- Common pattern: WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC
create index if not exists idx_activity_logs_entity_created
  on public.activity_logs (entity_type, entity_id, created_at desc);

-- Activity logs: Organization-specific queries
-- Common pattern: WHERE organization_id = ? ORDER BY created_at DESC
create index if not exists idx_activity_logs_org_created
  on public.activity_logs (organization_id, created_at desc);

-- ═══════════════════════════════════════════════════════════════════════
-- 2. PARTIAL INDEXES (Active records only)
-- ═══════════════════════════════════════════════════════════════════════

-- Active audits only (exclude cancelled and completed)
-- Reduces index size by ~30-40%
create index if not exists idx_audits_active
  on public.audits (organization_id, scheduled_date desc)
  where status not in ('cancelled', 'completed');

-- Open findings only (exclude closed and verified)
-- Reduces index size by ~50-60%
create index if not exists idx_findings_open
  on public.findings (audit_id, severity)
  where status not in ('closed', 'verified');

-- Critical and major findings (high priority)
-- Small index for critical queries
create index if not exists idx_findings_critical_major
  on public.findings (audit_id, created_at desc)
  where severity in ('critical', 'major');

-- Overdue corrective actions
-- Small index for urgent queries
create index if not exists idx_corrective_actions_overdue
  on public.corrective_actions (due_date, responsible_person)
  where status not in ('closed', 'verified')
    and due_date < current_date;

-- Unread notifications
-- Reduces index size by ~70-80%
create index if not exists idx_notifications_unread
  on public.notifications (user_id, created_at desc)
  where is_read = false;

-- Recent notifications (last 30 days)
-- For notification center
create index if not exists idx_notifications_recent
  on public.notifications (user_id, created_at desc)
  where created_at > (current_date - interval '30 days');

-- Active farms only
create index if not exists idx_farms_active
  on public.farms (organization_id, farm_name)
  where status = 'active';

-- Active templates only
create index if not exists idx_audit_templates_active
  on public.audit_templates (organization_id, audit_type)
  where status = 'active';

-- Active questions only
create index if not exists idx_audit_questions_active_category
  on public.audit_questions (category_id, sequence)
  where active = true;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. JSONB INDEXES (Flexible data queries)
-- ═══════════════════════════════════════════════════════════════════════

-- Farm location queries (GPS coordinates, region, etc.)
-- Enables fast location-based queries
create index if not exists idx_farms_location_gin
  on public.farms using gin (location);

-- Audit response data queries
-- Enables fast response data searches
create index if not exists idx_audit_responses_response_gin
  on public.audit_responses using gin (response);

-- Activity log old data queries
-- Enables fast change tracking searches
create index if not exists idx_activity_logs_old_data_gin
  on public.activity_logs using gin (old_data);

-- Activity log new data queries
-- Enables fast change tracking searches
create index if not exists idx_activity_logs_new_data_gin
  on public.activity_logs using gin (new_data);

-- ═══════════════════════════════════════════════════════════════════════
-- 4. REPORTING INDEXES (Analytics and exports)
-- ═══════════════════════════════════════════════════════════════════════

-- Date range queries for reports
create index if not exists idx_audits_org_date
  on public.audits (organization_id, scheduled_date desc);

create index if not exists idx_findings_created_severity
  on public.findings (created_at desc, severity);

create index if not exists idx_corrective_actions_created_status
  on public.corrective_actions (created_at desc, status);

-- Aggregation queries
create index if not exists idx_audits_completed_score
  on public.audits (organization_id, completed_at desc, overall_score)
  where status = 'completed' and overall_score is not null;

-- Farm performance queries
create index if not exists idx_audits_farm_completed
  on public.audits (farm_id, completed_at desc)
  where status = 'completed';

-- Auditor performance queries
create index if not exists idx_audits_auditor_completed
  on public.audits (auditor_id, completed_at desc)
  where status = 'completed' and auditor_id is not null;

-- ═══════════════════════════════════════════════════════════════════════
-- 5. COVERING INDEXES (Index-only scans)
-- ═══════════════════════════════════════════════════════════════════════

-- Dashboard KPI queries (avoid table lookups)
create index if not exists idx_audits_dashboard_kpi
  on public.audits (organization_id, status, scheduled_date)
  include (farm_id, overall_score, risk_level);

-- Finding summary queries
create index if not exists idx_findings_summary
  on public.findings (audit_id, status, severity)
  include (finding_number, title, created_at);

-- Corrective action summary queries
create index if not exists idx_corrective_actions_summary
  on public.corrective_actions (finding_id, status, due_date)
  include (responsible_person, verification_status);

-- ═══════════════════════════════════════════════════════════════════════
-- 6. OPTIMIZED VIEWS (Replace correlated subqueries)
-- ═══════════════════════════════════════════════════════════════════════

-- Drop old views
drop view if exists public.v_audit_summary;
drop view if exists public.v_finding_summary;

-- Recreate v_audit_summary with LATERAL joins (faster than correlated subqueries)
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
  coalesce(fc.findings_count, 0) as findings_count,
  coalesce(fc.open_findings_count, 0) as open_findings_count
from public.audits a
join public.farms f on f.id = a.farm_id
join public.audit_templates t on t.id = a.template_id
left join public.profiles p on p.id = a.auditor_id
left join lateral (
  select
    count(*) as findings_count,
    count(*) filter (where status not in ('closed', 'verified')) as open_findings_count
  from public.findings fn
  where fn.audit_id = a.id
) fc on true;

-- Recreate v_finding_summary with LATERAL joins
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
  coalesce(cac.ca_count, 0) as ca_count,
  coalesce(cac.open_ca_count, 0) as open_ca_count
from public.findings fn
join public.audits a on a.id = fn.audit_id
join public.farms f on f.id = a.farm_id
left join public.profiles p on p.id = fn.created_by
left join lateral (
  select
    count(*) as ca_count,
    count(*) filter (where status not in ('closed', 'verified')) as open_ca_count
  from public.corrective_actions ca
  where ca.finding_id = fn.id
) cac on true;

-- ═══════════════════════════════════════════════════════════════════════
-- 7. MATERIALIZED VIEWS (For expensive aggregations)
-- ═══════════════════════════════════════════════════════════════════════

-- Materialized view for dashboard KPIs
-- Refresh periodically (e.g., every 5 minutes)
create materialized view if not exists public.mv_dashboard_kpi as
select
  o.id as organization_id,
  o.name as organization_name,
  count(distinct f.id) as total_farms,
  count(distinct a.id) filter (where a.scheduled_date >= date_trunc('month', current_date)) as audits_this_month,
  count(distinct a.id) filter (where a.status = 'completed') as completed_audits,
  count(distinct a.id) filter (where a.status in ('draft', 'scheduled', 'in_progress')) as active_audits,
  avg(a.overall_score) filter (where a.status = 'completed' and a.overall_score is not null) as avg_compliance_score,
  count(distinct fn.id) filter (where fn.status not in ('closed', 'verified')) as open_findings,
  count(distinct fn.id) filter (where fn.severity = 'critical' and fn.status not in ('closed', 'verified')) as critical_findings,
  count(distinct ca.id) filter (where ca.status not in ('closed', 'verified') and ca.due_date < current_date) as overdue_actions
from public.organizations o
left join public.farms f on f.organization_id = o.id
left join public.audits a on a.organization_id = o.id
left join public.findings fn on fn.audit_id = a.id
left join public.corrective_actions ca on ca.finding_id = fn.id
group by o.id, o.name
with data;

-- Index on materialized view
create unique index if not exists idx_mv_dashboard_kpi_org
  on public.mv_dashboard_kpi (organization_id);

-- Function to refresh materialized view
create or replace function public.refresh_dashboard_kpi()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  refresh materialized view concurrent public.mv_dashboard_kpi;
end;
$$;

-- Grant execute on refresh function
grant execute on function public.refresh_dashboard_kpi() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 8. HELPER FUNCTIONS FOR PERFORMANCE
-- ═══════════════════════════════════════════════════════════════════════

-- Function to get audit statistics (optimized)
create or replace function public.get_audit_statistics(p_organization_id uuid)
returns table (
  total_audits bigint,
  completed_audits bigint,
  avg_score numeric,
  total_findings bigint,
  open_findings bigint,
  critical_findings bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select
    count(*) as total_audits,
    count(*) filter (where status = 'completed') as completed_audits,
    avg(overall_score) filter (where status = 'completed' and overall_score is not null) as avg_score,
    (select count(*) from public.findings fn join public.audits a on a.id = fn.audit_id where a.organization_id = p_organization_id) as total_findings,
    (select count(*) from public.findings fn join public.audits a on a.id = fn.audit_id where a.organization_id = p_organization_id and fn.status not in ('closed', 'verified')) as open_findings,
    (select count(*) from public.findings fn join public.audits a on a.id = fn.audit_id where a.organization_id = p_organization_id and fn.severity = 'critical' and fn.status not in ('closed', 'verified')) as critical_findings
  from public.audits
  where organization_id = p_organization_id;
end;
$$;

-- Grant execute
grant execute on function public.get_audit_statistics(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 9. GRANTS FOR NEW OBJECTS
-- ═══════════════════════════════════════════════════════════════════════

-- Grant select on materialized view
grant select on public.mv_dashboard_kpi to authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- END OF MIGRATION
-- ═══════════════════════════════════════════════════════════════════════
