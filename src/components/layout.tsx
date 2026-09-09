import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  AlertTriangle, BarChart3, Bell, Building2, CalendarDays, CheckCheck, ChevronDown, ClipboardCheck,
  ClipboardList, FileText, FolderKanban, GitCompareArrows, LayoutDashboard, ListChecks, LogOut, MapPin,
  Menu, RefreshCw, Scale, ScrollText, Search, Settings, ShieldCheck, Sparkles, Tags, TrendingUp,
  UserCog, Users, Wrench, X,
} from "lucide-react";
import { useApp } from "../store";
import { cn, Avatar, Badge, Button } from "./ui";
import type { Perm } from "../types";
import { ROLE_LABEL } from "../types";
import { timeAgo } from "../lib";

interface NavItem { to: string; label: string; icon: React.ReactNode; perm?: Perm }
interface NavGroup { section: string | null; items: NavItem[] }

const NAV: NavGroup[] = [
  { section: null, items: [{ to: "/", label: "Dashboard", icon: <LayoutDashboard size={16} />, perm: "dashboard" }] },
  {
    section: "Audit Management",
    items: [
      { to: "/calendar", label: "Audit Calendar", icon: <CalendarDays size={16} />, perm: "dashboard" },
      { to: "/programs", label: "Audit Programs", icon: <FolderKanban size={16} />, perm: "manage_programs" },
      { to: "/plans", label: "Audit Plans", icon: <ClipboardList size={16} />, perm: "schedule_audits" },
      { to: "/audits", label: "Active Audits", icon: <ClipboardCheck size={16} />, perm: "dashboard" },
      { to: "/audits/completed", label: "Completed Audits", icon: <CheckCheck size={16} />, perm: "dashboard" },
    ],
  },
  {
    section: "Audit Execution",
    items: [
      { to: "/my-audits", label: "My Audits", icon: <ListChecks size={16} />, perm: "execute_audits" },
      { to: "/evidence", label: "Evidence", icon: <Sparkles size={16} />, perm: "dashboard" },
      { to: "/findings", label: "Findings", icon: <AlertTriangle size={16} />, perm: "dashboard" },
    ],
  },
  {
    section: "Corrective Actions",
    items: [
      { to: "/findings/open", label: "Open Findings", icon: <AlertTriangle size={16} />, perm: "dashboard" },
      { to: "/corrective-actions", label: "Corrective Actions", icon: <Wrench size={16} />, perm: "dashboard" },
      { to: "/overdue", label: "Overdue Actions", icon: <RefreshCw size={16} />, perm: "dashboard" },
      { to: "/verification", label: "Verification", icon: <ShieldCheck size={16} />, perm: "verify_ca" },
    ],
  },
  {
    section: "Master Data",
    items: [
      { to: "/farms", label: "Farms", icon: <Building2 size={16} />, perm: "manage_master_data" },
      { to: "/locations", label: "Locations", icon: <MapPin size={16} />, perm: "manage_master_data" },
      { to: "/departments", label: "Departments", icon: <Users size={16} />, perm: "manage_master_data" },
      { to: "/categories", label: "Audit Categories", icon: <Tags size={16} />, perm: "manage_master_data" },
      { to: "/templates", label: "Checklist Templates", icon: <ListChecks size={16} />, perm: "manage_master_data" },
      { to: "/risk-matrix", label: "Risk Categories", icon: <Scale size={16} />, perm: "manage_master_data" },
    ],
  },
  {
    section: "Reports",
    items: [
      { to: "/reports", label: "Audit Reports", icon: <FileText size={16} />, perm: "view_reports" },
      { to: "/reports/findings", label: "Finding Reports", icon: <ScrollText size={16} />, perm: "view_reports" },
      { to: "/reports/compliance", label: "Compliance Reports", icon: <BarChart3 size={16} />, perm: "view_reports" },
      { to: "/comparison", label: "Farm Comparison", icon: <GitCompareArrows size={16} />, perm: "view_reports" },
      { to: "/trends", label: "Trend Analysis", icon: <TrendingUp size={16} />, perm: "view_reports" },
    ],
  },
  {
    section: "Administration",
    items: [
      { to: "/admin/users", label: "User Management", icon: <UserCog size={16} />, perm: "manage_users" },
      { to: "/admin/roles", label: "Roles & Permissions", icon: <ShieldCheck size={16} />, perm: "manage_users" },
      { to: "/admin/settings", label: "System Settings", icon: <Settings size={16} />, perm: "manage_settings" },
      { to: "/admin/config", label: "Audit Configuration", icon: <Scale size={16} />, perm: "manage_settings" },
      { to: "/admin/logs", label: "Activity Logs", icon: <ScrollText size={16} />, perm: "view_logs" },
    ],
  },
];

