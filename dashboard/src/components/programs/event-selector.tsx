'use client';

import { Badge } from '@/components/ui/badge';

interface EventItem {
  name: string;
  type: 'event' | 'instruction';
  enabled: boolean;
  fields: Array<{ name: string; type: string }>;
}

interface EventSelectorProps {
  events: EventItem[];
  onChange: (events: EventItem[]) => void;
  className?: string;
}

export function EventSelector({ events, onChange, className }: EventSelectorProps) {
  const toggleEvent = (index: number) => {
    const updated = events.map((e, i) =>
      i === index ? { ...e, enabled: !e.enabled } : e
    );
    onChange(updated);
  };

  const toggleAll = (enabled: boolean) => {
    onChange(events.map((e) => ({ ...e, enabled })));
  };

  const enabledCount = events.filter((e) => e.enabled).length;

  return (
    <div className={className}>
      {/* Header with select/deselect all */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-[#63637A]">
          {enabledCount} of {events.length} selected
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => toggleAll(true)}
            className="text-xs text-[#22D3EE] hover:underline cursor-pointer"
          >
            Select all
          </button>
          <span className="text-[#3A3A48]">·</span>
          <button
            type="button"
            onClick={() => toggleAll(false)}
            className="text-xs text-[#63637A] hover:text-[#A0A0AB] hover:underline cursor-pointer"
          >
            Deselect all
          </button>
        </div>
      </div>

      {/* Event list */}
      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {events.map((evt, i) => (
          <label
            key={`${evt.name}-${evt.type}`}
            className="flex items-start gap-3 p-3 rounded-xl border border-[#1E1E26] hover:border-[#2A2A35] transition-colors cursor-pointer"
          >
            <input
              type="checkbox"
              checked={evt.enabled}
              onChange={() => toggleEvent(i)}
              className="mt-0.5 rounded border-[#2A2A35] bg-[#23232B] text-[#22D3EE] focus:ring-[#22D3EE]/50 focus:ring-offset-[#09090B]"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-medium text-[#EDEDEF]">{evt.name}</span>
                <Badge variant={evt.type === 'event' ? 'accent' : 'info'}>
                  {evt.type}
                </Badge>
              </div>
              {evt.fields.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {evt.fields.slice(0, 6).map((f) => (
                    <span
                      key={f.name}
                      className="text-[10px] font-mono text-[#63637A] bg-[#16161A] rounded px-1.5 py-0.5"
                    >
                      {f.name}: {f.type}
                    </span>
                  ))}
                  {evt.fields.length > 6 && (
                    <span className="text-[10px] text-[#63637A]">
                      +{evt.fields.length - 6} more
                    </span>
                  )}
                </div>
              )}
            </div>
          </label>
        ))}
      </div>

      {events.length === 0 && (
        <p className="text-sm text-[#63637A] text-center py-8">
          No events or instructions found in the IDL.
        </p>
      )}
    </div>
  );
}
