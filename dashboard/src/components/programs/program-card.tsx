'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Code2, Copy, Check } from 'lucide-react';
import { Badge, EventTag } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { truncateAddress, formatSlot, formatNumber, copyToClipboard } from '@/lib/utils';
import type { ProgramStatus } from '@/lib/types';

interface ProgramCardProps {
  program: ProgramStatus;
}

export function ProgramCard({ program }: ProgramCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await copyToClipboard(program.programId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const totalEvents = program.eventCounts
    ? Object.values(program.eventCounts).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <div className="rounded-xl bg-[#0F0F12] border border-[#1E1E26] overflow-hidden hover:border-[#22D3EE]/30 hover:shadow-accent-glow transition-all duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#1E1E26]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#164E63]/20 flex items-center justify-center text-[#22D3EE]">
            <Code2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-[15px] font-semibold leading-5 text-[#EDEDEF]">{program.name}</h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="font-mono text-xs text-[#67E8F9]">
                {truncateAddress(program.programId, 6)}
              </span>
              <button
                onClick={handleCopy}
                className="text-[#63637A] hover:text-[#22D3EE] transition-colors cursor-pointer"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
          </div>
        </div>
        <Badge
          variant={program.status === 'running' || program.status === 'active' ? 'success' : 'default'}
          dot
          pulse={program.status === 'running' || program.status === 'active'}
        >
          {program.status || 'Active'}
        </Badge>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 divide-x divide-[#1E1E26] border-b border-[#1E1E26]">
        <div className="px-6 py-3">
          <div className="text-[11px] font-semibold tracking-widest uppercase text-[#63637A]">
            Events Indexed
          </div>
          <div className="font-mono text-lg font-bold text-[#EDEDEF] mt-0.5">
            {formatNumber(totalEvents, true)}
          </div>
        </div>
        <div className="px-6 py-3">
          <div className="text-[11px] font-semibold tracking-widest uppercase text-[#63637A]">
            Event Types
          </div>
          <div className="font-mono text-lg font-bold text-[#EDEDEF] mt-0.5">
            {program.events.length}
          </div>
        </div>
        <div className="px-6 py-3">
          <div className="text-[11px] font-semibold tracking-widest uppercase text-[#63637A]">
            Last Slot
          </div>
          <div className="font-mono text-lg font-bold text-[#EDEDEF] mt-0.5">
            {program.lastSlot ? String(program.lastSlot) : '—'}
          </div>
        </div>
      </div>

      {/* Event type chips */}
      <div className="px-6 py-4 flex flex-wrap gap-2">
        {program.events.map((event) => (
          <EventTag key={event}>{event}</EventTag>
        ))}
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-end gap-3 px-6 py-3 bg-[#0B0B0E] border-t border-[#1E1E26]">
        <Link href={`/events?program=${program.name}`}>
          <Button variant="secondary" size="sm">
            View Events →
          </Button>
        </Link>
      </div>
    </div>
  );
}
