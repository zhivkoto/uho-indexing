'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'icon';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
  loading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: `
    bg-[#22D3EE] text-[#09090B]
    hover:bg-[#06B6D4] active:bg-[#0891B2]
    disabled:bg-[#2A2A35] disabled:text-[#3A3A48] disabled:cursor-not-allowed
    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22D3EE] focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090B]
  `,
  secondary: `
    bg-transparent border border-[#2A2A35] text-[#EDEDEF]
    hover:bg-[#1C1C22] hover:border-[#3A3A48] active:bg-[#23232B]
    disabled:border-[#1E1E26] disabled:text-[#3A3A48] disabled:cursor-not-allowed
    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22D3EE] focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090B]
  `,
  ghost: `
    bg-transparent text-[#A0A0AB]
    hover:bg-[#1C1C22] hover:text-[#EDEDEF] active:bg-[#23232B]
    disabled:text-[#3A3A48] disabled:cursor-not-allowed
  `,
  danger: `
    bg-red-500/10 border border-red-500/20 text-red-400
    hover:bg-red-500/20 hover:border-red-500/30 active:bg-red-500/30
    disabled:bg-[#2A2A35] disabled:text-[#3A3A48] disabled:border-transparent disabled:cursor-not-allowed
  `,
  icon: `
    bg-transparent text-[#A0A0AB]
    hover:bg-[#1C1C22] hover:text-[#EDEDEF] active:bg-[#23232B]
  `,
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3.5 py-1.5 text-xs',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-6 py-3 text-sm',
};

const iconSizeClasses: Record<ButtonSize, string> = {
  sm: 'w-7 h-7',
  md: 'w-9 h-9',
  lg: 'w-11 h-11',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', children, loading, className, disabled, ...props }, ref) => {
    const isIcon = variant === 'icon';

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-full font-semibold leading-5 transition-colors duration-150 cursor-pointer',
          variantClasses[variant],
          isIcon ? iconSizeClasses[size] : sizeClasses[size],
          loading && 'opacity-80 cursor-wait',
          className
        )}
        {...props}
      >
        {loading && (
          <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
