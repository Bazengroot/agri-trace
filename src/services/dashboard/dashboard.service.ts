// @ts-nocheck
/**
 * Dashboard Service
 * Enterprise-grade dashboard analytics with real-time data from Supabase
 */

import { supabase } from '../../lib/supabase';

export interface DashboardKPIs {
  totalFarms: number;
  activeAudits: number;
  completedAudits: number;
  averageAuditScore: number | null;
  criticalFindings: number;
  openFindings: number;
  overdueCorrectiveActions: number;
}

export interface TrendDataPoint {
  date: string;
  value: number;
}

export interface FarmRanking {
  farmId: string;
  farmName: string;
  farmCode: string;
  auditScore: number | null;
  criticalFindings: number;
  complianceRate: number | null;
  overdueFindings: number;
  rank: number;
}

export interface CategoryPerformance {
  categoryId: string;
  categoryName: string;
  averageScore: number | null;
  totalAudits: number;
  complianceRate: number | null;
  trend: number; // percentage change
}

export interface HeatmapCell {
  farmId: string;
  farmName: string;
  categoryId: string;
  categoryName: string;
  score: number | null;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface DashboardData {
  kpis: DashboardKPIs;
  auditScoreTrend: TrendDataPoint[];
  farmPerformance: TrendDataPoint[];
  findingTrend: TrendDataPoint[];
  caClosureTrend: TrendDataPoint[];
  farmRankings: FarmRanking[];
  categoryPerformance: CategoryPerformance[];
  heatmap: HeatmapCell[];
}

/**
 * Get dashboard KPIs for an organization
 */
export async function getDashboardKPIs(organizationId: string): Promise<DashboardKPIs> {
  // Get farm count
  const { count: totalFarms } = await supabase
    .from('farms')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('status', 'active');

  // Get audit counts
  const auditStatsResult = await (supabase
    .from('audits')
    .select('status, overall_score')
    .eq('organization_id', organizationId) as any);
  const auditStats = auditStatsResult.data as Array<{ status: string; overall_score: number | null }> | null;

  const activeAudits = auditStats?.filter(
    (a) => a.status === 'in_progress' || a.status === 'scheduled'
  ).length || 0;

  const completedAudits = auditStats?.filter((a) => a.status === 'completed').length || 0;

  const scores = auditStats
    ?.map((a) => a.overall_score)
    .filter((s): s is number => s !== null) || [];

  const averageAuditScore =
    scores.length > 0 ? scores.reduce((sum, s) => sum + s, 0) / scores.length : null;

  // Get finding counts
  const { data: auditIds } = await supabase
    .from('audits')
    .select('id')
    .eq('organization_id', organizationId);

  const { data: findings } = await supabase
    .from('findings')
    .select('severity, status, due_date')
    .in('audit_id', auditIds?.map((a) => a.id) || []);

  const criticalFindings = findings?.filter((f) => f.severity === 'critical').length || 0;
  const openFindings = findings?.filter(
    (f) => f.status === 'open' || f.status === 'assigned' || f.status === 'in_progress'
  ).length || 0;

  // Get overdue corrective actions
  const now = new Date().toISOString();
  const { data: overdueCAs } = await supabase
    .from('corrective_actions')
    .select('id')
    .in('finding_id', findings?.map((f) => f.id) || [])
    .lt('due_date', now)
    .neq('status', 'closed');

  const overdueCorrectiveActions = overdueCAs?.length || 0;

  return {
    totalFarms: totalFarms || 0,
    activeAudits,
    completedAudits,
    averageAuditScore: averageAuditScore !== null ? Math.round(averageAuditScore * 100) / 100 : null,
    criticalFindings,
    openFindings,
    overdueCorrectiveActions,
  };
}

/**
 * Get audit score trend over time
 */
export async function getAuditScoreTrend(
  organizationId: string,
  months: number = 12
): Promise<TrendDataPoint[]> {
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);

  const { data: audits } = await supabase
    .from('audits')
    .select('completed_at, overall_score')
    .eq('organization_id', organizationId)
    .eq('status', 'completed')
    .gte('completed_at', startDate.toISOString())
    .order('completed_at', { ascending: true });

  // Group by month
  const monthlyData: Record<string, number[]> = {};

