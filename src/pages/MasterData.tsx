import React, { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Bird, Building2, Factory, Egg, MapPin, Pencil, Plus, Trash2, Wheat } from "lucide-react";
import { useApp, getFarm, getUser } from "../store";
import { Badge, Button, Card, DataTable, EmptyState, Field, Gauge, Input, Modal, PageHeader, ScorePill, SectionTitle, Select, Sparkline, StatusBadge, Textarea, Toggle, type Col, cn } from "../components/ui";
import { classifyScore, computeAuditScore, deadlineState, fmtDate, fmtDateShort, monthKey, monthLabel, recurringFindingIds, riskBand, todayISO, uid } from "../lib";
import type { Farm, FarmType, Question, RiskLevel } from "../types";
import { FARM_TYPES, RISK_LEVELS } from "../types";
import * as farmService from "../services/master-data/farm.service";
import * as locationService from "../services/master-data/location.service";
import * as departmentService from "../services/master-data/department.service";

const FARM_ICON: Record<string, React.ReactNode> = {
  Broiler: <Bird size={17} />, Layer: <Egg size={17} />, "Broiler Breeder": <Bird size={17} />,
  "Layer Breeder": <Egg size={17} />, Hatchery: <Factory size={17} />, "Feed Mill": <Wheat size={17} />,
};

