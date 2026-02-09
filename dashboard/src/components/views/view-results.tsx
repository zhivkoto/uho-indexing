'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import { queryView } from '@/lib/api';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { cn, formatNumber } from '@/lib/utils';

interface ViewResultsProps {
  programName: string;
  viewName: string;
}

const PAGE_SIZE = 25;

export function ViewResults({ programName, viewName }: ViewResultsProps) {
  const [page, setPage] = useState(0);
  const [orderBy, setOrderBy] = useState<string | undefined>();
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');

  const { data, isLoading, error } = useQuery({
    queryKey: ['view-results', programName, viewName, page, orderBy, order],
    queryFn: () =>
      queryView(programName, viewName, {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        orderBy,
        order,
      }),
  });

  const rows = data?.data || [];
  const total = data?.pagination?.total || 0;
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleSort = (col: string) => {
    if (orderBy === col) {
      setOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setOrderBy(col);
      setOrder('desc');
    }
    setPage(0);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-red-400">
          Failed to load results: {error instanceof Error ? error.message : 'Unknown error'}
        </p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<ChevronsUpDown className="w-6 h-6" />}
        title="No results"
        description="This view has no data yet. It may need to be refreshed."
      />
    );
  }

  return (
    <div>
      <div className="rounded-xl border border-[#1E1E26] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#1E1E26] bg-[#0F0F12]">
                {columns.map((col) => (
                  <th
                    key={col}
                    onClick={() => handleSort(col)}
                    className="px-4 py-3 text-left text-[11px] font-semibold leading-[14px] tracking-widest uppercase text-[#63637A] cursor-pointer select-none hover:text-[#A0A0AB] transition-colors duration-150"
                  >
                    <div className="flex items-center gap-1.5">
                      {col}
                      {orderBy === col ? (
                        order === 'asc' ? (
                          <ChevronUp className="w-3.5 h-3.5 text-[#22D3EE]" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-[#22D3EE]" />
                        )
                      ) : (
                        <ChevronsUpDown className="w-3 h-3 opacity-0 group-hover:opacity-50" />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIdx) => (
                <tr
                  key={rowIdx}
                  className={cn(
                    'border-b border-[#1E1E26] hover:bg-[#1C1C22] transition-colors duration-100',
                    rowIdx % 2 === 1 && 'bg-[#0B0B0E]'
                  )}
                >
                  {columns.map((col) => {
                    const val = row[col];
                    const isNumeric = typeof val === 'number' || (typeof val === 'string' && !isNaN(Number(val)) && val.trim() !== '');
                    return (
                      <td
                        key={col}
                        className={cn(
                          'px-4 py-3 font-mono text-[13px] leading-5',
                          isNumeric ? 'text-right text-[#EDEDEF]' : 'text-[#A0A0AB]'
                        )}
                      >
                        {isNumeric ? formatNumber(Number(val)) : String(val ?? '—')}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[#1E1E26] bg-[#0F0F12]">
            <span className="text-xs leading-4 text-[#63637A]">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {formatNumber(total)}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="rounded-full w-8 h-8 flex items-center justify-center text-[#63637A] hover:text-[#EDEDEF] hover:bg-[#1C1C22] disabled:text-[#3A3A48] transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-[#A0A0AB] px-2">
                Page {page + 1} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="rounded-full w-8 h-8 flex items-center justify-center text-[#63637A] hover:text-[#EDEDEF] hover:bg-[#1C1C22] disabled:text-[#3A3A48] transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
