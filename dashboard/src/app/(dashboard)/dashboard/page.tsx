'use client';

import { useQuery } from '@tanstack/react-query';
import { Code2, Activity, Hash, AlertCircle, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getStatus } from '@/lib/api';
import { PageContainer } from '@/components/layout/page-container';
import { StatCard } from '@/components/ui/card';
import { ThroughputChart } from '@/components/dashboard/throughput-chart';
import { LatestEvents } from '@/components/dashboard/latest-events';
import { EventDistribution } from '@/components/dashboard/event-distribution';
import { ProgramsMini } from '@/components/dashboard/programs-mini';
import { EmptyState } from '@/components/ui/empty-state';
import { formatNumber, formatSlot } from '@/lib/utils';

export default function DashboardPage() {
  const router = useRouter();
  const { data: status, isLoading } = useQuery({
    queryKey: ['status'],
    queryFn: getStatus,
    refetchInterval: 5000,
    retry: 1,
  });

  const programCount = status?.programs?.length || 0;
  const totalEvents = status?.programs?.reduce((sum, p) => {
    const counts = p.eventCounts ? Object.values(p.eventCounts).reduce((a, b) => a + b, 0) : 0;
    return sum + counts;
  }, 0) || 0;
  const lastSlot = status?.indexer?.currentSlot || 0;

  const noPrograms = !isLoading && programCount === 0;

  return (
    <PageContainer title="Dashboard">
      <div className="space-y-6">
        {/* Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            label="Programs Monitored"
            value={isLoading ? '—' : String(programCount)}
            icon={<Code2 className="w-4 h-4" />}
            loading={isLoading}
          />
          <StatCard
            label="Events Indexed"
            value={isLoading ? '—' : formatNumber(totalEvents, true)}
            icon={<Activity className="w-4 h-4" />}
            loading={isLoading}
          />
          <StatCard
            label="Last Slot Indexed"
            value={isLoading ? '—' : lastSlot ? formatSlot(lastSlot, true) : '—'}
            icon={<Hash className="w-4 h-4" />}
            loading={isLoading}
          />
          <StatCard
            label="Errors (24h)"
            value={isLoading ? '—' : '0'}
            icon={<AlertCircle className="w-4 h-4" />}
            loading={isLoading}
          />
        </div>

        {noPrograms ? (
          <EmptyState
            icon={<Plus className="w-6 h-6" />}
            title="Add Your First Program"
            description="Start indexing Solana events by adding a program with its IDL."
            action={{
              label: 'Add Program',
              onClick: () => router.push('/programs/new'),
            }}
          />
        ) : (
          <>
            {/* Throughput Chart */}
            <ThroughputChart />

            {/* Bottom Row: Latest Events + Distribution + Programs */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
              <LatestEvents />
              <div className="space-y-6">
                <EventDistribution programs={status?.programs || []} />
                <ProgramsMini programs={status?.programs || []} />
              </div>
            </div>
          </>
        )}
      </div>
    </PageContainer>
  );
}
