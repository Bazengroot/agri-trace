import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, Database, KeyRound, Lock, ShieldCheck, Sparkles } from "lucide-react";
import { useApp } from "../store";
import { Avatar, Button, Field, Input } from "../components/ui";

export default function Login() {
  const { login, toast } = useApp();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setErr(null);

    const result = await login(email, pw);
    setBusy(false);

    if (result.success) {
      toast("Signed in successfully");
      nav("/");
    } else {
      setErr(result.error || "Login failed");
    }
  };

  return (
    <div className="flex min-h-full">
      {/* brand panel */}
      <div className="sidebar-surface relative hidden w-[46%] flex-col justify-between overflow-hidden p-10 lg:flex">
        <div className="dot-grid pointer-events-none absolute inset-0 opacity-[0.12]" />
        <div className="relative flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/15 ring-1 ring-brand-400/40">
            <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
              <path d="M16 4l9 3.4v7.2c0 6.2-3.8 11-9 13.4-5.2-2.4-9-7.2-9-13.4V7.4L16 4z" stroke="#5f88f5" strokeWidth="2.2" />
              <path d="M11.5 16.2l3 3 6-6.4" stroke="#7ce0a3" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div>
            <p className="font-display text-lg font-extrabold tracking-tight text-white">AgriTrace <span className="text-brand-300">Audit</span></p>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink-400">Farm Audit Management System</p>
          </div>
        </div>

        <div className="relative max-w-md">
          <p className="font-display text-[34px] font-extrabold leading-[1.12] tracking-tight text-white">
            From footbath to<br />final sign-off —<br /><span className="text-brand-300">every check traceable.</span>
          </p>
          <p className="mt-4 text-[13.5px] leading-relaxed text-ink-300">
            One lifecycle for poultry, livestock, breeding, hatchery and feed-mill audits:
            planning, checklists, evidence, findings, corrective actions, verification and scoring.
          </p>
        </div>

        <div className="relative flex flex-wrap gap-x-5 gap-y-2 text-[11px] font-medium text-ink-400">
          <span className="inline-flex items-center gap-1.5"><ShieldCheck size={13} className="text-green-400" /> Row-Level Security</span>
          <span className="inline-flex items-center gap-1.5"><Database size={13} className="text-brand-300" /> Supabase · PostgreSQL</span>
          <span className="inline-flex items-center gap-1.5"><KeyRound size={13} className="text-amber-300" /> Role-based access</span>
        </div>
      </div>

      {/* form panel */}
      <div className="flex flex-1 items-center justify-center bg-canvas px-5 py-10">
        <div className="anim-fade-up w-full max-w-[420px]">
          <div className="mb-5 lg:hidden">
            <p className="font-display text-xl font-extrabold tracking-tight text-ink-900">AgriTrace <span className="text-brand-600">Audit</span></p>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Farm Audit Management System</p>
          </div>
          <div className="card p-6 sm:p-7">
            <h1 className="font-display text-xl font-extrabold text-ink-900">Sign in to your workspace</h1>
            <p className="mt-1 text-[12.5px] text-slate-500">Authenticate with your audit-team account using Supabase Auth</p>

            <form onSubmit={submit} className="mt-5">
              <Field label="Work email" req>
                <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@agritrace.co" />
              </Field>
              <Field label="Password" req>
                <div className="relative">
                  <Input type="password" required value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••" />
                  <Lock size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300" />
                </div>
              </Field>
              {err && (
                <p className="mb-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-700">
                  <AlertTriangle size={14} /> {err}
                </p>
              )}
              <Button size="lg" className="w-full" disabled={busy} type="submit" icon={busy ? <Sparkles size={15} className="animate-spin" /> : <ArrowRight size={15} />}>
                {busy ? "Signing in…" : "Sign in securely"}
              </Button>
            </form>
          </div>
          <p className="mt-4 text-center text-[11px] text-slate-400">
            Sessions are scoped by role · farm users only see their own farm · every action is written to the immutable activity log.
          </p>
        </div>
      </div>
    </div>
  );
}
