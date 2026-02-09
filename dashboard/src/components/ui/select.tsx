'use client';

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function Select({ options, value, onChange, placeholder = 'Select...', className }: SelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selectedLabel = options.find((o) => o.value === value)?.label || placeholder;

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'inline-flex items-center justify-between gap-2',
          'rounded-full',
          'bg-[#23232B] border border-[#2A2A35]',
          'px-4 py-2.5',
          'text-sm leading-5 text-[#EDEDEF]',
          'hover:border-[#3A3A48]',
          'focus:border-[#22D3EE] focus:ring-1 focus:ring-[#22D3EE]/50',
          'focus:outline-none',
          'transition-colors duration-150',
          'min-w-[180px] cursor-pointer'
        )}
      >
        <span className={value ? '' : 'text-[#63637A]'}>{selectedLabel}</span>
        <ChevronDown className={cn('w-4 h-4 text-[#63637A] transition-transform duration-150', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 min-w-[200px] w-full rounded-xl bg-[#16161A] border border-[#1E1E26] shadow-modal py-1 animate-in fade-in-0">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 text-sm leading-5 transition-colors duration-100 cursor-pointer',
                option.value === value
                  ? 'text-[#22D3EE] bg-[#22D3EE]/5'
                  : 'text-[#A0A0AB] hover:bg-[#1C1C22] hover:text-[#EDEDEF]'
              )}
            >
              {option.value === value && <Check className="w-4 h-4" />}
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Pill tabs for chart time ranges
interface PillTabsProps {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}

export function PillTabs({ options, value, onChange }: PillTabsProps) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-full bg-[#16161A] p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-150 cursor-pointer',
            option.value === value
              ? 'bg-[#22D3EE]/10 text-[#22D3EE]'
              : 'text-[#63637A] hover:text-[#A0A0AB]'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
