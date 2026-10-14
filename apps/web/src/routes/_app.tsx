import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { AppShell } from '@/components/app/app-shell';
import { getSession } from '@/lib/auth';

export const Route = createFileRoute('/_app')({
  beforeLoad: () => {
    if (!getSession()) throw redirect({ to: '/login' });
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
