'use client';

import { formatNumber } from '@/lib/utils';
import type { UserProfile } from '@/lib/types';

interface UsageDisplayProps {
  profile: UserProfile;
}

function UsageBar({ current, limit, label }: { current: number; limit: number; label: string }) {
  const pct = limit > 0 ? Math.min((current / limit) * 100, 100) : 0;
  const isWarning = pct >= 80;
  const isError = pct >= 95;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[#EDEDEF]">{label}</span>
        <span className="font-mono text-xs text-[#A0A0AB]">
          {formatNumber(current)} / {formatNumber(limit)}
        </span>
      </div>
      <div className="h-2 rounded-full bg-[#23232B] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            isError ? 'bg-red-400' : isWarning ? 'bg-amber-400' : 'bg-[#22D3EE]'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function UsageDisplay({ profile }: UsageDisplayProps) {
  return (
    <div className="space-y-5">
      <UsageBar
        label="Programs"
        current={profile.usage.programs}
        limit={profile.usage.programLimit}
      />
      <UsageBar
        label="API Calls (this month)"
        current={profile.usage.apiCalls}
        limit={profile.usage.apiCallLimit}
      />
    </div>
  );
}
