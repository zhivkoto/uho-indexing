'use client';

import { useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { cn, truncateAddress, formatRelativeTime, isValidPublicKey } from '@/lib/utils';
import { EventTag } from '@/components/ui/badge';
import Link from 'next/link';

interface EventTableProps {
  data: Record<string, unknown>[];
  program?: string;
  event?: string;
  eventType?: string;
  sorting: SortingState;
  onSortingChange: (sorting: SortingState) => void;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  loading?: boolean;
}

function SortIcon({ sorted }: { sorted: false | 'asc' | 'desc' }) {
  if (sorted === 'asc') return <ChevronUp className="w-3.5 h-3.5 text-[#22D3EE]" />;
  if (sorted === 'desc') return <ChevronDown className="w-3.5 h-3.5 text-[#22D3EE]" />;
  return <ChevronsUpDown className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />;
}

function CellValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="text-[#3A3A48] italic text-xs">null</span>;
  }
  if (typeof value === 'boolean') {
    return (
      <span className={cn('font-mono text-xs', value ? 'text-emerald-400' : 'text-[#63637A]')}>
        {String(value)}
      </span>
    );
  }
  if (typeof value === 'number') {
    return <span className="font-mono text-[13px] text-[#EDEDEF]">{value.toLocaleString()}</span>;
  }
  const str = String(value);
  if (isValidPublicKey(str)) {
    return <span className="font-mono text-[13px] text-[#67E8F9]">{truncateAddress(str, 4)}</span>;
  }
  if (str.length > 40) {
    return <span className="font-mono text-[13px] text-[#EDEDEF] truncate max-w-[200px] block" title={str}>{str.slice(0, 20)}...</span>;
  }
  return <span className="font-mono text-[13px] text-[#EDEDEF]">{str}</span>;
}

export function EventTable({
  data,
  program,
  event,
  eventType,
  sorting,
  onSortingChange,
  page,
  pageSize,
  total,
  onPageChange,
  loading,
}: EventTableProps) {
  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(() => {
    if (!data.length) return [];

    // Determine columns from data keys
    const sampleKeys = Object.keys(data[0]).filter(
      (k) => !k.startsWith('_') && k !== 'id'
    );

    // Priority columns first
    const priority = ['slot', 'txSignature', 'tx_signature', 'signature', 'eventType', 'event_type', 'timestamp', 'blockTime', 'block_time'];
    const sortedKeys = [
      ...priority.filter((k) => sampleKeys.includes(k)),
      ...sampleKeys.filter((k) => !priority.includes(k)),
    ];

    return sortedKeys.slice(0, 8).map((key) => ({
      accessorKey: key,
      header: key.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim(),
      cell: ({ getValue }) => {
        const val = getValue();

        // Special rendering for known columns
        if ((key === 'txSignature' || key === 'tx_signature' || key === 'signature') && typeof val === 'string') {
          return (
            <Link href={`/events/${val}?program=${program}&event=${event}`} className="font-mono text-[13px] text-[#67E8F9] hover:underline">
              {truncateAddress(val, 4)}
            </Link>
          );
        }
        if ((key === 'eventType' || key === 'event_type') && typeof val === 'string') {
          return <EventTag>{val}</EventTag>;
        }
        if ((key === 'timestamp' || key === 'blockTime' || key === 'block_time') && val) {
          return (
            <span className="text-sm text-[#A0A0AB]" title={String(val)}>
              {formatRelativeTime(val as string)}
            </span>
          );
        }
        if (key === 'slot' && typeof val === 'number') {
          return <span className="font-mono text-[13px] text-[#EDEDEF]">#{val.toLocaleString()}</span>;
        }

        return <CellValue value={val} />;
      },
    }));
  }, [data]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: (updater) => {
      const newSorting = typeof updater === 'function' ? updater(sorting) : updater;
      onSortingChange(newSorting);
    },
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
  });

  const totalPages = Math.ceil(total / pageSize);

  // Skeleton rows
  if (loading && !data.length) {
    return (
      <div className="rounded-xl border border-[#1E1E26] overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#1E1E26] bg-[#0F0F12]">
              {Array.from({ length: 5 }).map((_, i) => (
                <th key={i} className="px-4 py-3 text-left">
                  <div className="h-3 w-16 rounded bg-[#2A2A35] animate-pulse" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 8 }).map((_, i) => (
              <tr key={i} className="border-b border-[#1E1E26]">
                {Array.from({ length: 5 }).map((_, j) => (
                  <td key={j} className="px-4 py-3">
                    <div className="h-4 w-24 rounded bg-[#2A2A35] animate-pulse" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#1E1E26] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-[#1E1E26] bg-[#0F0F12]">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    className={cn(
                      'px-4 py-3 text-left',
                      'text-[11px] font-semibold leading-[14px] tracking-widest uppercase',
                      'text-[#63637A]',
                      'cursor-pointer select-none',
                      'hover:text-[#A0A0AB]',
                      'transition-colors duration-150',
                      'group'
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      <SortIcon sorted={header.column.getIsSorted()} />
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, i) => (
              <tr
                key={row.id}
                className={cn(
                  'border-b border-[#1E1E26]',
                  'hover:bg-[#1C1C22] transition-colors duration-100 cursor-pointer',
                  i % 2 !== 0 && 'bg-[#0B0B0E]'
                )}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-[#1E1E26] bg-[#0F0F12]">
          <span className="text-xs leading-4 text-[#63637A]">
            Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of{' '}
            {total.toLocaleString()} events
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page === 0}
              className="rounded-full w-8 h-8 flex items-center justify-center text-[#63637A] hover:text-[#EDEDEF] hover:bg-[#1C1C22] disabled:text-[#3A3A48] transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              ‹
            </button>
            {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
              let pageNum: number;
              if (totalPages <= 5) {
                pageNum = i;
              } else if (page < 3) {
                pageNum = i;
              } else if (page > totalPages - 4) {
                pageNum = totalPages - 5 + i;
              } else {
                pageNum = page - 2 + i;
              }

              return (
                <button
                  key={pageNum}
                  onClick={() => onPageChange(pageNum)}
                  className={cn(
                    'rounded-full w-8 h-8 flex items-center justify-center text-sm font-medium transition-colors cursor-pointer',
                    pageNum === page
                      ? 'bg-[#22D3EE]/10 text-[#22D3EE]'
                      : 'text-[#A0A0AB] hover:bg-[#1C1C22]'
                  )}
                >
                  {pageNum + 1}
                </button>
              );
            })}
            {totalPages > 5 && page < totalPages - 3 && (
              <>
                <span className="text-[#63637A] px-1">…</span>
                <button
                  onClick={() => onPageChange(totalPages - 1)}
                  className="rounded-full w-8 h-8 flex items-center justify-center text-sm font-medium text-[#A0A0AB] hover:bg-[#1C1C22] cursor-pointer"
                >
                  {totalPages}
                </button>
              </>
            )}
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages - 1}
              className="rounded-full w-8 h-8 flex items-center justify-center text-[#63637A] hover:text-[#EDEDEF] hover:bg-[#1C1C22] disabled:text-[#3A3A48] transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
