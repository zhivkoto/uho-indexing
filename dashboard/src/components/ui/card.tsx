import { type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type CardVariant = 'default' | 'interactive' | 'inset';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  children: ReactNode;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const variantClasses: Record<CardVariant, string> = {
  default: 'bg-[#0F0F12] border border-[#1E1E26] shadow-card',
  interactive: 'bg-[#0F0F12] border border-[#1E1E26] hover:border-[#22D3EE]/30 hover:shadow-accent-glow transition-all duration-200 cursor-pointer',
  inset: 'bg-[#09090B]',
};

const paddingClasses = {
  none: '',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
};

export function Card({ variant = 'default', padding = 'lg', children, className, ...props }: CardProps) {
  return (
    <div
      className={cn('rounded-xl', variantClasses[variant], paddingClasses[padding], className)}
      {...props}
    >
      {children}
    </div>
  );
}

// Stat card for dashboard
interface StatCardProps {
  label: string;
  value: string;
  icon?: ReactNode;
  trend?: { value: string; positive: boolean } | null;
  loading?: boolean;
}

export function StatCard({ label, value, icon, trend, loading }: StatCardProps) {
  if (loading) {
    return (
      <div className="rounded-xl bg-[#0F0F12] border border-[#1E1E26] p-5">
        <div className="h-3 w-20 rounded bg-[#2A2A35] animate-pulse mb-3" />
        <div className="h-8 w-32 rounded bg-[#2A2A35] animate-pulse mb-2" />
        <div className="h-3 w-24 rounded bg-[#2A2A35] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-[#0F0F12] border border-[#1E1E26] p-5 hover:border-[#2A2A35] hover:shadow-card-hover transition-all duration-200 group">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-semibold leading-[14px] tracking-widest uppercase text-[#63637A]">
          {label}
        </span>
        {icon && (
          <span className="w-8 h-8 rounded-lg bg-[#164E63]/20 flex items-center justify-center text-[#22D3EE]">
            {icon}
          </span>
        )}
      </div>
      <div className="font-mono text-[32px] font-bold leading-9 tracking-tight text-[#EDEDEF]">
        {value}
      </div>
      {trend && (
        <div className={cn(
          'mt-2 flex items-center gap-1.5 text-xs leading-4',
          trend.positive ? 'text-emerald-400' : 'text-red-400'
        )}>
          <span>{trend.positive ? '↑' : '↓'} {trend.value}</span>
        </div>
      )}
    </div>
  );
}
