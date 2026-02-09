'use client';

import { cn } from '@/lib/utils';

interface Tab {
  value: string;
  label: string;
  count?: number;
}

interface TabsProps {
  tabs: Tab[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function Tabs({ tabs, value, onChange, className }: TabsProps) {
  return (
    <div className={cn('border-b border-[#1E1E26]', className)}>
      <nav className="flex gap-0 -mb-px">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => onChange(tab.value)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium leading-5 border-b-2 transition-colors duration-150 cursor-pointer',
              tab.value === value
                ? 'text-[#22D3EE] border-[#22D3EE]'
                : 'text-[#63637A] border-transparent hover:text-[#A0A0AB] hover:border-[#2A2A35]',
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className={cn(
                'ml-2 inline-flex items-center justify-center rounded-full min-w-[20px] h-5 px-1.5 font-mono text-[10px] font-semibold leading-none',
                tab.value === value
                  ? 'bg-[#22D3EE]/15 text-[#22D3EE]'
                  : 'bg-[#2A2A35] text-[#63637A]',
              )}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}
