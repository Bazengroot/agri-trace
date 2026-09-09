// @ts-nocheck
/**
 * Reporting Service
 * Professional audit report generation with real Supabase data
 */

import { supabase } from '../../lib/supabase';
import { calculateAuditScoreWithWeights } from '../audit/scoring.service';

export interface AuditReport {
  // Audit Information
  auditId: string;
  auditNumber: string;
  auditDate: string;
  auditType: string;
  status: string;
  
  // Farm Information
  farm: {
    id: string;
    name: string;
    code: string;
    type: string;
    location: any;
    region: string;
  };
  
  // Auditor Information
  auditor: {
    id: string;
    name: string;
    email: string;
  } | null;
  
  // Scores
  overallScore: number | null;
  riskLevel: string;
  categoryScores: Array<{
    categoryId: string;
    categoryName: string;
    score: number | null;
    weight: number;
  }>;
  
  // Checklist Summary
  totalQuestions: number;
  answeredQuestions: number;
  complianceRate: number | null;
  
  // Findings
  findings: Array<{
    id: string;
    findingNumber: string;
    category: string;
    title: string;
    description: string;
    severity: string;
    riskLevel: string;
    status: string;
    rootCause: string;
    recommendation: string;
    evidenceCount: number;
  }>;
  
  // Corrective Actions
  correctiveActions: Array<{
    id: string;
    findingNumber: string;
    action: string;
    responsiblePerson: string;
    dueDate: string;
    status: string;
    verificationStatus: string;
  }>;
  
  // Evidence Summary
  evidenceCount: number;
  evidenceByType: Record<string, number>;
  
  // Recommendations
  recommendations: string[];
  
  // Approval Information
  approvedBy: string | null;
  approvedAt: string | null;
  closedAt: string | null;
}

export interface ReportFilters {
  organizationId: string;
  farmId?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  auditorId?: string;
}

/**
 * Generate a complete audit report
 */
export async function generateAuditReport(auditId: string): Promise<AuditReport> {
  // Get audit with all related data
  const { data: audit } = await supabase
    .from('audits')
    .select(`
      *,
      farm:farms(*),
      auditor:profiles!auditor_id(*),
      template:audit_templates(*)
    `)
    .eq('id', auditId)
    .single();

  if (!audit) {
    throw new Error('Audit not found');
  }

  // Calculate scores
  const scoreResult = await calculateAuditScoreWithWeights(auditId);

  // Get findings
  const { data: findings } = await supabase
    .from('findings')
    .select(`
      *,
      evidence:evidence(count)
    `)
    .eq('audit_id', auditId)
    .order('severity', { ascending: false });

  // Get corrective actions
  const { data: correctiveActions } = await supabase
    .from('corrective_actions')
    .select(`
      *,
      finding:findings(finding_number)
    `)
    .in('finding_id', findings?.map((f) => f.id) || []);

  // Get evidence count
  const { count: evidenceCount } = await supabase
    .from('evidence')
    .select('*', { count: 'exact', head: true })
    .eq('audit_id', auditId);

  // Get evidence by type
  const { data: evidenceByTypeRaw } = await supabase
    .from('evidence')
    .select('file_type')
    .eq('audit_id', auditId);

  const evidenceByType: Record<string, number> = {};
  evidenceByTypeRaw?.forEach((e) => {
    evidenceByType[e.file_type] = (evidenceByType[e.file_type] || 0) + 1;
  });

  // Get checklist summary
  const { data: responses } = await supabase
    .from('audit_responses')
    .select('score')
    .eq('audit_id', auditId);

  const totalQuestions = responses?.length || 0;
  const answeredQuestions = responses?.filter((r) => r.score !== null).length || 0;
  const complianceRate =
    totalQuestions > 0 ? (answeredQuestions / totalQuestions) * 100 : null;

  // Generate recommendations based on findings
  const recommendations = generateRecommendations(findings || []);

  return {
    auditId: audit.id,
    auditNumber: audit.audit_number,
    auditDate: audit.scheduled_date,
    auditType: audit.template?.audit_type || 'Unknown',
    status: audit.status,
    
    farm: {
      id: audit.farm.id,
      name: audit.farm.farm_name,
      code: audit.farm.farm_code,
      type: audit.farm.farm_type,
      location: audit.farm.location,
      region: audit.farm.region,
    },
    
    auditor: audit.auditor ? {
      id: audit.auditor.id,
      name: audit.auditor.full_name,
      email: audit.auditor.email,
    } : null,
    
    overallScore: scoreResult.overallScore,
    riskLevel: scoreResult.riskLevel,
    categoryScores: scoreResult.categoryScores,
    
    totalQuestions,
    answeredQuestions,
    complianceRate: complianceRate !== null ? Math.round(complianceRate * 100) / 100 : null,
    
    findings: (findings || []).map((f) => ({
      id: f.id,
      findingNumber: f.finding_number,
      category: f.category,
      title: f.title,
      description: f.description,
      severity: f.severity,
      riskLevel: f.risk_level,
      status: f.status,
      rootCause: f.root_cause,
      recommendation: f.recommendation,
      evidenceCount: f.evidence?.[0]?.count || 0,
    })),
    
    correctiveActions: (correctiveActions || []).map((ca) => ({
      id: ca.id,
      findingNumber: ca.finding?.finding_number || 'N/A',
      action: ca.action,
      responsiblePerson: ca.responsible_person,
      dueDate: ca.due_date,
      status: ca.status,
      verificationStatus: ca.verification_status,
    })),
    
    evidenceCount: evidenceCount || 0,
    evidenceByType,
    
    recommendations,
    
    approvedBy: audit.approved_by,
    approvedAt: audit.approved_at,
    closedAt: audit.closed_at,
  };
}

