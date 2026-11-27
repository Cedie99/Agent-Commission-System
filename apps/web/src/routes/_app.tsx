import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { AppShell, requiredPermission } from '@/components/app/app-shell';
import { can, getSession } from '@/lib/auth';

export const Route = createFileRoute('/_app')({
  beforeLoad: ({ location }) => {
    if (!getSession()) throw redirect({ to: '/login' });
    // A page this role can't use (typed URL, back button after switching accounts) goes to the dashboard.
    // The API refuses the data anyway; this keeps the page itself from showing.
    const perm = requiredPermission(location.pathname);
    if (perm && !can(perm)) throw redirect({ to: '/' });
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
