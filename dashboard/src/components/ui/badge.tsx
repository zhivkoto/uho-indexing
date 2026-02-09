import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'default' | 'accent';

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  dot?: boolean;
  pulse?: boolean;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  success: 'bg-emerald-900/20 border-emerald-500/20 text-emerald-400',
  warning: 'bg-amber-900/20 border-amber-500/20 text-amber-400',
  error: 'bg-red-900/20 border-red-500/20 text-red-400',
  info: 'bg-blue-900/20 border-blue-500/20 text-blue-400',
  default: 'bg-[#2A2A35] border-[#3A3A48] text-[#A0A0AB]',
  accent: 'bg-[#164E63]/20 border-[#22D3EE]/20 text-[#67E8F9]',
};

const dotVariantClasses: Record<BadgeVariant, string> = {
  success: 'bg-emerald-400',
  warning: 'bg-amber-400',
  error: 'bg-red-400',
  info: 'bg-blue-400',
  default: 'bg-[#63637A]',
  accent: 'bg-[#22D3EE]',
};

export function Badge({ variant = 'default', children, dot = false, pulse = false, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 border text-xs font-medium leading-4',
        variantClasses[variant],
        className
      )}
    >
      {dot && (
        <span
          className={cn(
            'w-1.5 h-1.5 rounded-full',
            dotVariantClasses[variant],
            pulse && 'animate-pulse'
          )}
        />
      )}
      {children}
    </span>
  );
}

// Event type tag
export function EventTag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 bg-[#164E63]/20 border border-[#22D3EE]/20 font-mono text-xs leading-4 text-[#67E8F9]',
        className
      )}
    >
      {children}
    </span>
  );
}

// Count badge for sidebar
export function CountBadge({ count, variant = 'accent' }: { count: number; variant?: 'accent' | 'error' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full min-w-[20px] h-5 px-1.5 font-mono text-[10px] font-semibold leading-none',
        variant === 'accent' ? 'bg-[#22D3EE]/15 text-[#22D3EE]' : 'bg-red-900/30 text-red-400'
      )}
    >
      {count}
    </span>
  );
}
