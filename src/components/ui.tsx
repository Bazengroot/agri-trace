import React, { useMemo, useState } from "react";
import {
  AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Check, Download, Inbox, Search, X,
} from "lucide-react";
import { downloadText, toCSV } from "../lib";
import type { CAStatus, AuditStatus, DeadlineState, FindingStatus, RiskLevel, Severity, User } from "../types";

export const cn = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(" ");

/* ── Button ───────────────────────────────────────────────────────────── */
type BtnVariant = "primary" | "dark" | "outline" | "ghost" | "danger" | "success" | "subtle";
export function Button({
  variant = "primary", size = "md", className, children, icon, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md" | "lg"; icon?: React.ReactNode }) {
  const v: Record<BtnVariant, string> = {
    primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm shadow-brand-600/25",
    dark: "bg-ink-900 text-white hover:bg-ink-800",
    outline: "border border-ink-200 bg-white text-ink-700 hover:border-brand-400 hover:text-brand-700",
    ghost: "text-ink-600 hover:bg-ink-50 hover:text-ink-900",
    danger: "bg-red-700 text-white hover:bg-red-800",
    success: "bg-green-700 text-white hover:bg-green-800",
    subtle: "bg-brand-50 text-brand-700 hover:bg-brand-100 border border-brand-100",
  };
  const s = { sm: "px-2.5 py-1.5 text-xs", md: "px-3.5 py-2 text-[13px]", lg: "px-5 py-2.5 text-sm" };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-all active:scale-[0.98] disabled:opacity-45 disabled:pointer-events-none cursor-pointer whitespace-nowrap",
        v[variant], s[size], className,
      )}
      aria-label={rest["aria-label"] || (typeof children === "string" ? children : undefined)}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

/* ── Badges ───────────────────────────────────────────────────────────── */
export type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "navy" | "violet" | "teal";
const TONES: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-600 border-slate-200",
  brand: "bg-brand-50 text-brand-700 border-brand-100",
  success: "bg-green-50 text-green-700 border-green-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  danger: "bg-red-50 text-red-700 border-red-200",
  navy: "bg-ink-50 text-ink-700 border-ink-100",
  violet: "bg-violet-50 text-violet-700 border-violet-200",
  teal: "bg-teal-50 text-teal-700 border-teal-200",
};
const DOTS: Record<Tone, string> = {
  neutral: "bg-slate-400", brand: "bg-brand-500", success: "bg-green-600", warning: "bg-amber-500",
  danger: "bg-red-600", navy: "bg-ink-600", violet: "bg-violet-500", teal: "bg-teal-600",
};
export function Badge({ tone = "neutral", children, dot, className, pulse }: { tone?: Tone; children: React.ReactNode; dot?: boolean; className?: string; pulse?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold leading-4 whitespace-nowrap", TONES[tone], className)}>
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", DOTS[tone], pulse && "pulse-dot")} />}
      {children}
    </span>
  );
}

const AUDIT_STATUS_TONE: Record<AuditStatus, Tone> = {
  Draft: "neutral", Scheduled: "brand", "In Progress": "warning", Submitted: "violet",
  "Under Review": "teal", Completed: "success", Cancelled: "danger",
};
export const StatusBadge = ({ status }: { status: AuditStatus }) => (
  <Badge tone={AUDIT_STATUS_TONE[status]} dot pulse={status === "In Progress"}>{status}</Badge>
);

const FINDING_TONE: Record<FindingStatus, Tone> = {
  Open: "danger", "Action Required": "warning", "In Progress": "brand",
  "Submitted for Verification": "violet", Verified: "teal", Closed: "success", Rejected: "danger",
};
export const FindingBadge = ({ status }: { status: FindingStatus }) => (
  <Badge tone={FINDING_TONE[status]} dot>{status}</Badge>
);
export const CABadge = ({ status }: { status: CAStatus }) => <FindingBadge status={status as FindingStatus} />;

const SEV_TONE: Record<Severity, Tone> = { Critical: "danger", Major: "warning", Minor: "brand", Observation: "neutral" };
export const SeverityBadge = ({ severity }: { severity: Severity }) => (
  <Badge tone={SEV_TONE[severity]} dot>{severity}</Badge>
);

