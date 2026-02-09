'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Code2, Plus, Pause, Play, Trash2, MoreVertical } from 'lucide-react';
import { toast } from 'sonner';
import { getPrograms, pauseProgram, resumeProgram, archiveProgram } from '@/lib/api';
import { PageContainer } from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { Badge, EventTag } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Modal } from '@/components/ui/modal';
import { Dropdown } from '@/components/ui/dropdown';
import { truncateAddress, formatNumber, formatSlot, copyToClipboard } from '@/lib/utils';
import { useState } from 'react';
import type { ProgramInfo, ProgramStatusValue } from '@/lib/types';

const statusBadge: Record<ProgramStatusValue, { variant: 'success' | 'warning' | 'error' | 'default' | 'info'; pulse: boolean }> = {
  provisioning: { variant: 'warning', pulse: true },
  running: { variant: 'success', pulse: true },
  paused: { variant: 'default', pulse: false },
  error: { variant: 'error', pulse: false },
  archived: { variant: 'default', pulse: false },
};

export default function ProgramsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [archiveId, setArchiveId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['programs'],
    queryFn: getPrograms,
    refetchInterval: 10000,
  });

  const pauseMutation = useMutation({
    mutationFn: pauseProgram,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['programs'] });
      toast.success('Program paused.');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed'),
  });

  const resumeMutation = useMutation({
    mutationFn: resumeProgram,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['programs'] });
      toast.success('Program resumed.');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed'),
  });

  const archiveMutation = useMutation({
    mutationFn: archiveProgram,
    onSuccess: () => {
      setArchiveId(null);
      queryClient.invalidateQueries({ queryKey: ['programs'] });
      toast.success('Program archived.');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed'),
  });

  const programs = data?.data || [];

  return (
    <PageContainer
      title="Programs"
      headerChildren={
        <Button size="sm" onClick={() => router.push('/programs/new')} className="ml-auto">
          <Plus className="w-3.5 h-3.5" /> Add Program
        </Button>
      }
    >
      {isLoading ? (
        <div className="space-y-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl bg-[#0F0F12] border border-[#1E1E26] p-6">
              <div className="h-5 w-40 rounded bg-[#2A2A35] animate-pulse mb-3" />
              <div className="h-4 w-60 rounded bg-[#2A2A35] animate-pulse" />
            </div>
          ))}
        </div>
      ) : programs.length === 0 ? (
        <EmptyState
          icon={<Code2 className="w-6 h-6" />}
          title="No programs indexed"
          description="Add a Solana program to start indexing its events."
          action={{ label: 'Add Program', onClick: () => router.push('/programs/new') }}
        />
      ) : (
        <div className="space-y-4">
          {programs.map((program: ProgramInfo) => {
            const badge = statusBadge[program.status] || statusBadge.paused;
            const totalEvents = program.eventsIndexed ?? program.events.reduce((sum, e) => sum + (e.count || 0), 0);

            return (
              <div
                key={program.id}
                className="rounded-xl bg-[#0F0F12] border border-[#1E1E26] overflow-hidden hover:border-[#22D3EE]/30 hover:shadow-accent-glow transition-all duration-200 cursor-pointer"
                onClick={() => router.push(`/programs/${program.id}`)}
              >
                <div className="flex items-center justify-between px-6 py-4 border-b border-[#1E1E26]">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#164E63]/20 flex items-center justify-center text-[#22D3EE]">
                      <Code2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-[15px] font-semibold leading-5 text-[#EDEDEF]">{program.name}</h3>
                      <button
                        onClick={(e) => { e.stopPropagation(); copyToClipboard(program.programId); toast.success('Copied!'); }}
                        className="font-mono text-xs text-[#67E8F9] hover:underline mt-0.5"
                      >
                        {truncateAddress(program.programId, 6)}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                    <Badge variant={badge.variant} dot pulse={badge.pulse}>
                      {program.status}
                    </Badge>
                    <Dropdown
                      align="right"
                      trigger={
                        <Button variant="icon" size="sm">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      }
                      items={[
                        program.status === 'running'
                          ? { label: 'Pause', icon: <Pause className="w-4 h-4" />, onClick: () => pauseMutation.mutate(program.id) }
                          : { label: 'Resume', icon: <Play className="w-4 h-4" />, onClick: () => resumeMutation.mutate(program.id) },
                        'separator',
                        { label: 'Archive', icon: <Trash2 className="w-4 h-4" />, danger: true, onClick: () => setArchiveId(program.id) },
                      ]}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 divide-x divide-[#1E1E26] border-b border-[#1E1E26]">
                  <div className="px-6 py-3">
                    <div className="text-[11px] font-semibold tracking-widest uppercase text-[#63637A]">Events Indexed</div>
                    <div className="font-mono text-lg font-bold text-[#EDEDEF] mt-0.5">{formatNumber(totalEvents, true)}</div>
                  </div>
                  <div className="px-6 py-3">
                    <div className="text-[11px] font-semibold tracking-widest uppercase text-[#63637A]">Event Types</div>
                    <div className="font-mono text-lg font-bold text-[#EDEDEF] mt-0.5">{program.events.length}</div>
                  </div>
                  <div className="px-6 py-3">
                    <div className="text-[11px] font-semibold tracking-widest uppercase text-[#63637A]">Chain</div>
                    <div className="font-mono text-lg font-bold text-[#EDEDEF] mt-0.5">{program.chain.replace('solana-', '')}</div>
                  </div>
                </div>

                <div className="px-6 py-3 flex flex-wrap gap-2">
                  {program.events.filter(e => e.enabled).map((event) => (
                    <EventTag key={event.name}>{event.name}</EventTag>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={!!archiveId}
        onClose={() => setArchiveId(null)}
        title="Archive Program"
        size="sm"
      >
        <p className="text-sm text-[#A0A0AB] mb-4">
          This will stop indexing and hide the program. Data is retained but not accessible.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setArchiveId(null)}>Cancel</Button>
          <Button
            variant="danger"
            onClick={() => archiveId && archiveMutation.mutate(archiveId)}
            loading={archiveMutation.isPending}
          >
            Archive
          </Button>
        </div>
      </Modal>
    </PageContainer>
  );
}
