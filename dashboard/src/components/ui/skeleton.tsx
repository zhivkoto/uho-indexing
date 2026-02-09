import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div className={cn('rounded-md bg-[#2A2A35] animate-pulse', className)} />
  );
}

/** Skeleton card matching StatCard dimensions */
export function SkeletonStatCard() {
  return (
    <div className="rounded-xl bg-[#0F0F12] border border-[#1E1E26] p-5">
      <Skeleton className="h-3 w-20 mb-3" />
      <Skeleton className="h-8 w-32 mb-2" />
      <Skeleton className="h-3 w-24" />
    </div>
  );
}

/** Skeleton table rows */
export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="rounded-xl border border-[#1E1E26] overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-[#1E1E26] bg-[#0F0F12]">
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i} className="px-4 py-3">
                <Skeleton className="h-3 w-16" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, rowIdx) => (
            <tr key={rowIdx} className="border-b border-[#1E1E26]">
              {Array.from({ length: cols }).map((_, colIdx) => (
                <td key={colIdx} className="px-4 py-3">
                  <Skeleton className={cn('h-4', colIdx === 0 ? 'w-24' : colIdx === 1 ? 'w-20' : 'w-16')} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Skeleton list of cards */
export function SkeletonCardList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl bg-[#0F0F12] border border-[#1E1E26] p-6">
          <Skeleton className="h-5 w-40 mb-3" />
          <Skeleton className="h-4 w-60 mb-2" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </div>
  );
}
