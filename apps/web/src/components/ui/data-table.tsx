/** Dense TanStack Table wrapper: sorting, optional row click, right-aligned numeric columns via meta.numeric. */
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowData,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    numeric?: boolean;
    className?: string;
  }
}

export interface DataTableProps<T> {
  columns: ColumnDef<T, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  data: T[];
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  empty?: React.ReactNode;
  loading?: boolean;
  footer?: React.ReactNode;
  maxHeight?: string;
}

export function DataTable<T>({ columns, data, onRowClick, rowClassName, empty, loading, footer, maxHeight = 'calc(100vh - 260px)' }: DataTableProps<T>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="overflow-auto rounded-lg border border-border bg-card" style={{ maxHeight }}>
      <table className="w-full border-collapse text-[12.5px]">
        <thead className="sticky top-0 z-10 bg-muted">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => {
                const meta = h.column.columnDef.meta;
                const sorted = h.column.getIsSorted();
                return (
                  <th
                    key={h.id}
                    className={cn(
                      'h-8 select-none whitespace-nowrap border-b border-border px-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground',
                      meta?.numeric && 'text-right',
                      h.column.getCanSort() && 'cursor-pointer hover:text-foreground',
                      meta?.className,
                    )}
                    onClick={h.column.getToggleSortingHandler()}
                  >
                    <span className={cn('inline-flex items-center gap-1', meta?.numeric && 'flex-row-reverse')}>
                      {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                      {sorted === 'asc' && <ArrowUp className="size-3" />}
                      {sorted === 'desc' && <ArrowDown className="size-3" />}
                    </span>
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={columns.length} className="px-2 py-6 text-center text-muted-foreground">
                Loading…
              </td>
            </tr>
          )}
          {!loading && data.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-2 py-6 text-center text-muted-foreground">
                {empty ?? 'No rows'}
              </td>
            </tr>
          )}
          {!loading &&
            table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className={cn('border-b border-border last:border-0 hover:bg-accent/50', onRowClick && 'cursor-pointer', rowClassName?.(row.original))}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
              >
                {row.getVisibleCells().map((cell) => {
                  const meta = cell.column.columnDef.meta;
                  return (
                    <td key={cell.id} className={cn('h-7 whitespace-nowrap px-2 align-middle', meta?.numeric && 'num', meta?.className)}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  );
                })}
              </tr>
            ))}
        </tbody>
        {footer && <tfoot className="sticky bottom-0 bg-muted font-semibold">{footer}</tfoot>}
      </table>
    </div>
  );
}

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="mt-2 flex items-center justify-end gap-2 text-xs text-muted-foreground">
      <span>
        {total === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
      </span>
      <button className="rounded border border-border px-2 py-0.5 disabled:opacity-40" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Prev
      </button>
      <button className="rounded border border-border px-2 py-0.5 disabled:opacity-40" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next
      </button>
    </div>
  );
}
