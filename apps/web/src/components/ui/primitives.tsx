/** Small shadcn-style primitives: Input, Select, Label, Card, Badge, Field, Alert. */
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'flex h-8 w-full rounded-md border border-input bg-card px-2.5 text-[13px] placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn('flex h-8 w-full rounded-md border border-input bg-card px-2 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', className)}
    {...props}
  />
));
Select.displayName = 'Select';

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-xs font-medium text-muted-foreground', className)} {...props} />;
}

export function Field({ label, children, className, hint }: { label: string; children: React.ReactNode; className?: string; hint?: string }) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <Label>{label}</Label>
      {children}
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </div>
  );
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-lg border border-border bg-card', className)} {...props} />;
}
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center justify-between gap-2 border-b border-border px-3 py-2', className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-[13px] font-semibold', className)} {...props} />;
}
export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-3', className)} {...props} />;
}

const badgeTones = {
  default: 'bg-muted text-foreground border-border',
  primary: 'bg-accent text-primary border-primary/20',
  success: 'bg-emerald-50 text-success border-emerald-200',
  warning: 'bg-amber-50 text-warning border-amber-200',
  danger: 'bg-red-50 text-destructive border-red-200',
  outline: 'bg-transparent text-muted-foreground border-border',
} as const;

export function Badge({ tone = 'default', className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof badgeTones }) {
  return <span className={cn('inline-flex items-center rounded border px-1.5 py-px text-[11px] font-medium leading-4', badgeTones[tone], className)} {...props} />;
}

export function Alert({ tone = 'danger', children, className }: { tone?: 'danger' | 'warning' | 'info'; children: React.ReactNode; className?: string }) {
  const t = { danger: 'border-red-200 bg-red-50 text-destructive', warning: 'border-amber-200 bg-amber-50 text-warning', info: 'border-primary/20 bg-accent text-primary' }[tone];
  return <div className={cn('rounded-md border px-3 py-2 text-[13px]', t, className)}>{children}</div>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h1 className="text-lg font-semibold leading-tight">{title}</h1>
        {description && <p className="text-[13px] text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Placeholder({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <Card className="border-dashed">
      <CardContent className="py-8 text-center text-muted-foreground">
        <div className="mb-1 text-[13px] font-medium text-foreground">{title}</div>
        {children ?? 'Not built yet.'}
      </CardContent>
    </Card>
  );
}
