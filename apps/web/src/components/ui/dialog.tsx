import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({ className, children, title, description }: { className?: string; children: React.ReactNode; title: string; description?: string }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/30" />
      <DialogPrimitive.Content
        className={cn('fixed left-1/2 top-1/2 z-50 w-[calc(100%-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card shadow-lg', className)}
      >
        <div className="flex items-start justify-between border-b border-border px-4 py-3">
          <div>
            <DialogPrimitive.Title className="text-sm font-semibold">{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="text-xs text-muted-foreground">{description}</DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close className="rounded p-1 hover:bg-accent" aria-label="Close">
            <X className="size-4" />
          </DialogPrimitive.Close>
        </div>
        <div className="p-4">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/** Right-side drawer (shadcn "Sheet"). */
export function Sheet({ open, onOpenChange, title, description, children, width = 'max-w-2xl' }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: React.ReactNode; children: React.ReactNode; width?: string }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/20" />
        <DialogPrimitive.Content className={cn('fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-border bg-card shadow-xl', width)}>
          <div className="flex items-start justify-between border-b border-border px-4 py-3">
            <div>
              <DialogPrimitive.Title className="text-sm font-semibold">{title}</DialogPrimitive.Title>
              <DialogPrimitive.Description asChild>
                <div className="text-xs text-muted-foreground">{description ?? ''}</div>
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close className="rounded p-1 hover:bg-accent" aria-label="Close">
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>
          <div className="flex-1 overflow-y-auto p-4">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
