import { cn } from '@/lib/utils';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-8 h-8',
};

export function Spinner({ size = 'md', className }: SpinnerProps) {
  return (
    <div
      className={cn(
        'border-2 border-[#2A2A35] border-t-[#22D3EE] rounded-full animate-spin',
        sizeClasses[size],
        className
      )}
    />
  );
}

export function LivePulse({ label = 'Live', color = 'accent' }: { label?: string; color?: 'accent' | 'success' | 'error' }) {
  const colorMap = {
    accent: { bg: 'bg-[#22D3EE]', text: 'text-[#22D3EE]' },
    success: { bg: 'bg-emerald-400', text: 'text-emerald-400' },
    error: { bg: 'bg-red-400', text: 'text-red-400' },
  };

  const c = colorMap[color];

  return (
    <div className="flex items-center gap-2">
      <span className="relative flex h-2.5 w-2.5">
        <span className={cn('animate-ping absolute inline-flex h-full w-full rounded-full opacity-50', c.bg)} />
        <span className={cn('relative inline-flex rounded-full h-2.5 w-2.5', c.bg)} />
      </span>
      <span className={cn('text-xs font-medium', c.text)}>{label}</span>
    </div>
  );
}
