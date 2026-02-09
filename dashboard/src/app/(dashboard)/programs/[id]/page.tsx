'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft, Pause, Play, Trash2, Copy, Check, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';
import { getProgram, pauseProgram, resumeProgram, archiveProgram, updateProgram } from '@/lib/api';
import { PageContainer } from '@/components/layout/page-container';
import { Card, StatCard } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, EventTag } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Modal } from '@/components/ui/modal';
import { Tabs } from '@/components/ui/tabs';
import { ThroughputChart } from '@/components/dashboard/throughput-chart';
import { truncateAddress, copyToClipboard, formatNumber, formatSlot, formatRelativeTime, solscanAddressUrl } from '@/lib/utils';
import type { ProgramStatusValue } from '@/lib/types';

const statusBadge: Record<ProgramStatusValue, { variant: 'success' | 'warning' | 'error' | 'default' | 'info'; pulse: boolean }> = {
  provisioning: { variant: 'warning', pulse: true },
  running: { variant: 'success', pulse: true },
  paused: { variant: 'default', pulse: false },
  error: { variant: 'error', pulse: false },
  archived: { variant: 'default', pulse: false },
};

export default function ProgramDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const programId = params.id as string;
  const [activeTab, setActiveTab] = useState('overview');
  const [showArchive, setShowArchive] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data: program, isLoading, error } = useQuery({
    queryKey: ['program', programId],
    queryFn: () => getProgram(programId),
    refetchInterval: 5000,
  });

  const pauseMut = useMutation({
    mutationFn: () => pauseProgram(programId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['program', programId] }); toast.success('Paused'); },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed'),
  });

  const resumeMut = useMutation({
    mutationFn: () => resumeProgram(programId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['program', programId] }); toast.success('Resumed'); },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed'),
  });

  const archiveMut = useMutation({
    mutationFn: () => archiveProgram(programId),
    onSuccess: () => { toast.success('Archived'); router.push('/programs'); },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed'),
  });

  const toggleEventMut = useMutation({
    mutationFn: (event: { name: string; type: string; enabled: boolean }) =>
      updateProgram(programId, { events: [event] }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['program', programId] });
      toast.success('Event updated');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to update event'),
  });

  const handleCopy = async () => {
    if (program) {
      await copyToClipboard(program.programId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (isLoading) {
    return (
      <PageContainer title="Program Detail">
        <div className="flex items-center justify-center py-20"><Spinner size="lg" /></div>
      </PageContainer>
    );
  }

  if (error || !program) {
    return (
      <PageContainer title="Program Detail">
        <div className="text-center py-20">
          <p className="text-sm text-red-400 mb-4">Program not found or failed to load.</p>
          <Link href="/programs" className="text-sm text-[#22D3EE]">Back to Programs</Link>
        </div>
      </PageContainer>
    );
  }

  const badge = statusBadge[program.status] || statusBadge.paused;
  const totalEvents = program.events.reduce((sum, e) => sum + (e.count || 0), 0);

  const tabs = [
    { value: 'overview', label: 'Overview' },
    { value: 'events', label: 'Events', count: program.events.length },
    { value: 'config', label: 'Configuration' },
  ];

  return (
    <PageContainer
      title={program.name}
      headerChildren={
        <Link href="/programs" className="inline-flex items-center gap-1.5 text-xs text-[#A0A0AB] hover:text-[#EDEDEF] transition-colors ml-3">
          <ArrowLeft className="w-3.5 h-3.5" /> Programs
        </Link>
      }
    >
      <div className="space-y-6">
        {/* Header card */}
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-[22px] font-semibold text-[#EDEDEF]">{program.name}</h2>
                <Badge variant={badge.variant} dot pulse={badge.pulse}>
                  {program.status}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <a href={solscanAddressUrl(program.programId)} target="_blank" rel="noopener noreferrer" className="font-mono text-sm text-[#67E8F9] hover:underline">
                  {truncateAddress(program.programId, 8)}
                </a>
                <a href={solscanAddressUrl(program.programId)} target="_blank" rel="noopener noreferrer" className="text-[#63637A] hover:text-[#22D3EE] transition-colors" title="View on Solscan">
                  <ExternalLink className="w-3 h-3" />
                </a>
                <button onClick={handleCopy} className="text-[#63637A] hover:text-[#22D3EE] transition-colors">
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <span className="text-xs text-[#63637A] ml-2">{program.chain}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {program.status === 'running' ? (
                <Button variant="secondary" size="sm" onClick={() => pauseMut.mutate()} loading={pauseMut.isPending}>
                  <Pause className="w-3.5 h-3.5" /> Pause
                </Button>
              ) : program.status === 'paused' ? (
                <Button variant="secondary" size="sm" onClick={() => resumeMut.mutate()} loading={resumeMut.isPending}>
                  <Play className="w-3.5 h-3.5" /> Resume
                </Button>
              ) : null}
              <Button variant="danger" size="sm" onClick={() => setShowArchive(true)}>
                <Trash2 className="w-3.5 h-3.5" /> Archive
              </Button>
            </div>
          </div>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard label="Events Indexed" value={formatNumber(program.state?.eventsIndexed || totalEvents, true)} />
          <StatCard label="Event Types" value={String(program.events.filter(e => e.enabled).length)} />
          <StatCard label="Last Slot" value={program.state?.lastSlot ? formatSlot(program.state.lastSlot, true) : '—'} />
          <StatCard label="Last Poll" value={program.state?.lastPollAt ? formatRelativeTime(program.state.lastPollAt) : '—'} />
        </div>

        {program.state?.error && (
          <Card className="border-red-500/20">
            <div className="flex items-start gap-3">
              <span className="text-red-400 text-sm font-medium">Error:</span>
              <span className="font-mono text-xs text-red-400">{program.state.error}</span>
            </div>
          </Card>
        )}

        <Tabs tabs={tabs} value={activeTab} onChange={setActiveTab} />

        {activeTab === 'overview' && (
          <ThroughputChart programId={programId} eventsIndexed={program.state?.eventsIndexed || 0} />
        )}

        {activeTab === 'events' && (
          <Card>
            <div className="space-y-3">
              {program.events.map((evt) => (
                <div key={evt.name} className="flex items-center justify-between py-3 border-b border-[#1E1E26] last:border-0">
                  <div className="flex items-center gap-3">
                    <EventTag>{evt.name}</EventTag>
                    <Badge variant={evt.type === 'event' ? 'accent' : 'info'}>{evt.type}</Badge>
                    {!evt.enabled && <Badge variant="default">disabled</Badge>}
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-sm text-[#A0A0AB]">{formatNumber(evt.count || 0)} events</span>
                    <Link href={`/events?program=${program.name}`}>
                      <Button variant="ghost" size="sm">View →</Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {activeTab === 'config' && (
          <Card>
            <h3 className="text-[15px] font-semibold text-[#EDEDEF] mb-4">Events & Instructions</h3>
            <p className="text-xs text-[#63637A] mb-4">Toggle which events and instructions to index</p>
            <div className="space-y-2">
              {program.events.map((event) => (
                <div key={`${event.type}-${event.name}`} className="flex items-center justify-between py-2 px-3 rounded-lg bg-[#16161A] border border-[#1E1E26]">
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-0.5 rounded ${event.type === 'event' ? 'bg-[#22D3EE]/10 text-[#22D3EE]' : 'bg-[#A855F7]/10 text-[#A855F7]'}`}>
                      {event.type}
                    </span>
                    <span className="font-mono text-sm text-[#EDEDEF]">{event.name}</span>
                  </div>
                  <button
                    onClick={() => toggleEventMut.mutate({ name: event.name, type: event.type, enabled: !event.enabled })}
                    disabled={toggleEventMut.isPending}
                    className={`relative w-10 h-5 rounded-full transition-colors ${event.enabled ? 'bg-[#22D3EE]' : 'bg-[#2A2A35]'}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${event.enabled ? 'left-5' : 'left-0.5'}`} />
                  </button>
                </div>
              ))}
            </div>
            {Object.keys(program.config || {}).length > 0 && (
              <>
                <h3 className="text-[15px] font-semibold text-[#EDEDEF] mt-6 mb-4">Advanced Config</h3>
                <div className="space-y-3">
                  {Object.entries(program.config).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between py-2 border-b border-[#1E1E26] last:border-0">
                      <span className="text-sm text-[#63637A]">{key}</span>
                      <span className="font-mono text-sm text-[#EDEDEF]">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        )}
      </div>

      <Modal open={showArchive} onClose={() => setShowArchive(false)} title="Archive Program" size="sm">
        <p className="text-sm text-[#A0A0AB] mb-4">
          This will stop indexing and archive the program. Data is retained but hidden.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setShowArchive(false)}>Cancel</Button>
          <Button variant="danger" onClick={() => archiveMut.mutate()} loading={archiveMut.isPending}>Archive</Button>
        </div>
      </Modal>
    </PageContainer>
  );
}