/* ── Farms ────────────────────────────────────────────────────────────── */
export function FarmsPage() {
  const { db, can, mutate, toast } = useApp();
  const nav = useNavigate();
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<Partial<Farm>>({ type: "Broiler", region: "Central", active: true, capacityUnit: "birds/cycle" });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const editable = can("manage_master_data");

  const rows = db.farms.map((f) => {
    const scored = db.audits.filter((a) => a.farmId === f.id && ["Completed", "Submitted", "Under Review"].includes(a.status))
      .sort((a, b) => b.date.localeCompare(a.date));
    const latest = scored[0] ? computeAuditScore(db.templates[0], scored[0].responses, db.settings).overall : null;
    const open = db.findings.filter((x) => x.farmId === f.id && !["Closed", "Verified"].includes(x.status)).length;
    return { ...f, latest, open };
  });

  const cols: Col<typeof rows[number]>[] = [
    { key: "code", label: "Farm", sortValue: (r) => r.name, render: (r) => (
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-900 text-brand-300">{FARM_ICON[r.type] ?? <Building2 size={16} />}</span>
        <div><p className="font-bold text-ink-900">{r.name}</p><p className="font-mono text-[10.5px] text-slate-400">{r.code} · {r.company}</p></div>
      </div>) },
    { key: "type", label: "Type", sortValue: (r) => r.type, render: (r) => <Badge tone="navy">{r.type}</Badge> },
    { key: "region", label: "Region", sortValue: (r) => r.region, render: (r) => <span className="text-slate-600">{r.region} · {r.district}</span> },
    { key: "manager", label: "Manager", sortValue: (r) => getUser(db, r.managerId)?.name ?? "", render: (r) => <span>{getUser(db, r.managerId)?.name ?? "—"}</span> },
    { key: "capacity", label: "Capacity", align: "right", sortValue: (r) => r.capacity, render: (r) => <span className="font-mono text-xs">{r.capacity.toLocaleString()} <span className="text-slate-400">{r.capacityUnit}</span></span> },
    { key: "latest", label: "Last Score", align: "center", sortValue: (r) => r.latest ?? -1, render: (r) => <ScorePill score={r.latest} /> },
    { key: "open", label: "Open", align: "center", sortValue: (r) => r.open, render: (r) => (r.open > 0 ? <Badge tone="danger" dot>{r.open}</Badge> : <Badge tone="success">0</Badge>) },
    { key: "active", label: "Status", render: (r) => <Badge tone={r.active ? "success" : "neutral"} dot>{r.active ? "Active" : "Inactive"}</Badge> },
  ];

  const [saving, setSaving] = useState(false);

  const save = async () => {
    const e: Record<string, string> = {};
    if (!form.name?.trim()) e.name = "Farm name is required";
    else if (form.name!.length > 100) e.name = "Farm name must be 100 characters or less";
    if (!form.province?.trim()) e.province = "Province is required";
    if (!form.capacity || form.capacity <= 0) e.capacity = "Enter a valid capacity";
    else if (form.capacity > 10000000) e.capacity = "Capacity seems too high — please verify";
    if (form.houses === undefined || form.houses < 0) e.houses = "Enter number of houses (0 allowed)";
    else if (form.houses > 100) e.houses = "Number of houses seems too high — please verify";
    if (form.gps?.lat && (form.gps.lat < -90 || form.gps.lat > 90)) e.gps = "Latitude must be between -90 and 90";
    if (form.gps?.lng && (form.gps.lng < -180 || form.gps.lng > 180)) e.gps = "Longitude must be between -180 and 180";
    // Check for duplicate farm name
    if (form.name && db.farms.some((f) => f.name.toLowerCase() === form.name!.toLowerCase())) {
      e.name = "A farm with this name already exists";
    }
    setErrs(e);
    if (Object.keys(e).length) return;

    setSaving(true);
    try {
      // Create farm in Supabase
      const newFarm = await farmService.createFarm({
        organization_id: "default-org", // TODO: Get from user context
        farm_code: `FRM-${String(db.farms.length + 1).padStart(3, "0")}`,
        farm_name: form.name!,
        farm_type: (form.type || "Broiler").toLowerCase().replace(" ", "_") as any,
        location: {
          address: form.address || "—",
          gps_lat: form.gps?.lat ?? -26.0,
          gps_lng: form.gps?.lng ?? 28.0,
          province: form.province!,
          district: form.district || "—",
        },
        region: form.region!,
        manager_id: form.managerId || null,
        status: form.active !== false ? "active" : "inactive",
      });

      // Update local state for UI compatibility
      mutate((d) => {
        d.farms.push({
          id: newFarm.id,
          code: newFarm.farm_code,
          name: newFarm.farm_name,
          type: form.type as FarmType,
          company: form.company || "—",
          region: newFarm.region!,
          province: form.province!,
          district: form.district || "—",
          address: form.address || "—",
          gps: { lat: form.gps?.lat ?? -26.0, lng: form.gps?.lng ?? 28.0 },
          managerId: form.managerId || "u-tomas",
          supervisorId: form.supervisorId || "u-jack",
          capacity: form.capacity!,
          capacityUnit: form.capacityUnit || "birds/cycle",
          houses: form.houses!,
          active: form.active !== false,
        });
      }, { action: "Farm created", record: form.name!, detail: "Master data record added" });

      toast(`${form.name} added to master data`);
      setModal(false);
      setForm({ type: "Broiler", region: "Central", active: true, capacityUnit: "birds/cycle" });
    } catch (error) {
      console.error("Failed to create farm:", error);
      toast(error instanceof Error ? error.message : "Failed to create farm", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader title="Farm Master Data" sub="All production facilities under audit management"
        actions={editable && <Button icon={<Plus size={15} />} onClick={() => setModal(true)}>Add Farm</Button>} />
      <DataTable rows={rows} cols={cols} exportName="farms" onRowClick={(r) => nav(`/farm/${r.id}`)} pageSize={8} />
      <Modal open={modal} onClose={() => setModal(false)} title="Register New Farm" wide
        footer={<><Button variant="ghost" onClick={() => setModal(false)} disabled={saving}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save Farm"}</Button></>}>
        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          <Field label="Farm name" req error={errs.name}><Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Willow Broiler Farm" /></Field>
          <Field label="Company"><Input value={form.company ?? ""} onChange={(e) => setForm({ ...form, company: e.target.value })} /></Field>
          <Field label="Farm type" req><Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as FarmType })}>{FARM_TYPES.map((t) => <option key={t}>{t}</option>)}</Select></Field>
          <Field label="Region" req><Select value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })}>{[...new Set(db.locations.map((l) => l.region))].map((r) => <option key={r}>{r}</option>)}</Select></Field>
          <Field label="Province" req error={errs.province}><Input value={form.province ?? ""} onChange={(e) => setForm({ ...form, province: e.target.value })} /></Field>
          <Field label="District"><Input value={form.district ?? ""} onChange={(e) => setForm({ ...form, district: e.target.value })} /></Field>
          <Field label="Address"><Input value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          <Field label="GPS (lat, lng)" error={errs.gps}><Input placeholder="-26.10, 28.05" onChange={(e) => { const [la, ln] = e.target.value.split(",").map((x) => parseFloat(x.trim())); if (!Number.isNaN(la) && !Number.isNaN(ln)) setForm({ ...form, gps: { lat: la, lng: ln } }); }} /></Field>
          <Field label="Farm manager"><Select value={form.managerId ?? "u-tomas"} onChange={(e) => setForm({ ...form, managerId: e.target.value })}>{db.users.filter((u) => u.role === "FARM_MANAGER").map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
          <Field label="Supervisor"><Select value={form.supervisorId ?? "u-jack"} onChange={(e) => setForm({ ...form, supervisorId: e.target.value })}>{db.users.filter((u) => u.role === "SUPERVISOR").map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
          <Field label="Capacity" req error={errs.capacity}><Input type="number" min={1} value={form.capacity ?? ""} onChange={(e) => setForm({ ...form, capacity: +e.target.value })} /></Field>
          <Field label="Capacity unit"><Input value={form.capacityUnit ?? ""} onChange={(e) => setForm({ ...form, capacityUnit: e.target.value })} /></Field>
          <Field label="Number of houses" req error={errs.houses}><Input type="number" min={0} value={form.houses ?? ""} onChange={(e) => setForm({ ...form, houses: +e.target.value })} /></Field>
          <Field label="Status"><div className="pt-2"><Toggle on={form.active !== false} onChange={(v) => setForm({ ...form, active: v })} label={form.active !== false ? "Active" : "Inactive"} /></div></Field>
        </div>
      </Modal>
    </div>
  );
}

