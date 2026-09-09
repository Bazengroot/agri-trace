import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type {
  AppNotification, Audit, CorrectiveAction, DB, Evidence, Finding, NotificationType, Perm, Response, User,
} from "./types";
import { ROLE_PERMS, SEVERITIES } from "./types";
import { addDaysISO, todayISO, uid, validateSubmission, type SubmitIssue } from "./lib";
import { supabase } from "./lib/supabase";
import type { Profile, UserRole } from "./types/database";
import * as auditTrailService from "./services/audit-trail/audit-trail.service";

const DB_KEY = "agritrace.db.v3";

export interface Toast { id: string; msg: string; tone: "success" | "error" | "info" }

// Map Supabase profile role to app User role
function mapProfileToUser(profile: Profile | null): User | null {
  if (!profile) return null;
  const roleMap: Record<UserRole, User["role"]> = {
    super_admin: "SUPER_ADMIN",
    audit_admin: "AUDIT_ADMIN",
    auditor: "AUDITOR",
    farm_manager: "FARM_MANAGER",
    supervisor: "SUPERVISOR",
    viewer: "VIEWER",
  };
  return {
    id: profile.id,
    name: profile.full_name,
    email: profile.email,
    role: roleMap[profile.role] || "VIEWER",
    title: profile.role.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase()),
    color: "#3465e8",
    active: profile.status === "active",
    lastLogin: new Date().toISOString(),
    farmId: profile.farm_id || undefined,
  };
}

function loadDB(): DB {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DB;
      if (parsed && parsed.v === 3 && Array.isArray(parsed.audits)) return parsed;
    }
  } catch { /* ignore */ }
  // Return minimal empty DB structure
  return {
    v: 3,
    users: [],
    farms: [],
    locations: [],
    departments: [],
    programs: [],
    templates: [],
    audits: [],
    findings: [],
    correctiveActions: [],
    evidence: [],
    notifications: [],
    activityLogs: [],
    settings: {
      scoreValues: { C: 100, PC: 50, NC: 0 },
      thresholds: { excellent: 90, good: 80, needsImprovement: 70 },
      dueSoonDays: 7,
      defaultCADays: 30,
      riskBands: { lowMax: 6, mediumMax: 12, highMax: 18 },
    },
  };
}

interface Ctx {
  db: DB;
  user: User | null;
  loading: boolean;
  login: (email: string, pw: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  can: (p: Perm) => boolean;
  mutate: (fn: (d: DB) => void, log?: { action: string; record: string; detail: string }) => void;
  notify: (type: NotificationType, title: string, body: string, audience: User["role"][], link?: string) => void;
  toasts: Toast[];
  toast: (msg: string, tone?: Toast["tone"]) => void;
  saveResponse: (auditId: string, qid: string, patch: Partial<Response>) => void;
  attachEvidence: (ev: Omit<Evidence, "id" | "code" | "uploadedAt">) => string;
  submitAudit: (auditId: string) => SubmitIssue[];
  startAudit: (auditId: string) => void;
  completeReview: (auditId: string, notes: string) => void;
  createCorrectiveAction: (findingId: string, data: { action: string; rootCause: string; responsibleId: string; targetDate: string }) => void;
  startCA: (caId: string) => void;
  submitCA: (caId: string) => void;
  verifyCA: (caId: string, notes: string) => void;
  rejectCA: (caId: string, notes: string) => void;
  reopenCA: (caId: string) => void;
}

const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<DB>(loadDB);
  const [user, setUser] = useState<User | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [loading, setLoading] = useState(true);
  const persistT = useRef<number | undefined>(undefined);