/**
 * Generate recommendations based on findings
 */
function generateRecommendations(findings: any[]): string[] {
  const recommendations: string[] = [];
  
  const criticalFindings = findings.filter((f) => f.severity === 'critical');
  const majorFindings = findings.filter((f) => f.severity === 'major');
  
  if (criticalFindings.length > 0) {
    recommendations.push(
      `Address ${criticalFindings.length} critical finding(s) immediately to prevent serious risks.`
    );
  }
  
  if (majorFindings.length > 0) {
    recommendations.push(
      `Prioritize resolution of ${majorFindings.length} major finding(s) within 30 days.`
    );
  }
  
  // Group findings by category
  const categoryCounts: Record<string, number> = {};
  findings.forEach((f) => {
    categoryCounts[f.category] = (categoryCounts[f.category] || 0) + 1;
  });
  
  const topCategory = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0];
  if (topCategory && topCategory[1] > 1) {
    recommendations.push(
      `Focus improvement efforts on "${topCategory[0]}" area which has ${topCategory[1]} findings.`
    );
  }
  
  if (findings.length === 0) {
    recommendations.push('Excellent compliance! Continue maintaining current standards.');
  }
  
  return recommendations;
}

/**
 * List audits for reporting
 */
export async function listAuditsForReporting(
  filters: ReportFilters
): Promise<any[]> {
  let query = supabase
    .from('audits')
    .select(`
      id,
      audit_number,
      scheduled_date,
      status,
      overall_score,
      risk_level,
      farm:farms(id, farm_name, farm_code),
      auditor:profiles!auditor_id(id, full_name)
    `)
    .eq('organization_id', filters.organizationId);

  if (filters.farmId) {
    query = query.eq('farm_id', filters.farmId);
  }

  if (filters.dateFrom) {
    query = query.gte('scheduled_date', filters.dateFrom);
  }

  if (filters.dateTo) {
    query = query.lte('scheduled_date', filters.dateTo);
  }

  if (filters.status) {
    query = query.eq('status', filters.status);
  }

  if (filters.auditorId) {
    query = query.eq('auditor_id', filters.auditorId);
  }

  query = query.order('scheduled_date', { ascending: false });

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list audits: ${error.message}`);
  }

  return data || [];
}

/**
 * Export report to CSV
 */
export function exportReportToCSV(report: AuditReport): string {
  const rows: string[][] = [];
  
  // Header
  rows.push(['Field', 'Value']);
  
  // Audit Information
  rows.push(['Audit Number', report.auditNumber]);
  rows.push(['Audit Date', report.auditDate]);
  rows.push(['Audit Type', report.auditType]);
  rows.push(['Status', report.status]);
  rows.push(['Overall Score', report.overallScore?.toString() || 'N/A']);
  rows.push(['Risk Level', report.riskLevel]);
  
  // Farm Information
  rows.push(['Farm Name', report.farm.name]);
  rows.push(['Farm Code', report.farm.code]);
  rows.push(['Farm Type', report.farm.type]);
  rows.push(['Region', report.farm.region || 'N/A']);
  
  // Auditor Information
  rows.push(['Auditor', report.auditor?.name || 'N/A']);
  
  // Checklist Summary
  rows.push(['Total Questions', report.totalQuestions.toString()]);
  rows.push(['Answered Questions', report.answeredQuestions.toString()]);
  rows.push(['Compliance Rate', report.complianceRate?.toString() || 'N/A']);
  
  // Findings Summary
  rows.push(['Total Findings', report.findings.length.toString()]);
  rows.push(['Critical Findings', report.findings.filter((f) => f.severity === 'critical').length.toString()]);
  rows.push(['Major Findings', report.findings.filter((f) => f.severity === 'major').length.toString()]);
  
  // Corrective Actions Summary
  rows.push(['Total Corrective Actions', report.correctiveActions.length.toString()]);
  rows.push(['Overdue Actions', report.correctiveActions.filter((ca) => new Date(ca.dueDate) < new Date() && ca.status !== 'closed').length.toString()]);
  
  // Evidence Summary
  rows.push(['Total Evidence Files', report.evidenceCount.toString()]);
  
  // Convert to CSV string
  return rows.map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');
}

/**
 * Download CSV file
 */
export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Print report
 */
export function printReport(report: AuditReport): void {
  // Create a new window for printing
  const printWindow = window.open('', '_blank');
  
  if (!printWindow) {
    throw new Error('Failed to open print window');
  }
  
  // Generate HTML content
  const html = generateReportHTML(report);
  
  printWindow.document.write(html);
  printWindow.document.close();
  
  // Wait for content to load, then print
  printWindow.onload = () => {
    printWindow.focus();
    printWindow.print();
  };
}

/**
 * Generate HTML for report
 */
function generateReportHTML(report: AuditReport): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>Audit Report - ${report.auditNumber}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    h1 { color: #1e40af; border-bottom: 2px solid #1e40af; padding-bottom: 10px; }
    h2 { color: #1e40af; margin-top: 30px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
    th { background-color: #f3f4f6; font-weight: bold; }
    .score { font-size: 24px; font-weight: bold; color: #1e40af; }
    .risk-critical { color: #dc2626; font-weight: bold; }
    .risk-high { color: #ea580c; font-weight: bold; }
    .risk-medium { color: #ca8a04; font-weight: bold; }
    .risk-low { color: #16a34a; font-weight: bold; }
    .section { margin: 30px 0; }
    .finding { background-color: #fef3c7; padding: 15px; margin: 10px 0; border-left: 4px solid #f59e0b; }
    .finding.critical { background-color: #fee2e2; border-left-color: #dc2626; }
    .finding.major { background-color: #fed7aa; border-left-color: #ea580c; }
    @media print {
      body { margin: 20px; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <h1>Audit Report: ${report.auditNumber}</h1>
  
  <div class="section">
    <h2>Audit Information</h2>
    <table>
      <tr><th>Audit Number</th><td>${report.auditNumber}</td></tr>
      <tr><th>Audit Date</th><td>${report.auditDate}</td></tr>
      <tr><th>Audit Type</th><td>${report.auditType}</td></tr>
      <tr><th>Status</th><td>${report.status}</td></tr>
    </table>
  </div>
  
  <div class="section">
    <h2>Farm Information</h2>
    <table>
      <tr><th>Farm Name</th><td>${report.farm.name}</td></tr>
      <tr><th>Farm Code</th><td>${report.farm.code}</td></tr>
      <tr><th>Farm Type</th><td>${report.farm.type}</td></tr>
      <tr><th>Region</th><td>${report.farm.region || 'N/A'}</td></tr>
    </table>
  </div>
  
  <div class="section">
    <h2>Auditor</h2>
    <p>${report.auditor?.name || 'N/A'} (${report.auditor?.email || 'N/A'})</p>
  </div>
  
  <div class="section">
    <h2>Overall Score</h2>
    <p class="score">${report.overallScore !== null ? `${report.overallScore}%` : 'N/A'}</p>
    <p>Risk Level: <span class="risk-${report.riskLevel}">${report.riskLevel.toUpperCase()}</span></p>
  </div>
  
  <div class="section">
    <h2>Category Scores</h2>
    <table>
      <tr><th>Category</th><th>Score</th><th>Weight</th></tr>
      ${report.categoryScores.map((cs) => `
        <tr>
          <td>${cs.categoryName}</td>
          <td>${cs.score !== null ? `${cs.score}%` : 'N/A'}</td>
          <td>${cs.weight}%</td>
        </tr>
      `).join('')}
    </table>
  </div>
  
  <div class="section">
    <h2>Checklist Summary</h2>
    <table>
      <tr><th>Total Questions</th><td>${report.totalQuestions}</td></tr>
      <tr><th>Answered Questions</th><td>${report.answeredQuestions}</td></tr>
      <tr><th>Compliance Rate</th><td>${report.complianceRate !== null ? `${report.complianceRate}%` : 'N/A'}</td></tr>
    </table>
  </div>
  
  <div class="section">
    <h2>Findings (${report.findings.length})</h2>
    ${report.findings.length === 0 ? '<p>No findings identified.</p>' : ''}
    ${report.findings.map((f) => `
      <div class="finding ${f.severity}">
        <h3>${f.findingNumber}: ${f.title}</h3>
        <p><strong>Category:</strong> ${f.category}</p>
        <p><strong>Severity:</strong> ${f.severity}</p>
        <p><strong>Risk Level:</strong> ${f.riskLevel}</p>
        <p><strong>Description:</strong> ${f.description || 'N/A'}</p>
        <p><strong>Root Cause:</strong> ${f.rootCause || 'N/A'}</p>
        <p><strong>Recommendation:</strong> ${f.recommendation || 'N/A'}</p>
        <p><strong>Evidence:</strong> ${f.evidenceCount} file(s)</p>
      </div>
    `).join('')}
  </div>
  
  <div class="section">
    <h2>Corrective Actions (${report.correctiveActions.length})</h2>
    ${report.correctiveActions.length === 0 ? '<p>No corrective actions required.</p>' : ''}
    ${report.correctiveActions.length > 0 ? `
      <table>
        <tr><th>Finding</th><th>Action</th><th>Responsible</th><th>Due Date</th><th>Status</th></tr>
        ${report.correctiveActions.map((ca) => `
          <tr>
            <td>${ca.findingNumber}</td>
            <td>${ca.action}</td>
            <td>${ca.responsiblePerson || 'N/A'}</td>
            <td>${ca.dueDate}</td>
            <td>${ca.status}</td>
          </tr>
        `).join('')}
      </table>
    ` : ''}
  </div>
  
  <div class="section">
    <h2>Evidence Summary</h2>
    <p>Total Evidence Files: ${report.evidenceCount}</p>
    ${Object.keys(report.evidenceByType).length > 0 ? `
      <table>
        <tr><th>Type</th><th>Count</th></tr>
        ${Object.entries(report.evidenceByType).map(([type, count]) => `
          <tr><td>${type}</td><td>${count}</td></tr>
        `).join('')}
      </table>
    ` : ''}
  </div>
  
  <div class="section">
    <h2>Recommendations</h2>
    <ul>
      ${report.recommendations.map((r) => `<li>${r}</li>`).join('')}
    </ul>
  </div>
  
  <div class="section">
    <h2>Approval Information</h2>
    <table>
      <tr><th>Approved By</th><td>${report.approvedBy || 'N/A'}</td></tr>
      <tr><th>Approved At</th><td>${report.approvedAt || 'N/A'}</td></tr>
      <tr><th>Closed At</th><td>${report.closedAt || 'N/A'}</td></tr>
    </table>
  </div>
  
  <div class="no-print" style="margin-top: 40px; text-align: center;">
    <button onclick="window.print()" style="padding: 10px 20px; font-size: 16px; cursor: pointer;">Print Report</button>
  </div>
</body>
</html>
  `;
}
