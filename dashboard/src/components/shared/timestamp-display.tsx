'use client';

import { formatRelativeTime, formatFullTime } from '@/lib/utils';

interface TimestampDisplayProps {
  timestamp: string | Date;
  className?: string;
}

export function TimestampDisplay({ timestamp, className }: TimestampDisplayProps) {
  return (
    <span
      className={`text-sm leading-5 text-[#A0A0AB] ${className || ''}`}
      title={formatFullTime(timestamp)}
    >
      {formatRelativeTime(timestamp)}
    </span>
  );
}
