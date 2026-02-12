'use client';

import { useState, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import type { SortingState } from '@tanstack/react-table';
import { getStatus, getEvents } from '@/lib/api';
import { PageContainer } from '@/components/layout/page-container';
import { FilterBar } from '@/components/events/filter-bar';
import { EventTable } from '@/components/events/event-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';

const PAGE_SIZE = 50;

function EventExplorerContent() {
  const searchParams = useSearchParams();
  const initialProgram = searchParams.get('program') || '';
  const initialEvent = searchParams.get('event') || '';

  const [selectedProgram, setSelectedProgram] = useState(initialProgram);
  const [selectedEvent, setSelectedEvent] = useState(initialEvent);
  const [search, setSearch] = useState('');
  const [slotFrom, setSlotFrom] = useState('');
  const [slotTo, setSlotTo] = useState('');
  const [page, setPage] = useState(0);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'slot', desc: true }]);

  const { data: status } = useQuery({
    queryKey: ['status'],
    queryFn: getStatus,
    refetchInterval: 10000,
    retry: 1,
  });

  const programs = useMemo(
    () => status?.programs?.map((p) => ({ value: p.name, label: p.name })) || [],
    [status]
  );

  // Empty string = "All Programs" / "All Events" — uses /data/all endpoint
  const activeProgram = selectedProgram !== '' ? selectedProgram : (initialProgram || '');
  const hasPrograms = programs.length > 0;

  const eventTypes = useMemo(() => {
    if (!activeProgram) {
      // "All Programs" — collect all events across all programs, sorted by count
      const allEvents = new Map<string, number>();
      for (const p of (status?.programs || [])) {
        const counts = p.eventCounts || {};
        for (const e of (p.events || [])) {
          allEvents.set(e, (allEvents.get(e) || 0) + (counts[e] || 0));
        }
      }
      return [...allEvents.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([e]) => ({ value: e, label: e }));
    }
    const program = status?.programs?.find((p) => p.name === activeProgram);
    if (!program?.events) return [];
    const counts = program.eventCounts || {};
    return [...program.events]
      .sort((a, b) => (counts[b] || 0) - (counts[a] || 0))
      .map((e) => ({ value: e, label: e }));
  }, [status, activeProgram]);

  const activeEvent = selectedEvent !== '' ? selectedEvent : (initialEvent || '');

  const { data: events, isLoading } = useQuery({
    queryKey: ['events', activeProgram, activeEvent, page, sorting, slotFrom, slotTo],
    queryFn: () =>
      getEvents(activeProgram, activeEvent, {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        orderBy: sorting[0]?.id,
        order: sorting[0]?.desc ? 'desc' : 'asc',
        slotFrom: slotFrom ? Number(slotFrom) : undefined,
        slotTo: slotTo ? Number(slotTo) : undefined,
      }),
    enabled: hasPrograms,
    refetchInterval: 5000,
    retry: 1,
  });

  const clearFilters = () => {
    setSelectedProgram('');
    setSelectedEvent('');
    setSearch('');
    setSlotFrom('');
    setSlotTo('');
    setPage(0);
    setSorting([]);
  };

  const filteredData = useMemo(() => {
    if (!events?.data || !search) return events?.data || [];
    const lower = search.toLowerCase();
    return events.data.filter((row) =>
      Object.values(row).some((v) => String(v).toLowerCase().includes(lower))
    );
  }, [events?.data, search]);

  const noPrograms = !status?.programs?.length;
  const noEvents = !activeEvent;

  return (
    <div className="space-y-4">
      <FilterBar
        programs={programs}
        eventTypes={eventTypes}
        selectedProgram={selectedProgram}
        selectedEvent={selectedEvent}
        search={search}
        slotFrom={slotFrom}
        slotTo={slotTo}
        onProgramChange={(v) => { setSelectedProgram(v); setSelectedEvent(''); setPage(0); }}
        onEventChange={(v) => { setSelectedEvent(v); setPage(0); }}
        onSearchChange={setSearch}
        onSlotFromChange={(v) => { setSlotFrom(v); setPage(0); }}
        onSlotToChange={(v) => { setSlotTo(v); setPage(0); }}
        onClearFilters={clearFilters}
      />

      {noPrograms || noEvents ? (
        <EmptyState
          icon={<Search className="w-6 h-6" />}
          title={noPrograms ? 'No programs indexed' : 'No event types available'}
          description={
            noPrograms
              ? 'Add a program to start indexing events.'
              : 'Select a program with indexed events to explore.'
          }
        />
      ) : (
        <EventTable
          data={filteredData}
          program={activeProgram}
          event={activeEvent}
          eventType={activeEvent}
          sorting={sorting}
          onSortingChange={setSorting}
          page={page}
          pageSize={PAGE_SIZE}
          total={events?.pagination?.total || 0}
          onPageChange={setPage}
          loading={isLoading}
        />
      )}
    </div>
  );
}

export default function EventExplorerPage() {
  return (
    <PageContainer title="Event Explorer">
      <Suspense fallback={<div className="flex justify-center py-20"><Spinner size="lg" /></div>}>
        <EventExplorerContent />
      </Suspense>
    </PageContainer>
  );
}
