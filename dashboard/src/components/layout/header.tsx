'use client';

import { useQuery } from '@tanstack/react-query';
import { getHealth, getStatus } from '@/lib/api';
import { LivePulse } from '@/components/ui/spinner';
import { formatSlot } from '@/lib/utils';

interface HeaderProps {
  title: string;
  children?: React.ReactNode;
}

export function Header({ title, children }: HeaderProps) {
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
    refetchInterval: 5000,
    retry: 1,
  });

  const { data: status } = useQuery({
    queryKey: ['status'],
    queryFn: getStatus,
    refetchInterval: 5000,
    retry: 1,
  });

  const isHealthy = health?.status === 'ok' || health?.status === 'healthy';
  const currentSlot = status?.indexer?.currentSlot;

  return (
    <header className="h-14 bg-[#0F0F12]/80 backdrop-blur-md border-b border-[#1E1E26] flex items-center justify-between px-6 sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <h1 className="text-[15px] font-semibold leading-5 text-[#EDEDEF]">{title}</h1>
        {children}
      </div>

      <div className="flex items-center gap-4">
        {health ? (
          <LivePulse
            label={isHealthy ? 'Healthy' : 'Down'}
            color={isHealthy ? 'success' : 'error'}
          />
        ) : (
          <LivePulse label="Offline" color="error" />
        )}

        {currentSlot && (
          <>
            <span className="text-xs text-[#63637A]">
              Slot <span className="font-mono text-[#A0A0AB]">{formatSlot(currentSlot)}</span>
            </span>
            <div className="w-px h-5 bg-[#1E1E26]" />
          </>
        )}
      </div>
    </header>
  );
}
