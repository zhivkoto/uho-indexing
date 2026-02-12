'use client';

import { X } from 'lucide-react';
import { Input, RangeInput } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

interface FilterBarProps {
  programs: { value: string; label: string }[];
  eventTypes: { value: string; label: string }[];
  selectedProgram: string;
  selectedEvent: string;
  search: string;
  slotFrom: string;
  slotTo: string;
  onProgramChange: (value: string) => void;
  onEventChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onSlotFromChange: (value: string) => void;
  onSlotToChange: (value: string) => void;
  onClearFilters: () => void;
}

export function FilterBar({
  programs,
  eventTypes,
  selectedProgram,
  selectedEvent,
  search,
  slotFrom,
  slotTo,
  onProgramChange,
  onEventChange,
  onSearchChange,
  onSlotFromChange,
  onSlotToChange,
  onClearFilters,
}: FilterBarProps) {
  const hasFilters = selectedProgram || selectedEvent || search || slotFrom || slotTo;

  return (
    <div className="flex flex-col gap-3 p-4 rounded-xl bg-[#0F0F12] border border-[#1E1E26]">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <Input
            icon
            placeholder="Search events..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        <Select
          options={programs}
          value={selectedProgram}
          onChange={onProgramChange}
        />

        <Select
          options={eventTypes}
          value={selectedEvent}
          onChange={onEventChange}
        />

        <div className="flex items-center gap-2">
          <RangeInput
            placeholder="From slot"
            value={slotFrom}
            onChange={(e) => onSlotFromChange(e.target.value)}
          />
          <span className="text-[#63637A] text-xs">→</span>
          <RangeInput
            placeholder="To slot"
            value={slotTo}
            onChange={(e) => onSlotToChange(e.target.value)}
          />
        </div>
      </div>

      {/* Active filter chips */}
      {hasFilters && (
        <div className="flex items-center gap-2 flex-wrap">
          {selectedProgram && (
            <FilterChip label={`program: ${selectedProgram}`} onRemove={() => onProgramChange('')} />
          )}
          {selectedEvent && (
            <FilterChip label={`event: ${selectedEvent}`} onRemove={() => onEventChange('')} />
          )}
          {slotFrom && (
            <FilterChip label={`from: #${slotFrom}`} onRemove={() => onSlotFromChange('')} />
          )}
          {slotTo && (
            <FilterChip label={`to: #${slotTo}`} onRemove={() => onSlotToChange('')} />
          )}
          <button
            onClick={onClearFilters}
            className="text-xs text-[#63637A] hover:text-[#EDEDEF] transition-colors cursor-pointer"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 bg-[#22D3EE]/10 border border-[#22D3EE]/20 text-xs font-medium text-[#22D3EE]">
      {label}
      <button
        onClick={onRemove}
        className="hover:text-[#EDEDEF] transition-colors cursor-pointer"
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}
