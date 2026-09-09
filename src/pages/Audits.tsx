import React, { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { format, addMonths, startOfMonth, getDay, getDaysInMonth, isToday, isSameDay, addDays } from "date-fns";
import {
  ArrowLeft, ArrowRight, CalendarDays, CalendarPlus, ClipboardCheck, FileText, FolderKanban, ListChecks,
  Play, Send, ShieldCheck, Users,
} from "lucide-react";
import { useApp, getUser, getProgram, getFarm, myVisibleAudits, templateOf } from "../store";
import { Avatar, Badge, Button, Card, DataTable, EmptyState, Field, Gauge, Input, Modal, PageHeader, ProgressBar, RiskBadge, ScorePill, SectionTitle, Select, StatusBadge, Textarea, type Col, cn } from "../components/ui";
import { classifyScore, computeAuditScore, fmtDate, fmtDateTime, todayISO, uid } from "../lib";
import type { Audit, AuditStatus, Program, RiskLevel } from "../types";
import { AUDIT_STATUSES } from "../types";
import * as auditService from "../services/audit/audit.service";
import * as programService from "../services/master-data/program.service";

/* ── Programs ─────────────────────────────────────────────────────────── */
export function ProgramsPage() {
  const { db, can, mutate, toast } = useApp();
  const editable = can("manage_programs");
  const [modal, setModal] = useState<Program | "new" | null>(null);
  const [form, setForm] = useState<Partial<Program>>({});

  const open = (p: Program | "new") => {
    setForm(p === "new" ? { frequency: "Monthly", riskLevel: "Medium", active: true, applicableFarmTypes: [], auditType: "Farm Compliance", scope: "", standard: "", activeFrom: todayISO(), activeTo: addDays(new Date(), 365).toISOString().slice(0, 10) } : { ...p });
    setModal(p);
  };
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name?.trim() || !form.scope?.trim()) { toast("Program name and scope are required", "error"); return; }
    setSaving(true);
    try {
      if (modal === "new") {
        await programService.createProgram({
          organization_id: "default-org", // TODO: Get from user context
          name: form.name!,
          audit_type: form.auditType || "Farm Compliance",
          frequency: form.frequency as Program["frequency"],
          scope: form.scope!,
          applicable_farm_types: form.applicableFarmTypes ?? [],
          standard: form.standard ?? "Internal Standard",
          risk_level: form.riskLevel as RiskLevel,
          active_from: form.activeFrom!,
          active_to: form.activeTo!,
          active: form.active !== false,
        });
      } else {
        await programService.updateProgram((modal as Program).id, {
          name: form.name!,
          audit_type: form.auditType || "Farm Compliance",
          frequency: form.frequency as Program["frequency"],
          scope: form.scope!,
          applicable_farm_types: form.applicableFarmTypes ?? [],
          standard: form.standard ?? "Internal Standard",
          risk_level: form.riskLevel as RiskLevel,
          active_from: form.activeFrom!,
          active_to: form.activeTo!,
          active: form.active !== false,
        });
      }
      // Update local state for UI compatibility
      mutate((d) => {
        if (modal === "new") {
          d.programs.push({ id: uid("prg"), code: `PRG-${String(d.programs.length + 1).padStart(2, "0")}`, name: form.name!, auditType: form.auditType!, frequency: form.frequency as Program["frequency"], scope: form.scope!, applicableFarmTypes: form.applicableFarmTypes ?? [], standard: form.standard ?? "Internal Standard", riskLevel: form.riskLevel as RiskLevel, activeFrom: form.activeFrom!, activeTo: form.activeTo!, active: form.active !== false });
        } else {
          d.programs = d.programs.map((p) => (p.id === (modal as Program).id ? { ...p, ...form } as Program : p));
        }
      }, { action: modal === "new" ? "Audit program created" : "Audit program modified", record: form.name!, detail: form.scope!.slice(0, 80) });
      toast(modal === "new" ? "Program created" : "Program updated");
      setModal(null);
    } catch (error) {
      console.error("Failed to save program:", error);
      toast(error instanceof Error ? error.message : "Failed to save program", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader title="Audit Programs" sub="Standing audit programs define type, frequency, scope and applicable farm types"
        actions={editable && <Button icon={<CalendarPlus size={15} />} onClick={() => open("new")}>New Program</Button>} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {db.programs.map((p) => {
          const farms = db.farms.filter((f) => p.applicableFarmTypes.includes(f.type)).length;
          const audits = db.audits.filter((a) => a.programId === p.id).length;
          return (
            <Card key={p.id} className="flex flex-col p-4 transition-all hover:-translate-y-0.5 hover:shadow-md">
              <div className="mb-2 flex items-start justify-between gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-900 text-brand-300"><FolderKanban size={16} /></span>
                <div className="flex gap-1.5">
                  <RiskBadge level={p.riskLevel} />
                  <Badge tone={p.active ? "success" : "neutral"} dot>{p.active ? "Active" : "Paused"}</Badge>
                </div>
              </div>
              <p className="font-mono text-[10.5px] text-slate-400">{p.code} · {p.frequency}</p>
              <h3 className="mt-0.5 font-display text-[15px] font-extrabold text-ink-900">{p.name}</h3>
              <p className="mt-1 line-clamp-2 flex-1 text-[12px] leading-relaxed text-slate-500">{p.scope}</p>
              <div className="mt-3 flex flex-wrap gap-1">
                {p.applicableFarmTypes.slice(0, 4).map((t) => <Badge key={t} tone="navy">{t}</Badge>)}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-ink-100 pt-3 text-[11.5px] font-semibold text-slate-500">
                <span>{farms} farms in scope · {audits} audits</span>
                <span className="font-mono text-[10.5px] text-slate-400">{p.standard}</span>
              </div>
              {editable && <Button variant="outline" size="sm" className="mt-3" onClick={() => open(p)}>Edit program</Button>}
            </Card>
          );
        })}
      </div>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal === "new" ? "New Audit Program" : "Edit Audit Program"} wide
        footer={<><Button variant="ghost" onClick={() => setModal(null)} disabled={saving}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save Program"}</Button></>}>
        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          <Field label="Program name" req><Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Audit type"><Input value={form.auditType ?? ""} onChange={(e) => setForm({ ...form, auditType: e.target.value })} /></Field>
          <Field label="Frequency"><Select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as Program["frequency"] })}>{["Monthly", "Quarterly", "Semi-Annual", "Annual"].map((f) => <option key={f}>{f}</option>)}</Select></Field>
          <Field label="Risk level"><Select value={form.riskLevel} onChange={(e) => setForm({ ...form, riskLevel: e.target.value as RiskLevel })}>{["Low", "Medium", "High", "Critical"].map((r) => <option key={r}>{r}</option>)}</Select></Field>
          <Field label="Audit standard"><Input value={form.standard ?? ""} onChange={(e) => setForm({ ...form, standard: e.target.value })} /></Field>
          <Field label="Active period"><div className="flex gap-2"><Input type="date" value={form.activeFrom ?? ""} onChange={(e) => setForm({ ...form, activeFrom: e.target.value })} /><Input type="date" value={form.activeTo ?? ""} onChange={(e) => setForm({ ...form, activeTo: e.target.value })} /></div></Field>
        </div>
        <Field label="Scope" req><Textarea value={form.scope ?? ""} onChange={(e) => setForm({ ...form, scope: e.target.value })} /></Field>
        <Field label="Applicable farm types">
          <div className="flex flex-wrap gap-1.5">
            {["Broiler", "Layer", "Broiler Breeder", "Layer Breeder", "Hatchery", "Feed Mill", "Livestock"].map((t) => {
              const on = form.applicableFarmTypes?.includes(t as never) ?? false;
              return (
                <button key={t} type="button" onClick={() => setForm({ ...form, applicableFarmTypes: on ? form.applicableFarmTypes!.filter((x) => x !== t) as Program["applicableFarmTypes"] : [...(form.applicableFarmTypes ?? []), t] as Program["applicableFarmTypes"] })}
                  className={cn("rounded-md border px-2 py-1 text-[11.5px] font-semibold cursor-pointer", on ? "border-brand-400 bg-brand-50 text-brand-700" : "border-ink-200 text-slate-500 hover:border-brand-200")}>{t}</button>
              );
            })}
          </div>
        </Field>
      </Modal>
    </div>
  );
}

