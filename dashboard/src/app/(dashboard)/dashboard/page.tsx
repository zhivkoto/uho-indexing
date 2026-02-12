'use client';

import { useQuery } from '@tanstack/react-query';
import { Code2, Activity, Hash, AlertCircle, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getPrograms } from '@/lib/api';
import { PageContainer } from '@/components/layout/page-container';
import { StatCard } from '@/components/ui/card';
import { ThroughputChart } from '@/components/dashboard/throughput-chart';
import { LatestEvents } from '@/components/dashboard/latest-events';
import { EventDistribution } from '@/components/dashboard/event-distribution';
import { ProgramsMini } from '@/components/dashboard/programs-mini';
import { EmptyState } from '@/components/ui/empty-state';
import { formatNumber, formatSlot } from '@/lib/utils';
import type { ProgramStatus } from '@/lib/types';

export default function DashboardPage() {
  const router = useRouter();
  const { data: programsData, isLoading } = useQuery({
    queryKey: ['programs'],
    queryFn: getPrograms,
    refetchInterval: 5000,
    retry: 1,
  });

  const userPrograms = programsData?.data || [];
  const programCount = userPrograms.length;
  const totalEvents = userPrograms.reduce((sum, p) => {
    const counts = p.events?.reduce((a, e) => a + (e.count || 0), 0) || 0;
    return sum + (p.eventsIndexed || counts);
  }, 0);
  const lastSlot = userPrograms.reduce((max, p) => Math.max(max, p.lastSlot || 0), 0);

  // Convert ProgramInfo[] to ProgramStatus[] for dashboard widgets
  const statusPrograms: ProgramStatus[] = userPrograms.map((p) => ({
    name: p.name,
    programId: p.programId,
    events: p.events?.filter((e) => e.enabled).map((e) => e.name) || [],
    eventCounts: Object.fromEntries(
      (p.events || []).filter((e) => e.enabled).map((e) => [e.name, e.count || 0])
    ),
    status: p.status,
    eventsIndexed: p.eventsIndexed,
  }));

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
            value={isLoading ? '—' : lastSlot ? String(lastSlot) : '—'}
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
                <EventDistribution programs={statusPrograms} />
                <ProgramsMini programs={statusPrograms} />
              </div>
            </div>
          </>
        )}
      </div>
    </PageContainer>
  );
}
