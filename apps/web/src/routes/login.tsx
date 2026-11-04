import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useState } from 'react';
import type { LoginResponse } from '@ocs/shared';
import { api } from '@/lib/api';
import { setSession } from '@/lib/auth';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/login')({ component: LoginPage });

/* Brand palette: taken from the app icon. */
const GREEN = '#0E4D30';
const GREEN_DEEP = '#08301D';
const GOLD = '#F5C518';

function LoginPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [email, setEmail] = useState(import.meta.env.DEV ? 'finance@ocs.local' : '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<LoginResponse>('/auth/login', { method: 'POST', json: { email, password } });
      setSession({ token: r.accessToken, user: r.user });
      // Drop anything cached for a previous account, so it never shows to this one.
      qc.clear();
      await navigate({ to: '/' });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-full bg-white text-[#0A0A0A] grid-rows-[auto_1fr] lg:grid-cols-[1.05fr_1fr] lg:grid-rows-1">
      {/* Brand panel */}
      <aside
        className="relative flex flex-col justify-between overflow-hidden px-6 py-6 text-white sm:px-10 lg:px-14 lg:py-12"
        style={{ background: `radial-gradient(120% 90% at 15% 0%, ${GREEN} 0%, ${GREEN_DEEP} 70%)` }}
      >
        {/* Oversized droplet watermark */}
        <svg aria-hidden viewBox="0 0 200 260" className="pointer-events-none absolute -bottom-24 -right-20 hidden h-[560px] opacity-[0.07] lg:block">
          <path d="M100 4C70 50 10 110 10 165a90 90 0 0 0 180 0C190 110 130 50 100 4Z" fill="none" stroke="white" strokeWidth="2" />
          <path d="M100 40C76 78 34 124 34 168a66 66 0 0 0 132 0c0-44-42-90-66-128Z" fill="none" stroke="white" strokeWidth="1" />
        </svg>

        <div className="relative flex items-center gap-3">
          <img src="/favicon-512.png" alt="" className="size-9 rounded-[9px] ring-1 ring-white/15" />
          <div className="leading-tight">
            <div className="text-[13px] font-semibold tracking-wide">Oracle Petroleum</div>
            <div className="text-[11px] text-white/55">Commission System</div>
          </div>
        </div>

        <div className="relative hidden max-w-md lg:block">
          <Sparkle className="mb-6 size-6" />
          <h2 className="text-[40px] font-semibold leading-[1.08] tracking-[-0.02em]">
            Every liter,
            <br />
            every peso,
            <br />
            <span style={{ color: GOLD }}>accounted for.</span>
          </h2>
          <p className="mt-5 max-w-sm text-[14px] leading-relaxed text-white/60">
            Import sales and collections, compute commissions, and move runs through approval, all in one place.
          </p>
        </div>

        <div className="relative hidden text-[11px] text-white/40 lg:block">© {new Date().getFullYear()} Oracle Petroleum · Internal use only</div>
      </aside>

      {/* Form panel */}
      <main className="flex items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-[360px]">
          <div className="mb-9">
            <div className="mb-3 h-[3px] w-8 rounded-full" style={{ background: GOLD }} />
            <h1 className="text-[26px] font-semibold tracking-[-0.015em]">Sign in</h1>
            <p className="mt-1.5 text-[13.5px] text-[#0A0A0A]/55">Welcome back. Enter your work account to continue.</p>
          </div>

          <form onSubmit={submit} className="flex flex-col gap-5">
            <LineField label="Email">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                placeholder="name@oraclepetroleum.net"
                required
                className={inputCls}
              />
            </LineField>

            <LineField label="Password">
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  required
                  className={cn(inputCls, 'pr-10')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-[#0A0A0A]/40 transition-colors hover:text-[#0A0A0A]"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </LineField>

            {error && (
              <div role="alert" className="flex gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[12.5px] text-red-800">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="group mt-2 flex h-11 items-center justify-center gap-2 rounded-lg bg-[#0A0A0A] text-[13.5px] font-medium text-white transition-colors hover:bg-[#0E4D30] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5C518] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Signing in
                </>
              ) : (
                <>
                  Continue <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>
            {/* TODO(SSO): "Sign in with Microsoft" (Entra ID) button. */}
          </form>

          {import.meta.env.DEV && (
            <p className="mt-10 border-t border-black/[0.07] pt-4 text-[11px] leading-relaxed text-[#0A0A0A]/40">
              Dev users: admin / finance / ssd / vp / as1 / ss1 / rsr1 @ocs.local (password from SEED_DEFAULT_PASSWORD)
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

const inputCls =
  'h-11 w-full rounded-lg border border-black/[0.12] bg-white px-3.5 text-[14px] text-[#0A0A0A] outline-none transition-[border-color,box-shadow] placeholder:text-black/30 hover:border-black/25 focus:border-[#0E4D30] focus:shadow-[0_0_0_3px_rgba(14,77,48,0.12)]';

function LineField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-[#0A0A0A]/70">{label}</span>
      {children}
    </label>
  );
}

function Sparkle({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} fill={GOLD}>
      <path d="M12 0c.6 6.2 5.8 11.4 12 12-6.2.6-11.4 5.8-12 12-.6-6.2-5.8-11.4-12-12C6.2 11.4 11.4.6 12 0Z" />
    </svg>
  );
}
