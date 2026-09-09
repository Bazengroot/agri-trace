import { format, addMonths, startOfMonth, addDays, subDays } from "date-fns";
import type {
  ActivityLog, AppNotification, Audit, CorrectiveAction, DB, Evidence, Finding, FindingDraft,
  Program, Question, Response, RiskLevel, Severity, Template, User,
} from "../types";
import { addDaysISO, todayISO } from "../lib";

/* Evidence photo pool (Supabase Storage stand-in: public bucket URLs) */
export const PHOTO = {
  footbath: "https://image.qwenlm.ai/generated-images/44fc47dd-fe8d-494c-b424-2ec11b7da971/_result.png",
  feedstore: "https://image.qwenlm.ai/generated-images/1eeb7c2f-53e4-4508-bd6e-006c3bca42c0/_result.png",
  waterline: "https://image.qwenlm.ai/generated-images/45263809-1dfd-4dfa-b61b-c0ff57ee626f/_result.png",
  chemical: "https://image.qwenlm.ai/generated-images/b42cc56f-e517-4963-b3d6-2d3d960d2f43/_result.png",
};
const PHOTOS = [PHOTO.footbath, PHOTO.feedstore, PHOTO.waterline, PHOTO.chemical];

const D = (n: number) => format(addDays(new Date(), n), "yyyy-MM-dd");
const iso = (d: Date) => format(d, "yyyy-MM-dd");

/* ── users ────────────────────────────────────────────────────────────── */
const users: User[] = [
  { id: "u-elena", name: "Elena Vasquez", email: "elena.vasquez@agritrace.co", role: "SUPER_ADMIN", title: "Head of Internal Audit", color: "#7C3AED", active: true, lastLogin: new Date().toISOString() },
  { id: "u-marcus", name: "Marcus Chen", email: "marcus.chen@agritrace.co", role: "AUDIT_ADMIN", title: "Audit Program Manager", color: "#2251CF", active: true, lastLogin: new Date(Date.now() - 3600e3 * 5).toISOString() },
  { id: "u-david", name: "David Okafor", email: "david.okafor@agritrace.co", role: "AUDITOR", title: "Senior Field Auditor", color: "#0E7490", active: true, lastLogin: new Date(Date.now() - 3600e3 * 2).toISOString() },
  { id: "u-priya", name: "Priya Sharma", email: "priya.sharma@agritrace.co", role: "AUDITOR", title: "Compliance Auditor", color: "#B45309", active: true, lastLogin: new Date(Date.now() - 3600e3 * 26).toISOString() },
  { id: "u-tomas", name: "Tomas Rivera", email: "tomas.rivera@sunriseagri.co", role: "FARM_MANAGER", title: "Farm Manager — Sunrise", farmId: "f-001", color: "#15803D", active: true, lastLogin: new Date(Date.now() - 3600e3 * 9).toISOString() },
  { id: "u-hana", name: "Hana Kim", email: "hana.kim@meadowlayers.co", role: "FARM_MANAGER", title: "Farm Manager — Meadow", farmId: "f-004", color: "#BE185D", active: true, lastLogin: new Date(Date.now() - 3600e3 * 50).toISOString() },
  { id: "u-jack", name: "Jack Thompson", email: "jack.thompson@greenvalley.co", role: "SUPERVISOR", title: "Farm Supervisor — Green Valley", farmId: "f-002", color: "#4D7C0F", active: true, lastLogin: new Date(Date.now() - 3600e3 * 12).toISOString() },
  { id: "u-grace", name: "Grace Miller", email: "grace.miller@agritrace.co", role: "VIEWER", title: "QA Analyst (read-only)", color: "#64748B", active: true, lastLogin: new Date(Date.now() - 3600e3 * 70).toISOString() },
];

/* ── farms ────────────────────────────────────────────────────────────── */
const farms = [
  { id: "f-001", code: "FRM-001", name: "Sunrise Broiler Farm", type: "Broiler" as const, company: "Sunrise Agriculture Co.", region: "Central", province: "Meadowshire", district: "Northfield", address: "Km 42 Route 7, Northfield", gps: { lat: -26.1076, lng: 28.0567 }, managerId: "u-tomas", supervisorId: "u-jack", capacity: 120000, capacityUnit: "birds/cycle", houses: 8, active: true },
  { id: "f-002", code: "FRM-002", name: "Green Valley Broiler Farm", type: "Broiler" as const, company: "Green Valley Poultry Ltd.", region: "Central", province: "Meadowshire", district: "Eastbrook", address: "18 Valley Road, Eastbrook", gps: { lat: -26.2331, lng: 28.3912 }, managerId: "u-tomas", supervisorId: "u-jack", capacity: 96000, capacityUnit: "birds/cycle", houses: 6, active: true },
  { id: "f-003", code: "FRM-003", name: "Highland Breeder Farm", type: "Broiler Breeder" as const, company: "Highland Genetics", region: "Northern", province: "Ashford", district: "Ridgeline", address: "Ridge Farm Site 3, Ridgeline", gps: { lat: -25.7449, lng: 28.1881 }, managerId: "u-hana", supervisorId: "u-jack", capacity: 54000, capacityUnit: "breeders", houses: 5, active: true },
  { id: "f-004", code: "FRM-004", name: "Meadow Layer Farm", type: "Layer" as const, company: "Meadow Layers (Pty) Ltd.", region: "Western", province: "Claremont", district: "Willowdale", address: "Plot 27 Willowdale", gps: { lat: -26.3714, lng: 27.6553 }, managerId: "u-hana", supervisorId: "u-jack", capacity: 180000, capacityUnit: "layers", houses: 10, active: true },
  { id: "f-005", code: "FRM-005", name: "AquaFlow Hatchery", type: "Hatchery" as const, company: "AquaFlow Hatcheries", region: "Coastal", province: "Bayview", district: "Harborton", address: "9 Harbor Industrial Park", gps: { lat: -26.0482, lng: 27.9521 }, managerId: "u-hana", supervisorId: "u-jack", capacity: 1200000, capacityUnit: "chicks/week", houses: 3, active: true },
  { id: "f-006", code: "FRM-006", name: "Prairie Feed Mill", type: "Feed Mill" as const, company: "Prairie Nutrition Mills", region: "Northern", province: "Ashford", district: "Grainfield", address: "Mill Road 4, Grainfield", gps: { lat: -25.9153, lng: 28.2186 }, managerId: "u-tomas", supervisorId: "u-jack", capacity: 40000, capacityUnit: "tons/month", houses: 0, active: true },
];