/* ── New plan modal (shared by Plans + Calendar) ──────────────────────── */
export function NewPlanModal({ open, onClose, initialDate }: { open: boolean; onClose: () => void; initialDate?: string }) {
  const { db, mutate, toast, notify, user } = useApp();
  const [form, setForm] = useState({ programId: db.programs[0]?.id ?? "", farmId: db.farms[0]?.id ?? "", date: initialDate ?? addDays(new Date(), 7).toISOString().slice(0, 10), startTime: "08:00", endTime: "13:00", leadAuditorId: "u-david", team: "u-priya", scope: "", objectives: "", riskLevel: "Medium" as RiskLevel, status: "Scheduled" as AuditStatus });
  React.useEffect(() => { if (open && initialDate) setForm((f) => ({ ...f, date: initialDate })); }, [open, initialDate]);

  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.date) { toast("Audit date is required", "error"); return; }
    if (form.date < todayISO() && form.status === "Scheduled") { toast("Scheduled audits cannot be dated in the past", "error"); return; }
    setSaving(true);
    try {
      const newAudit = await auditService.createAudit({
        organization_id: "default-org", // TODO: Get from user context
        farm_id: form.farmId,
        template_id: "tpl-01",
        auditor_id: form.leadAuditorId,
        scheduled_date: form.date,
        started_at: null,
        completed_at: null,
        status: form.status as any,
        overall_score: null,
        risk_level: form.riskLevel as any,
        summary: null,
      });
      
      const id = newAudit.id;
      // Update local state for UI compatibility
      mutate((d) => {
        d.audits.unshift({
          id, code: newAudit.audit_number,
          programId: form.programId, templateId: "tpl-01", farmId: form.farmId, date: form.date,
          startTime: form.startTime, endTime: form.endTime, leadAuditorId: form.leadAuditorId,
          teamIds: [form.leadAuditorId, ...[form.team].filter((t) => t && t !== form.leadAuditorId)],
          scope: form.scope || getProgram(d, form.programId)?.scope || "Per program scope",
          objectives: form.objectives || "Verify operational compliance and follow up on open corrective actions.",
          riskLevel: form.riskLevel, status: form.status, responses: {},
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        });
      }, { action: "Audit created", record: `${getFarm(db, form.farmId)?.name}`, detail: `Planned for ${fmtDate(form.date)}` });
      notify("audit_scheduled", "Audit scheduled", `${getFarm(db, form.farmId)?.name} — ${fmtDate(form.date)}`, ["FARM_MANAGER", "AUDITOR"], `/audit/${id}`);
      notify("audit_assigned", "Audit assigned to you", `You are the lead auditor for ${getFarm(db, form.farmId)?.name} on ${fmtDate(form.date)}.`, ["AUDITOR"], `/my-audits`);
      toast("Audit plan created");
      onClose();
    } catch (error) {
      console.error("Failed to create audit:", error);
      toast(error instanceof Error ? error.message : "Failed to create audit", "error");
    } finally {
      setSaving(false);
    }
  };

  const auditors = db.users.filter((u) => ["AUDITOR", "AUDIT_ADMIN"].includes(u.role));
  return (
    <Modal open={open} onClose={onClose} title="Create Audit Plan" wide
      footer={<><Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button><Button onClick={save} disabled={saving} icon={<CalendarPlus size={14} />}>{saving ? "Creating..." : "Create plan"}</Button></>}>
      <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
        <Field label="Audit program" req><Select value={form.programId} onChange={(e) => setForm({ ...form, programId: e.target.value })}>{db.programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
        <Field label="Farm" req><Select value={form.farmId} onChange={(e) => setForm({ ...form, farmId: e.target.value })}>{db.farms.map((f) => <option key={f.id} value={f.id}>{f.name} ({f.type})</option>)}</Select></Field>
        <Field label="Audit date" req><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
        <Field label="Planned time"><div className="flex gap-2"><Input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /><Input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} /></div></Field>
        <Field label="Lead auditor" req><Select value={form.leadAuditorId} onChange={(e) => setForm({ ...form, leadAuditorId: e.target.value })}>{auditors.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
        <Field label="Supporting auditor"><Select value={form.team} onChange={(e) => setForm({ ...form, team: e.target.value })}><option value="">— none —</option>{auditors.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
        <Field label="Risk level"><Select value={form.riskLevel} onChange={(e) => setForm({ ...form, riskLevel: e.target.value as RiskLevel })}>{["Low", "Medium", "High", "Critical"].map((r) => <option key={r}>{r}</option>)}</Select></Field>
        <Field label="Initial status"><Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as AuditStatus })}><option>Draft</option><option>Scheduled</option></Select></Field>
      </div>
      <Field label="Audit scope"><Textarea value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })} placeholder="Defaults to the program scope" /></Field>
      <Field label="Audit objectives"><Textarea value={form.objectives} onChange={(e) => setForm({ ...form, objectives: e.target.value })} /></Field>
      {user && <p className="text-[11px] text-slate-400">Created by {user.name} — the farm manager and lead auditor will be notified.</p>}
    </Modal>
  );
}

