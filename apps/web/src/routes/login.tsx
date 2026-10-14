import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import type { LoginResponse } from '@ocs/shared';
import { Button } from '@/components/ui/button';
import { Alert, Card, CardContent, Field, Input } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { setSession } from '@/lib/auth';

export const Route = createFileRoute('/login')({ component: LoginPage });

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('finance@ocs.local');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<LoginResponse>('/auth/login', { method: 'POST', json: { email, password } });
      setSession({ token: r.accessToken, user: r.user });
      await navigate({ to: '/' });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="p-5">
          <h1 className="text-base font-semibold">Agent Commission System</h1>
          <p className="mb-4 text-xs text-muted-foreground">Oracle Petroleum · sign in with your account</p>
          <form onSubmit={submit} className="flex flex-col gap-3">
            <Field label="Email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
            </Field>
            <Field label="Password">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            </Field>
            {error && <Alert>{error}</Alert>}
            <Button type="submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
            {/* TODO(SSO): "Sign in with Microsoft" (Entra ID) button. */}
            <p className="text-[11px] text-muted-foreground">Dev users: admin / finance / ssd / vp / as1 @ocs.local (password from SEED_DEFAULT_PASSWORD)</p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