const locations = [
  { id: "loc-1", name: "Central Operating Region", region: "Central", province: "Meadowshire" },
  { id: "loc-2", name: "Northern Operating Region", region: "Northern", province: "Ashford" },
  { id: "loc-3", name: "Western Operating Region", region: "Western", province: "Claremont" },
  { id: "loc-4", name: "Coastal Operating Region", region: "Coastal", province: "Bayview" },
];

const departments = [
  { id: "dep-1", name: "Biosecurity", head: "Marcus Chen" },
  { id: "dep-2", name: "Animal Health & Veterinary", head: "Dr. Amara Diallo" },
  { id: "dep-3", name: "Production Operations", head: "Tomas Rivera" },
  { id: "dep-4", name: "Feed & Nutrition", head: "Pieter Botha" },
  { id: "dep-5", name: "Quality Assurance", head: "Grace Miller" },
  { id: "dep-6", name: "Maintenance & Engineering", head: "Jack Thompson" },
];

/* ── programs ─────────────────────────────────────────────────────────── */
const programs: Program[] = [
  { id: "prg-01", code: "PRG-01", name: "Monthly Farm Compliance Audit", auditType: "Farm Compliance", frequency: "Monthly", scope: "All production activities, biosecurity, animal health, feed & water, documentation", applicableFarmTypes: ["Broiler", "Layer", "Broiler Breeder", "Layer Breeder"], standard: "AgriTrace GFS v3 + National GAP", riskLevel: "Medium", activeFrom: D(-400), activeTo: D(365), active: true },
  { id: "prg-02", code: "PRG-02", name: "Biosecurity Audit", auditType: "Biosecurity", frequency: "Quarterly", scope: "Personnel & vehicle entry, house biosecurity, sanitation barriers, pest vectors", applicableFarmTypes: ["Broiler", "Layer", "Broiler Breeder", "Layer Breeder", "Hatchery"], standard: "WOAH Biosecurity Guideline", riskLevel: "High", activeFrom: D(-400), activeTo: D(365), active: true },
  { id: "prg-03", code: "PRG-03", name: "Animal Health & Welfare Audit", auditType: "Animal Welfare", frequency: "Semi-Annual", scope: "Mortality, vaccination, medication, housing conditions, stocking density", applicableFarmTypes: ["Broiler", "Layer", "Broiler Breeder", "Layer Breeder", "Livestock"], standard: "Company Animal Welfare Code", riskLevel: "High", activeFrom: D(-400), activeTo: D(365), active: true },
  { id: "prg-04", code: "PRG-04", name: "Feed Mill GMP Audit", auditType: "Feed Safety", frequency: "Quarterly", scope: "Receiving, storage, milling, traceability, chemical control, HACCP plan", applicableFarmTypes: ["Feed Mill"], standard: "GMP+ / HACCP", riskLevel: "Critical", activeFrom: D(-200), activeTo: D(365), active: true },
];

/* ── checklist template ───────────────────────────────────────────────── */
const Q = (id: string, text: string, type: Question["type"], risk: RiskLevel, extra: Partial<Question> = {}): Question => ({
  id, text, type, riskLevel: risk, mandatory: false, mandatoryEvidence: false, scored: type === "choice" || type === "numeric" || type === "percent" || type === "rating", ...extra,
});

