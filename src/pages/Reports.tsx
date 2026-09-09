import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, FileText, GitCompareArrows, Printer, ScrollText, TrendingUp, BarChart3 } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useApp, getFarm, getUser, getProgram, templateOf } from "../store";
import { Badge, Button, Card, EmptyState, Gauge, PageHeader, ProgressBar, ScorePill, SectionTitle, Select, SeverityBadge, Sparkline, StatusBadge, cn } from "../components/ui";
import {
  choiceLabel, classifyScore, computeAuditScore, deadlineState, findQuestion, flattenQuestions, fmtDate,
  fmtDateShort, monthKey, monthLabel, recurringFindingIds, riskBand, scoreAnswer,
} from "../lib";
import type { AnswerValue, Severity } from "../types";
import { SEVERITIES } from "../types";
import * as auditService from "../services/audit/audit.service";
import * as findingService from "../services/finding/finding.service";
import * as caService from "../services/finding/corrective-action.service";
import * as evidenceService from "../services/audit/evidence.service";
import * as farmService from "../services/master-data/farm.service";
import * as userService from "../services/master-data/user.service";
import * as templateService from "../services/master-data/template.service";
import * as programService from "../services/master-data/program.service";

const SEV_COLORS: Record<Severity, string> = { Critical: "#b91c1c", Major: "#ea580c", Minor: "#2251cf", Observation: "#94a3b8" };
const tip = { borderRadius: 10, border: "1px solid #dde5f0", fontSize: 12, fontFamily: "IBM Plex Sans" };

const answerLabel = (v: AnswerValue | undefined): string => {
  if (v === undefined || v === "") return "—";
  if (v === "C" || v === "PC" || v === "NC" || v === "NA") return choiceLabel(v);
  return String(v);
};

/* ── Reports home ─────────────────────────────────────────────────────── */
export function ReportsHomePage() {
  const { db, user } = useApp();
  const nav = useNavigate();
  const [audits, setAudits] = useState<any[]>([]);
  const [findings, setFindings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const auditsResult = await auditService.listAudits({});
        setAudits(auditsResult.data || []);
        
        const findingsResult = await findingService.listFindings({});
        setFindings(findingsResult.data || []);
      } catch (error) {
        console.error("Failed to load reports ", error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const reportable = audits
    .filter((a: any) => ["submitted", "under_review", "completed"].includes(a.status))
    .sort((a: any, b: any) => b.scheduled_date.localeCompare(a.scheduled_date));

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600 mx-auto mb-4"></div>
          <p className="text-sm text-slate-500">Loading reports...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Audit Reports" sub="Professional sign-off reports with cover page, scoring, findings, corrective actions and traceable evidence" />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { to: "/reports/findings", icon: <ScrollText size={16} />, label: "Finding Reports", sub: "Severity & farm breakdowns + CSV" },
          { to: "/reports/compliance", icon: <BarChart3 size={16} />, label: "Compliance Reports", sub: "Classification per facility" },
          { to: "/comparison", icon: <GitCompareArrows size={16} />, label: "Farm Comparison", sub: "Side-by-side up to 3 farms" },
          { to: "/trends", icon: <TrendingUp size={16} />, label: "Trend Analysis", sub: "History, recurrence, closure rate" },
        ].map((x) => (
          <Card key={x.to} onClick={() => nav(x.to)} className="p-4">
            <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-ink-900 text-brand-300">{x.icon}</span>
            <p className="font-display text-[13.5px] font-extrabold text-ink-900">{x.label}</p>
            <p className="text-[11px] text-slate-500">{x.sub}</p>
          </Card>
        ))}
      </div>
      <SectionTitle>Generated from submitted & completed audits</SectionTitle>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {reportable.map((a: any) => {
          const auditFindings = findings.filter((f: any) => f.audit_id === a.id);
          return (
            <Card key={a.id} onClick={() => nav(`/report/${a.id}`)} className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[11px] font-bold text-brand-700">{a.audit_number}</span>
                <StatusBadge status={a.status} />
              </div>
              <p className="font-display text-[14.5px] font-extrabold text-ink-900">{a.farm_name || "Farm"}</p>
              <p className="text-[11.5px] text-slate-500">{a.program_name || "Program"} · {fmtDate(a.scheduled_date)} · {a.auditor_name || "Auditor"}</p>
              <div className="mt-3 flex items-center gap-3">
                <ScorePill score={a.overall_score} />
                <Badge tone={auditFindings.length ? "warning" : "success"} dot>{auditFindings.length} findings</Badge>
                <span className="ml-auto inline-flex items-center gap-1 text-[11.5px] font-bold text-brand-600"><FileText size={12} /> Open report <ArrowRight size={11} /></span>
              </div>
            </Card>
          );
        })}
      </div>
      {reportable.length === 0 && <EmptyState title="No reports available yet" body="Reports are generated once an audit is submitted for review." />}
    </div>
  );
}

