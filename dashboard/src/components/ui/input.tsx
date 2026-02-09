'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { Search } from 'lucide-react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, icon = false, ...props }, ref) => {
    return (
      <div className="relative">
        <input
          ref={ref}
          className={cn(
            'w-full rounded-full',
            'bg-[#23232B] border border-[#2A2A35]',
            icon ? 'px-4 py-2.5 pl-10' : 'px-4 py-2.5',
            'text-sm leading-5 text-[#EDEDEF]',
            'placeholder:text-[#63637A]',
            'hover:border-[#3A3A48]',
            'focus:border-[#22D3EE] focus:ring-1 focus:ring-[#22D3EE]/50',
            'focus:outline-none',
            'transition-colors duration-150',
            className
          )}
          {...props}
        />
        {icon && (
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#63637A]">
            <Search className="w-4 h-4" />
          </div>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

// Slot/Date range input (smaller)
export const RangeInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          'w-32 rounded-full',
          'bg-[#23232B] border border-[#2A2A35]',
          'px-3.5 py-2',
          'font-mono text-xs leading-4 text-[#EDEDEF]',
          'placeholder:text-[#63637A]',
          'focus:border-[#22D3EE] focus:ring-1 focus:ring-[#22D3EE]/50',
          'focus:outline-none',
          'transition-colors duration-150',
          className
        )}
        {...props}
      />
    );
  }
);

RangeInput.displayName = 'RangeInput';