const template: Template = {
  id: "tpl-01", code: "TPL-01", name: "Farm Compliance Checklist", version: "v3.2",
  description: "Standard on-site compliance checklist covering biosecurity, animal health, feed & water management and operational safety.",
  categories: [
    {
      id: "cat-bio", name: "Biosecurity",
      subcategories: [
        {
          id: "sub-bio-1", name: "Personnel Entry",
          questions: [
            Q("q01", "Footbath with effective disinfectant available and maintained at the entrance of every house", "choice", "High", { mandatory: true, mandatoryEvidence: true, requirement: "Disinfectant renewed at least every 2 days; concentration verified", reference: "SOP-BIO-01", guidance: "Check concentration strip log and physical condition. Cloudy or debris-filled footbaths are non-compliant." }),
            Q("q02", "Shower-in / change facilities used before entering the production area", "choice", "High", { mandatory: true, requirement: "Clean/dirty line maintained with farm-dedicated clothing", reference: "SOP-BIO-02" }),
            Q("q03", "Visitor logbook complete with biosecurity briefing records", "choice", "Medium", { reference: "SOP-BIO-04" }),
            Q("q04", "Days elapsed since last farm-wide disinfection", "numeric", "Medium", { rule: { max: 7, partialMax: 10 }, unit: "days", reference: "SOP-BIO-06", guidance: "Verify against sanitation schedule and chemical usage records." }),
          ],
        },
        {
          id: "sub-bio-2", name: "Vehicle & Equipment",
          questions: [
            Q("q05", "Vehicle disinfection point operational at farm gate with records", "choice", "High", { mandatory: true, mandatoryEvidence: true, reference: "SOP-BIO-08" }),
            Q("q06", "Mortality disposal area secured and separated from production zone", "choice", "Critical", { mandatory: true, mandatoryEvidence: true, requirement: "Composting bin / incinerator away from houses, rodent-proof", reference: "SOP-BIO-10" }),
            Q("q07", "Shared equipment cleaned and disinfected between houses", "choice", "Medium", { reference: "SOP-BIO-11" }),
          ],
        },
        {
          id: "sub-bio-3", name: "House Biosecurity",
          questions: [
            Q("q08", "Bird-proof netting intact on all ventilation openings", "choice", "Medium", { reference: "SOP-BIO-12" }),
            Q("q09", "No evidence of rodent or wild-bird access inside houses", "choice", "High", { mandatoryEvidence: true, guidance: "Look for droppings, gnaw marks, tracks in dust.", reference: "SOP-BIO-13" }),
          ],
        },
      ],
    },
    {
      id: "cat-health", name: "Animal Health & Welfare",
      subcategories: [
        {
          id: "sub-hl-1", name: "Mortality & Livability",
          questions: [
            Q("q10", "Cumulative mortality this cycle (%)", "percent", "High", { rule: { max: 4, partialMax: 6 }, unit: "%", mandatory: true, reference: "SOP-AH-01", guidance: "Compare daily mortality log with disposal records." }),
            Q("q11", "Daily mortality recorded and countersigned by supervisor", "choice", "Medium", { reference: "SOP-AH-02" }),
            Q("q12", "Post-mortem performed for unexplained mortality, with records", "choice", "High", { reference: "SOP-AH-03" }),
          ],
        },
        {
          id: "sub-hl-2", name: "Vaccination & Medication",
          questions: [
            Q("q13", "Vaccination schedule followed and fully documented (date, batch, dose)", "choice", "Critical", { mandatory: true, mandatoryEvidence: true, requirement: "Cold-chain log and batch reconciliation available", reference: "SOP-AH-05" }),
            Q("q14", "Medication stored at correct temperature with daily log", "choice", "High", { mandatoryEvidence: true, reference: "SOP-AH-06" }),
            Q("q15", "Antibiotic use matches veterinary prescription with withdrawal records", "choice", "Critical", { mandatory: true, reference: "SOP-AH-07" }),
            Q("q16", "Date of last veterinary visit", "date", "Medium", { scored: false, mandatory: true, reference: "SOP-AH-08" }),
          ],
        },
        {
          id: "sub-hl-3", name: "Housing Conditions",
          questions: [
            Q("q17", "Stocking density within standard for age and species", "choice", "High", { reference: "SOP-AW-01" }),
            Q("q18", "Litter condition (1 = caked/wet · 5 = dry/friable)", "rating", "Medium", { guidance: "Score at 4 random spots per house; use the lowest." }),
            Q("q19", "Ventilation adequate — no strong ammonia odor at bird level", "choice", "Medium", { reference: "SOP-AW-03" }),
          ],
        },
      ],
    },
    {
      id: "cat-feed", name: "Feed & Water Management",
      subcategories: [
        {
          id: "sub-fd-1", name: "Feed Storage",
          questions: [
            Q("q20", "Feed stored on pallets, off walls, FIFO applied, no pest evidence", "choice", "High", { mandatoryEvidence: true, requirement: "Min. 30 cm wall gap; lot cards present", reference: "SOP-FD-01" }),
            Q("q21", "Feed bins clean with secure lids; no mold or caking", "choice", "Medium", { reference: "SOP-FD-02" }),
            Q("q22", "Feed batch / lot numbers currently on site", "text", "Low", { scored: false, guidance: "Record lot codes for traceability test." }),
          ],
        },
        {
          id: "sub-fd-2", name: "Water Management",
          questions: [
            Q("q23", "Water lines flushed and sanitized between cycles, with records", "choice", "High", { mandatoryEvidence: true, reference: "SOP-WT-01" }),
            Q("q24", "Last water quality test within 3 months and within standard", "choice", "High", { mandatory: true, reference: "SOP-WT-02" }),
          ],
        },
      ],
    },
    {
      id: "cat-ops", name: "Operations & Safety",
      subcategories: [
        {
          id: "sub-op-1", name: "Sanitation & Pest Control",
          questions: [
            Q("q25", "Pest control program active with bait-station map and service records", "choice", "High", { mandatoryEvidence: true, reference: "SOP-PC-01" }),
            Q("q26", "Manure / litter handled on schedule without attracting pests", "choice", "Medium", { reference: "SOP-PC-02" }),
          ],
        },
        {
          id: "sub-op-2", name: "Worker Safety & PPE",
          questions: [
            Q("q27", "Workers wearing required PPE in production areas", "choice", "Medium", { reference: "SOP-HS-01" }),
            Q("q28", "Chemical store locked, labeled, with MSDS available", "choice", "High", { mandatoryEvidence: true, reference: "SOP-HS-03" }),
          ],
        },
        {
          id: "sub-op-3", name: "Documentation & Records",
          questions: [
            Q("q29", "Production records (FCR, livability, egg production) up to date", "choice", "Medium", { reference: "SOP-DC-01" }),
            Q("q30", "Corrective actions from previous audit verified and closed", "choice", "High", { mandatory: true, reference: "SOP-DC-03" }),
          ],
        },
      ],
    },
  ],
};