  audits?.forEach((audit) => {
    if (audit.overall_score !== null) {
      const date = new Date(audit.completed_at);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyData[key]) {
        monthlyData[key] = [];
      }
      monthlyData[key].push(audit.overall_score);
    }
  });

  // Calculate averages
  const trend: TrendDataPoint[] = Object.entries(monthlyData)
    .map(([date, scores]) => ({
      date,
      value: Math.round((scores.reduce((sum, s) => sum + s, 0) / scores.length) * 100) / 100,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return trend;
}

/**
 * Get farm performance trend
 */
export async function getFarmPerformanceTrend(
  organizationId: string,
  months: number = 12
): Promise<TrendDataPoint[]> {
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);

  const { data: audits } = await supabase
    .from('audits')
    .select('completed_at, overall_score')
    .eq('organization_id', organizationId)
    .eq('status', 'completed')
    .gte('completed_at', startDate.toISOString())
    .order('completed_at', { ascending: true });

  // Group by month
  const monthlyData: Record<string, number[]> = {};

  audits?.forEach((audit) => {
    if (audit.overall_score !== null) {
      const date = new Date(audit.completed_at);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyData[key]) {
        monthlyData[key] = [];
      }
      monthlyData[key].push(audit.overall_score);
    }
  });

  // Calculate averages
  const trend: TrendDataPoint[] = Object.entries(monthlyData)
    .map(([date, scores]) => ({
      date,
      value: Math.round((scores.reduce((sum, s) => sum + s, 0) / scores.length) * 100) / 100,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return trend;
}

/**
 * Get finding trend over time
 */
export async function getFindingTrend(
  organizationId: string,
  months: number = 12
): Promise<TrendDataPoint[]> {
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);

  const { data: auditIds } = await supabase
    .from('audits')
    .select('id')
    .eq('organization_id', organizationId);

  const { data: findings } = await supabase
    .from('findings')
    .select('created_at')
    .in('audit_id', auditIds?.map((a) => a.id) || [])
    .gte('created_at', startDate.toISOString())
    .order('created_at', { ascending: true });

  // Group by month
  const monthlyData: Record<string, number> = {};

  findings?.forEach((finding) => {
    const date = new Date(finding.created_at);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    monthlyData[key] = (monthlyData[key] || 0) + 1;
  });

  // Convert to trend
  const trend: TrendDataPoint[] = Object.entries(monthlyData)
    .map(([date, count]) => ({ date, value: count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return trend;
}

/**
 * Get corrective action closure trend
 */
export async function getCAClosureTrend(
  organizationId: string,
  months: number = 12
): Promise<TrendDataPoint[]> {
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);

  const { data: auditIds } = await supabase
    .from('audits')
    .select('id')
    .eq('organization_id', organizationId);

  const { data: findingIds } = await supabase
    .from('findings')
    .select('id')
    .in('audit_id', auditIds?.map((a) => a.id) || []);

  const { data: cas } = await supabase
    .from('corrective_actions')
    .select('completed_at')
    .in('finding_id', findingIds?.map((f) => f.id) || [])
    .eq('status', 'closed')
    .gte('completed_at', startDate.toISOString())
    .order('completed_at', { ascending: true });

  // Group by month
  const monthlyData: Record<string, number> = {};

  cas?.forEach((ca) => {
    if (ca.completed_at) {
      const date = new Date(ca.completed_at);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthlyData[key] = (monthlyData[key] || 0) + 1;
    }
  });

  // Convert to trend
  const trend: TrendDataPoint[] = Object.entries(monthlyData)
    .map(([date, count]) => ({ date, value: count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return trend;
}

/**
 * Get farm rankings
 */
export async function getFarmRankings(
  organizationId: string,
  limit: number = 10
): Promise<FarmRanking[]> {
  const { data: farms } = await supabase
    .from('farms')
    .select('id, farm_name, farm_code')
    .eq('organization_id', organizationId)
    .eq('status', 'active');

  const rankings: FarmRanking[] = [];

  for (const farm of farms || []) {
    // Get audit scores
    const { data: audits } = await supabase
      .from('audits')
      .select('overall_score, status')
      .eq('farm_id', farm.id)
      .eq('status', 'completed');

    const scores = audits?.map((a) => a.overall_score).filter((s): s is number => s !== null) || [];
    const auditScore =
      scores.length > 0 ? scores.reduce((sum, s) => sum + s, 0) / scores.length : null;

    // Get findings
    const { data: farmAuditIds } = await supabase
      .from('audits')
      .select('id')
      .eq('farm_id', farm.id);

    const { data: findings } = await supabase
      .from('findings')
      .select('severity, status, due_date')
      .in('audit_id', farmAuditIds?.map((a) => a.id) || []);

    const criticalFindings = findings?.filter((f) => f.severity === 'critical').length || 0;
    const totalFindings = findings?.length || 0;
    const closedFindings = findings?.filter((f) => f.status === 'closed').length || 0;
    const complianceRate =
      totalFindings > 0 ? (closedFindings / totalFindings) * 100 : null;

    const now = new Date().toISOString();
    const overdueFindings = findings?.filter(
      (f) => f.due_date && f.due_date < now && f.status !== 'closed'
    ).length || 0;

    rankings.push({
      farmId: farm.id,
      farmName: farm.farm_name,
      farmCode: farm.farm_code,
      auditScore: auditScore !== null ? Math.round(auditScore * 100) / 100 : null,
      criticalFindings,
      complianceRate: complianceRate !== null ? Math.round(complianceRate * 100) / 100 : null,
      overdueFindings,
      rank: 0, // Will be calculated after sorting
    });
  }

  // Sort by audit score (descending), then by critical findings (ascending)
  rankings.sort((a, b) => {
    if (a.auditScore === null && b.auditScore === null) return 0;
    if (a.auditScore === null) return 1;
    if (b.auditScore === null) return -1;
    if (a.auditScore !== b.auditScore) return b.auditScore - a.auditScore;
    return a.criticalFindings - b.criticalFindings;
  });

  // Assign ranks
  rankings.forEach((r, i) => {
    r.rank = i + 1;
  });

  return rankings.slice(0, limit);
}

/**
 * Get category performance
 */
export async function getCategoryPerformance(
  organizationId: string
): Promise<CategoryPerformance[]> {
  // Get all templates for the organization
  const { data: templates } = await supabase
    .from('audit_templates')
    .select('id')
    .eq('organization_id', organizationId);

  const templateIds = templates?.map((t) => t.id) || [];

  // Get all categories
  const { data: categories } = await supabase
    .from('audit_categories')
    .select('id, name')
    .in('template_id', templateIds);

  const performance: CategoryPerformance[] = [];

  for (const category of categories || []) {
    // Get questions for this category
    const { data: questions } = await supabase
      .from('audit_questions')
      .select('id')
      .eq('category_id', category.id);

    const questionIds = questions?.map((q) => q.id) || [];

    // Get responses for these questions
    const { data: responses } = await supabase
      .from('audit_responses')
      .select('score, audit_id')
      .in('question_id', questionIds);

    const scores = responses?.map((r) => r.score).filter((s): s is number => s !== null) || [];
    const averageScore =
      scores.length > 0 ? scores.reduce((sum, s) => sum + s, 0) / scores.length : null;

    const totalAudits = new Set(responses?.map((r) => r.audit_id)).size;
    const complianceRate =
      scores.length > 0 ? (scores.filter((s) => s >= 70).length / scores.length) * 100 : null;

    performance.push({
      categoryId: category.id,
      categoryName: category.name,
      averageScore: averageScore !== null ? Math.round(averageScore * 100) / 100 : null,
      totalAudits,
      complianceRate: complianceRate !== null ? Math.round(complianceRate * 100) / 100 : null,
      trend: 0, // TODO: Calculate trend based on historical data
    });
  }

  // Sort by average score (ascending - weakest first)
  performance.sort((a, b) => {
    if (a.averageScore === null && b.averageScore === null) return 0;
    if (a.averageScore === null) return 1;
    if (b.averageScore === null) return -1;
    return a.averageScore - b.averageScore;
  });

  return performance;
}

/**
 * Get heatmap data (Farm × Category)
 */
export async function getHeatmapData(organizationId: string): Promise<HeatmapCell[]> {
  // Get all farms
  const { data: farms } = await supabase
    .from('farms')
    .select('id, farm_name')
    .eq('organization_id', organizationId)
    .eq('status', 'active');

  // Get all categories
  const { data: templates } = await supabase
    .from('audit_templates')
    .select('id')
    .eq('organization_id', organizationId);

  const { data: categories } = await supabase
    .from('audit_categories')
    .select('id, name')
    .in('template_id', templates?.map((t) => t.id) || []);

  const heatmap: HeatmapCell[] = [];

  for (const farm of farms || []) {
    for (const category of categories || []) {
      // Get questions for this category
      const { data: questions } = await supabase
        .from('audit_questions')
        .select('id')
        .eq('category_id', category.id);

      const questionIds = questions?.map((q) => q.id) || [];

      // Get responses for these questions in this farm's audits
      const { data: farmAuditIds } = await supabase
        .from('audits')
        .select('id')
        .eq('farm_id', farm.id)
        .eq('status', 'completed');

      const { data: responses } = await supabase
        .from('audit_responses')
        .select('score')
        .in('question_id', questionIds)
        .in('audit_id', farmAuditIds?.map((a) => a.id) || []);

      const scores = responses?.map((r) => r.score).filter((s): s is number => s !== null) || [];
      const score =
        scores.length > 0 ? scores.reduce((sum, s) => sum + s, 0) / scores.length : null;

      // Determine risk level
      let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
      if (score !== null) {
        if (score >= 90) riskLevel = 'low';
        else if (score >= 75) riskLevel = 'medium';
        else if (score >= 60) riskLevel = 'high';
        else riskLevel = 'critical';
      }

      heatmap.push({
        farmId: farm.id,
        farmName: farm.farm_name,
        categoryId: category.id,
        categoryName: category.name,
        score: score !== null ? Math.round(score * 100) / 100 : null,
        riskLevel,
      });
    }
  }

  return heatmap;
}

/**
 * Get complete dashboard data
 */
export async function getDashboardData(organizationId: string): Promise<DashboardData> {
  const [
    kpis,
    auditScoreTrend,
    farmPerformance,
    findingTrend,
    caClosureTrend,
    farmRankings,
    categoryPerformance,
    heatmap,
  ] = await Promise.all([
    getDashboardKPIs(organizationId),
    getAuditScoreTrend(organizationId),
    getFarmPerformanceTrend(organizationId),
    getFindingTrend(organizationId),
    getCAClosureTrend(organizationId),
    getFarmRankings(organizationId),
    getCategoryPerformance(organizationId),
    getHeatmapData(organizationId),
  ]);

  return {
    kpis,
    auditScoreTrend,
    farmPerformance,
    findingTrend,
    caClosureTrend,
    farmRankings,
    categoryPerformance,
    heatmap,
  };
}