const RISK_TONE: Record<RiskLevel, Tone> = { Low: "success", Medium: "warning", High: "warning", Critical: "danger" };
export const RiskBadge = ({ level, score }: { level: RiskLevel; score?: number }) => (
  <Badge tone={RISK_TONE[level]} className={level === "High" ? "!bg-orange-50 !text-orange-700 !border-orange-200" : ""}>
    {level}{score !== undefined && <span className="opacity-70 font-mono">({score})</span>}
  </Badge>
);

const DL_TONE: Record<DeadlineState, Tone> = { Completed: "success", Overdue: "danger", "Due Soon": "warning", "On Track": "brand" };
export const DeadlineBadge = ({ state }: { state: DeadlineState }) => <Badge tone={DL_TONE[state]} dot pulse={state === "Overdue"}>{state}</Badge>;

/* ── Cards / layout ───────────────────────────────────────────────────── */
export function Card({ className, children, onClick }: { className?: string; children: React.ReactNode; onClick?: () => void }) {
  return <div onClick={onClick} className={cn("card", onClick && "cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md", className)}>{children}</div>;
}

export function PageHeader({ title, sub, actions }: { title: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[22px] font-extrabold tracking-tight text-ink-900">{title}</h1>
        {sub && <p className="mt-0.5 text-[13px] text-slate-500">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ── Modal ────────────────────────────────────────────────────────────── */
export function Modal({ open, onClose, title, children, footer, wide }: {
  open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="absolute inset-0 bg-ink-950/55 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div className={cn("anim-scale-in relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-xl sm:rounded-xl bg-white shadow-2xl", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}>
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3.5">
          <h3 id="modal-title" className="font-display text-[15px] font-bold text-ink-900">{title}</h3>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-ink-50 hover:text-ink-800 cursor-pointer" aria-label="Close dialog"><X size={17} /></button>
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-ink-100 bg-ink-50/60 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/* ── Form primitives ──────────────────────────────────────────────────── */
export function Field({ label, error, req, children, hint }: { label: string; error?: string; req?: boolean; children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-3">
      <label className="label">{label}{req && <span className="text-red-600 ml-0.5">*</span>}</label>
      {children}
      {hint && !error && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
      {error && <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-red-600"><AlertTriangle size={11} />{error}</p>}
    </div>
  );
}
export const Input = (p: React.InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cn("input", p.className)} />;
export const Textarea = (p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={cn("input min-h-[74px]", p.className)} />;
export const Select = (p: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cn("input cursor-pointer", p.className)} />;

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="inline-flex items-center gap-2 cursor-pointer">
      <span className={cn("relative h-5 w-9 rounded-full transition-colors", on ? "bg-brand-600" : "bg-slate-300")}>
        <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", on ? "left-[18px]" : "left-0.5")} />
      </span>
      {label && <span className="text-[13px] font-medium text-ink-700">{label}</span>}
    </button>
  );
}

/* ── Tabs ─────────────────────────────────────────────────────────────── */
export function Tabs({ tabs, active, onChange }: { tabs: { id: string; label: string; count?: number }[]; active: string; onChange: (id: string) => void }) {
  return (
    <div className="mb-4 flex flex-wrap gap-1 rounded-lg border border-ink-100 bg-white p-1 w-fit max-w-full overflow-x-auto scroll-thin">
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={cn("rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition-colors cursor-pointer whitespace-nowrap",
            active === t.id ? "bg-ink-900 text-white shadow-sm" : "text-ink-600 hover:bg-ink-50")}>
          {t.label}
          {t.count !== undefined && <span className={cn("ml-1.5 rounded-full px-1.5 py-px text-[10px] font-mono", active === t.id ? "bg-white/20" : "bg-ink-100 text-ink-600")}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ── Progress / gauge / sparkline ─────────────────────────────────────── */
export function ProgressBar({ value, tone = "brand", className, label }: { value: number; tone?: "brand" | "success" | "warning" | "danger"; className?: string; label?: string }) {
  const t = { brand: "bg-brand-500", success: "bg-green-600", warning: "bg-amber-500", danger: "bg-red-600" };
  return (
    <div className={className}>
      {label && <div className="mb-1 flex justify-between text-[11px] font-semibold text-slate-500"><span>{label}</span><span className="font-mono">{Math.round(value)}%</span></div>}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
        <div className={cn("h-full rounded-full transition-all duration-500", t[tone])} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
    </div>
  );
}

export function Gauge({ value, size = 108, stroke = 10, tone }: { value: number | null; size?: number; stroke?: number; tone?: string }) {
  const v = value ?? 0;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = tone ?? (v >= 90 ? "#16a34a" : v >= 80 ? "#2251cf" : v >= 70 ? "#d97706" : "#b91c1c");
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e4eaf3" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (c * v) / 100} style={{ transition: "stroke-dashoffset 0.8s ease" }} />
      </svg>
      <div className="absolute text-center">
        <div className="font-mono text-xl font-bold text-ink-900">{value === null ? "—" : `${v}%`}</div>
        <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400">score</div>
      </div>
    </div>
  );
}

export function Sparkline({ data, width = 120, height = 34, stroke = "#2251cf" }: { data: number[]; width?: number; height?: number; stroke?: string }) {
  if (data.length < 2) return <span className="text-xs text-slate-400">insufficient data</span>;
  const min = Math.min(...data), max = Math.max(...data);
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * (width - 6) + 3;
    const y = height - 5 - ((v - min) / Math.max(1, max - min)) * (height - 10);
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={width} height={height}>
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts.split(" ").pop()?.split(",")[0]} cy={pts.split(" ").pop()?.split(",")[1]} r="2.6" fill={stroke} />
    </svg>
  );
}

/* ── Avatar ───────────────────────────────────────────────────────────── */
export function Avatar({ user, size = 30 }: { user?: Pick<User, "name" | "color">; size?: number }) {
  const initials = user ? user.name.split(" ").map((s) => s[0]).slice(0, 2).join("") : "?";
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold text-white ring-2 ring-white"
      style={{ width: size, height: size, background: user?.color ?? "#64748b", fontSize: size * 0.36 }}>
      {initials}
    </span>
  );
}

/* ── Empty state ──────────────────────────────────────────────────────── */
export function EmptyState({ icon, title, body, action }: { icon?: React.ReactNode; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-ink-200 bg-white/60 px-6 py-12 text-center" role="status" aria-live="polite">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-ink-50 text-ink-400" aria-hidden="true">{icon ?? <Inbox size={20} />}</div>
      <p className="font-display text-sm font-bold text-ink-800">{title}</p>
      {body && <p className="mt-1 max-w-sm text-xs text-slate-500">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ── DataTable ────────────────────────────────────────────────────────── */
export interface Col<T> {
  key: string; label: React.ReactNode; width?: string; align?: "left" | "right" | "center";
  sortValue?: (r: T) => string | number; render?: (r: T) => React.ReactNode; csv?: (r: T) => string | number;
}
export function DataTable<T extends { id: string }>({
  rows, cols, pageSize = 10, onRowClick, exportName, toolbar, searchable = true, empty,
}: {
  rows: T[]; cols: Col<T>[]; pageSize?: number; onRowClick?: (r: T) => void;
  exportName?: string; toolbar?: React.ReactNode; searchable?: boolean; empty?: React.ReactNode;
}) {
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [dir, setDir] = useState<1 | -1>(1);
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    let out = rows;
    if (q.trim()) {
      const s = q.toLowerCase();
      out = rows.filter((r) => cols.some((c) => String(c.sortValue ? c.sortValue(r) : (r as Record<string, unknown>)[c.key] ?? "").toLowerCase().includes(s)));
    }
    if (sortKey) {
      const col = cols.find((c) => c.key === sortKey);
      if (col?.sortValue) {
        out = [...out].sort((a, b) => {
          const va = col.sortValue!(a), vb = col.sortValue!(b);
          return (typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb))) * dir;
        });
      }
    }
    return out;
  }, [rows, q, sortKey, dir, cols]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, pages - 1);
  const slice = filtered.slice(cur * pageSize, cur * pageSize + pageSize);

  const doSort = (k: string) => {
    if (sortKey === k) setDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(k); setDir(1); }
  };

  const doExport = () => {
    const csvCols = cols.filter((c) => typeof c.label === "string");
    downloadText(`${exportName ?? "export"}.csv`, toCSV(filtered as unknown as Record<string, unknown>[], csvCols.map((c) => ({ key: c.key, label: c.label as string }))));
  };

  return (
    <div className="card overflow-hidden">
      {(toolbar || searchable || exportName) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-3.5 py-2.5">
          {toolbar}
          <div className="ml-auto flex items-center gap-2">
            {searchable && (
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Search…"
                  className="input !w-44 !py-1.5 !pl-7 !text-xs" />
              </div>
            )}
            {exportName && (
              <Button variant="outline" size="sm" icon={<Download size={13} />} onClick={doExport}>CSV</Button>
            )}
          </div>
        </div>
      )}
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-ink-100 bg-ink-50/70">
              {cols.map((c) => (
                <th key={c.key} style={{ width: c.width }}
                  className={cn("px-3.5 py-2.5 text-[10.5px] font-bold uppercase tracking-wider text-slate-500 select-none", c.sortValue && "cursor-pointer hover:text-ink-800", c.align === "right" && "text-right", c.align === "center" && "text-center")}
                  onClick={() => c.sortValue && doSort(c.key)}>
                  <span className="inline-flex items-center gap-1">{c.label}
                    {c.sortValue && (sortKey === c.key ? (dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />) : <ArrowUpDown size={11} className="opacity-35" />)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((r) => (
              <tr key={r.id} onClick={() => onRowClick?.(r)} onKeyDown={(e) => { if (onRowClick && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onRowClick(r); } }}
                tabIndex={onRowClick ? 0 : undefined}
                role={onRowClick ? "button" : undefined}
                className={cn("border-b border-ink-100/70 last:border-0 transition-colors", onRowClick && "cursor-pointer hover:bg-brand-50/40 focus:outline-none focus:bg-brand-50/60")}>
                {cols.map((c) => (
                  <td key={c.key} className={cn("px-3.5 py-2.5 align-middle", c.align === "right" && "text-right", c.align === "center" && "text-center")}>
                    {c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key] ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {slice.length === 0 && (
          <div className="px-4 py-8">{empty ?? <EmptyState title="No records match" body="Adjust the search or filters to see results." />}</div>
        )}
      </div>
      {filtered.length > pageSize && (
        <div className="flex items-center justify-between border-t border-ink-100 px-3.5 py-2 text-[12px] text-slate-500">
          <span className="font-mono">{cur * pageSize + 1}–{Math.min(filtered.length, (cur + 1) * pageSize)} of {filtered.length}</span>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" disabled={cur === 0} onClick={() => setPage(cur - 1)}>Prev</Button>
            <Button variant="ghost" size="sm" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Misc ─────────────────────────────────────────────────────────────── */
export function ScorePill({ score }: { score: number | null }) {
  if (score === null) return <span className="font-mono text-slate-400">—</span>;
  const cls = score >= 90 ? "bg-green-50 text-green-700" : score >= 80 ? "bg-brand-50 text-brand-700" : score >= 70 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700";
  return <span className={cn("inline-block rounded-md px-2 py-0.5 font-mono text-xs font-bold", cls)}>{score}%</span>;
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="font-display text-[13px] font-extrabold uppercase tracking-[0.08em] text-ink-700">{children}</h2>
      {right}
    </div>
  );
}

export function CheckItem({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={cn("flex items-start gap-2 text-[13px]", ok ? "text-green-700" : "text-red-700")}>
      <span className={cn("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full", ok ? "bg-green-100" : "bg-red-100")}>
        {ok ? <Check size={10} strokeWidth={3} /> : <X size={10} strokeWidth={3} />}
      </span>
      <span className={ok ? "" : "font-medium"}>{children}</span>
    </li>
  );
}