/* ── audit generation ─────────────────────────────────────────────────── */
const ROOT_CAUSES = [
  "No assigned owner for the daily check",
  "Procedure not updated after site layout change",
  "Staff turnover — refresher training missing",
  "Consumable not reordered on time",
  "Record kept verbally, not written down",
  "Contractor not briefed on site SOP",
];
const RECS: Record<string, string> = {
  q01: "Install footbath renewal log at each house entrance and assign daily ownership to the house supervisor.",
  q25: "Renew pest control service contract and verify bait-station map against current site layout.",
  q13: "Reconcile vaccine cold-chain log with batch records and retrain vaccinator on documentation.",
  default: "Update the relevant SOP, retrain responsible staff and add the check to the weekly supervisor walk-through.",
};
const TITLES: Record<string, string> = {
  q01: "Footbath maintenance at house entrance",
  q02: "Entry facility compliance gap",
  q05: "Vehicle disinfection point not operational",
  q06: "Mortality disposal area unsecured",
  q09: "Pest access evidence in house",
  q10: "Mortality above cycle standard",
  q13: "Vaccination documentation incomplete",
  q14: "Medication storage temperature deviation",
  q17: "Stocking density above standard",
  q20: "Feed storage non-conformance",
  q23: "Water line sanitation records missing",
  q24: "Water quality test overdue",
  q25: "Pest control program lapse",
  q28: "Chemical storage non-conformance",
  q29: "Production records behind schedule",
  q30: "Previous corrective actions not closed",
};

const sevFromRisk: Record<RiskLevel, Severity> = { Critical: "Critical", High: "Major", Medium: "Minor", Low: "Observation" };
const PHOTO_CAPTIONS: Record<string, string> = {
  [PHOTO.footbath]: "Footbath at house entrance — disinfectant depleted and contaminated with debris",
  [PHOTO.feedstore]: "Feed bags stacked without pallet spacing; torn bag with spillage in aisle",
  [PHOTO.waterline]: "Nipple drinker line leaking onto litter near house 3",
  [PHOTO.chemical]: "Unlabeled chemical container stored outside the locked cabinet",
};

let auditSeq = 0, fndSeq = 0, capSeq = 0, evSeq = 0;
const audits: Audit[] = [];
const findings: Finding[] = [];
const cas: CorrectiveAction[] = [];
const evidence: Evidence[] = [];

const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

function makeEvidence(auditId: string, questionId: string | undefined, findingId: string | undefined, byId: string, at: string, photoIdx: number): Evidence {
  evSeq += 1;
  const url = PHOTOS[photoIdx % PHOTOS.length];
  return {
    id: `ev-${evSeq}`, code: `EV-${String(evSeq).padStart(3, "0")}`, auditId, questionId, findingId,
    uploadedById: byId, uploadedAt: at, type: "Photo",
    fileName: `site-photo-${evSeq}.png`, description: PHOTO_CAPTIONS[url] ?? "On-site audit photo", imageUrl: url,
  };
}

function genResponses(tpl: Template, quality: number, farmId: string, auditDate: string, forceNC: string[]): Record<string, Response> {
  const out: Record<string, Response> = {};
  for (const cat of tpl.categories)
    for (const sub of cat.subcategories)
      for (const q of sub.questions) {
        let value: Response["value"];
        if (forceNC.includes(q.id)) value = "NC";
        else if (q.type === "choice") {
          const r = Math.random();
          const pC = Math.min(0.93, quality + 0.1);
          value = r < pC ? "C" : r < pC + 0.13 ? "PC" : "NC";
        } else if (q.type === "numeric") value = quality > 0.74 ? 2 + Math.floor(Math.random() * 5) : 7 + Math.floor(Math.random() * 5);
        else if (q.type === "percent") value = Math.max(1.2, +(6.8 - quality * 5 + Math.random() * 1.4).toFixed(1));
        else if (q.type === "rating") value = quality > 0.74 ? (Math.random() > 0.4 ? 5 : 4) : 3;
        else if (q.type === "date") value = addDaysISO(auditDate, -(5 + Math.floor(Math.random() * 20)));
        else value = "FB-2481-11, FB-2492-04, FB-2501-12";
        out[q.id] = { value, evidenceIds: [], updatedAt: new Date().toISOString() };
        if (value === "NC" && q.mandatoryEvidence) {
          const ev = makeEvidence(`tmp`, q.id, undefined, "u-david", new Date().toISOString(), farmId.length + q.id.length);
          out[q.id].evidenceIds = [ev.id];
          (out[q.id] as Response & { _ev?: Evidence[] })._ev = [ev];
        }
      }
  return out;
}

function spawnFinding(audit: Audit, qid: string, tpl: Template, resp: Response): Finding {
  const q = tpl.categories.flatMap((c) => c.subcategories.flatMap((s) => s.questions)).find((x) => x.id === qid)!;
  const farm = farms.find((f) => f.id === audit.farmId)!;
  fndSeq += 1;
  let severity = sevFromRisk[q.riskLevel];
  if (severity !== "Critical" && Math.random() < 0.25) {
    const order: Severity[] = ["Observation", "Minor", "Major", "Critical"];
    severity = order[Math.max(0, order.indexOf(severity) - 1)];
  }
  const like = severity === "Critical" ? 4 + Math.round(Math.random()) : severity === "Major" ? 3 + Math.round(Math.random()) : severity === "Minor" ? 2 + Math.round(Math.random()) : 1 + Math.round(Math.random());
  const impact = severity === "Critical" ? 5 : severity === "Major" ? 4 : severity === "Minor" ? 3 : 2;
  const f: Finding = {
    id: `fnd-${fndSeq}`, code: `FND-${String(fndSeq).padStart(3, "0")}`,
    auditId: audit.id, farmId: audit.farmId, categoryId: tpl.categories.find((c) => c.subcategories.some((s) => s.questions.some((x) => x.id === qid)))!.id,
    questionId: qid,
    title: TITLES[qid] ?? q.text.slice(0, 60),
    description: `Observed during the on-site walkthrough: ${q.text.charAt(0).toLowerCase() + q.text.slice(1)} — the condition deviates from ${q.reference ?? "site SOP"} and was confirmed with the house supervisor.`,
    evidenceIds: [...resp.evidenceIds],
    severity, likelihood: Math.min(5, like), impact,
    rootCause: pick(ROOT_CAUSES),
    recommendation: RECS[qid] ?? RECS.default,
    responsibleId: farm.managerId,
    createdAt: audit.submittedAt ?? new Date().toISOString(),
    dueDate: addDaysISO(audit.date, 7 + Math.floor(Math.random() * 21)),
    status: "Open",
  };
  return f;
}