/* ── Farm detail ──────────────────────────────────────────────────────── */
export function FarmDetailPage() {
  const { id } = useParams();
  const { db } = useApp();
  const nav = useNavigate();
  const farm = getFarm(db, id);
  const farmAudits = useMemo(() => db.audits.filter((a) => a.farmId === id).sort((a, b) => b.date.localeCompare(a.date)), [db.audits, id]);
  if (!farm) return <EmptyState title="Farm not found" action={<Link to="/farms"><Button variant="dark">Back to farms</Button></Link>} />;

  const scored = farmAudits.filter((a) => ["Completed", "Submitted", "Under Review"].includes(a.status))
    .map((a) => ({ a, s: computeAuditScore(db.templates[0], a.responses, db.settings) }));
  const latest = scored[0];
  const trendData = [...scored].reverse().map((x) => x.s.overall ?? 0);
  const findings = db.findings.filter((f) => f.farmId === farm.id);
  const open = findings.filter((f) => !["Closed", "Verified"].includes(f.status));
  const cas = db.correctiveActions.filter((c) => findings.some((f) => f.id === c.findingId));
  const recIds = recurringFindingIds(findings);
  const recurring = findings.filter((f) => recIds.has(f.id));
  const byCat = db.templates[0].categories.map((c) => {
    const cs = scored.slice(0, 4).map((x) => x.s.categories.find((y) => y.id === c.id)?.score).filter((v): v is number => v !== null && v !== undefined);
    return { cat: c, latest: latest?.s.categories.find((y) => y.id === c.id)?.score ?? null, avg: cs.length ? Math.round(cs.reduce((a, b) => a + b, 0) / cs.length) : null };
  });

  return (
    <div>
      <button onClick={() => nav(-1)} className="mb-3 inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-ink-900 cursor-pointer"><ArrowLeft size={13} /> Back</button>
      <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-2">
          <div className="flex flex-wrap items-start gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-900 text-brand-300">{FARM_ICON[farm.type] ?? <Building2 size={24} />}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-xl font-extrabold text-ink-900">{farm.name}</h1>
                <Badge tone="navy">{farm.type}</Badge>
                <Badge tone={farm.active ? "success" : "neutral"} dot>{farm.active ? "Active" : "Inactive"}</Badge>
              </div>
              <p className="mt-0.5 font-mono text-[11px] text-slate-400">{farm.code} · {farm.company}</p>
              <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[12.5px] sm:grid-cols-3">
                {[
                  ["Region", `${farm.region} · ${farm.province}`], ["District", farm.district], ["Address", farm.address],
                  ["GPS", `${farm.gps.lat.toFixed(4)}, ${farm.gps.lng.toFixed(4)}`],
                  ["Manager", getUser(db, farm.managerId)?.name ?? "—"], ["Supervisor", getUser(db, farm.supervisorId)?.name ?? "—"],
                  ["Capacity", `${farm.capacity.toLocaleString()} ${farm.capacityUnit}`], ["Houses", String(farm.houses)],
                  ["Audits on record", String(farmAudits.length)],
                ].map(([k, v]) => (
                  <p key={k}><span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">{k}</span><span className="font-semibold text-ink-800">{v}</span></p>
                ))}
              </div>
            </div>
          </div>
        </Card>
        <Card className="flex items-center justify-around p-5">
          <div className="text-center">
            <Gauge value={latest?.s.overall ?? null} />
            <p className="mt-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">Latest · {latest ? fmtDateShort(latest.a.date) : "—"}</p>
            {latest?.s.overall !== null && latest?.s.overall !== undefined && <Badge tone={classifyScore(latest.s.overall, db.settings) === "Excellent" ? "success" : classifyScore(latest.s.overall, db.settings) === "Good" ? "brand" : classifyScore(latest.s.overall, db.settings) === "Needs Improvement" ? "warning" : "danger"}>{classifyScore(latest.s.overall, db.settings)}</Badge>}
          </div>
          <div className="text-center">
            <p className="font-mono text-3xl font-bold text-ink-900">{trendData.length}</p>
            <p className="text-[10.5px] font-bold uppercase tracking-wide text-slate-400">Scored audits</p>
            <div className="mt-2 flex justify-center"><Sparkline data={trendData} width={110} height={32} /></div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="p-4 xl:col-span-2">
          <SectionTitle>Category Performance (latest audit)</SectionTitle>
          <div className="space-y-3">
            {byCat.map(({ cat, latest: lv, avg }) => (
              <div key={cat.id}>
                <div className="mb-1 flex items-center justify-between text-[12.5px]">
                  <span className="font-semibold text-ink-800">{cat.name}</span>
                  <span className="font-mono text-xs text-slate-500">latest <ScorePill score={lv ?? null} /> · 4-audit avg <ScorePill score={avg} /></span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-ink-100">
                  <div className={cn("h-full rounded-full transition-all duration-700", (lv ?? 0) >= 80 ? "bg-brand-500" : (lv ?? 0) >= 70 ? "bg-amber-500" : "bg-red-500")} style={{ width: `${lv ?? 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-4">
          <SectionTitle>Open Findings ({open.length})</SectionTitle>
          <div className="space-y-2">
            {open.slice(0, 5).map((f) => (
              <Link key={f.id} to={`/finding/${f.id}`} className="block rounded-lg border border-ink-100 px-3 py-2 hover:border-brand-200 hover:bg-brand-50/40">
                <div className="flex items-center gap-2"><Badge tone={f.severity === "Critical" ? "danger" : f.severity === "Major" ? "warning" : "brand"}>{f.severity}</Badge>
                  {recIds.has(f.id) && <Badge tone="violet">Recurring</Badge>}
                  <span className="ml-auto font-mono text-[10px] text-slate-400">{f.code}</span></div>
                <p className="mt-1 truncate text-[12px] font-semibold text-ink-800">{f.title}</p>
              </Link>
            ))}
            {open.length === 0 && <p className="py-6 text-center text-xs text-slate-400">No open findings.</p>}
          </div>
        </Card>
        <Card className="p-4 xl:col-span-2">
          <SectionTitle right={<Link to="/reports" className="text-xs font-bold text-brand-600 hover:underline">Generate report →</Link>}>Audit History</SectionTitle>
          <table className="w-full text-left text-[12.5px]">
            <thead><tr className="border-b border-ink-100 text-[10.5px] uppercase tracking-wider text-slate-400">
              <th className="py-2 pr-2 font-bold">Audit</th><th className="py-2 pr-2 font-bold">Date</th><th className="py-2 pr-2 font-bold">Lead</th><th className="py-2 pr-2 font-bold">Score</th><th className="py-2 font-bold">Status</th></tr></thead>
            <tbody>
              {farmAudits.map((a) => {
                const s = ["Completed", "Submitted", "Under Review"].includes(a.status) ? computeAuditScore(db.templates[0], a.responses, db.settings).overall : null;
                return (
                  <tr key={a.id} onClick={() => nav(`/audit/${a.id}`)} className="cursor-pointer border-b border-ink-100/60 last:border-0 hover:bg-brand-50/40">
                    <td className="py-2 pr-2 font-mono text-xs text-brand-700">{a.code}</td>
                    <td className="py-2 pr-2">{fmtDate(a.date)}</td>
                    <td className="py-2 pr-2">{getUser(db, a.leadAuditorId)?.name}</td>
                    <td className="py-2 pr-2"><ScorePill score={s} /></td>
                    <td className="py-2"><StatusBadge status={a.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
        <Card className="p-4">
          <SectionTitle>Corrective Actions</SectionTitle>
          {(["Overdue", "Due Soon", "On Track", "Completed"] as const).map((st) => {
            const n = cas.filter((c) => deadlineState(c, db.settings) === st).length;
            return (
              <div key={st} className="mb-2 flex items-center justify-between rounded-lg border border-ink-100 px-3 py-2">
                <span className="text-[12.5px] font-semibold text-ink-700">{st}</span>
                <Badge tone={st === "Overdue" ? "danger" : st === "Due Soon" ? "warning" : st === "On Track" ? "brand" : "success"}>{n}</Badge>
              </div>
            );
          })}
          {recurring.length > 0 && (
            <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50/60 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-violet-700">Recurring problems</p>
              {[...new Set(recurring.map((r) => r.title))].slice(0, 3).map((t) => <p key={t} className="mt-1 text-[12px] font-medium text-ink-700">• {t}</p>)}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ── Locations & Departments ──────────────────────────────────────────── */
export function LocationsPage() {
  const { db, can, mutate, toast } = useApp();
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: "", region: "", province: "" });
  const [saving, setSaving] = useState(false);
  const editable = can("manage_master_data");
  const cols: Col<typeof db.locations[number]>[] = [
    { key: "name", label: "Location", sortValue: (r) => r.name, render: (r) => <span className="flex items-center gap-2 font-bold text-ink-900"><MapPin size={14} className="text-brand-500" />{r.name}</span> },
    { key: "region", label: "Region", sortValue: (r) => r.region },
    { key: "province", label: "Province", sortValue: (r) => r.province },
    { key: "farms", label: "Farms", align: "center", render: (r) => <Badge tone="navy">{db.farms.filter((f) => f.region === r.region).length}</Badge> },
  ];

  const save = async () => {
    if (!form.name || !form.region) return;
    setSaving(true);
    try {
      const newLocation = await locationService.createLocation({
        name: form.name,
        region: form.region,
        province: form.province,
      });
      mutate((d) => d.locations.push({ id: newLocation.id, ...form }));
      toast("Location added");
      setModal(false);
      setForm({ name: "", region: "", province: "" });
    } catch (error) {
      console.error("Failed to create location:", error);
      toast(error instanceof Error ? error.message : "Failed to create location", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader title="Locations" sub="Operating regions used for scheduling and reporting"
        actions={editable && <Button icon={<Plus size={15} />} onClick={() => setModal(true)}>Add Location</Button>} />
      <DataTable rows={db.locations} cols={cols} exportName="locations" searchable={false} />
      <Modal open={modal} onClose={() => setModal(false)} title="Add Location"
        footer={<><Button variant="ghost" onClick={() => setModal(false)} disabled={saving}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button></>}>
        <Field label="Name" req><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Region" req><Input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} /></Field>
        <Field label="Province"><Input value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })} /></Field>
      </Modal>
    </div>
  );
}

export function DepartmentsPage() {
  const { db, can, mutate, toast } = useApp();
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: "", head: "" });
  const [saving, setSaving] = useState(false);
  const editable = can("manage_master_data");
  const cols: Col<typeof db.departments[number]>[] = [
    { key: "name", label: "Department", sortValue: (r) => r.name, render: (r) => <span className="font-bold text-ink-900">{r.name}</span> },
    { key: "head", label: "Department Head", sortValue: (r) => r.head },
  ];

  const save = async () => {
    if (!form.name) return;
    setSaving(true);
    try {
      const newDepartment = await departmentService.createDepartment({
        name: form.name,
        head: form.head,
      });
      mutate((d) => d.departments.push({ id: newDepartment.id, ...form }));
      toast("Department added");
      setModal(false);
      setForm({ name: "", head: "" });
    } catch (error) {
      console.error("Failed to create department:", error);
      toast(error instanceof Error ? error.message : "Failed to create department", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader title="Departments" sub="Functional areas referenced by findings and corrective actions"
        actions={editable && <Button icon={<Plus size={15} />} onClick={() => setModal(true)}>Add Department</Button>} />
      <DataTable rows={db.departments} cols={cols} searchable={false} />
      <Modal open={modal} onClose={() => setModal(false)} title="Add Department"
        footer={<><Button variant="ghost" onClick={() => setModal(false)} disabled={saving}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button></>}>
        <Field label="Name" req><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Head"><Input value={form.head} onChange={(e) => setForm({ ...form, head: e.target.value })} /></Field>
      </Modal>
    </div>
  );
}

/* ── Categories (read from template) ──────────────────────────────────── */
export function CategoriesPage() {
  const { db } = useApp();
  const tpl = db.templates[0];
  const nav = useNavigate();
  return (
    <div>
      <PageHeader title="Audit Categories" sub={`Structure of ${tpl.name} ${tpl.version} — categories → subcategories → questions`}
        actions={<Button variant="outline" onClick={() => nav("/templates")}>Open template builder</Button>} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {tpl.categories.map((c) => (
          <Card key={c.id} className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-display text-sm font-extrabold text-ink-900">{c.name}</h3>
              <Badge tone="brand">{c.subcategories.reduce((s, x) => s + x.questions.length, 0)} questions</Badge>
            </div>
            {c.subcategories.map((s) => (
              <div key={s.id} className="mb-2 rounded-lg bg-ink-50/70 p-2.5">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{s.name}</p>
                <ul className="mt-1 space-y-1">
                  {s.questions.map((q) => (
                    <li key={q.id} className="flex items-start gap-1.5 text-[12px] text-ink-700">
                      <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-brand-400" />{q.text}
                      {q.mandatory && <Badge tone="warning" className="!px-1 !text-[9px]">REQ</Badge>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ── Checklist template builder ───────────────────────────────────────── */
const emptyQ = (): Partial<Question> => ({ text: "", type: "choice", riskLevel: "Medium", mandatory: false, mandatoryEvidence: false, scored: true });

export function TemplatesPage() {
  const { db, can, mutate, toast } = useApp();
  const tpl = db.templates[0];
  const editable = can("manage_master_data");
  const [catOpen, setCatOpen] = useState<string | null>(tpl.categories[0]?.id ?? null);
  const [qModal, setQModal] = useState<{ catId: string; subId: string; q?: Question } | null>(null);
  const [form, setForm] = useState<Partial<Question>>(emptyQ());
  const [subModal, setSubModal] = useState<string | null>(null);
  const [subName, setSubName] = useState("");
  const [err, setErr] = useState("");

  const openQ = (catId: string, subId: string, q?: Question) => { setForm(q ? { ...q } : emptyQ()); setQModal({ catId, subId, q }); setErr(""); };

  const saveQ = () => {
    if (!form.text?.trim()) { setErr("Question text is required"); return; }
    if ((form.type === "numeric" || form.type === "percent") && (form.rule?.max === undefined || form.rule?.max <= 0)) { setErr("Numeric questions need a compliant threshold (max)"); return; }
    mutate((d) => {
      const t = d.templates[0];
      const sub = t.categories.find((c) => c.id === qModal!.catId)?.subcategories.find((s) => s.id === qModal!.subId);
      if (!sub) return;
      const q: Question = {
        id: qModal!.q?.id ?? uid("q"), text: form.text!, type: form.type!, riskLevel: form.riskLevel as RiskLevel,
        mandatory: !!form.mandatory, mandatoryEvidence: !!form.mandatoryEvidence,
        scored: form.type === "choice" ? true : !!form.scored,
        rule: form.type === "numeric" || form.type === "percent" ? { max: form.rule?.max ?? 5, partialMax: form.rule?.partialMax } : undefined,
        unit: form.unit, requirement: form.requirement, reference: form.reference, guidance: form.guidance,
      };
      if (qModal!.q) sub.questions = sub.questions.map((x) => (x.id === q.id ? q : x));
      else sub.questions.push(q);
      t.version = `v${parseFloat(t.version.slice(1)) + 0.1}`.replace(/(\.\d)0*$/, "$1").length ? `v${(Math.round((parseFloat(t.version.slice(1)) + 0.1) * 10) / 10).toFixed(1)}` : t.version;
    }, { action: "Checklist modified", record: tpl.code, detail: qModal?.q ? `Question updated: ${form.text?.slice(0, 50)}` : `Question added: ${form.text?.slice(0, 50)}` });
    toast(qModal?.q ? "Question updated" : "Question added to checklist");
    setQModal(null);
  };

  const deleteQ = (catId: string, subId: string, qid: string) => {
    if (!window.confirm("Delete this question? Existing audit responses keep their data.")) return;
    mutate((d) => {
      const sub = d.templates[0].categories.find((c) => c.id === catId)?.subcategories.find((s) => s.id === subId);
      if (sub) sub.questions = sub.questions.filter((q) => q.id !== qid);
    }, { action: "Checklist modified", record: tpl.code, detail: "Question removed" });
    toast("Question removed", "info");
  };

  return (
    <div>
      <PageHeader title="Checklist Templates" sub={`${tpl.name} · ${tpl.code} — dynamic checklist engine with scoring rules, evidence requirements and risk levels`}
        actions={<Badge tone="brand" className="!text-xs">Current version {tpl.version}</Badge>} />
      <p className="mb-4 max-w-2xl text-[12.5px] text-slate-500">{tpl.description}</p>
      <div className="space-y-3">
        {tpl.categories.map((cat) => (
          <Card key={cat.id} className="overflow-hidden">
            <button onClick={() => setCatOpen(catOpen === cat.id ? null : cat.id)} className="flex w-full items-center justify-between px-4 py-3 text-left cursor-pointer hover:bg-ink-50/50">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-900 font-mono text-[11px] font-bold text-brand-300">{cat.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span>
                <div>
                  <p className="font-display text-sm font-extrabold text-ink-900">{cat.name}</p>
                  <p className="text-[11px] text-slate-400">{cat.subcategories.length} subcategories · {cat.subcategories.reduce((s, x) => s + x.questions.length, 0)} questions</p>
                </div>
              </div>
              <span className="text-xs font-bold text-slate-400">{catOpen === cat.id ? "Collapse" : "Expand"}</span>
            </button>
            {catOpen === cat.id && (
              <div className="border-t border-ink-100 px-4 py-3">
                {cat.subcategories.map((sub) => (
                  <div key={sub.id} className="mb-3 rounded-lg border border-ink-100 bg-ink-50/40 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[11.5px] font-bold uppercase tracking-wide text-ink-600">{sub.name}</p>
                      {editable && <Button variant="ghost" size="sm" icon={<Plus size={12} />} onClick={() => openQ(cat.id, sub.id)}>Question</Button>}
                    </div>
                    <div className="space-y-1.5">
                      {sub.questions.map((q) => (
                        <div key={q.id} className="group flex items-start gap-2 rounded-lg border border-ink-100 bg-white px-3 py-2">
                          <span className="mt-0.5 font-mono text-[10px] font-bold text-slate-300">{q.id.toUpperCase()}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[12.5px] font-medium text-ink-800">{q.text}</p>
                            <div className="mt-1 flex flex-wrap gap-1">
                              <Badge tone="neutral">{q.type}</Badge>
                              <Badge tone={q.riskLevel === "Critical" ? "danger" : q.riskLevel === "High" ? "warning" : "neutral"}>{q.riskLevel} risk</Badge>
                              {q.mandatory && <Badge tone="warning">Mandatory</Badge>}
                              {q.mandatoryEvidence && <Badge tone="violet">Evidence required</Badge>}
                              {!q.scored && <Badge tone="neutral">Informational</Badge>}
                              {q.rule && <Badge tone="brand">≤ {q.rule.max}{q.unit ?? ""} = compliant</Badge>}
                            </div>
                          </div>
                          {editable && (
                            <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                              <button onClick={() => openQ(cat.id, sub.id, q)} className="rounded-md p-1.5 text-slate-400 hover:bg-brand-50 hover:text-brand-600 cursor-pointer"><Pencil size={13} /></button>
                              <button onClick={() => deleteQ(cat.id, sub.id, q.id)} className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 cursor-pointer"><Trash2 size={13} /></button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {editable && (
                  <Button variant="outline" size="sm" icon={<Plus size={13} />} onClick={() => { setSubModal(cat.id); setSubName(""); }}>Add subcategory</Button>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>

      <Modal open={!!qModal} onClose={() => setQModal(null)} title={qModal?.q ? "Edit Question" : "New Checklist Question"} wide
        footer={<><Button variant="ghost" onClick={() => setQModal(null)}>Cancel</Button><Button onClick={saveQ}>{qModal?.q ? "Save changes" : "Add question"}</Button></>}>
        <Field label="Question text" req error={err}><Textarea value={form.text ?? ""} onChange={(e) => setForm({ ...form, text: e.target.value })} placeholder="Is the footbath available and properly maintained…" /></Field>
        <div className="grid grid-cols-2 gap-x-4 sm:grid-cols-3">
          <Field label="Response type"><Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Question["type"] })}>
            {["choice", "numeric", "percent", "rating", "date", "text"].map((t) => <option key={t} value={t}>{t === "choice" ? "Compliance choice (C/PC/NC/NA)" : t}</option>)}
          </Select></Field>
          <Field label="Risk level"><Select value={form.riskLevel} onChange={(e) => setForm({ ...form, riskLevel: e.target.value as RiskLevel })}>{RISK_LEVELS.map((r) => <option key={r}>{r}</option>)}</Select></Field>
          <Field label="Unit (numeric)"><Input value={form.unit ?? ""} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="days, %" /></Field>
        </div>
        {(form.type === "numeric" || form.type === "percent") && (
          <div className="mb-3 rounded-lg border border-brand-100 bg-brand-50/50 p-3">
            <p className="label !mb-2">Scoring rule — value thresholds</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label={`Compliant ≤ (max)`}><Input type="number" value={form.rule?.max ?? ""} onChange={(e) => setForm({ ...form, rule: { ...form.rule, max: +e.target.value, partialMax: form.rule?.partialMax } })} /></Field>
              <Field label="Partial ≤ (optional)"><Input type="number" value={form.rule?.partialMax ?? ""} onChange={(e) => setForm({ ...form, rule: { max: form.rule?.max ?? 5, partialMax: e.target.value ? +e.target.value : undefined } })} /></Field>
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-x-4 sm:grid-cols-3">
          <Field label="Requirement / SOP text"><Input value={form.requirement ?? ""} onChange={(e) => setForm({ ...form, requirement: e.target.value })} /></Field>
          <Field label="Reference"><Input value={form.reference ?? ""} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="SOP-BIO-01" /></Field>
          <Field label="Guidance for auditor"><Input value={form.guidance ?? ""} onChange={(e) => setForm({ ...form, guidance: e.target.value })} /></Field>
        </div>
        <div className="flex flex-wrap gap-5 rounded-lg bg-ink-50/70 p-3">
          <Toggle on={!!form.mandatory} onChange={(v) => setForm({ ...form, mandatory: v })} label="Mandatory answer" />
          <Toggle on={!!form.mandatoryEvidence} onChange={(v) => setForm({ ...form, mandatoryEvidence: v })} label="Mandatory evidence" />
          {form.type !== "choice" && <Toggle on={form.scored !== false} onChange={(v) => setForm({ ...form, scored: v })} label="Included in scoring" />}
        </div>
      </Modal>

      <Modal open={!!subModal} onClose={() => setSubModal(null)} title="Add Subcategory"
        footer={<><Button variant="ghost" onClick={() => setSubModal(null)}>Cancel</Button>
          <Button onClick={() => { if (!subName.trim()) return; mutate((d) => { d.templates[0].categories.find((c) => c.id === subModal)?.subcategories.push({ id: uid("sub"), name: subName.trim(), questions: [] }); }, { action: "Checklist modified", record: tpl.code, detail: `Subcategory added: ${subName}` }); toast("Subcategory added"); setSubModal(null); }}>Add</Button></>}>
        <Field label="Subcategory name" req><Input value={subName} onChange={(e) => setSubName(e.target.value)} placeholder="e.g. Litter Management" /></Field>
      </Modal>
    </div>
  );
}

/* ── Risk matrix ──────────────────────────────────────────────────────── */
export function RiskMatrixPage() {
  const { db, can, mutate, toast } = useApp();
  const [bands, setBands] = useState({ ...db.settings.riskBands });
  const editable = can("manage_master_data");
  const bandOf = (l: number, i: number) => { const r = l * i; return r <= bands.lowMax ? "Low" : r <= bands.mediumMax ? "Medium" : r <= bands.highMax ? "High" : "Critical"; };
  const CELL: Record<string, string> = {
    Low: "bg-green-100 text-green-800 border-green-200", Medium: "bg-amber-100 text-amber-800 border-amber-200",
    High: "bg-orange-200 text-orange-900 border-orange-300", Critical: "bg-red-200 text-red-900 border-red-300",
  };
  return (
    <div>
      <PageHeader title="Risk Categories & Matrix" sub="Risk Score = Likelihood × Impact — bands drive the risk badge on every finding" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-2">
          <SectionTitle>5 × 5 Risk Matrix</SectionTitle>
          <div className="overflow-x-auto">
            <table className="border-separate border-spacing-1">
              <thead>
                <tr>
                  <th className="pr-2 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400" rowSpan={1}>Likelihood ↓ / Impact →</th>
                  {[1, 2, 3, 4, 5].map((i) => <th key={i} className="w-20 pb-1 text-center font-mono text-[11px] font-bold text-slate-500">{i}</th>)}
                </tr>
              </thead>
              <tbody>
                {[5, 4, 3, 2, 1].map((l) => (
                  <tr key={l}>
                    <td className="pr-2 text-right font-mono text-[11px] font-bold text-slate-500">{l}</td>
                    {[1, 2, 3, 4, 5].map((i) => {
                      const b = bandOf(l, i);
                      return <td key={i} className={cn("h-12 w-20 rounded-lg border text-center", CELL[b])}>
                        <span className="block font-mono text-sm font-bold">{l * i}</span>
                        <span className="block text-[9px] font-bold uppercase tracking-wide">{b}</span>
                      </td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card className="p-5">
          <SectionTitle>Classification Bands</SectionTitle>
          {([["lowMax", "Low band — score ≤"], ["mediumMax", "Medium band — score ≤"], ["highMax", "High band — score ≤"]] as const).map(([k, label]) => (
            <Field key={k} label={label} hint={k === "highMax" ? "Anything above is Critical" : undefined}>
              <Input type="number" min={1} max={25} value={bands[k]} disabled={!editable}
                onChange={(e) => setBands({ ...bands, [k]: Math.max(1, Math.min(25, +e.target.value)) })} />
            </Field>
          ))}
          {editable && <Button className="w-full" onClick={() => {
            if (!(bands.lowMax < bands.mediumMax && bands.mediumMax < bands.highMax)) { toast("Bands must increase: low < medium < high", "error"); return; }
            mutate((d) => { d.settings.riskBands = { ...bands }; }, { action: "Risk matrix updated", record: "settings", detail: `Bands ${bands.lowMax}/${bands.mediumMax}/${bands.highMax}` });
            toast("Risk matrix bands saved");
          }}>Save bands</Button>}
          <div className="mt-4 space-y-2 text-[12px] text-slate-500">
            <p><Badge tone="success">Low</Badge> routine monitoring</p>
            <p><Badge tone="warning">Medium</Badge> corrective action within standard SLA</p>
            <p><Badge tone="warning" className="!bg-orange-50 !text-orange-700 !border-orange-200">High</Badge> escalated to area manager</p>
            <p><Badge tone="danger">Critical</Badge> immediate containment + mandatory CAP</p>
          </div>
        </Card>
      </div>
    </div>
  );
}

export { monthKey, monthLabel, riskBand, todayISO };
