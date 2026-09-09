import React, { useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import {
  AlertTriangle, ArrowLeft, Camera, CheckCircle2, ChevronDown, ClipboardCheck, FileText, Info, Paperclip,
  Save, Send, Star, X,
} from "lucide-react";
import { useApp, getFarm, getUser, myVisibleAudits, templateOf } from "../store";
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, ProgressBar, ScorePill, Select, StatusBadge, Textarea, cn } from "../components/ui";
import {
  addDaysISO, choiceLabel, computeAuditScore, flattenQuestions, fmtDate, fmtDateTime, riskBand, riskScore,
  todayISO, validateSubmission, type SubmitIssue,
} from "../lib";
import { CHOICE_OPTIONS } from "../types";
import type { Audit, ChoiceValue, EvidenceType, FindingDraft, Question, Response, Severity } from "../types";
import { EVIDENCE_TYPES, SEVERITIES } from "../types";

/* ── My Audits ────────────────────────────────────────────────────────── */
export function MyAuditsPage() {
  const { db, user, startAudit, can } = useApp();
  const nav = useNavigate();
  if (!user) return null;
  const mine = myVisibleAudits(db, user).sort((a, b) => {
    const rank = (s: string) => (s === "In Progress" ? 0 : s === "Scheduled" ? 1 : s === "Submitted" ? 2 : s === "Under Review" ? 3 : 4);
    return rank(a.status) - rank(b.status) || b.date.localeCompare(a.date);
  });
  const live = mine.filter((a) => ["In Progress", "Scheduled"].includes(a.status));

  return (
    <div>
      <PageHeader title="My Audits" sub={`${live.length} awaiting execution · ${mine.length} total assigned`} />
      {mine.length === 0 && <EmptyState icon={<ClipboardCheck size={20} />} title="No audits assigned" body="When the audit admin schedules an audit for you it will appear here." />}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {mine.map((a) => {
          const tpl = templateOf(db, a);
          const s = computeAuditScore(tpl, a.responses, db.settings);
          const farm = getFarm(db, a.farmId);
          const isTeam = a.leadAuditorId === user.id || a.teamIds.includes(user.id);
          return (
            <Card key={a.id} className="flex flex-col p-4 transition-all hover:-translate-y-0.5 hover:shadow-md">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[11px] font-bold text-brand-700">{a.code}</span>
                <StatusBadge status={a.status} />
              </div>
              <h3 className="font-display text-[15px] font-extrabold text-ink-900">{farm?.name}</h3>
              <p className="text-[12px] text-slate-500">{db.programs.find((p) => p.id === a.programId)?.name}</p>
              <p className="mt-1.5 text-[12px] font-semibold text-ink-700">📅 {fmtDate(a.date)} · {a.startTime}–{a.endTime} · Lead: {getUser(db, a.leadAuditorId)?.name}</p>
              {s.answered > 0 && <ProgressBar value={(s.answered / s.total) * 100} label={`${s.answered} / ${s.total} questions`} className="mt-3" />}
              <div className="mt-auto flex gap-2 pt-4">
                {a.status === "Scheduled" && isTeam && can("execute_audits") && (
                  <Button size="sm" className="flex-1" onClick={() => { startAudit(a.id); nav(`/execute/${a.id}`); }}>Start audit</Button>
                )}
                {a.status === "In Progress" && isTeam && can("execute_audits") && (
                  <Button size="sm" className="flex-1" onClick={() => nav(`/execute/${a.id}`)}>Continue checklist</Button>
                )}
                {a.status === "In Progress" && (!isTeam || !can("execute_audits")) && (
                  <Badge tone="warning" dot>Execution in progress</Badge>
                )}
                <Button variant="outline" size="sm" onClick={() => nav(`/audit/${a.id}`)}>Details</Button>
                {["Submitted", "Under Review", "Completed"].includes(a.status) && (
                  <Button variant="outline" size="sm" onClick={() => nav(`/report/${a.id}`)} icon={<FileText size={13} />}>Report</Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ── Evidence library ─────────────────────────────────────────────────── */
export function EvidencePage() {
  const { db } = useApp();
  const nav = useNavigate();
  const [type, setType] = useState("all");
  const [sel, setSel] = useState<string | null>(null);
  const list = db.evidence.filter((e) => type === "all" || e.type === type).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  const selEv = db.evidence.find((e) => e.id === sel);

  return (
    <div>
      <PageHeader title="Evidence Repository" sub="Photos and documents attached to checklist responses and findings — stored in Supabase Storage with bucket-level policies" />
      <div className="mb-4 flex flex-wrap gap-1.5">
        {["all", ...EVIDENCE_TYPES].map((t) => (
          <button key={t} onClick={() => setType(t)} className={cn("rounded-md border px-2.5 py-1 text-[11.5px] font-bold cursor-pointer", type === t ? "border-ink-900 bg-ink-900 text-white" : "border-ink-200 bg-white text-slate-500 hover:border-brand-300")}>
            {t === "all" ? `All (${db.evidence.length})` : t}
          </button>
        ))}
      </div>
      {list.length === 0 && <EmptyState title="No evidence of this type" body="Evidence appears here as auditors attach it during execution." />}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {list.map((e) => {
          const audit = db.audits.find((a) => a.id === e.auditId);
          const q = audit && e.questionId ? flattenQuestions(templateOf(db, audit)).find((f) => f.q.id === e.questionId) : undefined;
          return (
            <Card key={e.id} onClick={() => setSel(e.id)} className="overflow-hidden !p-0">
              <div className="relative h-36 overflow-hidden bg-ink-100">
                {e.imageUrl ? (
                  <img src={e.imageUrl} alt={e.description} className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                    onError={(ev) => { (ev.target as HTMLImageElement).style.display = "none"; }} />
                ) : (
                  <div className="flex h-full items-center justify-center"><FileText size={30} className="text-ink-300" /></div>
                )}
                <Badge tone="navy" className="absolute left-2 top-2 !bg-white/90">{e.type}</Badge>
              </div>
              <div className="p-3">
                <p className="truncate text-[12px] font-bold text-ink-900">{e.description || e.fileName}</p>
                <p className="mt-0.5 font-mono text-[10px] text-slate-400">{e.code} · {audit?.code ?? "—"} · {fmtDate(e.uploadedAt.slice(0, 10))}</p>
                {q && <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">{q.q.text}</p>}
              </div>
            </Card>
          );
        })}
      </div>
      <Modal open={!!selEv} onClose={() => setSel(null)} title={selEv?.code} wide>
        {selEv && (
          <div>
            {selEv.imageUrl ? (
              <img src={selEv.imageUrl} alt={selEv.description} className="mb-3 max-h-[46vh] w-full rounded-lg object-cover" />
            ) : (
              <div className="mb-3 flex h-40 items-center justify-center rounded-lg bg-ink-50"><FileText size={36} className="text-ink-300" /></div>
            )}
            <p className="text-[13.5px] font-semibold text-ink-900">{selEv.description}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
              <p><span className="label">File</span>{selEv.fileName}</p>
              <p><span className="label">Type</span>{selEv.type}</p>
              <p><span className="label">Uploaded by</span>{getUser(db, selEv.uploadedById)?.name}</p>
              <p><span className="label">Timestamp</span>{fmtDateTime(selEv.uploadedAt)}</p>
              <p><span className="label">Audit</span>{db.audits.find((a) => a.id === selEv.auditId)?.code}</p>
              {selEv.findingId && <p><span className="label">Linked finding</span>
                <button className="font-bold text-brand-700 hover:underline cursor-pointer" onClick={() => { nav(`/finding/${selEv.findingId}`); setSel(null); }}>{db.findings.find((f) => f.id === selEv.findingId)?.code}</button></p>}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ── Checklist runner ─────────────────────────────────────────────────── */
function defaultDraft(q: Question, farmManagerId: string, cadDays: number): FindingDraft {
  const sev: Severity = q.riskLevel === "Critical" ? "Critical" : q.riskLevel === "High" ? "Major" : "Minor";
  return {
    title: q.text.length > 64 ? q.text.slice(0, 61) + "…" : q.text,
    description: "", severity: sev, likelihood: sev === "Critical" ? 4 : sev === "Major" ? 3 : 2,
    impact: sev === "Critical" ? 5 : sev === "Major" ? 4 : 3,
    rootCause: "", recommendation: q.guidance ?? "", responsibleId: farmManagerId, dueDate: addDaysISO(todayISO(), cadDays),
  };
}

function QuestionCard({ audit, q, catName, idx, readOnly }: { audit: Audit; q: Question; catName: string; idx: number; readOnly: boolean }) {
  const { db, user, saveResponse, attachEvidence, toast } = useApp();
  const resp = audit.responses[q.id];
  const [evModal, setEvModal] = useState(false);
  const [evType, setEvType] = useState<EvidenceType>("Photo");
  const [evDesc, setEvDesc] = useState("");
  const [evFile, setEvFile] = useState<File | null>(null);
  const [draftOpen, setDraftOpen] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const farm = getFarm(db, audit.farmId);
  const respUsers = db.users.filter((u) => ["FARM_MANAGER", "SUPERVISOR"].includes(u.role));
  const evidence = db.evidence.filter((e) => e.auditId === audit.id && e.questionId === q.id);
  const value = resp?.value;

  const set = (patch: Partial<Response>) => saveResponse(audit.id, q.id, patch);

  const pickChoice = (v: ChoiceValue) => {
    if (readOnly) return;
    const patch: Partial<Response> = { value: v };
    if ((v === "NC" || v === "PC") && !resp?.findingDraft) {
      patch.findingDraft = defaultDraft(q, farm?.managerId ?? "u-tomas", db.settings.defaultCADays);
      if (v === "NC") patch.findingDraft.description = "";
    }
    if (v === "C" || v === "NA") patch.findingDraft = undefined;
    set(patch);
  };

  const submitEv = () => {
    if (!user) return;
    if (!evDesc.trim()) { toast("Add a short caption for the evidence", "error"); return; }
    // File size validation: max 10 MB
    if (evFile && evFile.size > 10 * 1024 * 1024) {
      toast("File too large — maximum 10 MB", "error");
      return;
    }
    // File type validation
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/csv"];
    if (evFile && !allowedTypes.includes(evFile.type) && !evFile.type.startsWith("image/")) {
      toast("Unsupported file type — use JPG, PNG, PDF, Excel, Word or CSV", "error");
      return;
    }
    let imageUrl: string | undefined;
    const finish = () => {
      attachEvidence({ auditId: audit.id, questionId: q.id, uploadedById: user.id, type: evType, fileName: evFile?.name ?? `${evType.toLowerCase()}-${Date.now()}.bin`, description: evDesc, imageUrl });
      toast("Evidence attached and saved");
      setEvModal(false); setEvDesc(""); setEvFile(null);
    };
    if (evFile && evFile.type.startsWith("image/") && evFile.size < 400_000) {
      const rd = new FileReader();
      rd.onload = () => { imageUrl = String(rd.result); finish(); };
      rd.readAsDataURL(evFile);
    } else finish();
  };

  const answered = value !== undefined && value !== "";
  const isNCPC = value === "NC" || value === "PC";
  const draft = resp?.findingDraft;
  const updDraft = (p: Partial<FindingDraft>) => set({ findingDraft: { ...(draft ?? defaultDraft(q, farm?.managerId ?? "u-tomas", db.settings.defaultCADays)), ...p } });
  const risk = draft ? riskBand(draft.likelihood, draft.impact, db.settings) : null;

  return (
    <div id={`q-${q.id}`} className={cn("card mb-3 overflow-hidden transition-colors", answered && !isNCPC && "border-l-4 border-l-green-500", isNCPC && "border-l-4 border-l-red-400")}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <span className={cn("mt-0.5 flex h-6 w-9 shrink-0 items-center justify-center rounded-md font-mono text-[11px] font-bold", answered ? "bg-ink-900 text-brand-300" : "bg-ink-100 text-slate-500")}>{idx}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-semibold leading-snug text-ink-900">{q.text}</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              <Badge tone="navy">{catName}</Badge>
              <Badge tone={q.riskLevel === "Critical" ? "danger" : q.riskLevel === "High" ? "warning" : "neutral"}>{q.riskLevel} risk</Badge>
              {q.mandatory && <Badge tone="warning">Mandatory</Badge>}
              {q.mandatoryEvidence && <Badge tone="violet">Evidence required</Badge>}
              {q.reference && <Badge tone="neutral">{q.reference}</Badge>}
            </div>
            {q.requirement && <p className="mt-1.5 text-[11.5px] text-slate-500"><span className="font-bold text-slate-400">Requirement:</span> {q.requirement}</p>}
            {q.guidance && (
              <details className="mt-1.5 group">
                <summary className="flex cursor-pointer items-center gap-1 text-[11.5px] font-bold text-brand-600"><Info size={12} /> Auditor guidance <ChevronDown size={11} className="transition-transform group-open:rotate-180" /></summary>
                <p className="mt-1 rounded-lg bg-brand-50/60 px-2.5 py-1.5 text-[11.5px] text-brand-900">{q.guidance}</p>
              </details>
            )}
          </div>
        </div>

        {/* answer controls */}
        <div className="mt-3 pl-0 sm:pl-12">
          {q.type === "choice" && (
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {CHOICE_OPTIONS.map((o) => {
                const on = value === o.value;
                const styles: Record<ChoiceValue, string> = {
                  C: on ? "bg-green-600 border-green-600 text-white shadow-md shadow-green-600/25" : "border-green-200 text-green-700 hover:bg-green-50",
                  PC: on ? "bg-amber-500 border-amber-500 text-white shadow-md shadow-amber-500/25" : "border-amber-200 text-amber-700 hover:bg-amber-50",
                  NC: on ? "bg-red-600 border-red-600 text-white shadow-md shadow-red-600/25" : "border-red-200 text-red-700 hover:bg-red-50",
                  NA: on ? "bg-slate-500 border-slate-500 text-white" : "border-slate-200 text-slate-500 hover:bg-slate-50",
                };
                return (
                  <button key={o.value} disabled={readOnly} onClick={() => pickChoice(o.value)}
                    className={cn("rounded-lg border-2 px-2 py-2.5 text-[12px] font-bold transition-all active:scale-[0.97] cursor-pointer disabled:cursor-not-allowed", styles[o.value])}>
                    <span className="block font-mono text-[15px] leading-none">{o.short}</span>
                    <span className="mt-0.5 block text-[10px] font-semibold opacity-80">{o.label}</span>
                  </button>
                );
              })}
            </div>
          )}
          {(q.type === "numeric" || q.type === "percent") && (
            <div className="flex flex-wrap items-center gap-2">
              <Input type="number" step="0.1" min={0} disabled={readOnly} className="!w-32 !py-2.5 !text-[15px] font-mono"
                value={value === undefined || value === "" ? "" : String(value)}
                onChange={(e) => set({ value: e.target.value === "" ? "" : +e.target.value })} />
              <span className="text-[12px] font-bold text-slate-500">{q.unit}</span>
              {q.rule && <Badge tone="brand">≤ {q.rule.max} {q.unit} = compliant{q.rule.partialMax ? ` · ≤ ${q.rule.partialMax} = partial` : ""}</Badge>}
              <button disabled={readOnly} onClick={() => set({ value: "NA" })} className={cn("rounded-md border px-2.5 py-2 text-[11px] font-bold cursor-pointer", value === "NA" ? "border-slate-500 bg-slate-500 text-white" : "border-slate-200 text-slate-500 hover:bg-slate-50")}>N/A</button>
            </div>
          )}
          {q.type === "rating" && (
            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => {
                const numVal = typeof value === "number" ? value : 0;
                return (
                  <button key={n} disabled={readOnly} onClick={() => set({ value: n })}
                    className={cn("flex h-11 w-11 items-center justify-center rounded-lg border-2 transition-all cursor-pointer active:scale-95",
                      numVal >= n ? "border-amber-400 bg-amber-50 text-amber-500" : "border-ink-200 text-slate-300 hover:border-amber-200")}>
                    <Star size={18} fill={numVal >= n ? "currentColor" : "none"} />
                  </button>
                );
              })}
              <span className="ml-2 text-[11px] font-semibold text-slate-400">{q.guidance ?? "1 = poor · 5 = excellent"}</span>
            </div>
          )}
          {q.type === "date" && (
            <div className="flex items-center gap-2">
              <Input type="date" disabled={readOnly} className="!w-44" value={typeof value === "string" && value !== "NA" ? value : ""} onChange={(e) => set({ value: e.target.value })} />
              <button disabled={readOnly} onClick={() => set({ value: "NA" })} className={cn("rounded-md border px-2.5 py-2 text-[11px] font-bold cursor-pointer", value === "NA" ? "border-slate-500 bg-slate-500 text-white" : "border-slate-200 text-slate-500 hover:bg-slate-50")}>N/A</button>
            </div>
          )}
          {q.type === "text" && <Input disabled={readOnly} placeholder="Record value…" value={typeof value === "string" && value !== "NA" ? value : ""} onChange={(e) => set({ value: e.target.value })} />}

          {/* notes + evidence */}
          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div>
              <label className="label">Auditor notes</label>
              <Textarea disabled={readOnly} className="!min-h-[54px] !text-[12px]" placeholder="Observations, house number, reference records…" value={resp?.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} />
            </div>
            <div>
              <label className="label">Evidence ({evidence.length}){q.mandatoryEvidence && <span className="text-red-500"> · required</span>}</label>
              <div className="flex flex-wrap items-center gap-2">
                {evidence.map((e) => (
                  <div key={e.id} className="group relative h-[54px] w-[72px] overflow-hidden rounded-lg border border-ink-200 bg-ink-100" title={e.description}>
                    {e.imageUrl ? <img src={e.imageUrl} alt="" className="h-full w-full object-cover" onError={(ev) => ((ev.target as HTMLImageElement).style.display = "none")} /> : <div className="flex h-full items-center justify-center"><FileText size={16} className="text-ink-300" /></div>}
                    <span className="absolute inset-x-0 bottom-0 truncate bg-ink-950/70 px-1 py-px text-[8.5px] font-bold text-white">{e.code}</span>
                  </div>
                ))}
                {!readOnly && (
                  <button onClick={() => setEvModal(true)} className="flex h-[54px] w-[72px] flex-col items-center justify-center gap-0.5 rounded-lg border-2 border-dashed border-ink-200 text-slate-400 transition-colors hover:border-brand-400 hover:text-brand-600 cursor-pointer">
                    <Camera size={16} /><span className="text-[9px] font-bold">Attach</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* conditional finding panel */}
          {isNCPC && !readOnly && (
            <div className="anim-fade-up mt-3 rounded-xl border border-red-200 bg-red-50/50 p-3.5">
              <div className="mb-2 flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-wide text-red-700"><AlertTriangle size={14} /> Finding will be raised on submission</p>
                {draft && risk && <Badge tone={risk === "Critical" ? "danger" : risk === "High" ? "warning" : "brand"}>Risk {risk} ({riskScore(draft.likelihood, draft.impact)})</Badge>}
              </div>
              <button onClick={() => setDraftOpen(!draftOpen)} className="mb-2 text-[11px] font-bold text-red-600 underline cursor-pointer">{draftOpen ? "Hide details" : "Edit finding details"}</button>
              {draftOpen && draft && (
                <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                  <Field label="Finding title" req><Input value={draft.title} onChange={(e) => updDraft({ title: e.target.value })} /></Field>
                  <Field label="Severity" req><Select value={draft.severity} onChange={(e) => updDraft({ severity: e.target.value as Severity })}>{SEVERITIES.map((s) => <option key={s}>{s}</option>)}</Select></Field>
                  <div className="sm:col-span-2"><Field label="Finding description" req><Textarea value={draft.description} onChange={(e) => updDraft({ description: e.target.value })} placeholder="What exactly was observed, where, and which record confirmed it…" /></Field></div>
                  <Field label="Likelihood (1–5)"><Select value={draft.likelihood} onChange={(e) => updDraft({ likelihood: +e.target.value })}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</Select></Field>
                  <Field label="Impact (1–5)"><Select value={draft.impact} onChange={(e) => updDraft({ impact: +e.target.value })}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</Select></Field>
                  <Field label="Root cause"><Input value={draft.rootCause} onChange={(e) => updDraft({ rootCause: e.target.value })} placeholder="Why did this happen?" /></Field>
                  <Field label="Due date" req><Input type="date" min={todayISO()} value={draft.dueDate} onChange={(e) => updDraft({ dueDate: e.target.value })} /></Field>
                  <div className="sm:col-span-2"><Field label="Recommendation / corrective action"><Textarea className="!min-h-[52px]" value={draft.recommendation} onChange={(e) => updDraft({ recommendation: e.target.value })} /></Field></div>
                  <Field label="Responsible person"><Select value={draft.responsibleId} onChange={(e) => updDraft({ responsibleId: e.target.value })}>{respUsers.map((u) => <option key={u.id} value={u.id}>{u.name} — {u.title}</option>)}</Select></Field>
                </div>
              )}
            </div>
          )}
          {isNCPC && readOnly && draft && (
            <div className="mt-3 rounded-xl border border-red-100 bg-red-50/40 p-3 text-[12px] text-red-800">
              <strong>{draft.severity}</strong> finding drafted — “{draft.title}” · due {fmtDate(draft.dueDate)}
            </div>
          )}
        </div>
      </div>

      {/* evidence modal */}
      <Modal open={evModal} onClose={() => setEvModal(false)} title="Attach Evidence"
        footer={<><Button variant="ghost" onClick={() => setEvModal(false)}>Cancel</Button><Button onClick={submitEv} icon={<Paperclip size={14} />}>Attach to question</Button></>}>
        <Field label="Evidence type" req>
          <Select value={evType} onChange={(e) => setEvType(e.target.value as EvidenceType)}>{EVIDENCE_TYPES.map((t) => <option key={t}>{t}</option>)}</Select>
        </Field>
        <Field label="Caption / description" req hint="e.g. “Dirty footbath at entrance of House 3”">
          <Input value={evDesc} onChange={(e) => setEvDesc(e.target.value)} placeholder="Describe what the evidence shows" />
        </Field>
        <Field label="File" hint="Images under 400 KB are previewed inline; anything else is stored as metadata (Supabase Storage in production)">
          <input ref={fileRef} type="file" accept="image/*,.pdf,.xlsx,.docx,.csv" className="hidden" onChange={(e) => setEvFile(e.target.files?.[0] ?? null)} />
          <Button variant="outline" onClick={() => fileRef.current?.click()} icon={<Camera size={14} />}>{evFile ? evFile.name : "Choose file / capture photo"}</Button>
        </Field>
      </Modal>
    </div>
  );
}

export function ExecutePage() {
  const { id } = useParams();
  const { db, user, can, submitAudit, toast } = useApp();
  const nav = useNavigate();
  const [submitOpen, setSubmitOpen] = useState(false);
  const [issues, setIssues] = useState<SubmitIssue[]>([]);
  const audit = db.audits.find((a) => a.id === id);

  if (!audit || !user) return <EmptyState title="Audit not found" action={<Link to="/my-audits"><Button variant="dark">My audits</Button></Link>} />;
  const tpl = templateOf(db, audit);
  const farm = getFarm(db, audit.farmId);
  const flat = flattenQuestions(tpl);
  const score = computeAuditScore(tpl, audit.responses, db.settings);
  const isTeam = audit.leadAuditorId === user.id || audit.teamIds.includes(user.id);
  const readOnly = audit.status !== "In Progress" || !isTeam || !can("execute_audits");
  const progress = score.total ? (score.answered / score.total) * 100 : 0;

  const doSubmit = () => {
    const found = submitAudit(audit.id);
    if (found.length) { setIssues(found); return; }
    toast("Audit submitted — findings generated and owners notified");
    nav(`/audit/${audit.id}`);
  };

  const ncCount = flat.filter((f) => audit.responses[f.q.id]?.value === "NC").length;
  const pcDrafts = flat.filter((f) => audit.responses[f.q.id]?.value === "PC" && audit.responses[f.q.id]?.findingDraft).length;

  return (
    <div className="mx-auto max-w-4xl">
      {/* sticky execution bar */}
      <div className="print-hidden sticky top-[52px] z-20 mb-4 -mx-4 border-b border-ink-100 bg-white/92 px-4 py-3 shadow-sm backdrop-blur lg:-mx-7 lg:px-7">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3">
          <button onClick={() => nav(`/audit/${audit.id}`)} className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-ink-900 cursor-pointer"><ArrowLeft size={13} /> Audit</button>
          <div className="min-w-0">
            <p className="truncate font-display text-[14px] font-extrabold text-ink-900">{audit.code} · {farm?.name}</p>
            <p className="text-[10.5px] font-semibold text-slate-400">{tpl.name} {tpl.version} · {fmtDate(audit.date)}</p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden items-center gap-1 text-[10.5px] font-bold text-green-700 sm:flex"><Save size={12} /> Autosaved {format(new Date(audit.updatedAt), "HH:mm:ss")}</span>
            <StatusBadge status={audit.status} />
            {!readOnly && <Button size="sm" icon={<Send size={13} />} onClick={() => { setIssues([]); setSubmitOpen(true); }}>Submit audit</Button>}
            {readOnly && <Badge tone="neutral">Read-only</Badge>}
          </div>
        </div>
        <div className="mx-auto mt-2 max-w-4xl">
          <ProgressBar value={progress} label={`Audit progress — ${score.answered} / ${score.total} questions completed`} tone={progress === 100 ? "success" : "brand"} />
          <div className="scroll-thin mt-2 flex gap-1.5 overflow-x-auto pb-1">
            {tpl.categories.map((c) => {
              const qs = flat.filter((f) => f.cat.id === c.id);
              const done = qs.filter((f) => audit.responses[f.q.id] && audit.responses[f.q.id].value !== "").length;
              return (
                <a key={c.id} href={`#cat-${c.id}`} className={cn("shrink-0 rounded-full border px-2.5 py-1 text-[10.5px] font-bold", done === qs.length ? "border-green-200 bg-green-50 text-green-700" : "border-ink-200 bg-white text-slate-500 hover:border-brand-300")}>
                  {c.name} {done}/{qs.length}
                </a>
              );
            })}
          </div>
        </div>
      </div>

      {readOnly && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-800">
          {audit.status !== "In Progress" ? `This audit is ${audit.status} — the checklist is locked.` : "Only the assigned audit team can edit responses."}
        </p>
      )}

      {(() => {
        let idx = 0;
        return tpl.categories.map((cat) => (
          <section key={cat.id} id={`cat-${cat.id}`} className="mb-6 scroll-mt-40">
            <div className="mb-2 flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-900 font-mono text-[11px] font-bold text-brand-300">{cat.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span>
              <div>
                <h2 className="font-display text-[16px] font-extrabold text-ink-900">{cat.name}</h2>
                <p className="text-[11px] font-semibold text-slate-400">{cat.subcategories.length} subcategories</p>
              </div>
            </div>
            {cat.subcategories.map((sub) => (
              <div key={sub.id} className="mb-4">
                <p className="mb-2 mt-4 text-[11px] font-extrabold uppercase tracking-[0.1em] text-brand-700">▸ {sub.name}</p>
                {sub.questions.map((q) => {
                  idx += 1;
                  return <QuestionCard key={q.id} audit={audit} q={q} catName={cat.name} idx={idx} readOnly={readOnly} />;
                })}
              </div>
            ))}
          </section>
        ));
      })()}

      {!readOnly && (
        <div className="mb-8 flex justify-center">
          <Button size="lg" icon={<Send size={15} />} onClick={() => { setIssues([]); setSubmitOpen(true); }}>Submit audit for review</Button>
        </div>
      )}

      <Modal open={submitOpen} onClose={() => setSubmitOpen(false)} title="Submit Audit" wide
        footer={issues.length === 0 ? (
          <><Button variant="ghost" onClick={() => setSubmitOpen(false)}>Keep working</Button>
            <Button icon={<CheckCircle2 size={14} />} onClick={doSubmit}>Confirm submission</Button></>
        ) : (
          <Button variant="dark" onClick={() => setSubmitOpen(false)}>Back to checklist</Button>
        )}>
        {issues.length === 0 ? (
          <div className="space-y-3">
            <p className="text-[13px] text-slate-600">You are about to submit <strong>{audit.code}</strong> at <strong>{farm?.name}</strong>. On submission:</p>
            <ul className="space-y-1.5 text-[12.5px] text-slate-600">
              <li className="flex gap-2"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-green-600" /> Compliance scores are locked: currently <strong className="font-mono">{score.overall}%</strong></li>
              <li className="flex gap-2"><AlertTriangle size={15} className="mt-0.5 shrink-0 text-red-600" /> <span><strong>{ncCount + pcDrafts}</strong> findings will be created ({ncCount} non-compliant, {pcDrafts} partial with drafted finding)</span></li>
              <li className="flex gap-2"><AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600" /> Critical & major findings automatically generate corrective actions for the farm team</li>
              <li className="flex gap-2"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-green-600" /> Farm manager and audit admin are notified</li>
            </ul>
            <p className="rounded-lg bg-ink-50 px-3 py-2 text-[11.5px] text-slate-500">Responses remain traceable to the original checklist version ({tpl.version}) and all attached evidence.</p>
          </div>
        ) : (
          <div>
            <p className="mb-2 flex items-center gap-2 text-[13px] font-bold text-red-700"><AlertTriangle size={15} /> {issues.length} issue{issues.length > 1 ? "s" : ""} must be resolved before submission</p>
            <div className="max-h-[46vh] space-y-1.5 overflow-y-auto scroll-thin">
              {issues.map((i, n) => (
                <a key={n} href={`#q-${i.questionId}`} onClick={() => setSubmitOpen(false)} className="block rounded-lg border border-red-100 bg-red-50/60 px-3 py-2 hover:bg-red-50">
                  <p className="text-[12px] font-semibold text-ink-800">{i.text}</p>
                  <p className="text-[11px] font-bold text-red-600">{i.problem}</p>
                </a>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
