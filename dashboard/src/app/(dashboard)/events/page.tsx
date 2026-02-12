'use client';

import { useState, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import type { SortingState } from '@tanstack/react-table';
import { getPrograms, getEvents } from '@/lib/api';
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

  const { data: programsData } = useQuery({
    queryKey: ['programs'],
    queryFn: getPrograms,
    refetchInterval: 10000,
    retry: 1,
  });

  const userPrograms = programsData?.data || [];

  // Empty string = "All Programs" / "All Events" — uses /data/all endpoint
  const activeProgram = selectedProgram !== '' ? selectedProgram : (initialProgram || '');
  const activeEvent = selectedEvent !== '' ? selectedEvent : (initialEvent || '');

  // Filter program dropdown: if an event is selected, only show programs that have it
  const programs = useMemo(() => {
    if (!activeEvent) {
      return userPrograms.map((p) => ({ value: p.name, label: p.name }));
    }
    return userPrograms
      .filter((p) => p.events?.some((e) => e.enabled && e.name === activeEvent))
      .map((p) => ({ value: p.name, label: p.name }));
  }, [userPrograms, activeEvent]);

  const hasPrograms = programs.length > 0;

  const eventTypes = useMemo(() => {
    const formatLabel = (name: string, type?: string) =>
      type === 'instruction' ? `${name} (ix)` : name;

    if (!activeProgram) {
      // "All Programs" — collect only enabled events/instructions, sorted by count
      const allEvents = new Map<string, { count: number; type: string }>();
      for (const p of userPrograms) {
        for (const e of (p.events || [])) {
          if (e.enabled) {
            const existing = allEvents.get(e.name);
            allEvents.set(e.name, {
              count: (existing?.count || 0) + (e.count || 0),
              type: existing?.type || e.type,
            });
          }
        }
      }
      return [...allEvents.entries()]
        .sort((a, b) => b[1].count - a[1].count)
        .map(([name, info]) => ({ value: name, label: formatLabel(name, info.type) }));
    }
    const program = userPrograms.find((p) => p.name === activeProgram);
    if (!program?.events) return [];
    return program.events
      .filter((e) => e.enabled)
      .sort((a, b) => (b.count || 0) - (a.count || 0))
      .map((e) => ({ value: e.name, label: formatLabel(e.name, e.type) }));
  }, [userPrograms, activeProgram]);

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

  const noPrograms = !userPrograms.length;

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
        onEventChange={(v) => {
          setSelectedEvent(v);
          setPage(0);
          // Auto-select program if only one program has this event
          if (v) {
            const matching = userPrograms.filter((p) =>
              p.events?.some((e) => e.enabled && e.name === v)
            );
            if (matching.length === 1) {
              setSelectedProgram(matching[0].name);
            }
          }
        }}
        onSearchChange={setSearch}
        onSlotFromChange={(v) => { setSlotFrom(v); setPage(0); }}
        onSlotToChange={(v) => { setSlotTo(v); setPage(0); }}
        onClearFilters={clearFilters}
      />

      {noPrograms ? (
        <EmptyState
          icon={<Search className="w-6 h-6" />}
          title="No programs indexed"
          description="Add a program to start indexing events."
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
