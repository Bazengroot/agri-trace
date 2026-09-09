import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle, ArrowUpRight, Building2, CalendarCheck2, ClipboardCheck, Flame, RefreshCw, ShieldAlert, TrendingUp,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useApp } from "../store";
import { Badge, Card, ProgressBar, ScorePill, SectionTitle, Select, Tone } from "../components/ui";
import {
  classifyScore, computeAuditScore, daysUntil, deadlineState, fmtDateShort, monthKey, monthLabel,
  recurringFindingIds, riskScore, timeAgo,
} from "../lib";
import type { Finding, Severity } from "../types";
import { SEVERITIES } from "../types";
import * as dashboardService from "../services/dashboard/dashboard.service";
import * as findingService from "../services/finding/finding.service";
import * as auditService from "../services/audit/audit.service";
import * as caService from "../services/finding/corrective-action.service";
import * as auditTrailService from "../services/audit-trail/audit-trail.service";

const SEV_COLORS: Record<Severity, string> = { Critical: "#b91c1c", Major: "#ea580c", Minor: "#2251cf", Observation: "#94a3b8" };

function Stat({ label, value, sub, icon, tone, to, alert }: { label: string; value: React.ReactNode; sub?: string; icon: React.ReactNode; tone: Tone; to?: string; alert?: boolean }) {
  const nav = useNavigate();
  const tones: Record<Tone, string> = {
    neutral: "bg-slate-100 text-slate-600", brand: "bg-brand-50 text-brand-600", success: "bg-green-50 text-green-600",
    warning: "bg-amber-50 text-amber-600", danger: "bg-red-50 text-red-600", navy: "bg-ink-900 text-brand-300",
    violet: "bg-violet-50 text-violet-600", teal: "bg-teal-50 text-teal-600",
  };
  return (
    <Card onClick={to ? () => nav(to) : undefined} className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-slate-500">{label}</p>
          <p className={`mt-1.5 font-mono text-[26px] font-bold leading-none ${alert ? "text-red-700" : "text-ink-900"}`}>{value}</p>
          {sub && <p className="mt-1.5 text-[11px] font-medium text-slate-400">{sub}</p>}
        </div>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}>{icon}</span>
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const { db, user } = useApp();
  const nav = useNavigate();
  const [fFarm, setFFarm] = useState("all");
  const [fRegion, setFRegion] = useState("all");
  const [fSev, setFSev] = useState("all");
  const [fCat, setFCat] = useState("all");
  const [fAuditor, setFAuditor] = useState("all");
  const [fRange, setFRange] = useState("all");
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [allFindings, setAllFindings] = useState<any[]>([]);
  const [audits, setAudits] = useState<any[]>([]);
  const [correctiveActions, setCorrectiveActions] = useState<any[]>([]);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);

  // Load data from Supabase
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const orgId = "default-org"; // TODO: Get from user context
        
        // Load dashboard data
        const dashData = await dashboardService.getDashboardData(orgId);
        setDashboardData(dashData);
        
        // Load findings
        const findingsResult = await findingService.listFindings({});
        setAllFindings(findingsResult.data || []);
        
        // Load audits
        const auditsResult = await auditService.listAudits({});
        setAudits(auditsResult.data || []);
        
        // Load corrective actions
        const casResult = await caService.listCorrectiveActions({});
        setCorrectiveActions(casResult.data || []);
        
        // Load activity logs
        const logsResult = await auditTrailService.getAuditTrail({});
        setActivityLogs(logsResult || []);
      } catch (error) {
        console.error("Failed to load dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const tpl = db.templates[0];
  const regions = [...new Set(db.farms.map((f: any) => f.region))];
  const auditors = db.users.filter((u: any) => u.role === "AUDITOR" || u.role === "AUDIT_ADMIN");
  const cats = tpl?.categories ?? [];

  const findings = useMemo(() => {
    let list = allFindings;
    if (fFarm !== "all") list = list.filter((f: any) => f.audit?.farm_id === fFarm);
    if (fSev !== "all") list = list.filter((f: any) => f.severity === fSev);
    if (fCat !== "all") list = list.filter((f: any) => f.category === fCat);
    if (fRegion !== "all") list = list.filter((f: any) => f.audit?.farms?.region === fRegion);
    if (fAuditor !== "all") list = list.filter((f: any) => f.audit?.auditor_id === fAuditor);
    if (fRange !== "all") {
      const now = new Date();
      const cutoff = fRange === "month" ? new Date(now.getFullYear(), now.getMonth(), 1) : new Date(now.getFullYear(), now.getMonth() - 2, 1);
      list = list.filter((f: any) => new Date(f.created_at) >= cutoff);
    }
    return list;
  }, [allFindings, fFarm, fSev, fCat, fRegion, fAuditor, fRange]);

  const scored = useMemo(() => audits
    .filter((a: any) => ["completed", "under_review", "submitted"].includes(a.status))
    .map((a: any) => ({ a, score: { overall: a.overall_score } })), [audits]);

  const kpi = useMemo(() => {
    if (!dashboardData) return { farms: 0, month: 0, completed: 0, active: 0, avg: null, open: 0, critical: 0, overdue: 0 };
    const nowKey = monthKey(new Date().toISOString());
    const open = findings.filter((f: any) => !["closed", "verified"].includes(f.status));
    return {
      farms: dashboardData.kpis.totalFarms || 0,
      month: audits.filter((a: any) => monthKey(a.scheduled_date) === nowKey).length,
      completed: dashboardData.kpis.completedAudits || 0,
      active: dashboardData.kpis.activeAudits || 0,
      avg: dashboardData.kpis.averageAuditScore ? Math.round(dashboardData.kpis.averageAuditScore) : null,
      open: dashboardData.kpis.openFindings || 0,
      critical: dashboardData.kpis.criticalFindings || 0,
      overdue: dashboardData.kpis.overdueCorrectiveActions || 0,
    };
  }, [dashboardData, audits, findings]);

  const byFarm = useMemo(() => {
    if (!dashboardData?.farmRankings) return [];
    return dashboardData.farmRankings.map((f: any) => ({
      name: f.farmName.replace(" Farm", "").replace(" Hatchery", ""),
      id: f.farmId,
      score: f.auditScore,
      cls: f.auditScore ? classifyScore(f.auditScore, db.settings) : null
    })).filter((x: any) => x.score !== null);
  }, [dashboardData, db.settings]);

  const trend = useMemo(() => {
    const map = new Map<string, { sum: number; n: number }>();
    for (const s of scored) {
      const k = monthKey(s.a.scheduled_date);
      const e = map.get(k) ?? { sum: 0, n: 0 };
      e.sum += s.score.overall ?? 0; e.n += 1; map.set(k, e);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => ({ month: monthLabel(k), score: Math.round(v.sum / v.n), audits: v.n }));
  }, [scored]);

  const bySev = SEVERITIES.map((s) => ({ name: s, value: findings.filter((f: any) => f.severity === s).length })).filter((x) => x.value > 0);
  const byCat = cats.map((c: any) => ({ name: c.name.split(" & ")[0], full: c.name, value: findings.filter((f: any) => f.category === c.id).length })).filter((x) => x.value > 0);
  const caStates = ["open", "in_progress", "submitted_for_verification", "verified", "rejected"].map((s) => ({ 
    name: s === "submitted_for_verification" ? "Awaiting Verif." : s.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase()), 
    value: correctiveActions.filter((c: any) => c.status === s).length 
  })).filter((x) => x.value > 0);
  const CA_COLORS = ["#2251cf", "#d97706", "#7c3aed", "#16a34a", "#b91c1c"];

  const overdue = correctiveActions
    .filter((c: any) => {
      const dueDate = new Date(c.due_date);
      const now = new Date();
      return dueDate < now && !["verified", "closed"].includes(c.status);
    })
    .map((c: any) => ({ c, f: allFindings.find((x: any) => x.id === c.finding_id) }))
    .filter((x: any) => x.f)
    .sort((a: any, b: any) => daysUntil(a.c.due_date) - daysUntil(b.c.due_date))
    .slice(0, 6);

  const recurring = useMemo(() => {
    const ids = recurringFindingIds(allFindings);
    const groups = new Map<string, any[]>();
    for (const f of allFindings.filter((x: any) => ids.has(x.id))) {
      const k = `${f.audit?.farm_id}|${f.question_id}`;
      groups.set(k, [...(groups.get(k) ?? []), f]);
    }
    return [...groups.values()].map((g: any[]) => ({
      title: g[0].title, 
      farm: g[0].audit?.farms?.farm_name ?? "", 
      count: g.length,
      months: [...new Set(g.map((x: any) => monthLabel(monthKey(x.created_at))))], 
      id: g[0].id,
      open: g.filter((x: any) => !["closed", "verified"].includes(x.status)).length,
    })).sort((a: any, b: any) => b.count - a.count).slice(0, 6);
  }, [allFindings]);

  const tooltipStyle = { borderRadius: 10, border: "1px solid #dde5f0", fontSize: 12, fontFamily: "IBM Plex Sans", boxShadow: "0 8px 24px rgba(16,35,68,0.12)" };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600 mx-auto mb-4"></div>
          <p className="text-sm text-slate-500">Loading dashboard data...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-600">Audit Command Center</p>
          <h1 className="font-display text-[24px] font-extrabold tracking-tight text-ink-900">
            {new Date().toLocaleDateString("en-GB", { weekday: "long" })}, {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long" })}
          </h1>
          <p className="text-[13px] text-slate-500">Welcome back, {user?.name.split(" ")[0]} — here is the compliance position across {kpi.farms} facilities.</p>
        </div>
      </div>

      {/* filters */}
      <Card className="mb-5 flex flex-wrap items-center gap-2 px-3.5 py-2.5">
        <span className="mr-1 text-[10.5px] font-bold uppercase tracking-widest text-slate-400">Filters</span>
        {[
          { v: fRange, set: setFRange, opts: [["all", "All time"], ["month", "This month"], ["3m", "Last 3 months"]] },
          { v: fFarm, set: setFFarm, opts: [["all", "All farms"], ...db.farms.map((f) => [f.id, f.name] as [string, string])] },
          { v: fRegion, set: setFRegion, opts: [["all", "All regions"], ...regions.map((r) => [r, r] as [string, string])] },
          { v: fAuditor, set: setFAuditor, opts: [["all", "All auditors"], ...auditors.map((u) => [u.id, u.name] as [string, string])] },
          { v: fCat, set: setFCat, opts: [["all", "All categories"], ...cats.map((c) => [c.id, c.name] as [string, string])] },
          { v: fSev, set: setFSev, opts: [["all", "All severities"], ...SEVERITIES.map((s) => [s, s] as [string, string])] },
        ].map((f, i) => (
          <Select key={i} value={f.v} onChange={(e) => f.set(e.target.value)} className="!w-auto !py-1.5 !text-xs">
            {f.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        ))}
        {(fFarm !== "all" || fRegion !== "all" || fSev !== "all" || fCat !== "all" || fAuditor !== "all" || fRange !== "all") && (
          <button onClick={() => { setFFarm("all"); setFRegion("all"); setFSev("all"); setFCat("all"); setFAuditor("all"); setFRange("all"); }}
            className="text-xs font-bold text-brand-600 hover:underline cursor-pointer">Reset</button>
        )}
      </Card>

      {/* KPIs */}
      <div className="stagger mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Stat label="Total Farms" value={kpi.farms} icon={<Building2 size={15} />} tone="navy" to="/farms" />
        <Stat label="Audits · Month" value={kpi.month} icon={<CalendarCheck2 size={15} />} tone="brand" to="/calendar" />
        <Stat label="Completed" value={kpi.completed} icon={<ClipboardCheck size={15} />} tone="success" to="/audits/completed" />
        <Stat label="Active Audits" value={kpi.active} icon={<TrendingUp size={15} />} tone="teal" to="/audits" />
        <Stat label="Avg Compliance" value={kpi.avg === null ? "—" : `${kpi.avg}%`} sub={kpi.avg !== null ? classifyScore(kpi.avg, db.settings) : undefined} icon={<ShieldAlert size={15} />} tone={kpi.avg !== null && kpi.avg < 70 ? "danger" : "success"} to="/reports/compliance" />
        <Stat label="Open Findings" value={kpi.open} icon={<AlertTriangle size={15} />} tone="warning" to="/findings/open" />
        <Stat label="Critical" value={kpi.critical} alert={kpi.critical > 0} icon={<Flame size={15} />} tone="danger" to="/findings/open" />
        <Stat label="Overdue Actions" value={kpi.overdue} alert={kpi.overdue > 0} icon={<RefreshCw size={15} />} tone="danger" to="/overdue" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* compliance by farm */}
        <Card className="p-4 xl:col-span-2">
          <SectionTitle right={<Link to="/comparison" className="inline-flex items-center gap-1 text-xs font-bold text-brand-600 hover:underline">Compare farms <ArrowUpRight size={12} /></Link>}>Compliance Score by Farm</SectionTitle>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byFarm} layout="vertical" margin={{ left: 8, right: 18, top: 0, bottom: 0 }}>
                <CartesianGrid horizontal={false} stroke="#e7edf5" />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: "#7d8ea8" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={118} tick={{ fontSize: 11.5, fill: "#33455f", fontWeight: 600 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v}%`, "Compliance"]} cursor={{ fill: "rgba(52,101,232,0.05)" }} />
                <Bar dataKey="score" radius={[0, 6, 6, 0]} barSize={16} onClick={(d: { id?: string }) => d?.id && nav(`/farm/${d.id}`)} className="cursor-pointer">
                  {byFarm.map((f: any) => (
                    <Cell key={f.id} fill={(f.score ?? 0) >= 90 ? "#16a34a" : (f.score ?? 0) >= 80 ? "#2251cf" : (f.score ?? 0) >= 70 ? "#d97706" : "#b91c1c"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10.5px] font-semibold text-slate-400">
            <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-green-600" />Excellent ≥ {db.settings.thresholds.excellent}</span>
            <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-brand-600" />Good ≥ {db.settings.thresholds.good}</span>
            <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-amber-600" />Needs improvement ≥ {db.settings.thresholds.needsImprovement}</span>
            <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-red-700" />Poor</span>
          </div>
        </Card>

        {/* trend */}
        <Card className="p-4">
          <SectionTitle right={<Link to="/trends" className="inline-flex items-center gap-1 text-xs font-bold text-brand-600 hover:underline">Trends <ArrowUpRight size={12} /></Link>}>Compliance Trend</SectionTitle>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ left: -14, right: 8, top: 6 }}>
                <CartesianGrid vertical={false} stroke="#e7edf5" />
                <XAxis dataKey="month" tick={{ fontSize: 10.5, fill: "#7d8ea8" }} axisLine={false} tickLine={false} />
                <YAxis domain={[50, 100]} tick={{ fontSize: 10.5, fill: "#7d8ea8" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => [n === "score" ? `${v}%` : v, n === "score" ? "Avg score" : "Audits"]} />
                <Line type="monotone" dataKey="score" stroke="#2251cf" strokeWidth={2.5} dot={{ r: 3.5, strokeWidth: 2, fill: "#fff" }} activeDot={{ r: 5 }} onClick={() => nav("/trends")} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {trend.length >= 2 && (
            <p className="mt-1 text-[11.5px] font-semibold text-slate-500">
              <span className={trend[trend.length - 1].score >= trend[0].score ? "text-green-700" : "text-red-700"}>
                {trend[trend.length - 1].score >= trend[0].score ? "▲" : "▼"} {Math.abs(trend[trend.length - 1].score - trend[0].score)} pts
              </span>{" "}since {trend[0].month} · {trend.reduce((s, t) => s + t.audits, 0)} audits scored
            </p>
          )}
        </Card>

        {/* severity donut */}
        <Card className="p-4">
          <SectionTitle>Findings by Severity</SectionTitle>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={bySev} dataKey="value" nameKey="name" innerRadius={52} outerRadius={78} paddingAngle={3} strokeWidth={0}
                  onClick={(d: { name?: string }) => d?.name && nav(`/findings?sev=${d.name}`)} className="cursor-pointer">
                  {bySev.map((s) => <Cell key={s.name} fill={SEV_COLORS[s.name as Severity]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 grid grid-cols-2 gap-1.5">
            {bySev.map((s) => (
              <button key={s.name} onClick={() => nav(`/findings?sev=${s.name}`)} className="flex items-center gap-2 rounded-md px-2 py-1 text-left text-[11.5px] font-semibold text-ink-700 hover:bg-ink-50 cursor-pointer">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SEV_COLORS[s.name as Severity] }} />
                {s.name} <span className="ml-auto font-mono text-slate-400">{s.value}</span>
              </button>
            ))}
          </div>
        </Card>

        {/* by category */}
        <Card className="p-4">
          <SectionTitle>Findings by Category</SectionTitle>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byCat} margin={{ left: -18, right: 4, top: 6 }}>
                <CartesianGrid vertical={false} stroke="#e7edf5" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#7d8ea8" }} axisLine={false} tickLine={false} interval={0} angle={-14} height={44} textAnchor="end" />
                <YAxis tick={{ fontSize: 10.5, fill: "#7d8ea8" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(52,101,232,0.05)" }} />
                <Bar dataKey="value" fill="#29466f" radius={[5, 5, 0, 0]} barSize={30}
                  onClick={(d: { full?: string }) => { const c = cats.find((x) => x.name === d?.full); if (c) nav(`/findings?cat=${c.id}`); }} className="cursor-pointer" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* CA status */}
        <Card className="p-4">
          <SectionTitle right={<Link to="/corrective-actions" className="inline-flex items-center gap-1 text-xs font-bold text-brand-600 hover:underline">All actions <ArrowUpRight size={12} /></Link>}>Corrective Action Status</SectionTitle>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={caStates} dataKey="value" nameKey="name" innerRadius={52} outerRadius={78} paddingAngle={3} strokeWidth={0} onClick={() => nav("/corrective-actions")} className="cursor-pointer">
                  {caStates.map((s, i) => <Cell key={s.name} fill={CA_COLORS[i % CA_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 grid grid-cols-2 gap-1.5">
            {caStates.map((s, i) => (
              <button key={s.name} onClick={() => nav("/corrective-actions")} className="flex items-center gap-2 rounded-md px-2 py-1 text-left text-[11.5px] font-semibold text-ink-700 hover:bg-ink-50 cursor-pointer">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CA_COLORS[i % CA_COLORS.length] }} />
                {s.name} <span className="ml-auto font-mono text-slate-400">{s.value}</span>
              </button>
            ))}
          </div>
        </Card>

        {/* overdue */}
        <Card className="p-4">
          <SectionTitle right={<Link to="/overdue" className="inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:underline">Overdue queue <ArrowUpRight size={12} /></Link>}>
            <span className="text-red-700">Overdue Corrective Actions</span>
          </SectionTitle>
          {overdue.length === 0 && <p className="py-8 text-center text-xs text-slate-400">Nothing overdue — deadlines are under control.</p>}
          <div className="space-y-2">
            {overdue.map(({ c, f }: any) => (
              <Link key={c.id} to={`/finding/${f.id}`} className="block rounded-lg border border-red-100 bg-red-50/50 px-3 py-2 transition-colors hover:border-red-200 hover:bg-red-50">
                <div className="flex items-center gap-2">
                  <Badge tone="danger">{f.severity}</Badge>
                  <span className="font-mono text-[10.5px] text-red-500">{Math.abs(daysUntil(c.due_date))}d overdue</span>
                  <span className="ml-auto font-mono text-[10.5px] text-slate-400">{c.code}</span>
                </div>
                <p className="mt-1 truncate text-[12.5px] font-semibold text-ink-800">{f.title}</p>
                <p className="text-[11px] text-slate-500">{f.audit?.farms?.farm_name} · due {fmtDateShort(c.due_date)}</p>
              </Link>
            ))}
          </div>
        </Card>

        {/* recurring */}
        <Card className="p-4 xl:col-span-2">
          <SectionTitle right={<Badge tone="violet" dot>Recurring Finding Detection</Badge>}>Top Recurring Findings — systemic issues</SectionTitle>
          <div className="space-y-2.5">
            {recurring.map((r) => (
              <Link key={r.id} to={`/finding/${r.id}`} className="block rounded-lg border border-ink-100 px-3.5 py-2.5 transition-colors hover:border-violet-200 hover:bg-violet-50/40">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-bold text-ink-900">{r.title}</span>
                  <Badge tone="violet">Recurring ×{r.count}</Badge>
                  {r.open > 0 && <Badge tone="danger">{r.open} still open</Badge>}
                  <span className="ml-auto text-[11px] font-semibold text-slate-400">{r.farm}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="flex flex-1 gap-1">
                    {r.months.map((m) => (
                      <span key={m} className="rounded bg-violet-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-violet-700">{m}</span>
                    ))}
                  </div>
                  <ProgressBar value={(r.count / 5) * 100} tone="warning" className="w-28" />
                </div>
              </Link>
            ))}
            {recurring.length === 0 && <p className="py-8 text-center text-xs text-slate-400">No recurring patterns detected in the current filter.</p>}
          </div>
        </Card>

        {/* activity pulse */}
        <Card className="p-4">
          <SectionTitle>Latest Activity</SectionTitle>
          <div className="space-y-2.5">
            {activityLogs.slice(0, 7).map((l) => {
              const u = db.users.find((x) => x.id === l.user_id);
              return (
                <div key={l.id} className="flex items-start gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                  <div className="min-w-0">
                    <p className="text-[12px] leading-snug text-ink-800"><strong>{u?.name.split(" ")[0]}</strong> · {l.action} — <span className="text-slate-500">{l.entity_type}</span></p>
                    <p className="text-[10.5px] font-medium text-slate-400">{timeAgo(l.created_at)}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <Link to="/admin/logs" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-brand-600 hover:underline">Full activity log <ArrowUpRight size={12} /></Link>
        </Card>
      </div>
    </div>
  );
}

export { ScorePill, riskScore };
