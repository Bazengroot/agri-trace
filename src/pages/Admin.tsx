import React, { useEffect, useMemo, useState } from "react";
import { Database, Download, KeyRound, Plus, RotateCcw, ShieldCheck, Upload, UserCog } from "lucide-react";
import { useApp, getFarm } from "../store";
import { Avatar, Badge, Button, Card, DataTable, Field, Input, Modal, PageHeader, SectionTitle, Select, Toggle, type Col, cn } from "../components/ui";
import { fmtDateTime, timeAgo } from "../lib";
import type { Perm, Role, User } from "../types";
import { ROLE_LABEL, ROLE_PERMS, ROLES } from "../types";
import * as userService from "../services/master-data/user.service";
import * as auditTrailService from "../services/audit-trail/audit-trail.service";

/* ── User management ──────────────────────────────────────────────────── */
export function UsersAdminPage() {
  const { db, mutate, toast, user: me } = useApp();
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<Partial<User>>({ role: "VIEWER", active: true });
  const [err, setErr] = useState<Record<string, string>>({});
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUsers = async () => {
      try {
        setLoading(true);
        const result = await userService.listUsers({});
        setUsers(result.data || []);
      } catch (error) {
        console.error("Failed to load users:", error);
        toast("Failed to load users", "error");
      } finally {
        setLoading(false);
      }
    };
    loadUsers();
  }, []);

  const cols: Col<User>[] = [
    { key: "name", label: "User", sortValue: (r) => r.name, render: (r) => (
      <div className="flex items-center gap-2.5"><Avatar user={r} size={30} />
        <div><p className="font-bold text-ink-900">{r.name}</p><p className="text-[11px] text-slate-400">{r.email}</p></div></div>) },
    { key: "title", label: "Title", sortValue: (r) => r.title, render: (r) => <span className="text-slate-600">{r.title}</span> },
    { key: "role", label: "Role", sortValue: (r) => r.role, render: (r) => (
      <Select value={r.role} disabled={r.id === me?.id}
        onChange={(e) => {
          mutate((d) => { const u = d.users.find((x) => x.id === r.id); if (u) u.role = e.target.value as Role; },
            { action: "User permission changed", record: r.name, detail: `Role set to ${e.target.value}` });
          toast(`${r.name} is now ${ROLE_LABEL[e.target.value as Role]}`);
        }}
        className="!w-auto !py-1 !text-xs font-bold">
        {ROLES.map((x) => <option key={x} value={x}>{ROLE_LABEL[x]}</option>)}
      </Select>) },
    { key: "farm", label: "Farm scope", render: (r) => (r.farmId ? <Badge tone="navy">{getFarm(db, r.farmId)?.name}</Badge> : <span className="text-slate-300">All farms</span>) },
    { key: "lastLogin", label: "Last login", sortValue: (r) => r.lastLogin, render: (r) => <span className="text-[11.5px] text-slate-500">{timeAgo(r.lastLogin)}</span> },
    { key: "active", label: "Status", render: (r) => (
      <Toggle on={r.active} label={r.active ? "Active" : "Disabled"} onChange={(v) => {
        if (r.id === me?.id) { toast("You cannot deactivate your own account", "error"); return; }
        mutate((d) => { const u = d.users.find((x) => x.id === r.id); if (u) u.active = v; }, { action: "User permission changed", record: r.name, detail: v ? "Account activated" : "Account deactivated" });
        toast(v ? "Account activated" : "Account deactivated", "info");
      }} />) },
  ];

  const save = async () => {
    const e: Record<string, string> = {};
    if (!form.name?.trim()) e.name = "Name is required";
    if (!/.+@.+\..+/.test(form.email ?? "")) e.email = "Enter a valid email address";
    if (users.some((u) => u.email.toLowerCase() === (form.email ?? "").toLowerCase())) e.email = "Email already registered";
    setErr(e);
    if (Object.keys(e).length) return;

    try {
      await userService.createUser({
        organization_id: "default-org", // TODO: Get from user context
        full_name: form.name!,
        email: form.email!,
        role: (form.role || "viewer").toLowerCase() as any,
        phone: null,
        avatar_url: null,
        status: "active",
        farm_id: form.farmId || null,
      });

      // Reload users
      const result = await userService.listUsers({});
      setUsers(result.data || []);

      toast(`${form.name} invited`);
      setModal(false);
      setForm({ role: "VIEWER", active: true });
    } catch (error) {
      console.error("Failed to create user:", error);
      toast("Failed to create user", "error");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600 mx-auto mb-4"></div>
          <p className="text-sm text-slate-500">Loading users...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="User Management" sub="Accounts, roles and farm scoping — changes are written to the immutable activity log"
        actions={<Button icon={<Plus size={15} />} onClick={() => setModal(true)}>Add User</Button>} />
      <DataTable rows={users} cols={cols} exportName="users" pageSize={10} />
      <Modal open={modal} onClose={() => setModal(false)} title="Add User"
        footer={<><Button variant="ghost" onClick={() => setModal(false)}>Cancel</Button><Button onClick={save}>Create account</Button></>}>
        <Field label="Full name" req error={err.name}><Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Email" req error={err.email}><Input type="email" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@company.co" /></Field>
        <Field label="Role" req><Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</Select></Field>
        <Field label="Title"><Input value={form.title ?? ""} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        {(form.role === "FARM_MANAGER" || form.role === "SUPERVISOR") && (
          <Field label="Scoped farm" hint="This user will only see data for the selected farm"><Select value={form.farmId ?? ""} onChange={(e) => setForm({ ...form, farmId: e.target.value || undefined })}>
            <option value="">— select —</option>{db.farms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select></Field>
        )}
      </Modal>
    </div>
  );
}

/* ── Roles & permissions ──────────────────────────────────────────────── */
const PERM_INFO: { perm: Perm; label: string; desc: string }[] = [
  { perm: "dashboard", label: "Dashboard & search", desc: "View KPIs, charts and global search" },
  { perm: "manage_master_data", label: "Master data", desc: "Farms, locations, departments, templates, risk matrix" },
  { perm: "manage_programs", label: "Audit programs", desc: "Create and edit audit programs" },
  { perm: "schedule_audits", label: "Schedule audits", desc: "Create plans, move lifecycle states, sign off" },
  { perm: "execute_audits", label: "Execute audits", desc: "Run assigned checklists, attach evidence, submit" },
  { perm: "manage_findings", label: "Manage findings", desc: "Raise findings and create corrective actions" },
  { perm: "submit_ca", label: "Corrective actions", desc: "Work, evidence and submit corrective actions" },
  { perm: "verify_ca", label: "Verification", desc: "Verify or reject submitted corrective actions" },
  { perm: "view_reports", label: "Reports", desc: "Audit reports, compliance, comparison, trends" },
  { perm: "manage_users", label: "User management", desc: "Accounts, roles, activation" },
  { perm: "manage_settings", label: "System settings", desc: "Scoring, thresholds, deadlines, configuration" },
  { perm: "view_logs", label: "Activity logs", desc: "Read the immutable audit trail" },
];

export function RolesPage() {
  return (
    <div>
      <PageHeader title="Roles & Permissions" sub="Permission matrix enforced at two levels: route guards in the client and Row Level Security policies in PostgreSQL" />
      <Card className="mb-4 overflow-hidden">
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-[12.5px]">
            <thead><tr className="border-b border-ink-100 bg-ink-50/70 text-[10.5px] uppercase tracking-wider text-slate-400">
              <th className="px-4 py-2.5 font-bold">Permission</th>
              {ROLES.map((r) => <th key={r} className="px-3 py-2.5 text-center font-bold">{ROLE_LABEL[r]}</th>)}
            </tr></thead>
            <tbody>
              {PERM_INFO.map((p) => (
                <tr key={p.perm} className="border-b border-ink-100/70 last:border-0">
                  <td className="px-4 py-2.5"><p className="font-bold text-ink-900">{p.label}</p><p className="text-[11px] text-slate-400">{p.desc}</p></td>
                  {ROLES.map((r) => (
                    <td key={r} className="px-3 py-2.5 text-center">
                      {ROLE_PERMS[r].includes(p.perm)
                        ? <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-green-700"><ShieldCheck size={12} /></span>
                        : <span className="text-slate-200">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle><span className="inline-flex items-center gap-2"><Database size={14} /> Row Level Security (PostgreSQL)</span></SectionTitle>
          <ul className="space-y-2 text-[12.5px] text-slate-600">
            {[
              "audits: auditors read/write only audits where they are lead or team member; farm users read audits for their farm",
              "findings & corrective_actions: scoped through the parent audit; responsible persons can update their own actions",
              "evidence bucket: storage policies restrict reads to audit participants; writes require audit execution role",
              "activity_logs: INSERT for authenticated users, no UPDATE/DELETE for any role (immutable trail)",
              "users: profile reads for team directory; role column writable only by service role via admin API",
            ].map((t, i) => <li key={i} className="flex gap-2"><span className="font-mono text-brand-600">RLS</span>{t}</li>)}
          </ul>
        </Card>
        <Card className="p-5">
          <SectionTitle><span className="inline-flex items-center gap-2"><KeyRound size={14} /> Session & API security</span></SectionTitle>
          <ul className="space-y-2 text-[12.5px] text-slate-600">
            {[
              "Authentication via Supabase Auth (JWT, short-lived sessions, refresh rotation)",
              "No service-role keys in the client — all writes go through RLS-checked client queries",
              "Environment variables hold anon key & API URLs; secrets stay server-side",
              "Uploads validated by type allow-list and 10 MB size cap before reaching storage",
              "Scores are computed server-side from immutable responses — clients cannot overwrite results",
            ].map((t, i) => <li key={i} className="flex gap-2"><span className="font-mono text-brand-600">SEC</span>{t}</li>)}
          </ul>
        </Card>
      </div>
    </div>
  );
}

/* ── System settings ──────────────────────────────────────────────────── */
export function SettingsPage() {
  const { db, mutate, toast } = useApp();
  const [s, setS] = useState({ ...db.settings, scoreValues: { ...db.settings.scoreValues }, thresholds: { ...db.settings.thresholds } });

  const backupData = () => {
    const data = JSON.stringify(db, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `agritrace-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Backup downloaded successfully");
  };

  // Note: Data restore functionality removed - use Supabase database backup/restore instead

  const save = () => {
    const t = s.thresholds;
    if (!(t.excellent > t.good && t.good > t.needsImprovement && t.needsImprovement > 0 && t.excellent <= 100)) {
      toast("Thresholds must satisfy 100 ≥ Excellent > Good > Needs Improvement > 0", "error"); return;
    }
    if (s.scoreValues.C <= s.scoreValues.PC || s.scoreValues.PC < 0 || s.scoreValues.NC !== 0 && s.scoreValues.NC > s.scoreValues.PC) {
      toast("Score values must satisfy Compliant > Partial ≥ Non-compliant", "error"); return;
    }
    if (s.dueSoonDays < 1 || s.dueSoonDays > 30) { toast("Due-soon window must be 1–30 days", "error"); return; }
    mutate((d) => { d.settings = { ...s, riskBands: d.settings.riskBands }; }, { action: "System settings updated", record: "scoring & thresholds", detail: `C=${s.scoreValues.C} PC=${s.scoreValues.PC} thresholds ${t.excellent}/${t.good}/${t.needsImprovement}` });
    toast("Settings saved — scoring recalculated everywhere");
  };

  return (
    <div>
      <PageHeader title="System Settings" sub="Configurable scoring, classification thresholds and deadline windows — nothing is hard-coded" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <SectionTitle>Scoring Values</SectionTitle>
          {([["C", "Compliant"], ["PC", "Partially compliant"], ["NC", "Non-compliant"]] as const).map(([k, label]) => (
            <Field key={k} label={`${label} (points)`}>
              <Input type="number" value={s.scoreValues[k]} onChange={(e) => setS({ ...s, scoreValues: { ...s.scoreValues, [k]: Math.max(0, Math.min(100, +e.target.value)) } })} />
            </Field>
          ))}
          <p className="rounded-lg bg-ink-50/70 px-3 py-2 text-[11.5px] text-slate-500">N/A responses are always excluded from the denominator. Overall = earned ÷ applicable maximum × 100.</p>
        </Card>
        <Card className="p-5">
          <SectionTitle>Compliance Classification</SectionTitle>
          <Field label="Excellent ≥"><Input type="number" value={s.thresholds.excellent} onChange={(e) => setS({ ...s, thresholds: { ...s.thresholds, excellent: +e.target.value } })} /></Field>
          <Field label="Good ≥"><Input type="number" value={s.thresholds.good} onChange={(e) => setS({ ...s, thresholds: { ...s.thresholds, good: +e.target.value } })} /></Field>
          <Field label="Needs improvement ≥"><Input type="number" value={s.thresholds.needsImprovement} onChange={(e) => setS({ ...s, thresholds: { ...s.thresholds, needsImprovement: +e.target.value } })} /></Field>
          <p className="text-[11.5px] text-slate-400">Below the last threshold = Poor. Default: 90 / 80 / 70.</p>
        </Card>
        <Card className="p-5">
          <SectionTitle>Deadlines</SectionTitle>
          <Field label="“Due Soon” window (days)"><Input type="number" min={1} max={30} value={s.dueSoonDays} onChange={(e) => setS({ ...s, dueSoonDays: +e.target.value })} /></Field>
          <Field label="Default CAP duration (days)"><Input type="number" min={1} value={s.defaultCADays} onChange={(e) => setS({ ...s, defaultCADays: Math.max(1, +e.target.value) })} /></Field>
          <p className="text-[11.5px] text-slate-400">Overdue is automatic: target date before today and action not verified.</p>
        </Card>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button className="mt-4" onClick={save}>Save settings</Button>
        <Button variant="outline" className="mt-4" icon={<Download size={14} />} onClick={backupData}>Backup Data</Button>
        <p className="mt-4 text-[11px] text-slate-400">Note: Data restore is managed through Supabase database backup/restore.</p>
      </div>
    </div>
  );
}

/* ── Audit configuration reference ────────────────────────────────────── */
export function ConfigPage() {
  const { db } = useApp();
  const flows: { title: string; steps: string[] }[] = [
    { title: "Audit lifecycle", steps: ["Draft", "Scheduled", "In Progress", "Submitted", "Under Review", "Completed", "(Cancelled)"] },
    { title: "Finding workflow", steps: ["Open", "Action Required", "In Progress", "Submitted for Verification", "Verified / Closed", "(Rejected → rework)"] },
    { title: "Corrective action", steps: ["Created", "Assigned", "Action submitted + evidence", "Auditor verification", "Approved → finding closed", "Rejected → returned to owner"] },
  ];
  return (
    <div>
      <PageHeader title="Audit Configuration" sub="Business rules enforced by the engine — reference view" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {flows.map((f) => (
          <Card key={f.title} className="p-5">
            <SectionTitle>{f.title}</SectionTitle>
            <ol className="space-y-1.5">
              {f.steps.map((s, i) => (
                <li key={s} className="flex items-center gap-2 text-[12.5px] font-semibold text-ink-700">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink-900 font-mono text-[9.5px] text-brand-300">{i + 1}</span>{s}
                </li>
              ))}
            </ol>
          </Card>
        ))}
      </div>
      <Card className="mt-4 p-5">
        <SectionTitle>Engine rules (always enforced)</SectionTitle>
        <div className="grid grid-cols-1 gap-2 text-[12.5px] text-slate-600 md:grid-cols-2">
          {[
            "Scores are derived from checklist responses — manual score edits are not permitted",
            "N/A responses are excluded from the scoring denominator",
            "Non-compliant responses generate findings automatically on submission",
            "Critical and Major findings always create a corrective action",
            "A corrective action cannot close without auditor verification",
            "Audits with unanswered mandatory questions cannot be submitted",
            "Questions flagged “mandatory evidence” block submission until evidence is attached",
            "Due-date validation: CAP targets cannot precede the finding date",
            "Overdue classification runs automatically against the configured window",
            "Every lifecycle change is written to the immutable activity log",
          ].map((t, i) => <p key={i} className="flex gap-2 rounded-lg bg-ink-50/60 px-3 py-2"><span className="font-mono font-bold text-brand-600">{String(i + 1).padStart(2, "0")}</span>{t}</p>)}
        </div>
        <p className="mt-3 text-[11.5px] text-slate-400">Active checklist template: {db.templates[0].name} {db.templates[0].version} · {db.templates[0].categories.reduce((s, c) => s + c.subcategories.reduce((x, y) => x + y.questions.length, 0), 0)} questions · response values {db.settings.scoreValues.C}/{db.settings.scoreValues.PC}/{db.settings.scoreValues.NC}.</p>
      </Card>
    </div>
  );
}

/* ── Activity logs ────────────────────────────────────────────────────── */
export function LogsPage() {
  const { db } = useApp();
  const [action, setAction] = useState("all");
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadLogs = async () => {
      try {
        setLoading(true);
        const result = await auditTrailService.getAuditTrail({});
        setLogs(result || []);
      } catch (error) {
        console.error("Failed to load activity logs:", error);
      } finally {
        setLoading(false);
      }
    };
    loadLogs();
  }, []);

  const actions = useMemo(() => [...new Set(logs.map((l) => l.action))], [logs]);
  const rows = logs.filter((l) => action === "all" || l.action === action)
    .map((l) => ({ ...l, userName: db.users.find((u) => u.id === l.user_id)?.name ?? "System" }));
  const cols: Col<typeof rows[number]>[] = [
    { key: "created_at", label: "Timestamp", sortValue: (r) => r.created_at, render: (r) => <span className="font-mono text-[11px] text-slate-500">{fmtDateTime(r.created_at)}</span> },
    { key: "userName", label: "User", sortValue: (r) => r.userName, render: (r) => <span className="font-bold text-ink-900">{r.userName}</span> },
    { key: "action", label: "Action", sortValue: (r) => r.action, render: (r) => <Badge tone={r.action.includes("verified") || r.action.includes("completed") || r.action.includes("closed") ? "success" : r.action.includes("created") || r.action.includes("uploaded") ? "brand" : "navy"}>{r.action}</Badge> },
    { key: "entity_type", label: "Record", render: (r) => <span className="text-slate-600">{r.entity_type}</span> },
    { key: "entity_id", label: "Detail", render: (r) => <span className="text-slate-500">{r.entity_id}</span> },
    { key: "metadata", label: "Metadata", render: (r) => <span className="text-[11px] text-slate-400">{r.metadata ? JSON.stringify(r.metadata) : "—"}</span> },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600 mx-auto mb-4"></div>
          <p className="text-sm text-slate-500">Loading activity logs...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Activity Logs" sub="Immutable trail — no user can edit or delete log entries; retention controlled by administration" />
      <DataTable rows={rows} cols={cols} exportName="activity-logs" pageSize={14}
        toolbar={<Select value={action} onChange={(e) => setAction(e.target.value)} className="!w-auto !py-1.5 !text-xs"><option value="all">All actions</option>{actions.map((a) => <option key={a}>{a}</option>)}</Select>} />
    </div>
  );
}