  // Initialize auth state from Supabase session
  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const session = data?.session;
        if (session?.user) {
          // Fetch profile from database
          const { data: profileData } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", session.user.id)
            .single();
          
          if (profileData) {
            setUser(mapProfileToUser(profileData as Profile));
          }
        }
      } catch (error) {
        console.error("Auth initialization error:", error);
      } finally {
        setLoading(false);
      }
    };

    initAuth();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .single();
        
        if (profileData) {
          setUser(mapProfileToUser(profileData as Profile));
        }
      } else if (event === "SIGNED_OUT") {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Persist DB to localStorage (temporary - will be migrated to Supabase in later steps)
  useEffect(() => {
    window.clearTimeout(persistT.current);
    persistT.current = window.setTimeout(() => {
      try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch { /* quota */ }
    }, 250);
  }, [db]);

  const toast = useCallback((msg: string, tone: Toast["tone"] = "success") => {
    const id = uid("t");
    setToasts((t) => [...t.slice(-3), { id, msg, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const mutate = useCallback(async (fn: (d: DB) => void, log?: { action: string; record: string; detail: string }) => {
    setLoading(true);
    setDb((prev) => {
      const d: DB = structuredClone(prev);
      fn(d);
      return d;
    });
    
    // Log to Supabase if log parameter is provided
    if (log && user) {
      try {
        await auditTrailService.logAuditTrail({
          user_id: user.id,
          action: log.action,
          entity_type: log.record,
          entity_id: log.detail,
          metadata: {
            device: `${navigator.userAgent.includes("Mobile") ? "Mobile" : "Desktop"} · ${navigator.language}`,
          },
        });
      } catch (error) {
        console.error("Failed to log activity:", error);
      }
    }
    
    // Reset loading after a short delay to allow UI to update
    setTimeout(() => setLoading(false), 100);
  }, [user]);

  const notify = useCallback((type: NotificationType, title: string, body: string, audience: User["role"][], link?: string) => {
    mutate((d) => {
      d.notifications.unshift({ id: uid("ntf"), type, title, body, audience, link, read: false, createdAt: new Date().toISOString() });
    });
  }, [mutate]);

  const can = useCallback((p: Perm) => (user ? ROLE_PERMS[user.role].includes(p) : false), [user]);

  const login = useCallback(async (email: string, password: string) => {
    try {
      setLoading(true);
      
      // Authenticate with Supabase
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (!data.user) {
        return { success: false, error: "No user returned from authentication" };
      }

      // Fetch profile from database
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", data.user.id)
        .single();

      if (profileError || !profileData) {
        return { success: false, error: "User profile not found" };
      }

      const mappedUser = mapProfileToUser(profileData as Profile);
      if (!mappedUser) {
        return { success: false, error: "Invalid user profile" };
      }

      if (!mappedUser.active) {
        await supabase.auth.signOut();
        return { success: false, error: "This account has been deactivated" };
      }

      setUser(mappedUser);

      // Log activity to Supabase
      try {
        await auditTrailService.logAuditTrail({
          user_id: mappedUser.id,
          action: "Login",
          entity_type: "User",
          entity_id: mappedUser.id,
          metadata: {
            detail: "Session started via Supabase Auth",
            device: navigator.userAgent.includes("Mobile") ? "Mobile browser" : "Desktop browser",
          },
        });
      } catch (error) {
        console.error("Failed to log login activity:", error);
      }

      return { success: true };
    } catch (error) {
      console.error("Login error:", error);
      return { success: false, error: "An unexpected error occurred" };
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      setLoading(true);
      await supabase.auth.signOut();
      setUser(null);
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const saveResponse = useCallback((auditId: string, qid: string, patch: Partial<Response>) => {
    mutate((d) => {
      const a = d.audits.find((x) => x.id === auditId);
      if (!a) return;
      const cur = a.responses[qid] ?? { value: "", evidenceIds: [], updatedAt: "" };
      a.responses[qid] = { ...cur, ...patch, updatedAt: new Date().toISOString() };
      a.updatedAt = new Date().toISOString();
    });
  }, [mutate]);

  const attachEvidence = useCallback((ev: Omit<Evidence, "id" | "code" | "uploadedAt">) => {
    const id = uid("ev");
    mutate((d) => {
      d.evidence.push({ ...ev, id, code: `EV-${String(d.evidence.length + 1).padStart(3, "0")}`, uploadedAt: new Date().toISOString() });
      if (ev.auditId && ev.questionId) {
        const a = d.audits.find((x) => x.id === ev.auditId);
        const r = a?.responses[ev.questionId];
        if (a && r) { r.evidenceIds = [...r.evidenceIds, id]; a.updatedAt = new Date().toISOString(); }
      }
    }, { action: "Evidence uploaded", record: ev.fileName, detail: ev.description || "Evidence attached" });
    return id;
  }, [mutate]);

  const submitAudit = useCallback((auditId: string) => {
    let issues: SubmitIssue[] = [];
    mutate((d) => {
      const audit = d.audits.find((x) => x.id === auditId);
      const tpl = audit && d.templates.find((t) => t.id === audit.templateId);
      if (!audit || !tpl) {
        issues = [{ questionId: "", text: "Audit not found", problem: "Reload and try again" }];
        return;
      }
      const validationIssues = validateSubmission(tpl, audit);
      if (validationIssues.length) {
        issues = validationIssues;
        return;
      }
      const t = tpl;
      const now = new Date().toISOString();
      audit.status = "Submitted";
      audit.submittedAt = now;
      audit.updatedAt = now;
      const sevOrder = SEVERITIES;
      for (const cat of t.categories)
        for (const sub of cat.subcategories)
          for (const q of sub.questions) {
            const r = audit.responses[q.id];
            if (!r) continue;
            const isNC = r.value === "NC";
            const isPC = r.value === "PC" && !!r.findingDraft;
            if (!isNC && !isPC) continue;
            const draft = r.findingDraft;
            const sev = draft?.severity ?? (q.riskLevel === "Critical" ? "Critical" : q.riskLevel === "High" ? "Major" : "Minor");
            const fid = uid("fnd");
            const finding: Finding = {
              id: fid, code: `FND-${String(d.findings.length + 1).padStart(3, "0")}`,
              auditId: audit.id, farmId: audit.farmId, categoryId: cat.id, questionId: q.id,
              title: draft?.title || q.text.slice(0, 64),
              description: draft?.description || `Non-conformance identified during on-site verification: ${q.text}`,
              evidenceIds: [...r.evidenceIds],
              severity: sev,
              likelihood: draft?.likelihood ?? (sev === "Critical" ? 4 : sev === "Major" ? 3 : 2),
              impact: draft?.impact ?? (sev === "Critical" ? 5 : sev === "Major" ? 4 : 3),
              rootCause: draft?.rootCause || "To be determined during root-cause analysis",
              recommendation: draft?.recommendation || q.guidance || "Correct the non-conformance and update the relevant SOP.",
              responsibleId: draft?.responsibleId || d.farms.find((f) => f.id === audit.farmId)?.managerId || "unknown",
              createdAt: now, dueDate: draft?.dueDate || addDaysISO(todayISO(), d.settings.defaultCADays),
              status: sev === "Critical" ? "Action Required" : "Open",
            };
            d.findings.unshift(finding);
            d.evidence.forEach((e) => { if (r.evidenceIds.includes(e.id)) e.findingId = fid; });
            if (sevOrder.indexOf(sev) <= 1) { // Critical or Major → corrective action required
              d.correctiveActions.unshift({
                id: uid("cap"), code: `CAP-${String(d.correctiveActions.length + 1).padStart(3, "0")}`,
                findingId: fid, action: finding.recommendation, rootCause: finding.rootCause,
                responsibleId: finding.responsibleId, targetDate: finding.dueDate,
                status: "Open", evidenceIds: [], createdAt: now, updatedAt: now,
              });
            }
            d.notifications.unshift({
              id: uid("ntf"), type: "finding_created", title: `${sev} finding raised`,
              body: `${finding.title} — ${d.farms.find((f) => f.id === audit.farmId)?.name ?? ""}`,
              audience: ["FARM_MANAGER", "SUPERVISOR", "AUDIT_ADMIN"], link: `/finding/${fid}`, read: false, createdAt: now,
            });
          }
      d.notifications.unshift({
        id: uid("ntf"), type: "ca_assigned", title: "Audit submitted for review",
        body: `${audit.code} at ${d.farms.find((f) => f.id === audit.farmId)?.name ?? ""} awaits review.`,
        audience: ["AUDIT_ADMIN"], link: `/audit/${audit.id}`, read: false, createdAt: now,
      });
    }, { action: "Audit submitted", record: auditId, detail: "Checklist submitted; findings generated from non-conformances" });
    return issues;
  }, [mutate]);

  const startAudit = useCallback((auditId: string) => {
    mutate((d) => {
      const a = d.audits.find((x) => x.id === auditId);
      if (a) { a.status = "In Progress"; a.updatedAt = new Date().toISOString(); }
    }, { action: "Audit started", record: auditId, detail: "Status set to In Progress" });
  }, [mutate]);

  const completeReview = useCallback((auditId: string, notes: string) => {
    mutate((d) => {
      const a = d.audits.find((x) => x.id === auditId);
      if (!a) return;
      a.status = "Completed";
      a.completedAt = new Date().toISOString();
      a.reviewNotes = notes;
      a.signedById = user?.id ?? undefined;
      a.updatedAt = a.completedAt;
      d.notifications.unshift({ id: uid("ntf"), type: "audit_completed", title: "Audit completed", body: `${a.code} reviewed and signed off.`, audience: ["FARM_MANAGER", "SUPERVISOR", "VIEWER"], link: `/audit/${a.id}`, read: false, createdAt: a.completedAt });
    }, { action: "Audit completed", record: auditId, detail: "Review approved and signed off" });
  }, [mutate, user]);

  const setCAandFinding = useCallback((d: DB, caId: string, caStatus: CorrectiveAction["status"], fStatus?: Finding["status"], extra?: Partial<CorrectiveAction>) => {
    const ca = d.correctiveActions.find((c) => c.id === caId);
    if (!ca) return;
    Object.assign(ca, { status: caStatus, updatedAt: new Date().toISOString() }, extra);
    const f = d.findings.find((x) => x.id === ca.findingId);
    if (f && fStatus) f.status = fStatus;
  }, []);

  const createCorrectiveAction = useCallback((findingId: string, data: { action: string; rootCause: string; responsibleId: string; targetDate: string }) => {
    mutate((d) => {
      const f = d.findings.find((x) => x.id === findingId);
      if (!f) return;
      const now = new Date().toISOString();
      d.correctiveActions.unshift({ id: uid("cap"), code: `CAP-${String(d.correctiveActions.length + 1).padStart(3, "0")}`, findingId, action: data.action, rootCause: data.rootCause, responsibleId: data.responsibleId, targetDate: data.targetDate, status: "Open", evidenceIds: [], createdAt: now, updatedAt: now });
      f.status = "Action Required";
      d.notifications.unshift({ id: uid("ntf"), type: "ca_assigned", title: "Corrective action assigned", body: f.title, audience: ["FARM_MANAGER", "SUPERVISOR"], link: `/finding/${f.id}`, read: false, createdAt: now });
    }, { action: "Corrective action created", record: findingId, detail: data.action });
  }, [mutate]);

  const startCA = useCallback((caId: string) => {
    mutate((d) => setCAandFinding(d, caId, "In Progress", "In Progress"), { action: "Corrective action started", record: caId, detail: "Work in progress" });
  }, [mutate]);

  const submitCA = useCallback((caId: string) => {
    mutate((d) => {
      setCAandFinding(d, caId, "Submitted for Verification", "Submitted for Verification", { completionDate: todayISO() });
      const ca = d.correctiveActions.find((c) => c.id === caId);
      if (ca) d.notifications.unshift({ id: uid("ntf"), type: "verification_required", title: "Verification required", body: ca.action.slice(0, 90), audience: ["AUDITOR", "AUDIT_ADMIN"], link: "/verification", read: false, createdAt: new Date().toISOString() });
    }, { action: "Corrective action submitted", record: caId, detail: "Submitted for verification with evidence" });
  }, [mutate]);

  const verifyCA = useCallback((caId: string, notes: string) => {
    mutate((d) => {
      setCAandFinding(d, caId, "Verified", "Closed", { verificationNotes: notes, verifiedById: user?.id ?? undefined, verifiedAt: new Date().toISOString(), completionDate: undefined });
      const ca = d.correctiveActions.find((c) => c.id === caId);
      const f = ca && d.findings.find((x) => x.id === ca.findingId);
      if (f) d.notifications.unshift({ id: uid("ntf"), type: "finding_closed", title: "Finding closed", body: f.title, audience: ["FARM_MANAGER", "SUPERVISOR", "VIEWER"], link: `/finding/${f.id}`, read: false, createdAt: new Date().toISOString() });
    }, { action: "Finding verified", record: caId, detail: notes });
  }, [mutate, user]);

  const rejectCA = useCallback((caId: string, notes: string) => {
    mutate((d) => {
      setCAandFinding(d, caId, "Rejected", "Rejected", { verificationNotes: notes, verifiedById: user?.id ?? undefined, verifiedAt: new Date().toISOString() });
      const ca = d.correctiveActions.find((c) => c.id === caId);
      if (ca) d.notifications.unshift({ id: uid("ntf"), type: "ca_overdue", title: "Verification rejected", body: `${ca.action.slice(0, 80)} — returned to responsible person.`, audience: ["FARM_MANAGER", "SUPERVISOR"], link: `/finding/${ca.findingId}`, read: false, createdAt: new Date().toISOString() });
    }, { action: "Verification rejected", record: caId, detail: notes });
  }, [mutate, user]);

  const reopenCA = useCallback((caId: string) => {
    mutate((d) => setCAandFinding(d, caId, "In Progress", "In Progress", { verificationNotes: undefined, verifiedById: undefined, verifiedAt: undefined }), { action: "Corrective action reopened", record: caId, detail: "Returned for updated action" });
  }, [mutate]);

  const value: Ctx = {
    db, user, loading, login, logout, can, mutate, notify, toasts, toast,
    saveResponse, attachEvidence, submitAudit, startAudit, completeReview,
    createCorrectiveAction, startCA, submitCA, verifyCA, rejectCA, reopenCA,
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp(): Ctx {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp outside provider");
  return ctx;
}

/* ── derived lookups ──────────────────────────────────────────────────── */
export const getFarm = (db: DB, id?: string) => db.farms.find((f) => f.id === id);
export const getUser = (db: DB, id?: string) => db.users.find((u) => u.id === id);
export const getProgram = (db: DB, id?: string) => db.programs.find((p) => p.id === id);
export const getTemplate = (db: DB, id?: string) => db.templates.find((t) => t.id === id);
export const templateOf = (db: DB, a: Audit) => db.templates.find((t) => t.id === a.templateId) ?? db.templates[0];
export const myVisibleAudits = (db: DB, u: User): Audit[] => {
  if (u.role === "FARM_MANAGER" || u.role === "SUPERVISOR")
    return db.audits.filter((a) => a.farmId === u.farmId);
  if (u.role === "AUDITOR")
    return db.audits.filter((a) => a.leadAuditorId === u.id || a.teamIds.includes(u.id));
  return db.audits;
};
export const myVisibleFindings = (db: DB, u: User): Finding[] => {
  if (u.role === "FARM_MANAGER" || u.role === "SUPERVISOR")
    return db.findings.filter((f) => f.farmId === u.farmId || f.responsibleId === u.id);
  return db.findings;
};