function spawnCA(f: Finding, audit: Audit, leadId: string): CorrectiveAction {
  capSeq += 1;
  const overdueBy = -daysSinceToday(f.dueDate);
  let status: CorrectiveAction["status"] = "Open";
  let completionDate: string | undefined;
  let verificationNotes: string | undefined;
  let verifiedById: string | undefined;
  let verifiedAt: string | undefined;
  if (f.severity === "Observation") status = Math.random() < 0.6 ? "Verified" : "Closed";
  else if (overdueBy > 12 && Math.random() < 0.88) status = "Verified";
  else if (overdueBy > 0) status = pick(["In Progress", "In Progress", "Open", "Submitted for Verification"] as const);
  else status = pick(["Open", "In Progress", "In Progress", "Submitted for Verification"] as const);
  if (status === "Verified" || status === "Closed") {
    completionDate = addDaysISO(f.dueDate, -Math.floor(Math.random() * 4));
    verifiedAt = new Date(addDays(new Date(), 0)).toISOString();
    verifiedById = leadId;
    verificationNotes = "On-site re-inspection confirmed the action is effective. Records reviewed and retained.";
  }
  return {
    id: `cap-${capSeq}`, code: `CAP-${String(capSeq).padStart(3, "0")}`, findingId: f.id,
    action: f.recommendation, rootCause: f.rootCause, responsibleId: f.responsibleId,
    targetDate: f.dueDate, completionDate, status, evidenceIds: [],
    verificationNotes, verifiedById, verifiedAt,
    createdAt: f.createdAt, updatedAt: new Date().toISOString(),
  };
}

function daysSinceToday(isoDate: string) {
  return Math.round((new Date(isoDate).getTime() - Date.now()) / 86400e3);
}

function buildCompletedAudit(opts: { farmId: string; monthOffset: number; quality: number; leadId: string; programId: string; forceNC?: string[]; status?: Audit["status"]; dayOfMonth?: number }): Audit {
  const { farmId, monthOffset, quality, leadId, programId } = opts;
  const base = startOfMonth(addMonths(new Date(), monthOffset));
  const date = iso(addDays(base, opts.dayOfMonth ?? 8 + Math.floor(Math.random() * 12)));
  auditSeq += 1;
  const forceNC = opts.forceNC ?? [];
  const responses = genResponses(template, quality, farmId, date, forceNC);
  const evCollect: Evidence[] = [];
  for (const k of Object.keys(responses)) {
    const r = responses[k] as Response & { _ev?: Evidence[] };
    if (r._ev) { evCollect.push(...r._ev); delete r._ev; }
  }
  const audit: Audit = {
    id: `aud-${auditSeq}`, code: `AUD-${format(new Date(), "yyyy")}-${String(auditSeq).padStart(3, "0")}`,
    programId, templateId: "tpl-01", farmId, date, startTime: "08:00", endTime: "13:00",
    leadAuditorId: leadId, teamIds: [leadId, leadId === "u-david" ? "u-priya" : "u-david"],
    scope: "Full on-site compliance audit per program scope", objectives: "Verify operational compliance, identify risks, and confirm corrective action closure from the previous cycle.",
    riskLevel: farmId === "f-006" ? "Critical" : "Medium",
    status: opts.status ?? "Completed", responses,
    createdAt: new Date(addDays(new Date(date), -10)).toISOString(),
    updatedAt: new Date(addDays(new Date(date), 1)).toISOString(),
    submittedAt: new Date(addDays(new Date(date), 0, )).toISOString(),
  };
  // findings from NC / PC
  for (const [qid, resp] of Object.entries(responses)) {
    const spawn = resp.value === "NC" ? Math.random() < 0.9 : resp.value === "PC" ? Math.random() < 0.22 : false;
    if (!spawn) continue;
    const f = spawnFinding(audit, qid, template, resp);
    findings.push(f);
    const ca = spawnCA(f, audit, leadId);
    ca.evidenceIds = [];
    cas.push(ca);
    f.status = ca.status === "Verified" || ca.status === "Closed" ? "Closed" : ca.status === "Submitted for Verification" ? "Submitted for Verification" : ca.status === "In Progress" ? "In Progress" : "Action Required";
  }
  evCollect.forEach((ev) => { ev.auditId = audit.id; evidence.push(ev); });
  // link evidence to findings by question
  for (const f of findings.filter((x) => x.auditId === audit.id)) {
    f.evidenceIds = evidence.filter((e) => e.auditId === audit.id && e.questionId === f.questionId).map((e) => e.id);
  }
  return audit;
}

