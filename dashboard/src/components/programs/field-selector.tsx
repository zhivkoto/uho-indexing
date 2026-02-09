'use client';

import { Badge } from '@/components/ui/badge';

interface Field {
  name: string;
  type: string;
  enabled: boolean;
}

interface FieldSelectorProps {
  eventName: string;
  fields: Field[];
  onChange: (fields: Field[]) => void;
  className?: string;
}

export function FieldSelector({ eventName, fields, onChange, className }: FieldSelectorProps) {
  const toggleField = (index: number) => {
    const updated = fields.map((f, i) =>
      i === index ? { ...f, enabled: !f.enabled } : f
    );
    onChange(updated);
  };

  const toggleAll = (enabled: boolean) => {
    onChange(fields.map((f) => ({ ...f, enabled })));
  };

  const enabledCount = fields.filter((f) => f.enabled).length;

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-medium text-[#EDEDEF]">{eventName}</span>
          <span className="text-xs text-[#63637A]">
            {enabledCount} of {fields.length} fields
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => toggleAll(true)}
            className="text-xs text-[#22D3EE] hover:underline cursor-pointer"
          >
            All
          </button>
          <span className="text-[#3A3A48]">·</span>
          <button
            type="button"
            onClick={() => toggleAll(false)}
            className="text-xs text-[#63637A] hover:text-[#A0A0AB] hover:underline cursor-pointer"
          >
            None
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {fields.map((field, i) => (
          <label
            key={field.name}
            className="flex items-center gap-2.5 p-2.5 rounded-lg border border-[#1E1E26] hover:border-[#2A2A35] transition-colors cursor-pointer"
          >
            <input
              type="checkbox"
              checked={field.enabled}
              onChange={() => toggleField(i)}
              className="rounded border-[#2A2A35] bg-[#23232B] text-[#22D3EE] focus:ring-[#22D3EE]/50 focus:ring-offset-[#09090B]"
            />
            <div className="flex-1 min-w-0">
              <span className="font-mono text-xs text-[#EDEDEF] block truncate">{field.name}</span>
              <span className="text-[10px] text-[#63637A]">{field.type}</span>
            </div>
          </label>
        ))}
      </div>

      {fields.length === 0 && (
        <p className="text-sm text-[#63637A] text-center py-4">No fields available.</p>
      )}
    </div>
  );
}
