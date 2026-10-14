import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  Calculator,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  LogOut,
  Percent,
  Settings,
  TriangleAlert,
  Upload,
  Users,
  Building2,
  type LucideIcon,
} from 'lucide-react';
import type { Permission } from '@ocs/shared';
import { can, getSession, setSession } from '@/lib/auth';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  perm: Permission;
}

const NAV: { section: string; items: NavItem[] }[] = [
  { section: 'Overview', items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, perm: 'dashboard:read' }] },
  {
    section: 'Data',
    items: [
      { to: '/imports', label: 'Imports', icon: Upload, perm: 'imports:read' },
      { to: '/customers', label: 'Customers', icon: Building2, perm: 'customers:read' },
      { to: '/people', label: 'People', icon: Users, perm: 'people:read' },
      { to: '/rates', label: 'Rates & Pricelists', icon: Percent, perm: 'rates:read' },
    ],
  },
  {
    section: 'Commissions',
    items: [
      { to: '/runs', label: 'Compute Runs', icon: Calculator, perm: 'runs:read' },
      { to: '/exceptions', label: 'Exceptions', icon: TriangleAlert, perm: 'exceptions:read' },
      { to: '/statements', label: 'Statements', icon: FileText, perm: 'statements:read' },
      { to: '/ledgers', label: 'Ledgers', icon: BookOpen, perm: 'ledgers:read' },
    ],
  },
  { section: 'Admin', items: [{ to: '/settings', label: 'Settings', icon: Settings, perm: 'settings:read' }] },
];

const CRUMBS: Record<string, string> = {
  '': 'Dashboard',
  imports: 'Imports',
  customers: 'Customers',
  people: 'People',
  rates: 'Rates & Pricelists',
  runs: 'Compute Runs',
  exceptions: 'Exceptions',
  statements: 'Statements',
  ledgers: 'Ledgers',
  settings: 'Settings',
};

function Breadcrumb() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const parts = pathname.split('/').filter(Boolean);
  const crumbs = [{ to: '/', label: 'Home' }, ...parts.map((p, i) => ({ to: `/${parts.slice(0, i + 1).join('/')}`, label: CRUMBS[p] ?? (p.length > 12 ? `${p.slice(0, 8)}…` : p) }))];
  return (
    <nav className="flex items-center gap-1 text-xs text-muted-foreground" aria-label="Breadcrumb">
      {crumbs.map((c, i) => (
        <span key={c.to} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="size-3" />}
          {i === crumbs.length - 1 ? <span className="text-foreground">{c.label}</span> : <Link to={c.to} className="hover:text-foreground">{c.label}</Link>}
        </span>
      ))}
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const session = getSession();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  function logout() {
    setSession(null);
    qc.clear();
    void navigate({ to: '/login' });
  }

  return (
    <div className="flex h-full">
      <aside className="hidden w-52 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="flex h-11 items-center gap-2 border-b border-border px-3">
          <FileSpreadsheet className="size-4 text-primary" />
          <div className="leading-tight">
            <div className="text-[13px] font-semibold">Commissions</div>
            <div className="text-[10px] text-muted-foreground">Oracle Petroleum</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-2">
          {NAV.map((s) => {
            const items = s.items.filter((i) => can(i.perm));
            if (!items.length) return null;
            return (
              <div key={s.section} className="mb-3">
                <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{s.section}</div>
                {items.map((i) => {
                  const active = i.to === '/' ? pathname === '/' : pathname.startsWith(i.to);
                  return (
                    <Link key={i.to} to={i.to} className={cn('flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-accent', active && 'bg-accent font-medium text-primary')}>
                      <i.icon className="size-3.5" />
                      {i.label}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-4">
          <Breadcrumb />
          <div className="flex items-center gap-3">
            <div className="text-right leading-tight">
              <div className="text-[13px] font-medium">{session?.user.displayName}</div>
              <div className="text-[10px] text-muted-foreground">{session?.user.roles.join(', ')}</div>
            </div>
            <button onClick={logout} className="rounded p-1.5 hover:bg-accent" title="Sign out" aria-label="Sign out">
              <LogOut className="size-4" />
            </button>
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-auto p-4">{children}</main>
      </div>
    </div>
  );
}
