import { formatSlot } from '@/lib/utils';

interface SlotDisplayProps {
  slot: number;
  abbreviated?: boolean;
  className?: string;
}

export function SlotDisplay({ slot, abbreviated = false, className }: SlotDisplayProps) {
  return (
    <span
      className={`font-mono text-[13px] leading-5 text-[#EDEDEF] ${className || ''}`}
      title={formatSlot(slot)}
    >
      {formatSlot(slot, abbreviated)}
    </span>
  );
}