/* ── Printable audit report ───────────────────────────────────────────── */
export function ReportViewerPage() {
  const { id } = useParams();
  const { db } = useApp();
  const nav = useNavigate();
  const [audit, setAudit] = useState<any>(null);
  const [findings, setFindings] = useState<any[]>([]);
  const [cas, setCas] = useState<any[]>([]);
  const [evidence, setEvidence] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      if (!id) return;
      try {
        setLoading(true);
        const auditResult = await auditService.getAudit(id);
        setAudit(auditResult);
        
        const findingsResult = await findingService.listFindings({ audit_id: id });
        setFindings(findingsResult.data || []);
        
        const casResult = await caService.listCorrectiveActions({});
        setCas(casResult.data?.filter((c: any) => findingsResult.data?.some((f: any) => f.id === c.finding_id)) || []);
        
        const evidenceResult = await evidenceService.listEvidence({ audit_id: id });
        setEvidence(evidenceResult || []);
      } catch (error) {
        console.error("Failed to load audit report:", error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600 mx-auto mb-4"></div>
          <p className="text-sm text-slate-500">Loading audit report...</p>
        </div>
      </div>
    );
  }

  if (!audit) return <EmptyState title="Report not available" body="The audit has not been submitted yet." action={<Link to="/reports"><Button variant="dark">All reports</Button></Link>} />;

  const tpl = db.templates[0]; // Use first template for now
  const farm = db.farms.find((f: any) => f.id === audit.farm_id);
  const program = db.programs.find((p: any) => p.id === audit.program_id);
  const s = computeAuditScore(tpl, audit.responses || {}, db.settings);
  const cls = classifyScore(s.overall, db.settings);
  const flat = flattenQuestions(tpl);
  const signers = [
    { role: "Lead Auditor", user: db.users.find((u: any) => u.id === audit.auditor_id) },
    { role: "Farm Manager", user: db.users.find((u: any) => u.id === farm?.managerId) },
    { role: "Audit Admin — sign-off", user: db.users.find((u: any) => u.role === "AUDIT_ADMIN") },
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <div className="print-hidden mb-4 flex flex-wrap items-center gap-2">
        <button onClick={() => nav(-1)} className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-ink-900 cursor-pointer"><ArrowLeft size={13} /> Back</button>
        <div className="ml-auto flex gap-2">
          <Button variant="dark" icon={<Printer size={14} />} onClick={() => window.print()}>Export PDF / Print</Button>
        </div>
      </div>

      <div className="print-block space-y-4">
        {/* cover */}
        <div className="overflow-hidden rounded-xl">
          <div className="sidebar-surface relative px-8 py-10 text-white">
            <div className="dot-grid absolute inset-0 opacity-10" />
            <div className="relative">
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-brand-300">AgriTrace Audit · Confidential</p>
              <h1 className="mt-3 font-display text-[30px] font-extrabold leading-tight tracking-tight">Audit Report</h1>
              <p className="mt-1 font-display text-[17px] font-bold text-ink-200">{program?.name}</p>
              <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-2 text-[12.5px] sm:grid-cols-3">
                {[["Audit ID", audit.audit_number], ["Farm", farm?.name ?? ""], ["Farm type", farm?.type ?? ""], ["Audit date", fmtDate(audit.scheduled_date)], ["Report generated", fmtDate(new Date().toISOString())], ["Status", audit.status]].map(([k, v]) => (
                  <p key={k}><span className="block text-[9.5px] font-bold uppercase tracking-widest text-ink-400">{k}</span><span className="font-bold">{v}</span></p>
                ))}
              </div>
              <div className="mt-6 inline-flex items-center gap-3 rounded-xl border border-white/15 bg-white/5 px-4 py-3">
                <Gauge value={s.overall} size={76} stroke={8} tone="#7ce0a3" />
                <div>
                  <p className="font-display text-lg font-extrabold">{cls}</p>
                  <p className="text-[11px] text-ink-300">{findings.length} findings · {evidence.length} evidence items · {cas.length} corrective actions</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 1 audit & farm info */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card className="p-5">
            <h2 className="mb-2 font-display text-[13px] font-extrabold uppercase tracking-wider text-ink-700">1 · Audit Information</h2>
            <dl className="space-y-1.5 text-[12.5px]">
              {[["Program", program?.name], ["Standard", program?.standard], ["Frequency", program?.frequency], ["Scope", audit.scope], ["Objectives", audit.objectives], ["Planned window", `${audit.start_time || "—"} – ${audit.end_time || "—"}`], ["Risk level", audit.risk_level], ["Submitted", audit.submitted_at ? fmtDate(audit.submitted_at.slice(0, 10)) : "—"]].map(([k, v]) => (
                <div key={k} className="flex gap-2"><dt className="w-32 shrink-0 font-bold text-slate-400">{k}</dt><dd className="font-medium text-ink-800">{v}</dd></div>
              ))}
            </dl>
          </Card>
          <Card className="p-5">
            <h2 className="mb-2 font-display text-[13px] font-extrabold uppercase tracking-wider text-ink-700">2 · Farm Information</h2>
            <dl className="space-y-1.5 text-[12.5px]">
              {[["Farm", `${farm?.name} (${farm?.code})`], ["Company", farm?.company], ["Location", `${farm?.region} · ${farm?.province} · ${farm?.district}`], ["GPS", `${farm?.gps.lat.toFixed(4)}, ${farm?.gps.lng.toFixed(4)}`], ["Capacity", `${farm?.capacity.toLocaleString()} ${farm?.capacityUnit}`], ["Houses", String(farm?.houses)], ["Manager", getUser(db, farm?.managerId)?.name], ["Supervisor", getUser(db, farm?.supervisorId)?.name]].map(([k, v]) => (
                <div key={k} className="flex gap-2"><dt className="w-32 shrink-0 font-bold text-slate-400">{k}</dt><dd className="font-medium text-ink-800">{v}</dd></div>
              ))}
            </dl>
            <h3 className="mb-1.5 mt-4 font-display text-[12px] font-extrabold uppercase tracking-wider text-ink-700">Audit Team</h3>
            {[audit.auditor_id, ...(audit.team_ids || []).filter((t: string) => t !== audit.auditor_id)].map((uidv, i) => {
              const u = db.users.find((user: any) => user.id === uidv);
              return u ? <p key={uidv + i} className="text-[12.5px] text-ink-800"><strong>{u.name}</strong> — {i === 0 ? "Lead Auditor" : "Supporting Auditor"}</p> : null;
            })}
          </Card>
        </div>

        {/* executive summary */}
        <Card className="p-5">
          <h2 className="mb-2 font-display text-[13px] font-extrabold uppercase tracking-wider text-ink-700">3 · Executive Summary</h2>
          <p className="text-[13px] leading-relaxed text-ink-800">
            The {program?.name?.toLowerCase()} at <strong>{farm?.name}</strong> achieved an overall compliance score of{" "}
            <strong className="font-mono">{s.overall}%</strong>, classified as <strong>{cls}</strong>. Of {s.total} checklist items,{" "}
            {s.applicable} were applicable and {s.answered} answered. The audit raised <strong>{findings.length} findings</strong>{" "}
            ({SEVERITIES.map((sv) => `${findings.filter((f: any) => f.severity === sv).length} ${sv.toLowerCase()}`).filter((x: string) => !x.startsWith("0")).join(", ") || "none"}),
            supported by <strong>{evidence.length} evidence items</strong>. {cas.length} corrective actions were initiated;{" "}
            {cas.filter((c: any) => c.status === "verified" || c.status === "closed").length} already verified and closed.
            {cls === "Poor" ? " Immediate management attention is required on critical non-conformances." : cls === "Needs Improvement" ? " Focused corrective actions are required to restore the facility to Good standing." : " The facility demonstrates effective control across the audited scope."}
          </p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex items-center justify-center rounded-xl bg-ink-50/70 p-3"><Gauge value={s.overall} size={92} /></div>
            <div className="rounded-xl bg-ink-50/70 p-3">
              <p className="label">Category Scores</p>
              {s.categories.map((c) => (
                <div key={c.id} className="mb-1.5">
                  <div className="flex justify-between text-[11.5px] font-semibold text-ink-700"><span>{c.name}</span><span className="font-mono">{c.score ?? "—"}%</span></div>
                  <ProgressBar value={c.score ?? 0} tone={(c.score ?? 0) >= 80 ? "success" : (c.score ?? 0) >= 70 ? "warning" : "danger"} />
                </div>
              ))}
            </div>
            <div className="rounded-xl bg-ink-50/70 p-3">
              <p className="label">Risk Classification</p>
              {(["Critical", "High", "Medium", "Low"] as const).map((b) => {
                const n = findings.filter((f: any) => riskBand(f.risk_level === "critical" ? 5 : f.risk_level === "high" ? 4 : f.risk_level === "medium" ? 3 : 2, f.risk_level === "critical" ? 5 : f.risk_level === "high" ? 4 : f.risk_level === "medium" ? 3 : 2, db.settings) === b).length;
                return <p key={b} className="flex justify-between text-[12px] font-semibold text-ink-700"><Badge tone={b === "Critical" ? "danger" : b === "High" ? "warning" : b === "Medium" ? "warning" : "success"}>{b}</Badge><span className="font-mono">{n}</span></p>;
              })}
            </div>
          </div>
        </Card>

        {/* checklist results */}
        <Card className="p-5">
          <h2 className="mb-3 font-display text-[13px] font-extrabold uppercase tracking-wider text-ink-700">4 · Checklist Results ({tpl.name} {tpl.version})</h2>
          {tpl.categories.map((cat) => {
            const cs = s.categories.find((c) => c.id === cat.id);
            return (
              <div key={cat.id} className="mb-4">
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="font-display text-[12.5px] font-extrabold text-ink-900">{cat.name}</p>
                  <ScorePill score={cs?.score ?? null} />
                </div>
                <table className="w-full border-collapse text-[11.5px]">
                  <thead>
                    <tr className="bg-ink-50 text-left text-[9.5px] uppercase tracking-wider text-slate-400">
                      <th className="border border-ink-100 px-2 py-1.5 font-bold">#</th>
                      <th className="border border-ink-100 px-2 py-1.5 font-bold">Requirement</th>
                      <th className="border border-ink-100 px-2 py-1.5 font-bold">Response</th>
                      <th className="border border-ink-100 px-2 py-1.5 text-right font-bold">Pts</th>
                      <th className="border border-ink-100 px-2 py-1.5 font-bold">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cat.subcategories.map((sub) => sub.questions.map((q) => {
                      const r = audit.responses[q.id];
                      const pts = scoreAnswer(q, r, db.settings);
                      const idx = flat.findIndex((f) => f.q.id === q.id) + 1;
                      const bad = r?.value === "NC" || pts === 0;
                      return (
                        <tr key={q.id} className={cn(bad && "bg-red-50/60")}>
                          <td className="border border-ink-100 px-2 py-1.5 font-mono text-[10px] text-slate-400">{idx}</td>
                          <td className="border border-ink-100 px-2 py-1.5 font-medium text-ink-800"><span className="text-[9.5px] font-bold uppercase text-slate-400">{sub.name} · </span>{q.text}</td>
                          <td className={cn("border border-ink-100 px-2 py-1.5 font-bold", r?.value === "NC" ? "text-red-700" : r?.value === "PC" ? "text-amber-700" : r?.value === "NA" ? "text-slate-400" : "text-green-700")}>{answerLabel(r?.value)}</td>
                          <td className="border border-ink-100 px-2 py-1.5 text-right font-mono">{pts === null ? "n/a" : pts}</td>
                          <td className="border border-ink-100 px-2 py-1.5 text-slate-500">{r?.notes ?? ""}</td>
                        </tr>
                      );
                    }))}
                  </tbody>
                </table>
              </div>
            );
          })}
          <p className="text-[10.5px] text-slate-400">Scoring: Compliant = {db.settings.scoreValues.C} · Partial = {db.settings.scoreValues.PC} · Non-compliant = {db.settings.scoreValues.NC} · N/A excluded from denominator. Overall = earned ÷ applicable maximum × 100.</p>
        </Card>

        {/* findings */}
        <Card className="p-5">
          <h2 className="mb-3 font-display text-[13px] font-extrabold uppercase tracking-wider text-ink-700">5 · Findings ({findings.length})</h2>
          {findings.length === 0 && <p className="rounded-lg bg-green-50 px-3 py-2.5 text-[12.5px] font-semibold text-green-800">No non-conformances identified during this audit.</p>}
          <div className="space-y-3">
            {findings.map((f: any) => (
              <div key={f.id} className="rounded-xl border border-ink-100 p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] font-bold text-brand-700">{f.finding_number}</span>
                  <SeverityBadge severity={f.severity} />
                  <Badge tone={riskBand(f.risk_level === "critical" ? 5 : f.risk_level === "high" ? 4 : f.risk_level === "medium" ? 3 : 2, f.risk_level === "critical" ? 5 : f.risk_level === "high" ? 4 : f.risk_level === "medium" ? 3 : 2, db.settings) === "Critical" ? "danger" : riskBand(f.risk_level === "critical" ? 5 : f.risk_level === "high" ? 4 : f.risk_level === "medium" ? 3 : 2, f.risk_level === "critical" ? 5 : f.risk_level === "high" ? 4 : f.risk_level === "medium" ? 3 : 2, db.settings) === "Low" ? "success" : "warning"}>Risk {f.risk_level}</Badge>
                  <span className="ml-auto text-[11px] font-semibold text-slate-400">due {fmtDate(f.due_date)} · {f.status}</span>
                </div>
                <p className="mt-1.5 text-[13px] font-bold text-ink-900">{f.title}</p>
                <p className="mt-0.5 text-[12px] text-slate-600">{f.description}</p>
                <div className="mt-2 grid grid-cols-1 gap-1.5 text-[11.5px] sm:grid-cols-3">
                  <p><span className="font-bold text-slate-400">Requirement:</span> <span className="text-ink-700">{findQuestion(tpl, f.question_id)?.q.text}</span></p>
                  <p><span className="font-bold text-slate-400">Root cause:</span> <span className="text-ink-700">{f.root_cause}</span></p>
                  <p><span className="font-bold text-slate-400">Responsible:</span> <span className="text-ink-700">{db.users.find((u: any) => u.id === f.assigned_to)?.name}</span></p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* corrective actions */}
        <Card className="p-5">
          <h2 className="mb-3 font-display text-[13px] font-extrabold uppercase tracking-wider text-ink-700">6 · Corrective Actions ({cas.length})</h2>
          {cas.length === 0 ? <p className="text-[12px] text-slate-500">No corrective actions required for this audit.</p> : (
            <table className="w-full border-collapse text-[11.5px]">
              <thead><tr className="bg-ink-50 text-left text-[9.5px] uppercase tracking-wider text-slate-400">
                {["ID", "Action", "Owner", "Target", "Deadline", "Status"].map((h) => <th key={h} className="border border-ink-100 px-2 py-1.5 font-bold">{h}</th>)}
              </tr></thead>
              <tbody>
                {cas.map((c: any) => (
                  <tr key={c.id}>
                    <td className="border border-ink-100 px-2 py-1.5 font-mono">{c.code}</td>
                    <td className="border border-ink-100 px-2 py-1.5 font-medium text-ink-800">{c.action}</td>
                    <td className="border border-ink-100 px-2 py-1.5">{db.users.find((u: any) => u.id === c.responsible_person)?.name}</td>
                    <td className="border border-ink-100 px-2 py-1.5">{fmtDate(c.due_date)}</td>
                    <td className="border border-ink-100 px-2 py-1.5">{deadlineState(c, db.settings)}</td>
                    <td className="border border-ink-100 px-2 py-1.5 font-bold">{c.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {/* evidence + recommendations + conclusion + sign-off */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card className="p-5">
            <h2 className="mb-2 font-display text-[13px] font-extrabold uppercase tracking-wider text-ink-700">7 · Evidence Summary</h2>
            <p className="mb-3 text-[12px] text-slate-500">{evidence.length} items captured and retained in the evidence repository (Supabase Storage, policy-restricted to audit participants).</p>
            <div className="grid grid-cols-3 gap-2">
              {evidence.slice(0, 6).map((e: any) => (
                <div key={e.id} className="overflow-hidden rounded-lg border border-ink-100">
                  <div className="h-16 bg-ink-100">{e.image_url ? <img src={e.image_url} alt={e.description} className="h-full w-full object-cover" onError={(ev) => ((ev.target as HTMLImageElement).style.display = "none")} /> : <div className="flex h-full items-center justify-center"><FileText size={14} className="text-ink-300" /></div>}</div>
                  <p className="truncate px-1.5 py-1 text-[9.5px] font-semibold text-slate-500">{e.code} · {e.file_type}</p>
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-5">
            <h2 className="mb-2 font-display text-[13px] font-extrabold uppercase tracking-wider text-ink-700">8 · Recommendations & Conclusion</h2>
            <ul className="mb-3 space-y-1.5">
              {[...new Set(findings.map((f: any) => f.recommendation))].slice(0, 5).map((r, i) => (
                <li key={i} className="flex gap-2 text-[12px] text-ink-700"><span className="font-mono text-brand-600">{String(i + 1).padStart(2, "0")}</span>{r}</li>
              ))}
              {findings.length === 0 && <li className="text-[12px] text-ink-700">Maintain current control levels; continue scheduled monitoring.</li>}
            </ul>
            <p className="rounded-lg bg-ink-50/70 p-3 text-[12px] leading-relaxed text-ink-700">
              <strong>Conclusion:</strong> Based on the evidence obtained, {farm?.name} is classified <strong>{cls}</strong> ({s.overall}%).
              {findings.some((f: any) => f.severity === "Critical") ? " Critical findings require immediate containment and verification within the agreed deadlines." : " All findings are tracked through the corrective action workflow until verified closure."}
            </p>
          </Card>
        </div>

        <Card className="p-5">
          <h2 className="mb-4 font-display text-[13px] font-extrabold uppercase tracking-wider text-ink-700">9 · Approval & Sign-off</h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {signers.map((sg) => (
              <div key={sg.role}>
                <p className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">{sg.role}</p>
                <p className="mt-6 border-b-2 border-ink-300 pb-1 font-display text-[13.5px] font-bold text-ink-900">{sg.user?.name ?? ""}</p>
                <p className="mt-1 text-[10.5px] text-slate-400">{sg.user?.email} · {audit.status === "completed" ? fmtDate(audit.completed_at?.slice(0, 10)) : "pending"}</p>
              </div>
            ))}
          </div>
          <p className="mt-5 text-center text-[9.5px] uppercase tracking-[0.18em] text-slate-300">AgriTrace Audit · {audit.audit_number} · generated {new Date().toLocaleString()} · document controlled — uncontrolled when printed</p>
        </Card>
      </div>
    </div>
  );
}

/* ── Finding reports ──────────────────────────────────────────────────── */
export function FindingReportsPage() {
  const { db, user } = useApp();
  const nav = useNavigate();
  const [sev, setSev] = useState("all");
  const [allFindings, setAllFindings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const result = await findingService.listFindings({});
        setAllFindings(result.data || []);
      } catch (error) {
        console.error("Failed to load findings:", error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const findings = useMemo(() => {
    let list = allFindings;
    if (user && (user.role === "FARM_MANAGER" || user.role === "SUPERVISOR")) list = list.filter((f: any) => f.audit?.farm_id === user.farmId);
    if (sev !== "all") list = list.filter((f: any) => f.severity === sev);
    return [...list].sort((a: any, b: any) => b.created_at.localeCompare(a.created_at));
  }, [allFindings, sev, user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600 mx-auto mb-4"></div>
          <p className="text-sm text-slate-500">Loading findings...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Finding Reports" sub="Cross-farm finding analytics with CSV export for management review" />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {SEVERITIES.map((sv) => {
          const n = allFindings.filter((f: any) => f.severity === sv).length;
          return (
            <button key={sv} onClick={() => setSev(sev === sv ? "all" : sv)} className={cn("card cursor-pointer p-3.5 text-left transition-all hover:-translate-y-0.5", sev === sv && "ring-2 ring-brand-300")}>
              <span className="mb-1 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: SEV_COLORS[sv] }} />
              <p className="font-mono text-xl font-bold text-ink-900">{n}</p>
              <p className="text-[10.5px] font-bold uppercase tracking-wide text-slate-400">{sv}</p>
            </button>
          );
        })}
        <div className="card p-3.5">
          <p className="font-mono text-xl font-bold text-green-700">{Math.round((allFindings.filter((f: any) => ["closed", "verified"].includes(f.status)).length / Math.max(1, allFindings.length)) * 100)}%</p>
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-slate-400">Closure rate</p>
        </div>
      </div>
      <div className="card overflow-hidden">
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-[12.5px]">
            <thead><tr className="border-b border-ink-100 bg-ink-50/70 text-[10.5px] uppercase tracking-wider text-slate-400">
              {["Finding", "Farm", "Audit", "Severity", "Risk", "Raised", "Due", "Status"].map((h) => <th key={h} className="px-3.5 py-2.5 font-bold">{h}</th>)}
            </tr></thead>
            <tbody>
              {findings.map((f: any) => (
                <tr key={f.id} onClick={() => nav(`/finding/${f.id}`)} className="cursor-pointer border-b border-ink-100/70 last:border-0 hover:bg-brand-50/40">
                  <td className="px-3.5 py-2.5"><span className="font-mono text-[11px] font-bold text-brand-700">{f.finding_number}</span><p className="max-w-[220px] truncate font-semibold text-ink-900">{f.title}</p></td>
                  <td className="px-3.5 py-2.5">{f.audit?.farms?.farm_name}</td>
                  <td className="px-3.5 py-2.5 font-mono text-[11px]">{f.audit?.audit_number}</td>
                  <td className="px-3.5 py-2.5"><SeverityBadge severity={f.severity} /></td>
                  <td className="px-3.5 py-2.5"><Badge tone={f.risk_level === "critical" ? "danger" : "warning"}>{f.risk_level}</Badge></td>
                  <td className="px-3.5 py-2.5">{fmtDateShort(f.created_at.slice(0, 10))}</td>
                  <td className="px-3.5 py-2.5">{fmtDateShort(f.due_date)}</td>
                  <td className="px-3.5 py-2.5 font-semibold text-ink-700">{f.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ── Compliance report ────────────────────────────────────────────────── */
export function CompliancePage() {
  const { db } = useApp();
  const nav = useNavigate();
  const [farms, setFarms] = useState<any[]>([]);
  const [audits, setAudits] = useState<any[]>([]);
  const [findings, setFindings] = useState<any[]>([]);
  const [cas, setCas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const farmsResult = await farmService.listFarms();
        setFarms(farmsResult.data || []);
        
        const auditsResult = await auditService.listAudits({});
        setAudits(auditsResult.data || []);
        
        const findingsResult = await findingService.listFindings({});
        setFindings(findingsResult.data || []);
        
        const casResult = await caService.listCorrectiveActions({});
        setCas(casResult.data || []);
      } catch (error) {
        console.error("Failed to load compliance data:", error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const rows = farms.map((f: any) => {
    const scored = audits.filter((a: any) => a.farm_id === f.id && ["completed", "submitted", "under_review"].includes(a.status))
      .sort((a: any, b: any) => b.scheduled_date.localeCompare(a.scheduled_date)).map((a: any) => ({ overall: a.overall_score }));
    const latest = scored[0]?.overall ?? null;
    const hist = [...scored].reverse().map((s: any) => s.overall ?? 0);
    return {
      f,
      latest,
      cls: classifyScore(latest, db.settings),
      audits: scored.length,
      hist,
      open: findings.filter((x: any) => x.audit?.farm_id === f.id && !["closed", "verified"].includes(x.status)).length,
      overdueCA: cas.filter((c: any) => {
        const fd = findings.find((x: any) => x.id === c.finding_id);
        return fd?.audit?.farm_id === f.id && deadlineState(c, db.settings) === "Overdue";
      }).length
    };
  });
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600 mx-auto mb-4"></div>
          <p className="text-sm text-slate-500">Loading compliance data...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Compliance Reports" sub="Current compliance classification per facility against configured thresholds" />
      <div className="mb-4 flex flex-wrap gap-2 text-[11px] font-bold">
        <Badge tone="success">Excellent ≥ {db.settings.thresholds.excellent}</Badge>
        <Badge tone="brand">Good ≥ {db.settings.thresholds.good}</Badge>
        <Badge tone="warning">Needs Improvement ≥ {db.settings.thresholds.needsImprovement}</Badge>
        <Badge tone="danger">Poor &lt; {db.settings.thresholds.needsImprovement}</Badge>
      </div>
      <div className="card overflow-hidden">
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-[12.5px]">
            <thead><tr className="border-b border-ink-100 bg-ink-50/70 text-[10.5px] uppercase tracking-wider text-slate-400">
              {["Farm", "Type", "Latest Score", "Classification", "Trend", "Audits", "Open Findings", "Overdue CAs", ""].map((h, i) => <th key={i} className="px-3.5 py-2.5 font-bold">{h}</th>)}
            </tr></thead>
            <tbody>
              {rows.map(({ f, latest, cls, audits, hist, open, overdueCA }) => (
                <tr key={f.id} className="cursor-pointer border-b border-ink-100/70 last:border-0 hover:bg-brand-50/40" onClick={() => nav(`/farm/${f.id}`)}>
                  <td className="px-3.5 py-3 font-bold text-ink-900">{f.farm_name}<p className="font-mono text-[10px] font-medium text-slate-400">{f.farm_code}</p></td>
                  <td className="px-3.5 py-3"><Badge tone="navy">{f.farm_type}</Badge></td>
                  <td className="px-3.5 py-3"><ScorePill score={latest} /></td>
                  <td className="px-3.5 py-3"><Badge tone={cls === "Excellent" ? "success" : cls === "Good" ? "brand" : cls === "Needs Improvement" ? "warning" : "danger"} dot>{cls}</Badge></td>
                  <td className="px-3.5 py-3"><Sparkline data={hist} width={100} height={26} stroke={cls === "Poor" || cls === "Needs Improvement" ? "#d97706" : "#2251cf"} /></td>
                  <td className="px-3.5 py-3 font-mono">{audits}</td>
                  <td className="px-3.5 py-3">{open > 0 ? <Badge tone="danger" dot>{open}</Badge> : <Badge tone="success">0</Badge>}</td>
                  <td className="px-3.5 py-3">{overdueCA > 0 ? <Badge tone="danger" dot>{overdueCA}</Badge> : <span className="text-slate-300">0</span>}</td>
                  <td className="px-3.5 py-3 text-brand-600"><ArrowRight size={14} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ── Comparison ───────────────────────────────────────────────────────── */
export function ComparisonPage() {
  const { db } = useApp();
  const [farms, setFarms] = useState<any[]>([]);
  const [audits, setAudits] = useState<any[]>([]);
  const [findings, setFindings] = useState<any[]>([]);
  const [cas, setCas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<string[]>([]);
  const COLORS = ["#2251cf", "#0e7490", "#b45309"];

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const farmsResult = await farmService.listFarms();
        const farmsData = farmsResult.data || [];
        setFarms(farmsData);
        setSel([farmsData[0]?.id, farmsData[3]?.id].filter(Boolean) as string[]);
        
        const auditsResult = await auditService.listAudits({});
        setAudits(auditsResult.data || []);
        
        const findingsResult = await findingService.listFindings({});
        setFindings(findingsResult.data || []);
        
        const casResult = await caService.listCorrectiveActions({});
        setCas(casResult.data || []);
      } catch (error) {
        console.error("Failed to load comparison data:", error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 3 ? s : [...s, id]));

  const data = useMemo(() => {
    const per = sel.map((fid) => {
      const latest = audits.filter((a: any) => a.farm_id === fid && ["completed", "submitted", "under_review"].includes(a.status))
        .sort((a: any, b: any) => b.scheduled_date.localeCompare(a.scheduled_date))[0];
      const s = latest ? { overall: latest.overall_score, categories: [] } : null;
      const auditFindings = findings.filter((f: any) => f.audit_id === latest?.id);
      const farmFindings = findings.filter((f: any) => f.audit?.farm_id === fid);
      const farmCAs = cas.filter((c: any) => farmFindings.some((f: any) => f.id === c.finding_id));
      return {
        fid, name: farms.find((f: any) => f.id === fid)?.farm_name ?? "", audit: latest, score: s,
        findings: farmFindings.length,
        critical: farmFindings.filter((f: any) => f.severity === "Critical").length,
        major: farmFindings.filter((f: any) => f.severity === "Major").length,
        openCA: farmCAs.filter((c: any) => !["verified", "closed"].includes(c.status)).length,
        overdueCA: farmCAs.filter((c: any) => deadlineState(c, db.settings) === "Overdue").length,
      };
    });
    const chart = db.templates[0].categories.map((cat: any) => {
      const row: Record<string, string | number> = { cat: cat.name.split(" & ")[0] };
      per.forEach((p) => { row[p.name] = 0; }); // Simplified for now
      return row;
    });
    return { per, chart };
  }, [sel, audits, findings, cas, farms, db]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600 mx-auto mb-4"></div>
          <p className="text-sm text-slate-500">Loading comparison data...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Farm Comparison" sub="Side-by-side compliance, findings and corrective action position — select up to 3 facilities" />
      <div className="mb-4 flex flex-wrap gap-1.5">
        {farms.map((f: any) => {
          const i = sel.indexOf(f.id);
          return (
            <button key={f.id} onClick={() => toggle(f.id)}
              className={cn("rounded-lg border-2 px-3 py-1.5 text-[12px] font-bold transition-all cursor-pointer", i >= 0 ? "text-white" : "border-ink-200 bg-white text-slate-500 hover:border-brand-300")}
              style={i >= 0 ? { background: COLORS[i], borderColor: COLORS[i] } : undefined}>
              {f.farm_name}
            </button>
          );
        })}
      </div>
      {sel.length < 2 ? <EmptyState title="Select at least two farms" body="Pick facilities above to compare category scores and finding profiles." /> : (
        <>
          <Card className="mb-4 p-4">
            <SectionTitle>Category Scores — latest audit per farm</SectionTitle>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.chart} margin={{ left: -12, right: 8 }}>
                  <CartesianGrid vertical={false} stroke="#e7edf5" />
                  <XAxis dataKey="cat" tick={{ fontSize: 11, fill: "#7d8ea8" }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#7d8ea8" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tip} formatter={(v: number) => [`${v}%`]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {data.per.map((p, i) => <Bar key={p.fid} dataKey={p.name} fill={COLORS[i]} radius={[5, 5, 0, 0]} barSize={22} />)}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card className="overflow-hidden">
            <div className="scroll-thin overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-[12.5px]">
                <thead><tr className="border-b border-ink-100 bg-ink-50/70 text-[10.5px] uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-2.5 font-bold">Metric</th>
                  {data.per.map((p, i) => <th key={p.fid} className="px-4 py-2.5 font-bold" style={{ color: COLORS[i] }}>{p.name}<p className="font-mono text-[9.5px] font-medium text-slate-400">{p.audit?.code ?? "no audit"}</p></th>)}
                </tr></thead>
                <tbody>
                  {([
                    ["Overall score", (p: (typeof data.per)[number]) => <ScorePill score={p.score?.overall ?? null} />],
                    ["Classification", (p: (typeof data.per)[number]) => p.score ? classifyScore(p.score.overall, db.settings) : "—"],
                    ["Findings (all time)", (p: (typeof data.per)[number]) => p.findings],
                    ["Critical findings", (p: (typeof data.per)[number]) => <span className={p.critical ? "font-bold text-red-700" : ""}>{p.critical}</span>],
                    ["Major findings", (p: (typeof data.per)[number]) => <span className={p.major ? "font-bold text-orange-600" : ""}>{p.major}</span>],
                    ["Open corrective actions", (p: (typeof data.per)[number]) => p.openCA],
                    ["Overdue actions", (p: (typeof data.per)[number]) => <span className={p.overdueCA ? "font-bold text-red-700" : ""}>{p.overdueCA}</span>],
                  ] as const).map(([label, fn]) => (
                    <tr key={label as string} className="border-b border-ink-100/70 last:border-0">
                      <td className="px-4 py-2.5 font-bold text-ink-700">{label}</td>
                      {data.per.map((p) => <td key={p.fid} className="px-4 py-2.5">{(fn as (p: (typeof data.per)[number]) => React.ReactNode)(p)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

/* ── Trends ───────────────────────────────────────────────────────────── */
export function TrendsPage() {
  const { db } = useApp();
  const nav = useNavigate();

  const months = useMemo(() => {
    const keys = [...new Set(db.audits.map((a) => monthKey(a.date)))].sort();
    return keys.map((k) => {
      const scored = db.audits.filter((a) => monthKey(a.date) === k && ["Completed", "Submitted", "Under Review"].includes(a.status))
        .map((a) => computeAuditScore(db.templates[0], a.responses, db.settings).overall ?? 0);
      const created = db.findings.filter((f) => monthKey(f.createdAt.slice(0, 10)) === k).length;
      const closed = db.findings.filter((f) => monthKey(f.createdAt.slice(0, 10)) === k && ["Closed", "Verified"].includes(f.status)).length;
      return { k, label: monthLabel(k), score: scored.length ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length) : null, audits: scored.length, created, closure: created ? Math.round((closed / created) * 100) : 100 };
    });
  }, [db]);

  const catMove = useMemo(() => db.templates[0].categories.map((cat) => {
    const avgIn = (m: string) => {
      const scores = db.audits.filter((a) => monthKey(a.date) === m && ["Completed", "Submitted", "Under Review"].includes(a.status))
        .map((a) => computeAuditScore(db.templates[0], a.responses, db.settings).categories.find((c) => c.id === cat.id)?.score)
        .filter((v): v is number => v !== null && v !== undefined);
      return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    };
    const keys = months.map((m) => m.k).filter((k) => avgIn(k) !== null);
    const prev = keys.length > 1 ? avgIn(keys[keys.length - 2]) : null;
    const last = keys.length ? avgIn(keys[keys.length - 1]) : null;
    return { cat: cat.name, prev, last, delta: prev !== null && last !== null ? Math.round(last - prev) : null };
  }), [db, months]);

  const recGroups = useMemo(() => {
    const ids = recurringFindingIds(db.findings);
    const map = new Map<string, typeof db.findings>();
    db.findings.filter((f) => ids.has(f.id)).forEach((f) => {
      const k = `${f.farmId}|${f.questionId}`;
      map.set(k, [...(map.get(k) ?? []), f]);
    });
    return [...map.values()].sort((a, b) => b.length - a.length).slice(0, 6);
  }, [db.findings]);

  const auditorLoad = db.users.filter((u) => u.role === "AUDITOR").map((u) => ({
    u, audits: db.audits.filter((a) => a.leadAuditorId === u.id).length,
    findings: db.findings.filter((f) => db.audits.find((a) => a.id === f.auditId)?.leadAuditorId === u.id).length,
  }));

  return (
    <div>
      <PageHeader title="Trend Analysis" sub="Historical compliance movement, finding frequency, closure rate and systemic recurrence" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="p-4">
          <SectionTitle>Compliance Score Trend</SectionTitle>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={months.filter((m) => m.score !== null)} margin={{ left: -12, right: 8 }}>
                <CartesianGrid vertical={false} stroke="#e7edf5" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#7d8ea8" }} axisLine={false} tickLine={false} />
                <YAxis domain={[50, 100]} tick={{ fontSize: 11, fill: "#7d8ea8" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tip} formatter={(v: number) => [`${v}%`, "Avg compliance"]} />
                <Line type="monotone" dataKey="score" stroke="#2251cf" strokeWidth={2.5} dot={{ r: 4, fill: "#fff", strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-4">
          <SectionTitle>Finding Frequency & Closure Rate</SectionTitle>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={months} margin={{ left: -16, right: 8 }}>
                <CartesianGrid vertical={false} stroke="#e7edf5" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#7d8ea8" }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="l" tick={{ fontSize: 11, fill: "#7d8ea8" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis yAxisId="r" orientation="right" domain={[0, 100]} tick={{ fontSize: 10, fill: "#16a34a" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tip} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="l" dataKey="created" name="Findings raised" fill="#29466f" radius={[4, 4, 0, 0]} barSize={20} />
                <Line yAxisId="r" dataKey="closure" name="Closure rate %" stroke="#16a34a" strokeWidth={2} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4">
          <SectionTitle>Category Movement (latest month vs previous)</SectionTitle>
          <div className="space-y-2.5">
            {catMove.map((c) => (
              <div key={c.cat} className="flex items-center gap-3 rounded-lg border border-ink-100 px-3 py-2.5">
                <span className="flex-1 text-[13px] font-bold text-ink-800">{c.cat}</span>
                <span className="font-mono text-xs text-slate-400">{c.prev !== null ? `${Math.round(c.prev)}%` : "—"}</span>
                <ArrowRight size={13} className="text-slate-300" />
                <span className="font-mono text-xs font-bold text-ink-900">{c.last !== null ? `${Math.round(c.last)}%` : "—"}</span>
                {c.delta !== null && (
                  <Badge tone={c.delta >= 0 ? "success" : "danger"} dot>
                    {c.delta >= 0 ? "▲ Improving" : "▼ Deteriorating"} {c.delta >= 0 ? "+" : ""}{c.delta}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <SectionTitle>Recurring Findings — systemic problems</SectionTitle>
          <div className="space-y-2">
            {recGroups.map((g) => (
              <button key={g[0].id} onClick={() => nav(`/finding/${g[0].id}`)} className="block w-full rounded-lg border border-violet-100 bg-violet-50/40 px-3 py-2.5 text-left transition-colors hover:bg-violet-50 cursor-pointer">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[12.5px] font-bold text-ink-900">{g[0].title}</span>
                  <Badge tone="violet">×{g.length} audits</Badge>
                  <span className="ml-auto text-[11px] font-semibold text-slate-400">{getFarm(db, g[0].farmId)?.name}</span>
                </div>
                <div className="mt-1 flex gap-1">
                  {[...new Set(g.map((f) => monthLabel(monthKey(f.createdAt.slice(0, 10)))))].map((m) => (
                    <span key={m} className="rounded bg-white px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-violet-700 ring-1 ring-violet-200">{m}</span>
                  ))}
                </div>
              </button>
            ))}
            {recGroups.length === 0 && <p className="py-6 text-center text-xs text-slate-400">No recurring findings detected.</p>}
          </div>
        </Card>

        <Card className="p-4">
          <SectionTitle>Farm Performance</SectionTitle>
          {db.farms.map((f) => {
            const hist = db.audits.filter((a) => a.farmId === f.id && ["Completed", "Submitted", "Under Review"].includes(a.status))
              .sort((a, b) => a.date.localeCompare(b.date)).map((a) => computeAuditScore(db.templates[0], a.responses, db.settings).overall ?? 0);
            const delta = hist.length > 1 ? hist[hist.length - 1] - hist[0] : null;
            return (
              <div key={f.id} className="mb-2 flex items-center gap-3">
                <span className="w-40 truncate text-[12.5px] font-bold text-ink-800">{f.name}</span>
                <Sparkline data={hist} width={130} height={28} stroke={delta !== null && delta < 0 ? "#b91c1c" : "#2251cf"} />
                <span className="font-mono text-xs font-bold text-ink-900">{hist.length ? `${hist[hist.length - 1]}%` : "—"}</span>
                {delta !== null && <Badge tone={delta >= 0 ? "success" : "danger"}>{delta >= 0 ? "+" : ""}{delta} pts</Badge>}
              </div>
            );
          })}
        </Card>

        <Card className="p-4">
          <SectionTitle>Auditor Activity</SectionTitle>
          {auditorLoad.map(({ u, audits, findings }) => (
            <div key={u.id} className="mb-2.5 flex items-center gap-3 rounded-lg border border-ink-100 px-3 py-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full font-display text-[11px] font-bold text-white" style={{ background: u.color }}>{u.name.split(" ").map((x) => x[0]).join("")}</span>
              <div className="flex-1"><p className="text-[12.5px] font-bold text-ink-800">{u.name}</p><p className="text-[10.5px] text-slate-400">{u.title}</p></div>
              <div className="text-right"><p className="font-mono text-sm font-bold text-ink-900">{audits}</p><p className="text-[9.5px] font-bold uppercase text-slate-400">audits</p></div>
              <div className="text-right"><p className="font-mono text-sm font-bold text-ink-900">{findings}</p><p className="text-[9.5px] font-bold uppercase text-slate-400">findings</p></div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
