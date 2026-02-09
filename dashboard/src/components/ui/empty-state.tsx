import { type ReactNode } from 'react';
import { Button } from './button';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6">
      <div className="w-12 h-12 rounded-2xl bg-[#1C1C22] flex items-center justify-center text-[#3A3A48] mb-4">
        {icon}
      </div>
      <h3 className="text-sm font-semibold leading-5 text-[#EDEDEF] mb-1">{title}</h3>
      {description && (
        <p className="text-xs leading-4 text-[#63637A] text-center max-w-[280px] mb-5">
          {description}
        </p>
      )}
      {action && (
        <Button variant="secondary" size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
