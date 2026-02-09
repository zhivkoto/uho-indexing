'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { PillTabs } from '@/components/ui/select';
import { getThroughput } from '@/lib/api';

const timeRanges = [
  { value: '1', label: '1h' },
  { value: '6', label: '6h' },
  { value: '24', label: '24h' },
];

interface ThroughputChartProps {
  /** Program ID to filter metrics (optional) */
  programId?: string;
  /** Total events indexed (to show in empty state) */
  eventsIndexed?: number;
}

interface TooltipPayloadItem {
  value: number;
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadItem[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-[#16161A] border border-[#2A2A35] px-3 py-2 shadow-modal">
      <p className="text-xs text-[#63637A] mb-1">{label}</p>
      <p className="font-mono text-sm font-medium text-[#EDEDEF]">
        {payload[0].value} <span className="text-[#63637A] text-xs">events/min</span>
      </p>
    </div>
  );
}

export function ThroughputChart({ programId, eventsIndexed = 0 }: ThroughputChartProps) {
  const [range, setRange] = useState('24');

  const { data: metricsData, isLoading } = useQuery({
    queryKey: ['throughput', range, programId],
    queryFn: () => getThroughput(Number(range), programId),
    refetchInterval: 10000, // refresh every 10s
    retry: 1,
  });

  const chartData = metricsData?.data || [];
  const hasData = chartData.length > 0 && chartData.some(d => d.value > 0);
  const currentRate = hasData ? (chartData[chartData.length - 1]?.value || 0) : 0;

  return (
    <Card padding="md">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[15px] font-semibold leading-5 text-[#EDEDEF]">Events / Minute</h3>
          <p className="text-xs leading-4 text-[#63637A] mt-0.5">
            Last {range}h · <span className="font-mono text-[#A0A0AB]">{currentRate}/min</span>
          </p>
        </div>
        <PillTabs options={timeRanges} value={range} onChange={setRange} />
      </div>
      
      {!hasData && (
        <div className="h-[200px] flex items-center justify-center">
          <div className="text-center">
            <p className="text-sm text-[#63637A]">
              {eventsIndexed > 0 
                ? `${eventsIndexed} event${eventsIndexed === 1 ? '' : 's'} indexed — metrics coming soon`
                : 'No events indexed yet'}
            </p>
            <p className="text-xs text-[#4A4A5A] mt-1">Chart will show real-time data once metrics API is ready</p>
          </div>
        </div>
      )}
      
      {hasData && (
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="throughputGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22D3EE" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#22D3EE" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E1E26" vertical={false} />
              <XAxis
                dataKey="time"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#63637A', fontSize: 10 }}
                interval="preserveStartEnd"
                minTickGap={50}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#63637A', fontSize: 10 }}
                width={40}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#22D3EE"
                strokeWidth={2}
                fill="url(#throughputGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