const TYPE_ICON: Record<string, React.ReactNode> = {
  finding_created: <AlertTriangle size={14} />, ca_overdue: <RefreshCw size={14} />,
  verification_required: <ShieldCheck size={14} />, audit_completed: <CheckCheck size={14} />,
  audit_assigned: <ListChecks size={14} />, audit_scheduled: <CalendarDays size={14} />,
  ca_assigned: <Wrench size={14} />, ca_submitted: <Wrench size={14} />, ca_due_soon: <Bell size={14} />,
  finding_closed: <CheckCheck size={14} />,
};

function GlobalSearch() {
  const { db } = useApp();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("agritrace.recentSearches") || "[]"); } catch { return []; }
  });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const addRecentSearch = (term: string) => {
    if (!term.trim() || term.length < 2) return;
    const updated = [term, ...recentSearches.filter((s) => s !== term)].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem("agritrace.recentSearches", JSON.stringify(updated));
  };

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return null;
    return {
      farms: db.farms.filter((f) => `${f.name} ${f.code} ${f.region}`.toLowerCase().includes(s)).slice(0, 3),
      audits: db.audits.filter((a) => `${a.code} ${db.farms.find((f) => f.id === a.farmId)?.name ?? ""}`.toLowerCase().includes(s)).slice(0, 4),
      findings: db.findings.filter((f) => `${f.code} ${f.title}`.toLowerCase().includes(s)).slice(0, 4),
      users: db.users.filter((u) => u.name.toLowerCase().includes(s)).slice(0, 3),
    };
  }, [q, db]);

  const go = (to: string) => { addRecentSearch(q); setOpen(false); setQ(""); nav(to); };
  const none = results && !results.farms.length && !results.audits.length && !results.findings.length && !results.users.length;

  return (
    <div ref={ref} className="relative hidden md:block w-full max-w-md">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Search audits, farms, findings, people…  (ID, title, auditor)"
        className="input !rounded-full !border-ink-100 !bg-ink-50/70 !pl-8 !text-[12.5px] focus:!bg-white"
      />
      {open && results && (
        <div className="anim-scale-in absolute left-0 right-0 top-11 z-40 max-h-[70vh] overflow-y-auto scroll-thin rounded-xl border border-ink-100 bg-white p-1.5 shadow-xl">
          {none && <p className="px-3 py-4 text-center text-xs text-slate-400">No matches for “{q}”.</p>}
          {results.audits.length > 0 && <p className="label px-3 pt-2 !mb-1">Audits</p>}
          {results.audits.map((a) => (
            <button key={a.id} onClick={() => go(`/audit/${a.id}`)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] hover:bg-brand-50 cursor-pointer">
              <ClipboardCheck size={14} className="text-brand-600 shrink-0" />
              <span className="font-mono text-xs text-slate-500">{a.code}</span>
              <span className="truncate font-medium text-ink-800">{db.farms.find((f) => f.id === a.farmId)?.name}</span>
              <Badge tone="neutral" className="ml-auto">{a.status}</Badge>
            </button>
          ))}
          {results.findings.length > 0 && <p className="label px-3 pt-2 !mb-1">Findings</p>}
          {results.findings.map((f) => (
            <button key={f.id} onClick={() => go(`/finding/${f.id}`)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] hover:bg-brand-50 cursor-pointer">
              <AlertTriangle size={14} className="text-amber-600 shrink-0" />
              <span className="font-mono text-xs text-slate-500">{f.code}</span>
              <span className="truncate font-medium text-ink-800">{f.title}</span>
            </button>
          ))}
          {results.farms.length > 0 && <p className="label px-3 pt-2 !mb-1">Farms</p>}
          {results.farms.map((f) => (
            <button key={f.id} onClick={() => go(`/farm/${f.id}`)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] hover:bg-brand-50 cursor-pointer">
              <Building2 size={14} className="text-ink-500 shrink-0" />
              <span className="truncate font-medium text-ink-800">{f.name}</span>
              <span className="ml-auto text-xs text-slate-400">{f.type}</span>
            </button>
          ))}
          {results.users.length > 0 && <p className="label px-3 pt-2 !mb-1">People</p>}
          {results.users.map((u) => (
            <div key={u.id} className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px]">
              <Avatar user={u} size={22} />
              <span className="font-medium text-ink-800">{u.name}</span>
              <span className="ml-auto text-xs text-slate-400">{ROLE_LABEL[u.role]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NotificationDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, user, mutate } = useApp();
  const nav = useNavigate();
  if (!user) return null;
  const mine = db.notifications.filter((n) => n.audience.includes(user.role) || n.userIds?.includes(user.id));
  const unread = mine.filter((n) => !n.read).length;
  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-ink-950/40" onClick={onClose} />}
      <aside className={cn("fixed right-0 top-0 z-50 h-full w-full max-w-sm transform bg-white shadow-2xl transition-transform duration-300", open ? "translate-x-0" : "translate-x-full")}>
        <div className="flex items-center justify-between border-b border-ink-100 bg-ink-900 px-4 py-3.5">
          <div>
            <h3 className="font-display text-sm font-bold text-white">Notification Center</h3>
            <p className="text-[11px] text-ink-300">{unread} unread of {mine.length}</p>
          </div>
          <div className="flex gap-1.5">
            <Button variant="subtle" size="sm" onClick={() => mutate((d) => { d.notifications.forEach((n) => { if (mine.some((m) => m.id === n.id)) n.read = true; }); })}>Mark all read</Button>
            <button onClick={onClose} className="rounded-md p-1.5 text-ink-300 hover:bg-ink-800 hover:text-white cursor-pointer"><X size={16} /></button>
          </div>
        </div>
        <div className="scroll-thin h-[calc(100%-62px)] overflow-y-auto">
          {mine.length === 0 && <p className="px-6 py-12 text-center text-xs text-slate-400">No notifications yet.</p>}
          {mine.map((n) => (
            <button key={n.id}
              onClick={() => { mutate((d) => { const x = d.notifications.find((y) => y.id === n.id); if (x) x.read = true; }); if (n.link) { nav(n.link); onClose(); } }}
              className={cn("flex w-full items-start gap-3 border-b border-ink-100/70 px-4 py-3.5 text-left transition-colors hover:bg-brand-50/50 cursor-pointer", !n.read && "bg-brand-50/30")}>
              <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", n.type.includes("overdue") ? "bg-red-50 text-red-600" : n.type.includes("closed") || n.type.includes("completed") ? "bg-green-50 text-green-600" : "bg-brand-50 text-brand-600")}>
                {TYPE_ICON[n.type] ?? <Bell size={14} />}
              </span>
              <span className="min-w-0">
                <span className={cn("block text-[12.5px] leading-tight", !n.read ? "font-bold text-ink-900" : "font-medium text-ink-700")}>{n.title}</span>
                <span className="mt-0.5 block truncate text-[11.5px] text-slate-500">{n.body}</span>
                <span className="mt-1 block text-[10.5px] font-medium uppercase tracking-wide text-slate-400">{timeAgo(n.createdAt)}</span>
              </span>
              {!n.read && <span className="ml-auto mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />}
            </button>
          ))}
        </div>
      </aside>
    </>
  );
}

export function ToastHost() {
  const { toasts } = useApp();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2 print-hidden">
      {toasts.map((t) => (
        <div key={t.id} className={cn("anim-slide-in pointer-events-auto flex items-center gap-2.5 rounded-lg border px-4 py-2.5 text-[13px] font-semibold shadow-lg",
          t.tone === "success" && "border-green-200 bg-green-50 text-green-800",
          t.tone === "error" && "border-red-200 bg-red-50 text-red-800",
          t.tone === "info" && "border-brand-200 bg-brand-50 text-brand-800")}>
          {t.tone === "success" ? <CheckCheck size={15} /> : t.tone === "error" ? <AlertTriangle size={15} /> : <Bell size={15} />}
          {t.msg}
        </div>
      ))}
    </div>
  );
}

export function LoadingOverlay({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink-950/40 backdrop-blur-sm print-hidden">
      <div className="card flex items-center gap-3 px-6 py-4">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
        <span className="text-sm font-semibold text-ink-800">Processing…</span>
      </div>
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const { user, logout, can, db, loading } = useApp();
  const loc = useLocation();
  const nav = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenu, setUserMenu] = useState(false);

  useEffect(() => { setMobileOpen(false); window.scrollTo(0, 0); }, [loc.pathname]);

  if (!user) return null;
  const unread = db.notifications.filter((n) => !n.read && (n.audience.includes(user.role) || n.userIds?.includes(user.id))).length;

  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.perm || can(i.perm)) })).filter((g) => g.items.length > 0);

  const sidebar = (
    <div className="sidebar-surface flex h-full flex-col">
      <Link to="/" className="flex items-center gap-2.5 px-5 pb-5 pt-6">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/15 ring-1 ring-brand-400/40">
          <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
            <path d="M16 4l9 3.4v7.2c0 6.2-3.8 11-9 13.4-5.2-2.4-9-7.2-9-13.4V7.4L16 4z" stroke="#5f88f5" strokeWidth="2.2" />
            <path d="M11.5 16.2l3 3 6-6.4" stroke="#7ce0a3" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span>
          <span className="block font-display text-[15px] font-extrabold leading-4 tracking-tight text-white">AgriTrace <span className="text-brand-300">Audit</span></span>
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.18em] text-ink-400">Farm Compliance OS</span>
        </span>
      </Link>
      <nav className="scroll-thin flex-1 overflow-y-auto px-3 pb-6">
        {groups.map((g) => (
          <div key={g.section ?? "root"} className="mb-1.5">
            {g.section && <p className="px-2.5 pb-1 pt-3 text-[9.5px] font-bold uppercase tracking-[0.16em] text-ink-500">{g.section}</p>}
            {g.items.map((i) => {
              const active = i.to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(i.to);
              return (
                <Link key={i.to + i.label} to={i.to}
                  className={cn("group relative mb-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[12.5px] font-semibold transition-all",
                    active ? "bg-brand-500/15 text-white" : "text-ink-300 hover:bg-white/5 hover:text-white")}>
                  {active && <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r bg-brand-400" />}
                  <span className={cn(active ? "text-brand-300" : "text-ink-400 group-hover:text-ink-200")}>{i.icon}</span>
                  {i.label}
                  {i.to === "/verification" && can("verify_ca") && db.correctiveActions.some((c) => c.status === "Submitted for Verification") && (
                    <span className="ml-auto rounded-full bg-brand-500 px-1.5 py-px font-mono text-[10px] font-bold text-white">{db.correctiveActions.filter((c) => c.status === "Submitted for Verification").length}</span>
                  )}
                  {i.to === "/overdue" && db.correctiveActions.some((c) => c.status !== "Verified" && c.status !== "Closed" && c.targetDate < new Date().toISOString().slice(0, 10)) && (
                    <span className="ml-auto h-1.5 w-1.5 rounded-full bg-red-500" />
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <Avatar user={user} size={32} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] font-bold text-white">{user.name}</p>
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-brand-300">{ROLE_LABEL[user.role]}</p>
          </div>
          <button onClick={() => { logout(); nav("/login"); }} title="Sign out" className="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-white/10 hover:text-white cursor-pointer">
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="app-canvas flex h-full">
      <aside className="print-hidden fixed inset-y-0 left-0 z-30 hidden w-[228px] lg:block">{sidebar}</aside>
      {mobileOpen && (
        <div className="print-hidden fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink-950/55" onClick={() => setMobileOpen(false)} />
          <aside className="anim-slide-in absolute inset-y-0 left-0 w-[248px]">{sidebar}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-[228px]">
        <header className="print-hidden sticky top-0 z-20 flex items-center gap-3 border-b border-ink-100 bg-white/85 px-4 py-2.5 backdrop-blur lg:px-6">
          <button onClick={() => setMobileOpen(true)} className="rounded-lg p-1.5 text-ink-600 hover:bg-ink-50 lg:hidden cursor-pointer"><Menu size={18} /></button>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setNotifOpen(true)} className="relative rounded-lg p-2 text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-900 cursor-pointer">
              <Bell size={17} />
              {unread > 0 && <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 font-mono text-[9px] font-bold text-white">{unread}</span>}
            </button>
            <div className="relative">
              <button onClick={() => setUserMenu((v) => !v)} className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-ink-50 cursor-pointer">
                <Avatar user={user} size={28} />
                <ChevronDown size={13} className="text-slate-400" />
              </button>
              {userMenu && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setUserMenu(false)} />
                  <div className="anim-scale-in absolute right-0 top-11 z-40 w-60 rounded-xl border border-ink-100 bg-white p-2 shadow-xl">
                    <div className="border-b border-ink-100 px-2.5 pb-2.5 pt-1">
                      <p className="text-[13px] font-bold text-ink-900">{user.name}</p>
                      <p className="text-[11px] text-slate-500">{user.email}</p>
                      <Badge tone="navy" className="mt-1.5">{ROLE_LABEL[user.role]}</Badge>
                    </div>
                    <button onClick={() => { setUserMenu(false); nav("/admin/roles"); }} className="mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12.5px] font-medium text-ink-700 hover:bg-ink-50 cursor-pointer">
                      <ShieldCheck size={14} className="text-slate-400" /> My permissions
                    </button>
                    <button onClick={() => { logout(); nav("/login"); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12.5px] font-medium text-red-700 hover:bg-red-50 cursor-pointer">
                      <LogOut size={14} /> Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>
        <main className="print-block min-w-0 flex-1 px-4 py-5 lg:px-7 lg:py-6">{children}</main>
      </div>
      <div className="print-hidden"><NotificationDrawer open={notifOpen} onClose={() => setNotifOpen(false)} /></div>
      <LoadingOverlay show={loading} />
      <ToastHost />
    </div>
  );
}

export function AccessDenied() {
  const { user } = useApp();
  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <div className="card p-8">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600"><ShieldCheck size={22} /></div>
        <h1 className="font-display text-lg font-extrabold text-ink-900">Access restricted</h1>
        <p className="mt-2 text-[13px] text-slate-500">
          Your role <strong>{user ? ROLE_LABEL[user.role] : ""}</strong> does not include permission for this area.
          Row-level security also blocks this query at the database level. Contact your audit administrator if you need access.
        </p>
        <Link to="/" className="mt-5 inline-block"><Button variant="dark">Back to dashboard</Button></Link>
      </div>
    </div>
  );
}