/* ── Plans list ───────────────────────────────────────────────────────── */
export function PlansPage() {
  const { db, user, can } = useApp();
  const nav = useNavigate();
  const [modal, setModal] = useState(false);
  const rows = useMemo(() => (user ? myVisibleAudits(db, user) : []).map((a) => ({ ...a, farm: getFarm(db, a.farmId)?.name ?? "", lead: getUser(db, a.leadAuditorId)?.name ?? "", program: getProgram(db, a.programId)?.name ?? "" })), [db, user]);
  const cols: Col<typeof rows[number]>[] = [
    { key: "code", label: "Audit", sortValue: (r) => r.code, render: (r) => <span className="font-mono text-xs font-bold text-brand-700">{r.code}</span> },
    { key: "farm", label: "Farm", sortValue: (r) => r.farm },
    { key: "program", label: "Program", sortValue: (r) => r.program, render: (r) => <span className="text-slate-600">{r.program}</span> },
    { key: "date", label: "Date", sortValue: (r) => r.date, render: (r) => <span className="font-semibold">{fmtDate(r.date)}</span> },
    { key: "lead", label: "Lead Auditor", sortValue: (r) => r.lead },
    { key: "riskLevel", label: "Risk", align: "center", sortValue: (r) => r.riskLevel, render: (r) => <RiskBadge level={r.riskLevel} /> },
    { key: "status", label: "Status", sortValue: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> },
  ];
  return (
    <div>
      <PageHeader title="Audit Plans" sub="Every planned, live and historic audit with its current lifecycle status"
        actions={can("schedule_audits") && <Button icon={<CalendarPlus size={15} />} onClick={() => setModal(true)}>New Audit Plan</Button>} />
      <DataTable rows={rows} cols={cols} exportName="audit-plans" onRowClick={(r) => nav(`/audit/${r.id}`)} pageSize={12} />
      <NewPlanModal open={modal} onClose={() => setModal(false)} />
    </div>
  );
}

