'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ScrollText } from 'lucide-react';
import { getPrograms, getHealth } from '@/lib/api';
import { PageContainer } from '@/components/layout/page-container';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';
import type { LogEntry, LogLevel } from '@/lib/types';

const levelColors: Record<LogLevel, { badge: string; text: string }> = {
  info: { badge: 'bg-blue-900/20 text-blue-400', text: 'text-blue-400' },
  warn: { badge: 'bg-amber-900/20 text-amber-400', text: 'text-amber-400' },
  error: { badge: 'bg-red-900/20 text-red-400', text: 'text-red-400' },
};

const filterOptions: { value: LogLevel | 'all'; label: string; color?: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'info', label: 'Info', color: 'text-blue-400 hover:bg-blue-900/10' },
  { value: 'warn', label: 'Warn', color: 'text-amber-400 hover:bg-amber-900/10' },
  { value: 'error', label: 'Error', color: 'text-red-400 hover:bg-red-900/10' },
];

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<LogLevel | 'all'>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);
  const prevStatusRef = useRef<string>('');

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
    refetchInterval: 5000,
    retry: 1,
  });

  const { data: programsData } = useQuery({
    queryKey: ['programs'],
    queryFn: getPrograms,
    refetchInterval: 5000,
    retry: 1,
  });

  const addLog = useCallback((level: LogLevel, message: string, details?: string) => {
    setLogs((prev) => [
      ...prev.slice(-200),
      {
        id: `${Date.now()}-${Math.random()}`,
        timestamp: new Date(),
        level,
        message,
        details,
      },
    ]);
  }, []);

  useEffect(() => {
    const programs = programsData?.data;
    if (!programs) return;
    const statusStr = JSON.stringify(programs);
    if (statusStr === prevStatusRef.current) return;

    if (prevStatusRef.current === '') {
      addLog('info', 'Connected to Uho indexer');
      const maxSlot = programs.reduce((max, p) => Math.max(max, p.lastSlot || 0), 0);
      if (maxSlot) {
        addLog('info', `Latest slot: ${maxSlot.toLocaleString()}`);
      }
      programs.forEach((p) => {
        const enabledCount = p.events?.filter(e => e.enabled).length || 0;
        addLog('info', `Monitoring program: ${p.name}`, `${enabledCount} enabled event/instruction types`);
      });
    } else {
      const prevPrograms = JSON.parse(prevStatusRef.current);
      const prevMaxSlot = Array.isArray(prevPrograms) ? prevPrograms.reduce((max: number, p: { lastSlot?: number }) => Math.max(max, p.lastSlot || 0), 0) : 0;
      const currMaxSlot = programs.reduce((max, p) => Math.max(max, p.lastSlot || 0), 0);
      if (currMaxSlot !== prevMaxSlot && prevMaxSlot && currMaxSlot) {
        addLog('info', `Polled slots ${prevMaxSlot.toLocaleString()}–${currMaxSlot.toLocaleString()}`);
      }
    }
    prevStatusRef.current = statusStr;
  }, [programsData, addLog]);

  useEffect(() => {
    if (health) {
      if (health.status !== 'ok' && health.status !== 'healthy') {
        addLog('warn', `Health status: ${health.status}`);
      }
    }
  }, [health, addLog]);

  useEffect(() => {
    if (!health && !programsData) {
      addLog('error', 'Failed to connect to Uho API', 'Is the indexer running?');
    }
  }, [health, programsData, addLog]);

  useEffect(() => {
    if (autoScroll && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const filteredLogs = filter === 'all' ? logs : logs.filter((l) => l.level === filter);
  const errorCount = logs.filter((l) => l.level === 'error').length;
  const warnCount = logs.filter((l) => l.level === 'warn').length;

  return (
    <PageContainer title="Activity Log">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {filterOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFilter(opt.value)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition-colors cursor-pointer',
                  filter === opt.value
                    ? 'bg-[#1C1C22] text-[#EDEDEF]'
                    : opt.color || 'text-[#A0A0AB] hover:bg-[#1C1C22]'
                )}
              >
                {opt.label}
                {opt.value === 'warn' && warnCount > 0 && (
                  <span className="ml-1 text-[10px]">{warnCount}</span>
                )}
                {opt.value === 'error' && errorCount > 0 && (
                  <span className="ml-1 text-[10px]">{errorCount}</span>
                )}
              </button>
            ))}
          </div>
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors cursor-pointer',
              autoScroll ? 'bg-[#22D3EE]/10 text-[#22D3EE]' : 'text-[#63637A] hover:text-[#A0A0AB]'
            )}
          >
            Auto-scroll {autoScroll ? 'ON' : 'OFF'}
          </button>
        </div>

        <Card padding="none" className="overflow-hidden">
          <div ref={logRef} className="max-h-[600px] overflow-y-auto">
            {filteredLogs.length === 0 ? (
              <EmptyState
                icon={<ScrollText className="w-6 h-6" />}
                title="No activity yet"
                description="Activity logs will appear here as the indexer processes events."
              />
            ) : (
              filteredLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 px-4 py-2.5 hover:bg-[#1C1C22] transition-colors border-b border-[#1E1E26]/50"
                >
                  <span className="font-mono text-xs leading-5 text-[#63637A] whitespace-nowrap tabular-nums">
                    {log.timestamp.toLocaleTimeString('en-US', { hour12: false })}
                  </span>
                  <span
                    className={cn(
                      'inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-bold leading-none tracking-wide uppercase min-w-[44px]',
                      levelColors[log.level].badge
                    )}
                  >
                    {log.level}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-xs leading-5 text-[#EDEDEF]">{log.message}</p>
                    {log.details && (
                      <p className="font-mono text-xs leading-5 text-[#63637A]">{log.details}</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </PageContainer>
  );
}
