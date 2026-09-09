import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  AlertTriangle, ArrowLeft, CalendarClock, Camera, CheckCircle2, FileText, Flame, RotateCcw, Send, ShieldCheck, ThumbsDown, Wrench, XCircle,
} from "lucide-react";
import { useApp, getUser, getFarm, templateOf } from "../store";
import { Badge, Button, Card, CABadge, DataTable, DeadlineBadge, EmptyState, Field, FindingBadge, Input, Modal, PageHeader, RiskBadge, SectionTitle, Select, SeverityBadge, Textarea, type Col, cn } from "../components/ui";
import { addDaysISO, daysUntil, deadlineState, findQuestion, fmtDate, fmtDateTime, recurringFindingIds, riskBand, riskScore, todayISO } from "../lib";
import type { CorrectiveAction, DeadlineState, Finding, Severity } from "../types";
import { SEVERITIES } from "../types";
import * as findingService from "../services/finding/finding.service";
import * as caService from "../services/finding/corrective-action.service";
import { uploadQueue } from "../services/audit";

/* ── Findings list ────────────────────────────────────────────────────── */
export function FindingsPage({ openOnly }: { openOnly?: boolean }) {
  const { db, user } = useApp();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const [sev, setSev] = useState(sp.get("sev") ?? "all");
  const [cat, setCat] = useState(sp.get("cat") ?? "all");
  const [farm, setFarm] = useState(sp.get("farm") ?? "all");
  const [status, setStatus] = useState(sp.get("status") ?? "all");
  const [findings, setFindings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  React.useEffect(() => { setSev(sp.get("sev") ?? "all"); setCat(sp.get("cat") ?? "all"); setFarm(sp.get("farm") ?? "all"); }, [sp]);

  useEffect(() => {
    const loadFindings = async () => {
      try {
        setLoading(true);
        const filters: any = {};
        if (sev !== "all") filters.severity = sev;
        if (cat !== "all") filters.category = cat;
        if (farm !== "all") filters.farm_id = farm;
        if (status !== "all") filters.status = status;
        if (openOnly) filters.status = "open";
        
        const result = await findingService.listFindings(filters);
        setFindings(result.data || []);
      } catch (error) {
        console.error("Failed to load findings:", error);
      } finally {
        setLoading(false);
      }
    };
    loadFindings();
  }, [sev, cat, farm, status, openOnly]);

  const recIds = useMemo(() => recurringFindingIds(findings), [findings]);
  const rows = useMemo(() => {
    let list = findings;
    const auditFilter = sp.get("audit");
    if (auditFilter) list = list.filter((f: any) => f.audit_id === auditFilter);
    return list.map((f: any) => ({
      ...f, 
      id: f.id,
      code: f.finding_number,
      title: f.title,
      severity: f.severity,
      status: f.status,
      farmId: f.audit?.farm_id,
      categoryId: f.category,
      responsibleId: f.assigned_to,
      likelihood: f.risk_level === "critical" ? 5 : f.risk_level === "high" ? 4 : f.risk_level === "medium" ? 3 : 2,
      impact: f.risk_level === "critical" ? 5 : f.risk_level === "high" ? 4 : f.risk_level === "medium" ? 3 : 2,
      dueDate: f.due_date,
      createdAt: f.created_at,
      farmName: f.audit?.farms?.farm_name ?? "",
      catName: f.category ?? "",
      responsible: f.assignee?.full_name ?? "",
      risk: riskScore(f.risk_level === "critical" ? 5 : f.risk_level === "high" ? 4 : f.risk_level === "medium" ? 3 : 2, f.risk_level === "critical" ? 5 : f.risk_level === "high" ? 4 : f.risk_level === "medium" ? 3 : 2),
      recurring: recIds.has(f.id),
      due: f.due_date,
    })).sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt));
  }, [findings, sp, recIds]);

  const cols: Col<typeof rows[number]>[] = [
    { key: "code", label: "Finding", sortValue: (r) => r.code, render: (r) => (
      <div><span className="font-mono text-xs font-bold text-brand-700">{r.code}</span>
        <p className="max-w-[240px] truncate text-[12px] font-semibold text-ink-900">{r.title}</p>
        {r.recurring && <Badge tone="violet" className="mt-0.5">Recurring</Badge>}</div>) },
    { key: "farmName", label: "Farm", sortValue: (r) => r.farmName },
    { key: "catName", label: "Category", sortValue: (r) => r.catName, render: (r) => <span className="text-slate-600">{r.catName}</span> },
    { key: "severity", label: "Severity", sortValue: (r) => SEVERITIES.indexOf(r.severity), render: (r) => <SeverityBadge severity={r.severity} /> },
    { key: "risk", label: "Risk", align: "center", sortValue: (r) => r.risk, render: (r) => <RiskBadge level={riskBand(r.likelihood, r.impact, db.settings)} score={r.risk} /> },
    { key: "responsible", label: "Owner", sortValue: (r) => r.responsible },
    { key: "due", label: "Due", sortValue: (r) => r.due, render: (r) => (
      <div><span className="text-[12px] font-semibold">{fmtDate(r.due)}</span>
        {daysUntil(r.due) < 0 && !["Closed", "Verified"].includes(r.status) && <p className="font-mono text-[10px] font-bold text-red-600">{Math.abs(daysUntil(r.due))}d overdue</p>}</div>) },
    { key: "status", label: "Status", sortValue: (r) => r.status, render: (r) => <FindingBadge status={r.status} /> },
  ];

  return (
    <div>
      <PageHeader title={openOnly ? "Open Findings" : "All Findings"}
        sub={`${rows.length} finding${rows.length === 1 ? "" : "s"} · non-conformances stay traceable to the original checklist response and evidence`} />
      <div className="mb-3 flex flex-wrap gap-2">
        <Select value={sev} onChange={(e) => setSev(e.target.value)} className="!w-auto !py-1.5 !text-xs"><option value="all">All severities</option>{SEVERITIES.map((s) => <option key={s}>{s}</option>)}</Select>
        <Select value={cat} onChange={(e) => setCat(e.target.value)} className="!w-auto !py-1.5 !text-xs"><option value="all">All categories</option>{db.templates[0].categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Select value={farm} onChange={(e) => setFarm(e.target.value)} className="!w-auto !py-1.5 !text-xs"><option value="all">All farms</option>{db.farms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="!w-auto !py-1.5 !text-xs"><option value="all">All statuses</option>{["Open", "Action Required", "In Progress", "Submitted for Verification", "Verified", "Closed", "Rejected"].map((s) => <option key={s}>{s}</option>)}</Select>
      </div>
      <DataTable rows={rows} cols={cols} exportName={openOnly ? "open-findings" : "findings"} onRowClick={(r) => nav(`/finding/${r.id}`)} pageSize={10}
        empty={<EmptyState icon={<AlertTriangle size={20} />} title={openOnly ? "No open findings" : "No findings"} body="Findings are generated automatically from non-compliant checklist responses." />} />
    </div>
  );
}

/* ── Finding detail + CAP workflow ────────────────────────────────────── */
const CA_FLOW = ["Open", "In Progress", "Submitted for Verification", "Verified"];

export function FindingDetailPage() {
  const { id } = useParams();
  const { db, user, can, toast } = useApp();
  const nav = useNavigate();
  const [finding, setFinding] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [caModal, setCaModal] = useState(false);
  const [caForm, setCaForm] = useState({ action: "", rootCause: "", responsibleId: "", targetDate: addDaysISO(todayISO(), 14) });
  const [verModal, setVerModal] = useState<"approve" | "reject" | null>(null);
  const [verNotes, setVerNotes] = useState("");
  const [evModal, setEvModal] = useState(false);
  const [evDesc, setEvDesc] = useState("");
  const [evFile, setEvFile] = useState<File | null>(null);
  const [cas, setCas] = useState<any[]>([]);

  useEffect(() => {
    const loadFinding = async () => {
      if (!id) return;
      try {
        setLoading(true);
        const f = await findingService.getFinding(id);
        setFinding(f);
        if (f) {
          const casResult = await caService.getCorrectiveActionsByFinding(id);
          setCas(casResult || []);
        }
      } catch (error) {
        console.error("Failed to load finding:", error);
      } finally {
        setLoading(false);
      }
    };
    loadFinding();
  }, [id]);

  if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div></div>;
  if (!finding || !user) return <EmptyState title="Finding not found" action={<Link to="/findings"><Button variant="dark">All findings</Button></Link>} />;

  const farm = getFarm(db, finding.farm_id);
  const audit = db.audits.find((a) => a.id === finding.audit_id);
  const tpl = audit ? templateOf(db, audit) : db.templates[0];
  const fq = findQuestion(tpl, finding.question_id);
  const ca = cas[0];
  const evidence = db.evidence.filter((e) => e.findingId === finding.id || (e.auditId === finding.audit_id && e.questionId === finding.question_id));
  const recIds = recurringFindingIds(db.findings);
  const isRecurring = recIds.has(finding.id);
  const recCount = db.findings.filter((f) => f.farmId === finding.farm_id && f.questionId === finding.question_id).length;
  const band = riskBand(finding.risk_level === "critical" ? 5 : finding.risk_level === "high" ? 4 : finding.risk_level === "medium" ? 3 : 2, finding.risk_level === "critical" ? 5 : finding.risk_level === "high" ? 4 : finding.risk_level === "medium" ? 3 : 2, db.settings);
  const isOwner = can("submit_ca") && (finding.assigned_to === user.id || user.farmId === finding.audit?.farms?.id);
  const isVerifier = can("verify_ca");
  const dlState: DeadlineState = ca ? deadlineState(ca, db.settings) : daysUntil(finding.due_date) < 0 ? "Overdue" : daysUntil(finding.due_date) <= db.settings.dueSoonDays ? "Due Soon" : "On Track";
  const caIdx = ca ? CA_FLOW.indexOf(ca.status === "Rejected" ? "In Progress" : ca.status === "Closed" ? "Verified" : ca.status) : -1;
  const rejected = ca ? ca.status === "Rejected" : false;

  const saveCA = async () => {
    if (!caForm.action.trim()) { toast("Describe the corrective action", "error"); return; }
    if (caForm.targetDate < finding.created_at.slice(0, 10)) { toast("Target date cannot precede the finding date", "error"); return; }
    try {
      await caService.createCorrectiveAction({
        finding_id: finding.id,
        action: caForm.action,
        responsible_person: caForm.responsibleId || finding.assigned_to,
        due_date: caForm.targetDate,
        status: "open",
        verification_status: "pending",
        started_at: null,
        submitted_at: null,
        completed_at: null,
        verified_by: null,
        verification_date: null,
        verification_comment: null,
        reopened_at: null,
        reopened_by: null,
        reopen_reason: null,
      });
      toast("Corrective action created and owner notified");
      setCaModal(false);
      // Reload corrective actions
      const casResult = await caService.getCorrectiveActionsByFinding(finding.id);
      setCas(casResult || []);
    } catch (error) {
      console.error("Failed to create corrective action:", error);
      toast("Failed to create corrective action", "error");
    }
  };

  const doVerify = async () => {
    if (!ca) return;
    if (!verNotes.trim()) { toast("Verification notes are required", "error"); return; }
    try {
      if (verModal === "approve") {
        await caService.verifyCorrectiveAction(ca.id, user.id, verNotes, true);
        toast("Corrective action verified — finding closed");
      } else {
        await caService.verifyCorrectiveAction(ca.id, user.id, verNotes, false);
        toast("Verification rejected — returned to owner", "info");
      }
      setVerModal(null);
      setVerNotes("");
      // Reload corrective actions
      const casResult = await caService.getCorrectiveActionsByFinding(finding.id);
      setCas(casResult || []);
    } catch (error) {
      console.error("Failed to verify corrective action:", error);
      toast("Failed to verify corrective action", "error");
    }
  };

  return (
    <div>
      <button onClick={() => nav(-1)} className="mb-3 inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-ink-900 cursor-pointer"><ArrowLeft size={13} /> Back</button>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-xl font-extrabold text-ink-900">{finding.code}</h1>
            <SeverityBadge severity={finding.severity} />
            <RiskBadge level={band} score={riskScore(finding.likelihood, finding.impact)} />
            <FindingBadge status={finding.status} />
            {isRecurring && <Badge tone="violet" dot pulse>Recurring Finding Detected ×{recCount}</Badge>}
          </div>
          <h2 className="mt-1 max-w-2xl font-display text-[15px] font-bold text-ink-800">{finding.title}</h2>
          <p className="mt-0.5 text-[12.5px] text-slate-500">
            <Link to={`/farm/${farm?.id}`} className="font-bold text-brand-700 hover:underline">{farm?.name}</Link>
            {" · "}<Link to={`/audit/${finding.auditId}`} className="font-mono text-xs hover:underline">{audit?.code}</Link>
            {" · raised "}{fmtDate(finding.createdAt.slice(0, 10))} by {getUser(db, audit?.leadAuditorId)?.name}
          </p>
        </div>
        <div className="flex gap-2">
          {!ca && can("manage_findings") && <Button icon={<Wrench size={14} />} onClick={() => { setCaForm({ action: finding.recommendation, rootCause: finding.rootCause, responsibleId: finding.responsibleId, targetDate: finding.dueDate }); setCaModal(true); }}>Create corrective action</Button>}
        </div>
      </div>

      {isRecurring && (
        <div className="mb-4 rounded-xl border border-violet-200 bg-violet-50/70 px-4 py-3">
          <p className="text-[12.5px] font-bold text-violet-800">⚠ Systemic issue — this exact requirement failed in {recCount} separate audits at {farm?.name}.</p>
          <p className="text-[11.5px] text-violet-700">Treat as a recurring finding: verify the root cause analysis addresses the underlying process, not just the latest occurrence.</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="p-4 xl:col-span-2">
          <SectionTitle>Finding Detail</SectionTitle>
          <p className="text-[13px] leading-relaxed text-ink-800">{finding.description}</p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-ink-50/70 p-3"><p className="label !mb-1">Checklist requirement</p>
              <p className="text-[12.5px] font-medium text-ink-800">{fq?.q.text ?? "—"}</p>
              {fq?.q.reference && <Badge tone="navy" className="mt-1.5">{fq.q.reference}</Badge>}
            </div>
            <div className="rounded-lg bg-ink-50/70 p-3"><p className="label !mb-1">Category</p>
              <p className="text-[12.5px] font-medium text-ink-800">{db.templates[0].categories.find((c) => c.id === finding.categoryId)?.name} → {fq?.sub.name}</p>
              <p className="mt-1.5 text-[11px] text-slate-500">Likelihood {finding.likelihood} × Impact {finding.impact} = <strong>{riskScore(finding.likelihood, finding.impact)}</strong></p>
            </div>
            <div className="rounded-lg bg-ink-50/70 p-3"><p className="label !mb-1">Root cause</p><p className="text-[12.5px] font-medium text-ink-800">{finding.rootCause || "Pending analysis"}</p></div>
            <div className="rounded-lg bg-ink-50/70 p-3"><p className="label !mb-1">Recommendation</p><p className="text-[12.5px] font-medium text-ink-800">{finding.recommendation}</p></div>
            <div className="rounded-lg bg-ink-50/70 p-3"><p className="label !mb-1">Responsible</p><p className="text-[12.5px] font-bold text-ink-800">{getUser(db, finding.responsibleId)?.name}</p><p className="text-[11px] text-slate-400">{getUser(db, finding.responsibleId)?.title}</p></div>
            <div className="rounded-lg bg-ink-50/70 p-3"><p className="label !mb-1">Due date</p>
              <p className="text-[12.5px] font-bold text-ink-800">{fmtDate(finding.dueDate)}</p>
              <div className="mt-1"><DeadlineBadge state={dlState} /></div>
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <SectionTitle>Evidence ({evidence.length})</SectionTitle>
            <div className="grid grid-cols-2 gap-2">
              {evidence.map((e) => (
                <div key={e.id} className="overflow-hidden rounded-lg border border-ink-100">
                  <div className="h-20 bg-ink-100">
                    {e.imageUrl ? <img src={e.imageUrl} alt={e.description} className="h-full w-full object-cover" onError={(ev) => ((ev.target as HTMLImageElement).style.display = "none")} /> : <div className="flex h-full items-center justify-center"><FileText size={18} className="text-ink-300" /></div>}
                  </div>
                  <p className="truncate px-2 py-1 text-[10px] font-semibold text-slate-500">{e.description || e.fileName}</p>
                </div>
              ))}
              {evidence.length === 0 && <p className="col-span-2 py-4 text-center text-xs text-slate-400">No evidence attached.</p>}
            </div>
          </Card>
          <Card className="p-4">
            <SectionTitle>Traceability</SectionTitle>
            <ul className="space-y-1.5 text-[12px] text-slate-600">
              <li>▸ Audit response: <Link className="font-bold text-brand-700 hover:underline" to={`/audit/${finding.auditId}`}>{audit?.code}</Link> → {finding.questionId.toUpperCase()}</li>
              <li>▸ Checklist version: {tpl.version}</li>
              <li>▸ Original respondent answers are immutable after submission</li>
              <li>▸ All workflow changes recorded in the activity log</li>
            </ul>
          </Card>
        </div>
      </div>

      {/* CAP workflow */}
      <Card className="mt-4 p-4">
        <SectionTitle right={ca ? <CABadge status={ca.status} /> : <Badge tone="neutral">No corrective action yet</Badge>}>Corrective Action Workflow</SectionTitle>
        {!ca ? (
          <div className="rounded-lg border border-dashed border-ink-200 p-5 text-center">
            <p className="text-[13px] font-semibold text-ink-700">{finding.severity === "Critical" || finding.severity === "Major" ? "Critical/Major findings require a corrective action." : "No corrective action recorded for this finding."}</p>
            {can("manage_findings") && <Button className="mt-3" icon={<Wrench size={14} />} onClick={() => { setCaForm({ action: finding.recommendation, rootCause: finding.rootCause, responsibleId: finding.responsibleId, targetDate: finding.dueDate }); setCaModal(true); }}>Create corrective action</Button>}
          </div>
        ) : (
          <div>
            {/* flow */}
            <div className="mb-4 flex flex-wrap items-center gap-1">
              {CA_FLOW.map((s, i) => {
                const done = caIdx >= i || (ca.status === "Closed");
                const rejected = ca.status === "Rejected";
                return (
                  <React.Fragment key={s}>
                    {i > 0 && <span className={cn("h-0.5 w-5 rounded sm:w-9", done ? "bg-green-500" : "bg-ink-100")} />}
                    <div className="flex items-center gap-1.5">
                      <span className={cn("flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold", done ? "bg-green-600 text-white" : "bg-ink-100 text-slate-400")}>{done ? <CheckCircle2 size={12} /> : i + 1}</span>
                      <span className={cn("text-[10.5px] font-bold", done ? "text-ink-800" : "text-slate-400")}>{s === "Submitted for Verification" ? "Submitted" : s}</span>
                    </div>
                  </React.Fragment>
                );
              })}
              {ca.status === "Rejected" && <Badge tone="danger" className="ml-2" dot>Verification failed — returned to owner</Badge>}
              {rejected && ca.verificationNotes && <p className="ml-2 max-w-xs truncate text-[11px] text-red-600">“{ca.verificationNotes}”</p>}
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              <div className="rounded-lg bg-ink-50/70 p-3">
                <p className="label !mb-1">Corrective action</p>
                <p className="text-[12.5px] font-medium text-ink-800">{ca.action}</p>
                <p className="mt-2 text-[11px] text-slate-500"><strong>Root cause:</strong> {ca.rootCause}</p>
                <p className="text-[11px] text-slate-500"><strong>Owner:</strong> {getUser(db, ca.responsibleId)?.name} · <strong>Target:</strong> {fmtDate(ca.targetDate)}</p>
                {ca.completionDate && <p className="text-[11px] text-green-700"><strong>Completed:</strong> {fmtDate(ca.completionDate)}</p>}
              </div>
              <div className="rounded-lg bg-ink-50/70 p-3">
                <p className="label !mb-1">Completion evidence ({db.evidence.filter((e) => ca.evidenceIds.includes(e.id)).length})</p>
                <div className="flex flex-wrap gap-1.5">
                  {db.evidence.filter((e) => ca.evidenceIds.includes(e.id)).map((e) => (
                    <div key={e.id} className="h-12 w-16 overflow-hidden rounded-md border border-ink-200 bg-white">
                      {e.imageUrl ? <img src={e.imageUrl} alt="" className="h-full w-full object-cover" onError={(ev) => ((ev.target as HTMLImageElement).style.display = "none")} /> : <div className="flex h-full items-center justify-center"><FileText size={13} className="text-ink-300" /></div>}
                    </div>
                  ))}
                  {isOwner && ["Open", "In Progress", "Rejected"].includes(ca.status) && (
                    <button onClick={() => setEvModal(true)} className="flex h-12 w-16 flex-col items-center justify-center rounded-md border-2 border-dashed border-ink-200 text-slate-400 hover:border-brand-400 hover:text-brand-600 cursor-pointer"><Camera size={13} /><span className="text-[8px] font-bold">Add</span></button>
                  )}
                </div>
              </div>
              <div className="rounded-lg bg-ink-50/70 p-3">
                <p className="label !mb-1">Verification</p>
                {ca.verifiedById ? (
                  <>
                    <p className="text-[12px] font-bold text-green-700">Verified by {getUser(db, ca.verifiedById)?.name}</p>
                    <p className="text-[11px] text-slate-500">{fmtDateTime(ca.verifiedAt)}</p>
                    <p className="mt-1 text-[11.5px] text-ink-700">“{ca.verificationNotes}”</p>
                  </>
                ) : <p className="text-[11.5px] text-slate-500">Awaiting auditor verification after submission.</p>}
              </div>
            </div>

            {/* actions */}
            <div className="mt-4 flex flex-wrap gap-2">
              {isOwner && ca.status === "Open" && <Button onClick={async () => {
                try {
                  await caService.startCorrectiveAction(ca.id, user.id);
                  toast("Corrective action started");
                  const casResult = await caService.getCorrectiveActionsByFinding(finding.id);
                  setCas(casResult || []);
                } catch (error) {
                  console.error("Failed to start corrective action:", error);
                  toast("Failed to start corrective action", "error");
                }
              }} icon={<Wrench size={14} />}>Start work</Button>}
              {isOwner && ca.status === "Rejected" && <Button variant="outline" onClick={async () => {
                try {
                  await caService.reopenCorrectiveAction(ca.id, user.id, "Reopened for update");
                  toast("Action reopened for update", "info");
                  const casResult = await caService.getCorrectiveActionsByFinding(finding.id);
                  setCas(casResult || []);
                } catch (error) {
                  console.error("Failed to reopen corrective action:", error);
                  toast("Failed to reopen corrective action", "error");
                }
              }} icon={<RotateCcw size={14} />}>Update & reopen</Button>}
              {isOwner && ["In Progress", "Rejected"].includes(ca.status) && (
                <Button variant="dark" icon={<Send size={14} />} onClick={async () => {
                  if (db.evidence.filter((e) => ca.evidenceIds.includes(e.id)).length === 0 && ca.evidenceIds.length === 0) { toast("Attach completion evidence before submitting", "error"); setEvModal(true); return; }
                  try {
                    await caService.submitCorrectiveAction(ca.id, user.id);
                    toast("Submitted for verification — auditors notified");
                    const casResult = await caService.getCorrectiveActionsByFinding(finding.id);
                    setCas(casResult || []);
                  } catch (error) {
                    console.error("Failed to submit corrective action:", error);
                    toast("Failed to submit corrective action", "error");
                  }
                }}>Submit for verification</Button>
              )}
              {isVerifier && ca.status === "Submitted for Verification" && (
                <>
                  <Button variant="success" icon={<ShieldCheck size={14} />} onClick={() => setVerModal("approve")}>Verify & close</Button>
                  <Button variant="danger" icon={<XCircle size={14} />} onClick={() => setVerModal("reject")}>Reject</Button>
                </>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* modals */}
      <Modal open={caModal} onClose={() => setCaModal(false)} title="Create Corrective Action"
        footer={<><Button variant="ghost" onClick={() => setCaModal(false)}>Cancel</Button><Button onClick={saveCA}>Create action</Button></>}>
        <Field label="Corrective action" req><Textarea value={caForm.action} onChange={(e) => setCaForm({ ...caForm, action: e.target.value })} /></Field>
        <Field label="Root cause"><Input value={caForm.rootCause} onChange={(e) => setCaForm({ ...caForm, rootCause: e.target.value })} /></Field>
        <Field label="Responsible person"><Select value={caForm.responsibleId} onChange={(e) => setCaForm({ ...caForm, responsibleId: e.target.value })}>
          {db.users.filter((u) => ["FARM_MANAGER", "SUPERVISOR"].includes(u.role)).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
        <Field label="Target date" req hint="Cannot precede the finding date"><Input type="date" min={finding.createdAt.slice(0, 10)} value={caForm.targetDate} onChange={(e) => setCaForm({ ...caForm, targetDate: e.target.value })} /></Field>
      </Modal>

      <Modal open={!!verModal} onClose={() => setVerModal(null)} title={verModal === "approve" ? "Verify Corrective Action" : "Reject Verification"}
        footer={<><Button variant="ghost" onClick={() => setVerModal(null)}>Cancel</Button>
          <Button variant={verModal === "approve" ? "success" : "danger"} onClick={doVerify}>{verModal === "approve" ? "Verify & close finding" : "Reject & return to owner"}</Button></>}>
        <p className="mb-3 text-[12.5px] text-slate-600">{verModal === "approve"
          ? "Confirm the action is effective. The finding will be closed and the farm team notified. Closure without verification is not permitted."
          : "The action will be returned to the responsible person with your notes for rework."}</p>
        <Field label="Verification notes" req><Textarea value={verNotes} onChange={(e) => setVerNotes(e.target.value)} placeholder="What was re-inspected, which records were reviewed…" /></Field>
      </Modal>

      <Modal open={evModal} onClose={() => setEvModal(false)} title="Attach Completion Evidence"
        footer={<><Button variant="ghost" onClick={() => setEvModal(false)}>Cancel</Button>
          <Button onClick={async () => {
            if (!evDesc.trim()) { toast("Add a caption for the evidence", "error"); return; }
            if (!evFile) { toast("Please select a file", "error"); return; }
            
            try {
              toast("Uploading evidence...", "info");
              
              // Upload file using upload queue
              const uploadId = uploadQueue.addUpload(
                evFile,
                finding.audit_id,
                "default-org", // TODO: Get from user context
                finding.audit?.farm_id || "unknown",
                undefined,
                finding.id
              );
              
              // Wait for upload to complete
              const unsubscribe = uploadQueue.subscribe(async (state) => {
                const upload = state.uploads.find(u => u.id === uploadId);
                if (upload?.status === 'success') {
                  toast("Evidence uploaded successfully", "success");
                  setEvModal(false);
                  setEvDesc("");
                  setEvFile(null);
                  unsubscribe();
                  
                  // Reload finding to show new evidence
                  const f = await findingService.getFinding(finding.id);
                  setFinding(f);
                } else if (upload?.status === 'error') {
                  toast(`Upload failed: ${upload.result?.error || "Unknown error"}`, "error");
                  unsubscribe();
                }
              });
            } catch (error) {
              console.error("Failed to upload evidence:", error);
              toast("Failed to upload evidence", "error");
            }
          }}>Attach</Button></>}>
        <Field label="File" req>
          <input
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf"
            onChange={(e) => setEvFile(e.target.files?.[0] || null)}
            className="w-full"
          />
          <p className="mt-1 text-[10px] text-slate-400">Allowed: JPG, PNG, WEBP, PDF (max 10MB for images, 20MB for PDF)</p>
        </Field>
        <Field label="Caption" req hint="Describe the completed work shown in the evidence"><Input value={evDesc} onChange={(e) => setEvDesc(e.target.value)} placeholder="e.g. Repaired pallet racking, aisle cleared" /></Field>
        <p className="text-[11px] text-slate-400">In production this uploads to the audit’s Supabase Storage bucket; the demo stores metadata + preview.</p>
      </Modal>
    </div>
  );
}

/* ── Corrective actions list / overdue / verification ─────────────────── */
export function CorrectiveActionsPage({ preset }: { preset?: "overdue" | "all" }) {
  const { db, user } = useApp();
  const nav = useNavigate();
  const [tab, setTab] = useState(preset === "overdue" ? "overdue" : "all");
  const [cas, setCas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadCAs = async () => {
      try {
        setLoading(true);
        const result = await caService.listCorrectiveActions({});
        setCas(result.data || []);
      } catch (error) {
        console.error("Failed to load corrective actions:", error);
      } finally {
        setLoading(false);
      }
    };
    loadCAs();
  }, []);

  const rows = useMemo(() => {
    let list = cas.map((c) => {
      return { 
        ...c, 
        id: c.id,
        code: c.code || `CA-${c.id.slice(0, 8)}`,
        action: c.action,
        status: c.status,
        targetDate: c.due_date,
        responsibleId: c.responsible_person,
        findingId: c.finding_id,
        finding: null, // Will be loaded separately if needed
        farmName: "", // Will be loaded from finding
        sev: "Observation" as Severity,
        title: "",
        owner: c.assignee?.full_name || "",
        dl: deadlineState(c, db.settings)
      };
    });
    if (user && (user.role === "FARM_MANAGER" || user.role === "SUPERVISOR")) {
      list = list.filter((r) => r.responsibleId === user.id);
    }
    return list;
  }, [cas, user, db.settings]);

  const filtered = rows.filter((r) => tab === "all" ? true : tab === "open" ? ["open", "in_progress", "rejected"].includes(r.status) : tab === "due" ? r.dl === "Due Soon" : tab === "overdue" ? r.dl === "Overdue" : r.dl === "Completed")
    .sort((a, b) => a.targetDate.localeCompare(b.targetDate));

  const cols: Col<typeof rows[number]>[] = [
    { key: "code", label: "Action", sortValue: (r) => r.code, render: (r) => (
      <div><span className="font-mono text-xs font-bold text-brand-700">{r.code}</span><p className="max-w-[260px] truncate text-[12px] font-semibold text-ink-900">{r.action}</p></div>) },
    { key: "title", label: "Finding", sortValue: (r) => r.title, render: (r) => <span className="text-slate-600">{r.finding?.code} · <span className="line-clamp-1 max-w-[200px]">{r.title}</span></span> },
    { key: "sev", label: "Severity", sortValue: (r) => SEVERITIES.indexOf(r.sev), render: (r) => <SeverityBadge severity={r.sev} /> },
    { key: "farmName", label: "Farm", sortValue: (r) => r.farmName },
    { key: "owner", label: "Owner", sortValue: (r) => r.owner },
    { key: "targetDate", label: "Target", sortValue: (r) => r.targetDate, render: (r) => <span className="font-semibold">{fmtDate(r.targetDate)}</span> },
    { key: "dl", label: "Deadline", sortValue: (r) => ["Overdue", "Due Soon", "On Track", "Completed"].indexOf(r.dl), render: (r) => <DeadlineBadge state={r.dl} /> },
    { key: "status", label: "Status", sortValue: (r) => r.status, render: (r) => <CABadge status={r.status} /> },
  ];

  const counts = { all: rows.length, open: rows.filter((r) => ["Open", "In Progress", "Rejected"].includes(r.status)).length, due: rows.filter((r) => r.dl === "Due Soon").length, overdue: rows.filter((r) => r.dl === "Overdue").length, done: rows.filter((r) => r.dl === "Completed").length };

  return (
    <div>
      <PageHeader title="Corrective Actions" sub="Every finding-driven action with deadline monitoring — Due Soon window is configurable in System Settings" />
      <div className="mb-3 flex flex-wrap gap-1.5">
        {([["all", `All (${counts.all})`], ["open", `Open (${counts.open})`], ["due", `Due soon (${counts.due})`], ["overdue", `Overdue (${counts.overdue})`], ["done", `Completed (${counts.done})`]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("rounded-md border px-2.5 py-1.5 text-[11.5px] font-bold cursor-pointer", tab === k ? "border-ink-900 bg-ink-900 text-white" : "border-ink-200 bg-white text-slate-500 hover:border-brand-300", k === "overdue" && tab !== k && counts.overdue > 0 && "!border-red-200 !bg-red-50 !text-red-700")}>{l}</button>
        ))}
      </div>
      <DataTable rows={filtered} cols={cols} exportName="corrective-actions" onRowClick={(r) => r.finding && nav(`/finding/${r.finding.id}`)} pageSize={10} />
    </div>
  );
}

export function OverduePage() {
  const { db } = useApp();
  const nav = useNavigate();
  const [cas, setCas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadCAs = async () => {
      try {
        setLoading(true);
        const result = await caService.listCorrectiveActions({});
        setCas(result.data || []);
      } catch (error) {
        console.error("Failed to load corrective actions:", error);
      } finally {
        setLoading(false);
      }
    };
    loadCAs();
  }, []);

  const overdue = cas.filter((c) => deadlineState(c, db.settings) === "Overdue");
  const week = cas.filter((c) => { const d = daysUntil(c.due_date); return d >= 0 && d <= 7 && !["verified", "closed"].includes(c.status); });
  const month = cas.filter((c) => { const d = daysUntil(c.due_date); return d > 7 && d <= 30 && !["verified", "closed"].includes(c.status); });
  const cards = [
    { label: "Overdue Critical", n: 0, icon: <Flame size={16} />, cls: "bg-red-600" },
    { label: "Overdue Major", n: 0, icon: <AlertTriangle size={16} />, cls: "bg-orange-500" },
    { label: "Due This Week", n: week.length, icon: <CalendarClock size={16} />, cls: "bg-amber-500" },
    { label: "Due This Month", n: month.length, icon: <CalendarClock size={16} />, cls: "bg-brand-500" },
  ];
  return (
    <div>
      <PageHeader title="Overdue Actions & Deadline Monitor" sub="Automatic classification: Overdue · Due Soon (≤ configured window) · On Track · Completed" />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} className="flex items-center gap-3 p-4">
            <span className={cn("flex h-9 w-9 items-center justify-center rounded-lg text-white", c.cls)}>{c.icon}</span>
            <div><p className="font-mono text-2xl font-bold text-ink-900">{c.n}</p><p className="text-[10.5px] font-bold uppercase tracking-wide text-slate-400">{c.label}</p></div>
          </Card>
        ))}
      </div>
      {overdue.length === 0 ? (
        <EmptyState icon={<CheckCircle2 size={20} />} title="No overdue corrective actions" body="All deadlines are currently under control." />
      ) : (
        <div className="space-y-2.5">
          {overdue.sort((a, b) => a.due_date.localeCompare(b.due_date)).map((c) => (
            <Card key={c.id} className="flex flex-wrap items-center gap-3 p-3.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 font-mono text-sm font-bold text-red-700">{Math.abs(daysUntil(c.due_date))}d</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5"><span className="font-mono text-[10.5px] text-slate-400">{c.code}</span></div>
                <p className="truncate text-[13px] font-bold text-ink-900">{c.action}</p>
                <p className="text-[11.5px] text-slate-500">owner {c.assignee?.full_name || "Unassigned"} · target {fmtDate(c.due_date)}</p>
              </div>
              <CABadge status={c.status} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export function VerificationPage() {
  const { db, user, toast } = useApp();
  const nav = useNavigate();
  const [verModal, setVerModal] = useState<{ ca: any; mode: "approve" | "reject" } | null>(null);
  const [notes, setNotes] = useState("");
  const [cas, setCas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadCAs = async () => {
      try {
        setLoading(true);
        const result = await caService.listCorrectiveActions({ status: "submitted_for_verification" as any });
        setCas(result.data || []);
      } catch (error) {
        console.error("Failed to load corrective actions:", error);
      } finally {
        setLoading(false);
      }
    };
    loadCAs();
  }, []);

  const queue = cas;

  const doVerify = async () => {
    if (!verModal || !user) return;
    if (!notes.trim()) { toast("Verification notes are required", "error"); return; }
    try {
      if (verModal.mode === "approve") {
        await caService.verifyCorrectiveAction(verModal.ca.id, user.id, notes, true);
        toast("Verified — finding closed");
      } else {
        await caService.verifyCorrectiveAction(verModal.ca.id, user.id, notes, false);
        toast("Rejected — returned to owner", "info");
      }
      setVerModal(null);
      setNotes("");
      // Reload the queue
      const result = await caService.listCorrectiveActions({ status: "submitted_for_verification" as any });
      setCas(result.data || []);
    } catch (error) {
      console.error("Failed to verify corrective action:", error);
      toast("Failed to verify corrective action", "error");
    }
  };

  return (
    <div>
      <PageHeader title="Verification Inbox" sub={`${queue.length} corrective action${queue.length === 1 ? "" : "s"} awaiting auditor verification`} />
      {queue.length === 0 && <EmptyState icon={<ShieldCheck size={20} />} title="Verification inbox is clear" body="Actions submitted by farm teams will appear here for on-site verification." />}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {queue.map((ca) => {
          return (
            <Card key={ca.id} className="p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-brand-700">{ca.code || `CA-${ca.id.slice(0, 8)}`}</span>
                <DeadlineBadge state={deadlineState(ca, db.settings)} />
              </div>
              <p className="text-[13.5px] font-bold text-ink-900">{ca.action}</p>
              <p className="text-[11.5px] text-slate-500">Completed {ca.completed_at ? fmtDate(ca.completed_at) : "—"} by {ca.assignee?.full_name || "Unassigned"}</p>
              <div className="mt-3 flex gap-2">
                <Button variant="success" size="sm" className="flex-1" icon={<ShieldCheck size={13} />} onClick={() => { setVerModal({ ca, mode: "approve" }); setNotes(""); }}>Verify & close</Button>
                <Button variant="danger" size="sm" icon={<XCircle size={13} />} onClick={() => { setVerModal({ ca, mode: "reject" }); setNotes(""); }}>Reject</Button>
              </div>
            </Card>
          );
        })}
      </div>
      <Modal open={!!verModal} onClose={() => setVerModal(null)} title={verModal?.mode === "approve" ? "Verify Corrective Action" : "Reject Verification"}
        footer={<><Button variant="ghost" onClick={() => setVerModal(null)}>Cancel</Button>
          <Button variant={verModal?.mode === "approve" ? "success" : "danger"} onClick={doVerify}>{verModal?.mode === "approve" ? "Verify & close finding" : "Reject & return"}</Button></>}>
        <Field label="Verification notes" req><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="On-site re-inspection results…" /></Field>
      </Modal>
    </div>
  );
}