/* ── Active / Completed lists ─────────────────────────────────────────── */
export function AuditsListPage({ completed }: { completed?: boolean }) {
  const { db, user } = useApp();
  const nav = useNavigate();
  const rows = useMemo(() => (user ? myVisibleAudits(db, user) : [])
    .filter((a) => (completed ? a.status === "Completed" : a.status !== "Completed" && a.status !== "Cancelled"))
    .map((a) => {
      const score = ["Completed", "Submitted", "Under Review", "In Progress"].includes(a.status) ? computeAuditScore(templateOf(db, a), a.responses, db.settings).overall : null;
      const findings = db.findings.filter((f) => f.auditId === a.id).length;
      return { ...a, farmName: getFarm(db, a.farmId)?.name ?? "", farmId: a.farmId, lead: getUser(db, a.leadAuditorId)?.name ?? "", score, findings };
    }).sort((a, b) => b.date.localeCompare(a.date)), [db, user, completed]);

  const cols: Col<typeof rows[number]>[] = [
    { key: "code", label: "Audit", sortValue: (r) => r.code, render: (r) => (
      <div><span className="font-mono text-xs font-bold text-brand-700">{r.code}</span><p className="text-[11px] text-slate-400">{getProgram(db, r.programId)?.name}</p></div>) },
    { key: "farmName", label: "Farm", sortValue: (r) => r.farmName, render: (r) => (
      <div className="flex items-center gap-2"><span className="font-bold text-ink-900">{r.farmName}</span></div>) },
    { key: "date", label: "Date", sortValue: (r) => r.date, render: (r) => fmtDate(r.date) },
    { key: "lead", label: "Lead", sortValue: (r) => r.lead },
    { key: "score", label: "Score", align: "center", sortValue: (r) => r.score ?? -1, render: (r) => <ScorePill score={r.score} /> },
    { key: "findings", label: "Findings", align: "center", sortValue: (r) => r.findings, render: (r) => (r.findings > 0 ? <Badge tone="warning" dot>{r.findings}</Badge> : <span className="text-slate-300">0</span>) },
    { key: "status", label: "Status", sortValue: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <div>
      <PageHeader title={completed ? "Completed Audits" : "Active Audits"}
        sub={completed ? "Signed-off audits with final scores, findings and reports" : "Draft, scheduled, in-progress and in-review audits"} />
      <DataTable rows={rows} cols={cols} exportName={completed ? "completed-audits" : "active-audits"} onRowClick={(r) => nav(`/audit/${r.id}`)} pageSize={12}
        empty={<EmptyState icon={<ClipboardCheck size={20} />} title={completed ? "No completed audits yet" : "No active audits"} body="Audits move here as they progress through the lifecycle." />} />
    </div>
  );
}

/* ── Calendar ─────────────────────────────────────────────────────────── */
const STATUS_CHIP: Record<AuditStatus, string> = {
  Draft: "bg-slate-100 text-slate-600 border-slate-200",
  Scheduled: "bg-brand-50 text-brand-700 border-brand-200",
  "In Progress": "bg-amber-50 text-amber-700 border-amber-200",
  Submitted: "bg-violet-50 text-violet-700 border-violet-200",
  "Under Review": "bg-teal-50 text-teal-700 border-teal-200",
  Completed: "bg-green-50 text-green-700 border-green-200",
  Cancelled: "bg-red-50 text-red-600 border-red-200",
};

export function CalendarPage() {
  const { db, user, can } = useApp();
  const nav = useNavigate();
  const [cur, setCur] = useState(() => startOfMonth(new Date()));
  const [planDate, setPlanDate] = useState<string | null>(null);
  const audits = user ? myVisibleAudits(db, user) : [];

  const first = startOfMonth(cur);
  const offset = getDay(first);
  const days = getDaysInMonth(cur);
  const cells: (Date | null)[] = [...Array(offset).fill(null), ...Array.from({ length: days }, (_, i) => addDays(first, i))];

  return (
    <div>
      <PageHeader title="Audit Calendar" sub="Scheduled, in-progress, completed and overdue audit activity"
        actions={can("schedule_audits") && <Button icon={<CalendarPlus size={15} />} onClick={() => setPlanDate(addDays(new Date(), 7).toISOString().slice(0, 10))}>Schedule Audit</Button>} />
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
          <Button variant="ghost" size="sm" onClick={() => setCur(addMonths(cur, -1))} icon={<ArrowLeft size={14} />}>Prev</Button>
          <div className="text-center">
            <p className="font-display text-[15px] font-extrabold text-ink-900">{format(cur, "MMMM yyyy")}</p>
            <button onClick={() => setCur(startOfMonth(new Date()))} className="text-[11px] font-bold text-brand-600 hover:underline cursor-pointer">Jump to today</button>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setCur(addMonths(cur, 1))}>Next <ArrowRight size={14} /></Button>
        </div>
        <div className="grid grid-cols-7 border-b border-ink-100 bg-ink-50/60">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="px-2 py-1.5 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d, i) => {
            if (!d) return <div key={`e${i}`} className="min-h-[86px] border-b border-r border-ink-100/60 bg-ink-50/30" />;
            const dayAudits = audits.filter((a) => isSameDay(new Date(a.date + "T00:00:00"), d));
            const today = isToday(d);
            return (
              <div key={d.toISOString()} className={cn("min-h-[86px] border-b border-r border-ink-100/60 p-1", today && "bg-brand-50/50")}>
                <div className="flex items-center justify-between px-1">
                  <span className={cn("font-mono text-[11px] font-bold", today ? "flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-white" : "text-slate-400")}>{format(d, "d")}</span>
                  {can("schedule_audits") && (
                    <button onClick={() => setPlanDate(format(d, "yyyy-MM-dd"))} className="rounded p-0.5 text-slate-300 opacity-0 transition-opacity hover:bg-brand-100 hover:text-brand-700 [div:hover>&]:opacity-100 cursor-pointer"><CalendarPlus size={12} /></button>
                  )}
                </div>
                <div className="mt-0.5 space-y-0.5">
                  {dayAudits.map((a) => (
                    <button key={a.id} onClick={() => nav(`/audit/${a.id}`)}
                      className={cn("block w-full truncate rounded border px-1.5 py-0.5 text-left text-[10px] font-bold transition-transform hover:scale-[1.02] cursor-pointer", STATUS_CHIP[a.status])}>
                      {getFarm(db, a.farmId)?.name.split(" ")[0]} · {a.status === "Completed" ? "✓ done" : a.status}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
      <div className="mt-3 flex flex-wrap gap-2">
        {AUDIT_STATUSES.filter((s) => s !== "Cancelled").map((s) => (
          <span key={s} className={cn("rounded-md border px-2 py-0.5 text-[10.5px] font-bold", STATUS_CHIP[s])}>{s}</span>
        ))}
      </div>
      <NewPlanModal open={!!planDate} onClose={() => setPlanDate(null)} initialDate={planDate ?? undefined} />
    </div>
  );
}

/* ── Audit detail ─────────────────────────────────────────────────────── */
export function AuditDetailPage() {
  const { id } = useParams();
  const { db, user, can, startAudit, completeReview, mutate, toast } = useApp();
  const nav = useNavigate();
  const [reviewModal, setReviewModal] = useState(false);
  const [notes, setNotes] = useState("");
  const audit = db.audits.find((a) => a.id === id);
  if (!audit || !user) return <EmptyState title="Audit not found" action={<Link to="/plans"><Button variant="dark">All audit plans</Button></Link>} />;

  const tpl = templateOf(db, audit);
  const farm = getFarm(db, audit.farmId);
  const program = getProgram(db, audit.programId);
  const score = computeAuditScore(tpl, audit.responses, db.settings);
  const findings = db.findings.filter((f) => f.auditId === audit.id);
  const evidence = db.evidence.filter((e) => e.auditId === audit.id);
  const isLead = audit.leadAuditorId === user.id || audit.teamIds.includes(user.id);
  const isAdmin = can("manage_programs"); // review, sign-off and publishing stay with audit admins
  const progress = score.total ? (score.answered / score.total) * 100 : 0;

  const flow: { status: AuditStatus; note: string }[] = [
    { status: "Scheduled", note: "Planned & assigned" },
    { status: "In Progress", note: "On-site execution" },
    { status: "Submitted", note: "Awaiting review" },
    { status: "Under Review", note: "QA verification" },
    { status: "Completed", note: "Signed off" },
  ];
  const stageIdx = flow.findIndex((f) => f.status === audit.status);

  return (
    <div>
      <button onClick={() => nav(-1)} className="mb-3 inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-ink-900 cursor-pointer"><ArrowLeft size={13} /> Back</button>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-xl font-extrabold text-ink-900">{audit.code}</h1>
            <StatusBadge status={audit.status} />
            <RiskBadge level={audit.riskLevel} />
          </div>
          <p className="mt-1 text-[13px] text-slate-500">
            <Link to={`/farm/${farm?.id}`} className="font-bold text-brand-700 hover:underline">{farm?.name}</Link>
            {" · "}{program?.name} · {fmtDate(audit.date)}, {audit.startTime}–{audit.endTime}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {audit.status === "Draft" && isAdmin && (
            <Button variant="outline" onClick={async () => {
              try {
                await auditService.scheduleAudit(audit.id);
                mutate((d) => { const a = d.audits.find((x) => x.id === audit.id); if (a) a.status = "Scheduled"; }, { action: "Audit scheduled", record: audit.code, detail: "Draft published to calendar" });
                toast("Audit scheduled");
              } catch (error) {
                console.error("Failed to schedule audit:", error);
                toast(error instanceof Error ? error.message : "Failed to schedule audit", "error");
              }
            }}>Publish to calendar</Button>
          )}
          {audit.status === "Scheduled" && (isLead || isAdmin) && can("execute_audits") && (
            <Button icon={<Play size={14} />} onClick={() => { startAudit(audit.id); nav(`/execute/${audit.id}`); }}>Start audit</Button>
          )}
          {audit.status === "In Progress" && (isLead || isAdmin) && can("execute_audits") && (
            <Button icon={<ListChecks size={14} />} onClick={() => nav(`/execute/${audit.id}`)}>Open checklist</Button>
          )}
          {audit.status === "Submitted" && isAdmin && (
            <Button variant="dark" icon={<ShieldCheck size={14} />} onClick={async () => {
              try {
                await auditService.startReview(audit.id);
                mutate((d) => { const a = d.audits.find((x) => x.id === audit.id); if (a) a.status = "Under Review"; }, { action: "Audit review started", record: audit.code, detail: "Moved to Under Review" });
                toast("Review started");
              } catch (error) {
                console.error("Failed to start review:", error);
                toast(error instanceof Error ? error.message : "Failed to start review", "error");
              }
            }}>Start review</Button>
          )}
          {audit.status === "Under Review" && isAdmin && (
            <Button variant="success" icon={<ShieldCheck size={14} />} onClick={() => setReviewModal(true)}>Approve & complete</Button>
          )}
          {["Submitted", "Under Review", "Completed"].includes(audit.status) && can("view_reports") && (
            <Button variant="outline" icon={<FileText size={14} />} onClick={() => nav(`/report/${audit.id}`)}>Audit report</Button>
          )}
        </div>
      </div>

      {/* lifecycle */}
      <Card className="mb-4 px-4 py-3">
        <div className="flex flex-wrap items-center gap-1">
          {flow.map((f, i) => {
            const done = stageIdx >= 0 && i <= stageIdx;
            const current = i === stageIdx;
            return (
              <React.Fragment key={f.status}>
                {i > 0 && <span className={cn("h-0.5 w-6 rounded sm:w-10", done ? "bg-brand-500" : "bg-ink-100")} />}
                <div className="flex items-center gap-1.5">
                  <span className={cn("flex h-6 w-6 items-center justify-center rounded-full font-mono text-[10px] font-bold", done ? "bg-brand-600 text-white" : "bg-ink-100 text-slate-400", current && "ring-4 ring-brand-100")}>{i + 1}</span>
                  <span className={cn("text-[11px] font-bold", done ? "text-ink-800" : "text-slate-400")}>{f.status}</span>
                </div>
              </React.Fragment>
            );
          })}
          {audit.status === "Cancelled" && <Badge tone="danger" className="ml-2">Cancelled</Badge>}
          {audit.completedAt && <span className="ml-auto text-[11px] font-semibold text-slate-400">Signed off {fmtDateTime(audit.completedAt)}{audit.signedById ? ` by ${getUser(db, audit.signedById)?.name}` : ""}</span>}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="p-4">
          <SectionTitle>Score Summary</SectionTitle>
          <div className="flex items-center gap-4">
            <Gauge value={score.overall} />
            <div>
              <Badge tone={classifyScore(score.overall, db.settings) === "Excellent" ? "success" : classifyScore(score.overall, db.settings) === "Good" ? "brand" : classifyScore(score.overall, db.settings) === "Needs Improvement" ? "warning" : "danger"}>{classifyScore(score.overall, db.settings)}</Badge>
              <p className="mt-2 font-mono text-[11.5px] text-slate-500">{score.earned} / {score.max} pts<br />{score.applicable} applicable questions<br />{score.answered}/{score.total} answered</p>
            </div>
          </div>
          <ProgressBar value={progress} label="Checklist completion" className="mt-4" tone={progress === 100 ? "success" : "brand"} />
          <div className="mt-4 space-y-2.5">
            {score.categories.map((c) => (
              <div key={c.id}>
                <div className="mb-1 flex justify-between text-[12px]"><span className="font-semibold text-ink-700">{c.name}</span><ScorePill score={c.score} /></div>
                <ProgressBar value={c.score ?? 0} tone={(c.score ?? 0) >= 80 ? "success" : (c.score ?? 0) >= 70 ? "warning" : "danger"} />
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <SectionTitle>Audit Information</SectionTitle>
          <dl className="space-y-2 text-[12.5px]">
            {[
              ["Scope", audit.scope], ["Objectives", audit.objectives],
              ["Standard", program?.standard ?? "—"], ["Frequency", program?.frequency ?? "—"],
              ["Submitted", audit.submittedAt ? fmtDateTime(audit.submittedAt) : "—"],
              ["Review notes", audit.reviewNotes ?? "—"],
            ].map(([k, v]) => (
              <div key={k as string}><dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{k}</dt><dd className="font-medium text-ink-800">{v}</dd></div>
            ))}
          </dl>
          <SectionTitle right={undefined}>Audit Team</SectionTitle>
          <div className="space-y-2">
            {[audit.leadAuditorId, ...audit.teamIds.filter((t) => t !== audit.leadAuditorId)].map((uidv, i) => {
              const u = getUser(db, uidv);
              return u ? (
                <div key={uidv + i} className="flex items-center gap-2.5 rounded-lg border border-ink-100 px-2.5 py-1.5">
                  <Avatar user={u} size={26} />
                  <div><p className="text-[12.5px] font-bold text-ink-800">{u.name}</p><p className="text-[10.5px] text-slate-400">{i === 0 ? "Lead Auditor" : "Supporting Auditor"}</p></div>
                </div>
              ) : null;
            })}
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400"><Users size={12} /> Farm contact: {getUser(db, farm?.managerId)?.name}</p>
          </div>
        </Card>

        <Card className="p-4">
          <SectionTitle right={<Link to={`/findings?audit=${audit.id}`} className="text-xs font-bold text-brand-600 hover:underline">All →</Link>}>Findings ({findings.length})</SectionTitle>
          <div className="space-y-2">
            {findings.slice(0, 6).map((f) => (
              <Link key={f.id} to={`/finding/${f.id}`} className="block rounded-lg border border-ink-100 px-3 py-2 hover:border-brand-200 hover:bg-brand-50/40">
                <div className="flex items-center gap-2">
                  <Badge tone={f.severity === "Critical" ? "danger" : f.severity === "Major" ? "warning" : "brand"}>{f.severity}</Badge>
                  <span className="ml-auto font-mono text-[10px] text-slate-400">{f.code}</span>
                </div>
                <p className="mt-1 truncate text-[12px] font-semibold text-ink-800">{f.title}</p>
              </Link>
            ))}
            {findings.length === 0 && <p className="py-6 text-center text-xs text-slate-400">{["Submitted", "Under Review", "Completed"].includes(audit.status) ? "No findings — clean audit." : "Findings appear after submission."}</p>}
          </div>
          <div className="mt-3 flex items-center justify-between rounded-lg bg-ink-50/70 px-3 py-2 text-[11.5px] font-semibold text-slate-500">
            <span className="inline-flex items-center gap-1.5"><FileText size={12} /> Evidence items</span>
            <span className="font-mono text-ink-800">{evidence.length}</span>
          </div>
        </Card>
      </div>

      <Modal open={reviewModal} onClose={() => setReviewModal(false)} title="Approve & Complete Audit"
        footer={<><Button variant="ghost" onClick={() => setReviewModal(false)}>Cancel</Button>
          <Button variant="success" onClick={async () => {
            if (!notes.trim()) { toast("Review notes are required for sign-off", "error"); return; }
            try {
              await auditService.approveAudit(audit.id, notes);
              completeReview(audit.id, notes);
              setReviewModal(false);
              toast("Audit completed and signed off");
              nav(`/report/${audit.id}`);
            } catch (error) {
              console.error("Failed to approve audit:", error);
              toast(error instanceof Error ? error.message : "Failed to approve audit", "error");
            }
          }}>Sign off audit</Button></>}>
        <p className="mb-3 rounded-lg bg-brand-50 px-3 py-2 text-[12px] text-brand-800">Final score <strong>{score.overall}%</strong> ({classifyScore(score.overall, db.settings)}) with <strong>{findings.length}</strong> findings. Sign-off is recorded immutably in the activity log.</p>
        <Field label="Review notes" req><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Summary of review conclusions…" /></Field>
      </Modal>
    </div>
  );
}