/* historical completed audits — improving trend */
audits.push(buildCompletedAudit({ farmId: "f-001", monthOffset: -4, quality: 0.6, leadId: "u-david", programId: "prg-01", forceNC: ["q01", "q25"], dayOfMonth: 9 }));
audits.push(buildCompletedAudit({ farmId: "f-001", monthOffset: -3, quality: 0.64, leadId: "u-priya", programId: "prg-01", forceNC: ["q01"], dayOfMonth: 11 }));
audits.push(buildCompletedAudit({ farmId: "f-001", monthOffset: -2, quality: 0.69, leadId: "u-david", programId: "prg-01", forceNC: ["q01", "q09"], dayOfMonth: 10 }));
audits.push(buildCompletedAudit({ farmId: "f-001", monthOffset: -1, quality: 0.73, leadId: "u-priya", programId: "prg-01", forceNC: ["q01", "q06"], dayOfMonth: 12 }));

audits.push(buildCompletedAudit({ farmId: "f-002", monthOffset: -4, quality: 0.66, leadId: "u-priya", programId: "prg-01", forceNC: ["q25", "q20"], dayOfMonth: 13 }));
audits.push(buildCompletedAudit({ farmId: "f-002", monthOffset: -2, quality: 0.71, leadId: "u-david", programId: "prg-01", forceNC: ["q25"], dayOfMonth: 12 }));
audits.push(buildCompletedAudit({ farmId: "f-002", monthOffset: -1, quality: 0.76, leadId: "u-priya", programId: "prg-01", forceNC: ["q25", "q28"], dayOfMonth: 14 }));

audits.push(buildCompletedAudit({ farmId: "f-003", monthOffset: -3, quality: 0.7, leadId: "u-david", programId: "prg-02", dayOfMonth: 15 }));
audits.push(buildCompletedAudit({ farmId: "f-003", monthOffset: -1, quality: 0.75, leadId: "u-priya", programId: "prg-02", dayOfMonth: 15 }));

audits.push(buildCompletedAudit({ farmId: "f-004", monthOffset: -4, quality: 0.62, leadId: "u-priya", programId: "prg-01", forceNC: ["q13", "q10"], dayOfMonth: 16 }));
audits.push(buildCompletedAudit({ farmId: "f-004", monthOffset: -2, quality: 0.67, leadId: "u-david", programId: "prg-01", forceNC: ["q10"], dayOfMonth: 15 }));
audits.push(buildCompletedAudit({ farmId: "f-004", monthOffset: -1, quality: 0.72, leadId: "u-priya", programId: "prg-03", forceNC: ["q18"], dayOfMonth: 17 }));

audits.push(buildCompletedAudit({ farmId: "f-005", monthOffset: -3, quality: 0.77, leadId: "u-david", programId: "prg-02", dayOfMonth: 18 }));
audits.push(buildCompletedAudit({ farmId: "f-005", monthOffset: -2, quality: 0.8, leadId: "u-priya", programId: "prg-02", dayOfMonth: 16 }));

audits.push(buildCompletedAudit({ farmId: "f-006", monthOffset: -2, quality: 0.69, leadId: "u-david", programId: "prg-04", forceNC: ["q28", "q22"], dayOfMonth: 19 }));

/* recent submitted (awaiting review) — f-004 */
const submitted = buildCompletedAudit({ farmId: "f-004", monthOffset: 0, quality: 0.76, leadId: "u-priya", programId: "prg-01", forceNC: ["q13", "q11"], dayOfMonth: -6 < 1 ? 2 : 2, status: "Submitted" });
submitted.date = D(-6); submitted.submittedAt = new Date().toISOString();
audits.push(submitted);

/* recent under review — f-005 */
const underReview = buildCompletedAudit({ farmId: "f-005", monthOffset: 0, quality: 0.82, leadId: "u-david", programId: "prg-02", dayOfMonth: 2, status: "Under Review" });
underReview.date = D(-12); underReview.submittedAt = new Date(Date.now() - 86400e3 * 2).toISOString();
audits.push(underReview);

/* in-progress audit — my audit for David at f-002 */
(function buildInProgress() {
  auditSeq += 1;
  const date = D(-2);
  const responses: Record<string, Response> = {};
  const flat = template.categories.flatMap((c) => c.subcategories.flatMap((s) => s.questions));
  flat.slice(0, 24).forEach((q, i) => {
    const r: Response = { value: "C", evidenceIds: [], updatedAt: new Date().toISOString() };
    if (q.id === "q20") {
      r.value = "NC";
      const ev = makeEvidence(`aud-${auditSeq}`, q.id, undefined, "u-david", new Date().toISOString(), 1);
      evidence.push(ev); r.evidenceIds = [ev.id];
      r.findingDraft = { title: "Feed storage non-conformance", description: "Feed bags stored against the wall without pallet spacing; one torn bag with spillage observed in aisle 2.", severity: "Major", likelihood: 3, impact: 4, rootCause: "Warehouse layout not re-marked after expansion", recommendation: RECS.q20, responsibleId: "u-tomas", dueDate: addDaysISO(todayISO(), 14) };
      r.notes = "Aisle 2, warehouse block B.";
    } else if (q.id === "q23") {
      r.value = "PC";
      const ev = makeEvidence(`aud-${auditSeq}`, q.id, undefined, "u-david", new Date().toISOString(), 2);
      evidence.push(ev); r.evidenceIds = [ev.id];
      r.findingDraft = { title: "Water line sanitation records incomplete", description: "Lines were flushed but the sanitation record for house 3 was missing the supervisor signature.", severity: "Minor", likelihood: 2, impact: 3, rootCause: "Record kept verbally, not written down", recommendation: RECS.default, responsibleId: "u-jack", dueDate: addDaysISO(todayISO(), 10) };
    } else if (q.id === "q04") r.value = 5;
    else if (q.id === "q10") r.value = 3.4;
    else if (q.id === "q16") r.value = addDaysISO(todayISO(), -9);
    else if (q.id === "q18") r.value = 4;
    else if (q.id === "q22") r.value = "FB-2503-02, FB-2503-11";
    else if (i % 9 === 4) r.value = "PC";
    responses[q.id] = r;
  });
  const audit: Audit = {
    id: `aud-${auditSeq}`, code: `AUD-${format(new Date(), "yyyy")}-${String(auditSeq).padStart(3, "0")}`,
    programId: "prg-01", templateId: "tpl-01", farmId: "f-002", date, startTime: "07:30", endTime: "12:30",
    leadAuditorId: "u-david", teamIds: ["u-david", "u-priya"],
    scope: "Monthly compliance audit — full scope", objectives: "Verify biosecurity controls, feed & water management and record-keeping; follow up on recurring pest control finding.",
    riskLevel: "Medium", status: "In Progress", responses,
    createdAt: new Date(Date.now() - 86400e3 * 6).toISOString(), updatedAt: new Date().toISOString(),
  };
  audits.push(audit);
})();

