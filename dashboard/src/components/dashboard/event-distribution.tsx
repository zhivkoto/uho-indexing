'use client';

import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { Card } from '@/components/ui/card';
import type { ProgramStatus } from '@/lib/types';

const COLORS = ['#22D3EE', '#A78BFA', '#34D399', '#FBBF24', '#F87171'];

interface EventDistributionProps {
  programs: ProgramStatus[];
}

interface TooltipPayloadItem {
  name: string;
  value: number;
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadItem[] }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-[#16161A] border border-[#2A2A35] px-3 py-2 shadow-modal">
      <p className="text-xs font-medium text-[#EDEDEF]">{payload[0].name}</p>
      <p className="font-mono text-sm text-[#22D3EE]">{payload[0].value.toLocaleString()}</p>
    </div>
  );
}

export function EventDistribution({ programs }: EventDistributionProps) {
  const data = useMemo(() => {
    if (!programs?.length) {
      return [
        { name: 'Swap', count: 68000 },
        { name: 'Transfer', count: 22000 },
        { name: 'Liquidity', count: 10000 },
      ];
    }

    return programs.flatMap((p) =>
      p.events.map((event) => ({
        name: event,
        count: p.eventCounts?.[event] || 0,
      }))
    ).slice(0, 8);
  }, [programs]);

  return (
    <Card padding="md">
      <h3 className="text-[15px] font-semibold leading-5 text-[#EDEDEF] mb-4">Event Distribution</h3>
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical">
            <XAxis
              type="number"
              stroke="#63637A"
              tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              stroke="#63637A"
              tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }}
              tickLine={false}
              axisLine={false}
              width={160}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {data.map((_, index) => (
                <Cell key={index} fill={COLORS[index % COLORS.length]} fillOpacity={0.8} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
