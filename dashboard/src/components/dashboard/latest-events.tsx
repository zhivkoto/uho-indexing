'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowRight, Search } from 'lucide-react';
import { getPrograms, getEvents } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { EventTag } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { truncateAddress, formatRelativeTime } from '@/lib/utils';

export function LatestEvents() {
  const { data: programsData } = useQuery({
    queryKey: ['programs'],
    queryFn: getPrograms,
    refetchInterval: 5000,
    retry: 1,
  });

  // Prefer a program that already has indexed events so Latest Events isn't empty
  const programs = programsData?.data;
  const firstProgram =
    programs?.find((p) => (p.eventsIndexed ?? 0) > 0 && p.events?.some((e) => e.enabled)) ??
    programs?.[0];
  const firstEvent = firstProgram?.events?.find((e) => e.enabled)?.name;

  const { data: events, isLoading } = useQuery({
    queryKey: ['latest-events', firstProgram?.name, firstEvent],
    queryFn: () => getEvents(firstProgram!.name, firstEvent!, { limit: 10, order: 'desc' }),
    enabled: !!firstProgram && !!firstEvent,
    refetchInterval: 5000,
    retry: 1,
  });

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#1E1E26]">
        <h3 className="text-[15px] font-semibold leading-5 text-[#EDEDEF]">Latest Events</h3>
        <Link
          href="/events"
          className="inline-flex items-center gap-1 text-xs font-medium text-[#A0A0AB] hover:text-[#22D3EE] transition-colors"
        >
          View all <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="divide-y divide-[#1E1E26]">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-2.5 px-5">
              <div className="h-5 w-20 rounded-full bg-[#2A2A35] animate-pulse" />
              <div className="h-4 w-24 rounded bg-[#2A2A35] animate-pulse flex-1" />
              <div className="h-3 w-12 rounded bg-[#2A2A35] animate-pulse" />
            </div>
          ))
        ) : events?.data?.length ? (
          events.data.map((event, i) => {
            const tx = String(event.txSignature || event.tx_signature || event.signature || '');
            const eventType = String(event.eventType || event.event_type || firstEvent || 'Event');
            const timestamp = event.timestamp || event.blockTime || event.block_time;

            return (
              <Link
                key={`${tx}-${i}`}
                href={tx ? `/events/${tx}` : '/events'}
                className="flex items-center gap-3 py-2.5 px-5 hover:bg-[#1C1C22] transition-colors cursor-pointer"
              >
                <EventTag className="text-[10px] px-2 py-0.5">{eventType}</EventTag>
                <span className="font-mono text-xs text-[#A0A0AB] flex-1 truncate">
                  {tx ? truncateAddress(tx, 4) : '—'}
                </span>
                {Boolean(timestamp) && (
                  <span className="text-[10px] text-[#63637A] whitespace-nowrap">
                    {formatRelativeTime(String(timestamp))}
                  </span>
                )}
              </Link>
            );
          })
        ) : (
          <EmptyState
            icon={<Search className="w-6 h-6" />}
            title="No events yet"
            description="Events will appear here once the indexer starts processing."
          />
        )}
      </div>
    </Card>
  );
}