/* scheduled + draft */
auditSeq += 1;
audits.push({ id: `aud-${auditSeq}`, code: `AUD-${format(new Date(), "yyyy")}-${String(auditSeq).padStart(3, "0")}`, programId: "prg-02", templateId: "tpl-01", farmId: "f-003", date: D(12), startTime: "08:00", endTime: "13:00", leadAuditorId: "u-priya", teamIds: ["u-priya"], scope: "Quarterly biosecurity audit", objectives: "Verify entry controls and house biosecurity integrity.", riskLevel: "High", status: "Scheduled", responses: {}, createdAt: new Date(Date.now() - 86400e3 * 4).toISOString(), updatedAt: new Date(Date.now() - 86400e3 * 4).toISOString() });
auditSeq += 1;
audits.push({ id: `aud-${auditSeq}`, code: `AUD-${format(new Date(), "yyyy")}-${String(auditSeq).padStart(3, "0")}`, programId: "prg-01", templateId: "tpl-01", farmId: "f-005", date: D(20), startTime: "08:00", endTime: "12:00", leadAuditorId: "u-david", teamIds: ["u-david"], scope: "Monthly compliance audit", objectives: "Routine compliance verification.", riskLevel: "Medium", status: "Scheduled", responses: {}, createdAt: new Date(Date.now() - 86400e3 * 3).toISOString(), updatedAt: new Date(Date.now() - 86400e3 * 3).toISOString() });
auditSeq += 1;
audits.push({ id: `aud-${auditSeq}`, code: `AUD-${format(new Date(), "yyyy")}-${String(auditSeq).padStart(3, "0")}`, programId: "prg-04", templateId: "tpl-01", farmId: "f-006", date: D(26), startTime: "09:00", endTime: "14:00", leadAuditorId: "u-marcus", teamIds: ["u-marcus", "u-david"], scope: "Feed mill GMP audit", objectives: "GMP+ surveillance audit preparation.", riskLevel: "Critical", status: "Draft", responses: {}, createdAt: new Date(Date.now() - 86400e3).toISOString(), updatedAt: new Date(Date.now() - 86400e3).toISOString() });

/* force a critical overdue + major overdue for the dashboard */
(function forceOverdue() {
  const f1 = findings.find((f) => f.questionId === "q06" && f.farmId === "f-001");
  if (f1) {
    f1.severity = "Critical"; f1.dueDate = D(-6); f1.status = "In Progress";
    const ca = cas.find((c) => c.findingId === f1.id);
    if (ca) { ca.targetDate = D(-6); ca.status = "In Progress"; ca.completionDate = undefined; ca.verificationNotes = undefined; ca.verifiedById = undefined; ca.verifiedAt = undefined; }
  }
  const f2 = findings.find((f) => f.questionId === "q20" && f.farmId === "f-002");
  if (f2) {
    f2.severity = "Major"; f2.dueDate = D(-3); f2.status = "Action Required";
    const ca = cas.find((c) => c.findingId === f2.id);
    if (ca) { ca.targetDate = D(-3); ca.status = "Open"; ca.completionDate = undefined; ca.verificationNotes = undefined; ca.verifiedById = undefined; ca.verifiedAt = undefined; }
  }
  const f3 = findings.find((f) => f.questionId === "q25" && f.farmId === "f-002");
  if (f3) {
    f3.severity = "Major"; f3.dueDate = D(3); f3.status = "In Progress";
    const ca = cas.find((c) => c.findingId === f3.id);
    if (ca) { ca.targetDate = D(3); ca.status = "In Progress"; ca.completionDate = undefined; }
  }
})();

/* document-type evidence samples */
evSeq += 1;
evidence.push({ id: `ev-${evSeq}`, code: `EV-${String(evSeq).padStart(3, "0")}`, auditId: submitted.id, questionId: "q13", uploadedById: "u-priya", uploadedAt: new Date(Date.now() - 86400e3).toISOString(), type: "PDF", fileName: "vaccination-log-scan.pdf", description: "Vaccination log scan — batch reconciliation page" });
evSeq += 1;
evidence.push({ id: `ev-${evSeq}`, code: `EV-${String(evSeq).padStart(3, "0")}`, auditId: submitted.id, questionId: "q24", uploadedById: "u-priya", uploadedAt: new Date(Date.now() - 86400e3).toISOString(), type: "Excel", fileName: "water-quality-Q3.xlsx", description: "Latest laboratory water quality results" });

