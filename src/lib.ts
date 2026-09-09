import { format, addDays, differenceInCalendarDays, parseISO } from "date-fns";
import type {
  Audit, Category, CorrectiveAction, Finding, Question, Response, Settings, Subcategory, Template,
} from "./types";
import { CHOICE_OPTIONS } from "./types";

/* ── ids ──────────────────────────────────────────────────────────────── */
let seq = 0;
export function uid(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}${seq.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

/* ── dates ────────────────────────────────────────────────────────────── */
export const todayISO = () => format(new Date(), "yyyy-MM-dd");
export const fmtDate = (iso?: string) => (iso ? format(parseISO(iso.slice(0, 10)), "dd MMM yyyy") : "—");
export const fmtDateShort = (iso?: string) => (iso ? format(parseISO(iso.slice(0, 10)), "dd MMM") : "—");
export const fmtDateTime = (iso?: string) => (iso ? format(parseISO(iso), "dd MMM yyyy HH:mm") : "—");
export const monthKey = (iso: string) => iso.slice(0, 7);
export const monthLabel = (key: string) => format(parseISO(`${key}-01`), "MMM yy");
export const addDaysISO = (iso: string, n: number) => format(addDays(parseISO(iso.slice(0, 10)), n), "yyyy-MM-dd");
export const daysUntil = (iso: string) => differenceInCalendarDays(parseISO(iso.slice(0, 10)), new Date());
export const timeAgo = (iso: string) => {
  const mins = Math.max(1, Math.round((Date.now() - parseISO(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d}d ago` : fmtDate(iso);
};

/* ── checklist helpers ────────────────────────────────────────────────── */
export interface FlatQuestion { q: Question; sub: Subcategory; cat: Category }

export function flattenQuestions(tpl: Template): FlatQuestion[] {
  const out: FlatQuestion[] = [];
  for (const cat of tpl.categories)
    for (const sub of cat.subcategories)
      for (const q of sub.questions) out.push({ q, sub, cat });
  return out;
}

export function findQuestion(tpl: Template, qid: string): FlatQuestion | undefined {
  return flattenQuestions(tpl).find((f) => f.q.id === qid);
}

export const choiceLabel = (v: string) => CHOICE_OPTIONS.find((o) => o.value === v)?.label ?? v;

/** Points earned for a response; null = excluded from scoring (N/A or informational). */
export function scoreAnswer(q: Question, resp: Response | undefined, s: Settings): number | null {
  if (!resp) return null;
  const v = resp.value;
  if (v === "NA") return null;
  if (q.type === "choice") {
    if (v === "C" || v === "PC" || v === "NC") return s.scoreValues[v];
    return null;
  }
  if (!q.scored) return null;
  const num = typeof v === "number" ? v : parseFloat(String(v));
  if (Number.isNaN(num)) return null;
  if (q.type === "rating") return num >= 4 ? 100 : num === 3 ? 50 : 0;
  if (q.rule) {
    if (num <= q.rule.max) return 100;
    if (q.rule.partialMax && num <= q.rule.partialMax) return 50;
    return 0;
  }
  return null;
}

export interface CategoryScore {
  id: string; name: string; earned: number; max: number; score: number | null;
  answered: number; total: number;
}
export interface AuditScore {
  overall: number | null; earned: number; max: number;
  answered: number; total: number; applicable: number; categories: CategoryScore[];
}

export function computeAuditScore(tpl: Template, responses: Record<string, Response>, s: Settings): AuditScore {
  let earned = 0, max = 0, answered = 0, total = 0, applicable = 0;
  const categories: CategoryScore[] = [];
  for (const cat of tpl.categories) {
    let ce = 0, cm = 0, ca = 0, ct = 0;
    for (const sub of cat.subcategories)
      for (const q of sub.questions) {
        total += 1; ct += 1;
        const r = responses[q.id];
        if (r && !(r.value === undefined || r.value === "")) { answered += 1; ca += 1; }
        const pts = scoreAnswer(q, r, s);
        if (pts !== null) {
          ce += pts; cm += 100; earned += pts; max += 100; applicable += 1;
        }
      }
    categories.push({ id: cat.id, name: cat.name, earned: ce, max: cm, score: cm ? Math.round((ce / cm) * 100) : null, answered: ca, total: ct });
  }
  return { overall: max ? Math.round((earned / max) * 100) : null, earned, max, answered, total, applicable, categories };
}

export type ScoreClass = "Excellent" | "Good" | "Needs Improvement" | "Poor";
export function classifyScore(score: number | null, s: Settings): ScoreClass {
  if (score === null) return "Poor";
  if (score >= s.thresholds.excellent) return "Excellent";
  if (score >= s.thresholds.good) return "Good";
  if (score >= s.thresholds.needsImprovement) return "Needs Improvement";
  return "Poor";
}
export const scoreClassTone: Record<ScoreClass, string> = {
  Excellent: "success", Good: "brand", "Needs Improvement": "warning", Poor: "danger",
};

/* ── risk ─────────────────────────────────────────────────────────────── */
export function riskScore(likelihood: number, impact: number) { return likelihood * impact; }
export function riskBand(likelihood: number, impact: number, s: Settings): Finding["severity"] extends never ? never : "Low" | "Medium" | "High" | "Critical" {
  const r = likelihood * impact;
  if (r <= s.riskBands.lowMax) return "Low";
  if (r <= s.riskBands.mediumMax) return "Medium";
  if (r <= s.riskBands.highMax) return "High";
  return "Critical";
}

/* ── deadlines ────────────────────────────────────────────────────────── */
export function deadlineState(ca: CorrectiveAction, s: Settings): "Completed" | "Overdue" | "Due Soon" | "On Track" {
  if (ca.status === "Verified" || ca.status === "Closed") return "Completed";
  const d = daysUntil(ca.targetDate);
  if (d < 0) return "Overdue";
  if (d <= s.dueSoonDays) return "Due Soon";
  return "On Track";
}

/* ── recurring findings ───────────────────────────────────────────────── */
export function recurringFindingIds(findings: Finding[]): Set<string> {
  const byKey = new Map<string, Finding[]>();
  for (const f of findings) {
    const key = `${f.farmId}|${f.questionId}`;
    const list = byKey.get(key) ?? [];
    list.push(f);
    byKey.set(key, list);
  }
  const out = new Set<string>();
  for (const list of byKey.values()) {
    const audits = new Set(list.map((f) => f.auditId));
    if (audits.size >= 3) list.forEach((f) => out.add(f.id));
  }
  return out;
}

/* ── validation ───────────────────────────────────────────────────────── */
export interface SubmitIssue { questionId: string; text: string; problem: string }

export function validateSubmission(tpl: Template, audit: Audit): SubmitIssue[] {
  const issues: SubmitIssue[] = [];
  for (const { q } of flattenQuestions(tpl)) {
    const r = audit.responses[q.id];
    const has = r && !(r.value === undefined || r.value === "" || r.value === null);
    if (!has) {
      if (q.mandatory) issues.push({ questionId: q.id, text: q.text, problem: "Mandatory question is unanswered" });
      continue;
    }
    if (q.type === "numeric" || q.type === "percent") {
      const n = typeof r!.value === "number" ? r!.value : parseFloat(String(r!.value));
      if (Number.isNaN(n) || n < 0) issues.push({ questionId: q.id, text: q.text, problem: "Enter a valid positive number" });
    }
    if (q.mandatoryEvidence && r!.value !== "NA" && r!.evidenceIds.length === 0)
      issues.push({ questionId: q.id, text: q.text, problem: "Mandatory evidence is missing" });
    if ((r!.value === "NC" || r!.value === "PC") && q.mandatoryEvidence && r!.evidenceIds.length === 0)
      issues.push({ questionId: q.id, text: q.text, problem: "Attach evidence for the non-conformance" });
  }
  return issues;
}

/* ── export helpers ───────────────────────────────────────────────────── */
export function toCSV(rows: Record<string, unknown>[], cols: { key: string; label: string }[]): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = cols.map((c) => esc(c.label)).join(",");
  const body = rows.map((r) => cols.map((c) => esc(r[c.key])).join(",")).join("\n");
  return `${head}\n${body}`;
}

export function downloadText(filename: string, content: string, mime = "text/csv") {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const clampPct = (n: number) => Math.max(0, Math.min(100, n));
