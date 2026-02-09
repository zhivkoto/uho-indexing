'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { truncateAddress } from '@/lib/utils';
import type { ProgramStatus } from '@/lib/types';

interface ProgramsMiniProps {
  programs: ProgramStatus[];
}

export function ProgramsMini({ programs }: ProgramsMiniProps) {
  return (
    <Card padding="md">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[15px] font-semibold leading-5 text-[#EDEDEF]">Programs</h3>
        <Link
          href="/programs"
          className="text-xs text-[#A0A0AB] hover:text-[#22D3EE] transition-colors"
        >
          View all →
        </Link>
      </div>
      <div className="space-y-2">
        {programs.map((program) => (
          <Link
            key={program.programId}
            href={`/events?program=${program.name}`}
            className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-[#1C1C22] transition-colors"
          >
            <div>
              <div className="text-sm font-medium text-[#EDEDEF]">{program.name}</div>
              <div className="font-mono text-xs text-[#67E8F9] mt-0.5">
                {truncateAddress(program.programId, 4)}
              </div>
            </div>
            <Badge
              variant={program.status === 'running' || program.status === 'active' ? 'success' : 'default'}
              dot
              pulse={program.status === 'running' || program.status === 'active'}
            >
              {program.status || 'Active'}
            </Badge>
          </Link>
        ))}
        {programs.length === 0 && (
          <p className="text-xs text-[#63637A] text-center py-4">No programs configured</p>
        )}
      </div>
    </Card>
  );
}