/* ── notifications & logs ─────────────────────────────────────────────── */
const N = (type: AppNotification["type"], title: string, body: string, audience: AppNotification["audience"], link: string, minsAgo: number, read = false): AppNotification => ({
  id: `ntf-${type}-${minsAgo}`, type, title, body, audience, link, read, createdAt: new Date(Date.now() - minsAgo * 60000).toISOString(),
});

const notifications: AppNotification[] = [
  N("verification_required", "Verification required", "CAP for FND — vaccination documentation at Meadow Layer Farm was submitted for verification.", ["AUDITOR", "AUDIT_ADMIN"], "/verification", 42),
  N("ca_overdue", "Corrective action overdue", "Mortality disposal area finding at Sunrise Broiler Farm is 6 days overdue (Critical).", ["FARM_MANAGER", "SUPERVISOR", "AUDIT_ADMIN"], "/overdue", 130),
  N("finding_created", "Critical finding raised", "Vaccination documentation incomplete at Meadow Layer Farm (AUD submitted by P. Sharma).", ["FARM_MANAGER", "AUDIT_ADMIN"], "/findings/open", 260),
  N("audit_assigned", "Audit assigned to you", "Monthly compliance audit at Green Valley Broiler Farm scheduled — lead auditor: D. Okafor.", ["AUDITOR"], "/my-audits", 60 * 26, true),
  N("ca_submitted", "Corrective action submitted", "Pest control contract renewal evidence uploaded by J. Thompson.", ["AUDITOR", "AUDIT_ADMIN"], "/verification", 60 * 30),
  N("audit_scheduled", "Audit scheduled", "Biosecurity audit at Highland Breeder Farm planned for next month.", ["FARM_MANAGER", "AUDITOR"], "/calendar", 60 * 49, true),
  N("ca_due_soon", "Action due soon", "Pest control program lapse at Green Valley is due in 3 days.", ["FARM_MANAGER", "SUPERVISOR"], "/corrective-actions", 60 * 8),
  N("finding_closed", "Finding closed", "Feed storage non-conformance at Highland Breeder Farm verified and closed.", ["VIEWER", "FARM_MANAGER"], "/findings", 60 * 75, true),
  N("audit_completed", "Audit completed", "Monthly compliance audit at AquaFlow Hatchery completed — score 84%.", ["VIEWER", "AUDIT_ADMIN"], "/audits/completed", 60 * 96, true),
];

const logs: ActivityLog[] = [
  { id: "log-1", userId: "u-priya", action: "Audit submitted", record: submitted.code, detail: "Checklist submitted for review with 2 findings", at: new Date(Date.now() - 3600e3 * 4).toISOString(), device: "Chrome · Android tablet" },
  { id: "log-2", userId: "u-priya", action: "Finding created", record: "FND — vaccination documentation", detail: "Critical finding raised at Meadow Layer Farm", at: new Date(Date.now() - 3600e3 * 4).toISOString(), device: "Chrome · Android tablet" },
  { id: "log-3", userId: "u-david", action: "Checklist modified", record: "AUD — Green Valley in-progress", detail: "24 of 30 responses autosaved", at: new Date(Date.now() - 3600e3 * 2).toISOString(), device: "Safari · iPhone" },
  { id: "log-4", userId: "u-david", action: "Evidence uploaded", record: "EV — feed storage photo", detail: "Photo attached to q20 at Green Valley", at: new Date(Date.now() - 3600e3 * 2).toISOString(), device: "Safari · iPhone" },
  { id: "log-5", userId: "u-jack", action: "Corrective action submitted", record: "CAP — pest control renewal", detail: "Evidence uploaded, awaiting verification", at: new Date(Date.now() - 3600e3 * 30).toISOString(), device: "Chrome · Windows" },
  { id: "log-6", userId: "u-marcus", action: "Audit created", record: "AUD — Highland scheduled", detail: "Quarterly biosecurity audit planned", at: new Date(Date.now() - 3600e3 * 49).toISOString(), device: "Edge · Windows" },
  { id: "log-7", userId: "u-david", action: "Finding verified", record: "CAP — feed storage Highland", detail: "Verified on-site; finding closed", at: new Date(Date.now() - 3600e3 * 75).toISOString(), device: "Chrome · Windows" },
  { id: "log-8", userId: "u-elena", action: "User permission changed", record: "Grace Miller", detail: "Role set to Viewer (read-only)", at: new Date(Date.now() - 3600e3 * 100).toISOString(), device: "Chrome · macOS" },
  { id: "log-9", userId: "u-marcus", action: "Checklist modified", record: "TPL-01 v3.2", detail: "Water quality question marked mandatory", at: new Date(Date.now() - 3600e3 * 120).toISOString(), device: "Edge · Windows" },
  { id: "log-10", userId: "u-priya", action: "Audit completed", record: "AUD — AquaFlow Hatchery", detail: "Final score 84% — Good", at: new Date(Date.now() - 3600e3 * 96).toISOString(), device: "Chrome · Android tablet" },
];

export const DEFAULT_SETTINGS: DB["settings"] = {
  scoreValues: { C: 100, PC: 50, NC: 0 },
  thresholds: { excellent: 90, good: 80, needsImprovement: 70 },
  dueSoonDays: 7,
  defaultCADays: 14,
  riskBands: { lowMax: 6, mediumMax: 12, highMax: 18 },
};

export function makeDemoDB(): DB {
  return {
    v: 3,
    users,
    farms: farms.map((f) => ({ ...f })),
    locations,
    departments,
    programs,
    templates: [template],
    audits,
    findings,
    correctiveActions: cas,
    evidence,
    notifications,
    activityLogs: logs,
    settings: { ...DEFAULT_SETTINGS },
  };
}

export type { FindingDraft };
