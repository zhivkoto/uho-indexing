'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Plus, Trash2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { getPrograms, getProgram, createView } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import type { ProgramInfo, ProgramDetail } from '@/lib/types';

type Step = 'program' | 'event' | 'config' | 'name';

type AggOp = '$count' | '$sum' | '$avg' | '$min' | '$max';

interface SelectColumn {
  alias: string;
  field: string;
  aggregate: AggOp | 'value';
}

const AGG_OPTIONS: { value: AggOp | 'value'; label: string }[] = [
  { value: 'value', label: 'Raw Value' },
  { value: '$count', label: 'COUNT' },
  { value: '$sum', label: 'SUM' },
  { value: '$avg', label: 'AVG' },
  { value: '$min', label: 'MIN' },
  { value: '$max', label: 'MAX' },
];

export function ViewWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('program');
  const [selectedProgramId, setSelectedProgramId] = useState('');
  const [selectedEvent, setSelectedEvent] = useState('');
  const [groupByFields, setGroupByFields] = useState<string[]>([]);
  const [selectColumns, setSelectColumns] = useState<SelectColumn[]>([]);
  const [viewName, setViewName] = useState('');
  const [materialized, setMaterialized] = useState(true);

  // Fetch programs list
  const { data: programsData, isLoading: loadingPrograms } = useQuery({
    queryKey: ['programs'],
    queryFn: getPrograms,
  });

  // Fetch selected program detail for IDL/events
  const { data: programDetail, isLoading: loadingDetail } = useQuery({
    queryKey: ['program', selectedProgramId],
    queryFn: () => getProgram(selectedProgramId),
    enabled: !!selectedProgramId,
  });

  const programs = programsData?.data || [];
  const programOptions = programs.map((p) => ({ value: p.id, label: p.name }));

  // Extract event names from the program
  const eventOptions = useMemo(() => {
    if (!programDetail) return [];
    return programDetail.events
      .filter((e) => e.enabled)
      .map((e) => ({ value: e.name, label: e.name }));
  }, [programDetail]);

  // System columns present in every event/instruction table
  const SYSTEM_FIELDS = [
    { name: 'slot', type: 'u64' },
    { name: 'block_time', type: 'i64' },
    { name: 'tx_signature', type: 'string' },
    { name: 'ix_index', type: 'u32' },
    { name: 'inner_ix_index', type: 'u32' },
  ];

  // Extract fields from the IDL for the selected event
  const eventFields = useMemo(() => {
    if (!programDetail?.idl || !selectedEvent) return [];
    const idl = programDetail.idl as Record<string, unknown>;

    // Try events — check for inline fields first, then look up in types
    const events = (idl.events || []) as Array<{ name: string; fields?: Array<{ name: string; type: unknown }> }>;
    const types = (idl.types || []) as Array<{ name: string; type?: { kind: string; fields?: Array<{ name: string; type: unknown }> } }>;
    const found = events.find((e) => e.name === selectedEvent);
    if (found) {
      // Inline fields (older IDL format)
      let fields = found.fields;
      // If no inline fields, look up in types (newer Anchor IDL format)
      if (!fields || fields.length === 0) {
        const typeDef = types.find((t) => t.name === selectedEvent);
        if (typeDef?.type?.fields) {
          fields = typeDef.type.fields;
        }
      }
      if (fields && fields.length > 0) {
        return [
          ...SYSTEM_FIELDS,
          ...fields.map((f) => ({
            name: f.name,
            type: typeof f.type === 'string' ? f.type : JSON.stringify(f.type),
          })),
        ];
      }
    }

    // Try instructions
    const instructions = (idl.instructions || []) as Array<{
      name: string;
      args?: Array<{ name: string; type: unknown }>;
      accounts?: Array<{ name: string } | string>;
    }>;
    const ix = instructions.find((i) => i.name === selectedEvent);
    if (ix) {
      const ixFields = [
        ...SYSTEM_FIELDS,
        ...(ix.args || []).map((a) => ({
          name: a.name,
          type: typeof a.type === 'string' ? a.type : JSON.stringify(a.type),
        })),
        ...(ix.accounts || []).map((acc) => ({
          name: typeof acc === 'string' ? acc : acc.name,
          type: 'publicKey',
        })),
      ];
      return ixFields;
    }

    // Last resort: check types directly (event might not be in events array)
    const typeDef = types.find((t) => t.name === selectedEvent);
    if (typeDef?.type?.fields) {
      return [
        ...SYSTEM_FIELDS,
        ...typeDef.type.fields.map((f) => ({
          name: f.name,
          type: typeof f.type === 'string' ? f.type : JSON.stringify(f.type),
        })),
      ];
    }

    return SYSTEM_FIELDS;
  }, [programDetail, selectedEvent]);

  const fieldOptions = eventFields.map((f) => ({ value: f.name, label: `${f.name} (${f.type})` }));

  const toggleGroupBy = (field: string) => {
    setGroupByFields((prev) =>
      prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]
    );
  };

  const addSelectColumn = () => {
    setSelectColumns((prev) => [
      ...prev,
      { alias: '', field: fieldOptions[0]?.value || '', aggregate: 'value' },
    ]);
  };

  const updateSelectColumn = (index: number, updates: Partial<SelectColumn>) => {
    setSelectColumns((prev) =>
      prev.map((col, i) => (i === index ? { ...col, ...updates } : col))
    );
  };

  const removeSelectColumn = (index: number) => {
    setSelectColumns((prev) => prev.filter((_, i) => i !== index));
  };

  // Build the definition
  const buildDefinition = () => {
    const select: Record<string, unknown> = {};
    for (const col of selectColumns) {
      const alias = col.alias || col.field;
      if (col.aggregate === 'value') {
        select[alias] = col.field;
      } else {
        select[alias] = { [col.aggregate]: col.aggregate === '$count' ? '*' : col.field };
      }
    }
    return {
      groupBy: groupByFields.length === 1 ? groupByFields[0] : groupByFields,
      select,
    };
  };

  const createMutation = useMutation({
    mutationFn: () =>
      createView({
        userProgramId: selectedProgramId,
        name: viewName,
        source: selectedEvent,
        definition: buildDefinition(),
        materialized,
      }),
    onSuccess: () => {
      toast.success('View created! It will be ready shortly.');
      router.push('/views');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to create view'),
  });

  const isValidName = /^[a-z][a-z0-9_]*$/.test(viewName);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs text-[#63637A]">
        {(['program', 'event', 'config', 'name'] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            {i > 0 && <span className="text-[#3A3A48]">→</span>}
            <span className={step === s ? 'text-[#22D3EE] font-medium' : ''}>
              {s === 'program' ? 'Program' : s === 'event' ? 'Event' : s === 'config' ? 'Configure' : 'Name & Create'}
            </span>
          </div>
        ))}
      </div>

      {/* Step 1: Select Program */}
      {step === 'program' && (
        <Card>
          <h2 className="text-lg font-semibold text-[#EDEDEF] mb-1">Select Program</h2>
          <p className="text-sm text-[#A0A0AB] mb-6">
            Choose which program&apos;s data to build the view from.
          </p>
          {loadingPrograms ? (
            <div className="flex justify-center py-8"><Spinner size="lg" /></div>
          ) : programs.length === 0 ? (
            <p className="text-sm text-[#63637A] text-center py-8">
              No programs available. Add a program first.
            </p>
          ) : (
            <div className="space-y-2">
              {programs.map((p) => (
                <label
                  key={p.id}
                  className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${
                    selectedProgramId === p.id
                      ? 'border-[#22D3EE]/30 bg-[#22D3EE]/5'
                      : 'border-[#1E1E26] hover:border-[#2A2A35]'
                  }`}
                >
                  <input
                    type="radio"
                    name="program"
                    checked={selectedProgramId === p.id}
                    onChange={() => { setSelectedProgramId(p.id); setSelectedEvent(''); }}
                    className="text-[#22D3EE] focus:ring-[#22D3EE]/50"
                  />
                  <div>
                    <span className="text-sm font-medium text-[#EDEDEF]">{p.name}</span>
                    <span className="text-xs text-[#63637A] ml-2">{p.events.length} event types</span>
                  </div>
                  <Badge variant="success" dot className="ml-auto">
                    {p.status}
                  </Badge>
                </label>
              ))}
            </div>
          )}
          <div className="flex justify-end mt-6">
            <Button onClick={() => setStep('event')} disabled={!selectedProgramId}>
              Next <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </Card>
      )}

      {/* Step 2: Select Event */}
      {step === 'event' && (
        <Card>
          <h2 className="text-lg font-semibold text-[#EDEDEF] mb-1">Select Source Event</h2>
          <p className="text-sm text-[#A0A0AB] mb-6">
            Choose which event type to aggregate in this view.
          </p>
          {loadingDetail ? (
            <div className="flex justify-center py-8"><Spinner size="lg" /></div>
          ) : eventOptions.length === 0 ? (
            <p className="text-sm text-[#63637A] text-center py-8">
              No enabled events found for this program.
            </p>
          ) : (
            <div className="space-y-2">
              {eventOptions.map((evt) => (
                <label
                  key={evt.value}
                  className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${
                    selectedEvent === evt.value
                      ? 'border-[#22D3EE]/30 bg-[#22D3EE]/5'
                      : 'border-[#1E1E26] hover:border-[#2A2A35]'
                  }`}
                >
                  <input
                    type="radio"
                    name="event"
                    checked={selectedEvent === evt.value}
                    onChange={() => setSelectedEvent(evt.value)}
                    className="text-[#22D3EE] focus:ring-[#22D3EE]/50"
                  />
                  <span className="font-mono text-sm text-[#EDEDEF]">{evt.label}</span>
                </label>
              ))}
            </div>
          )}
          <div className="flex justify-between mt-6">
            <Button variant="ghost" onClick={() => setStep('program')}>
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
            <Button onClick={() => setStep('config')} disabled={!selectedEvent}>
              Next <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </Card>
      )}

      {/* Step 3: Configure groupBy + select */}
      {step === 'config' && (
        <Card>
          <h2 className="text-lg font-semibold text-[#EDEDEF] mb-1">Configure Aggregation</h2>
          <p className="text-sm text-[#A0A0AB] mb-6">
            Choose fields to group by and select columns with optional aggregation.
          </p>

          {/* Available Fields */}
          <div className="mb-6 p-4 rounded-xl bg-[#09090B] border border-[#1E1E26]">
            <span className="text-[11px] font-semibold tracking-widest uppercase text-[#63637A] block mb-2">
              Available Fields ({eventFields.length})
            </span>
            <div className="flex flex-wrap gap-1.5">
              {eventFields.map((f) => (
                <span
                  key={f.name}
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs bg-[#16161A] border border-[#1E1E26]"
                >
                  <span className="font-mono text-[#EDEDEF]">{f.name}</span>
                  <span className="text-[#63637A]">({f.type})</span>
                </span>
              ))}
            </div>
          </div>

          {/* Group By */}
          <div className="mb-6">
            <label className="text-sm font-medium text-[#EDEDEF] block mb-2">Group By</label>
            <div className="flex flex-wrap gap-2">
              {fieldOptions.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => toggleGroupBy(f.value)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                    groupByFields.includes(f.value)
                      ? 'bg-[#22D3EE]/10 text-[#22D3EE] border border-[#22D3EE]/30'
                      : 'bg-[#16161A] text-[#63637A] border border-[#1E1E26] hover:text-[#A0A0AB]'
                  }`}
                >
                  {f.value}
                </button>
              ))}
            </div>
            {groupByFields.length === 0 && (
              <p className="text-xs text-[#63637A] mt-1.5">
                <AlertCircle className="w-3 h-3 inline mr-1" />
                Select at least one field to group by.
              </p>
            )}
          </div>

          {/* Select Columns */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-[#EDEDEF]">Select Columns</label>
              <Button variant="ghost" size="sm" onClick={addSelectColumn}>
                <Plus className="w-3 h-3" /> Add Column
              </Button>
            </div>
            {selectColumns.length === 0 && (
              <p className="text-xs text-[#63637A] mb-2">
                Add columns to include in the view output.
              </p>
            )}
            <div className="space-y-3">
              {selectColumns.map((col, i) => (
                <div key={i} className="flex items-center gap-2 p-3 rounded-xl bg-[#09090B] border border-[#1E1E26]">
                  <div className="flex-1 grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={col.alias}
                      onChange={(e) => updateSelectColumn(i, { alias: e.target.value })}
                      placeholder="Column name"
                      className="rounded-full bg-[#23232B] border border-[#2A2A35] px-3 py-1.5 text-xs text-[#EDEDEF] placeholder:text-[#63637A] focus:border-[#22D3EE] focus:ring-1 focus:ring-[#22D3EE]/50 focus:outline-none transition-colors"
                    />
                    <select
                      value={col.field}
                      onChange={(e) => updateSelectColumn(i, { field: e.target.value })}
                      className="rounded-full bg-[#23232B] border border-[#2A2A35] px-3 py-1.5 text-xs text-[#EDEDEF] focus:border-[#22D3EE] focus:outline-none transition-colors cursor-pointer"
                    >
                      {fieldOptions.map((f) => (
                        <option key={f.value} value={f.value}>{f.value}</option>
                      ))}
                    </select>
                    <select
                      value={col.aggregate}
                      onChange={(e) => updateSelectColumn(i, { aggregate: e.target.value as AggOp | 'value' })}
                      className="rounded-full bg-[#23232B] border border-[#2A2A35] px-3 py-1.5 text-xs text-[#EDEDEF] focus:border-[#22D3EE] focus:outline-none transition-colors cursor-pointer"
                    >
                      {AGG_OPTIONS.map((a) => (
                        <option key={a.value} value={a.value}>{a.label}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={() => removeSelectColumn(i)}
                    className="text-[#63637A] hover:text-red-400 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep('event')}>
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
            <Button
              onClick={() => setStep('name')}
              disabled={groupByFields.length === 0 || selectColumns.length === 0}
            >
              Next <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </Card>
      )}

      {/* Step 4: Name & Create */}
      {step === 'name' && (
        <Card>
          <h2 className="text-lg font-semibold text-[#EDEDEF] mb-1">Name Your View</h2>
          <p className="text-sm text-[#A0A0AB] mb-6">
            Give the view a unique name. Lowercase, alphanumeric, and underscores only.
          </p>
          <div className="space-y-4 mb-6">
            <div>
              <label className="text-sm font-medium text-[#EDEDEF] block mb-1.5">View Name</label>
              <input
                type="text"
                value={viewName}
                onChange={(e) => setViewName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder="e.g., active_traders"
                className="w-full rounded-full bg-[#23232B] border border-[#2A2A35] px-4 py-2.5 font-mono text-sm text-[#EDEDEF] placeholder:text-[#63637A] hover:border-[#3A3A48] focus:border-[#22D3EE] focus:ring-1 focus:ring-[#22D3EE]/50 focus:outline-none transition-colors duration-150"
              />
              {viewName && !isValidName && (
                <p className="text-xs text-red-400 mt-1">
                  Must start with a letter and contain only lowercase letters, numbers, and underscores.
                </p>
              )}
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={materialized}
                onChange={(e) => setMaterialized(e.target.checked)}
                className="rounded border-[#2A2A35] bg-[#23232B] text-[#22D3EE] focus:ring-[#22D3EE]/50"
              />
              <div>
                <span className="text-sm font-medium text-[#EDEDEF]">Materialized</span>
                <p className="text-xs text-[#63637A]">Pre-computed for faster queries, refreshed periodically</p>
              </div>
            </label>
          </div>

          {/* Preview */}
          <div className="p-4 rounded-xl bg-[#09090B] border border-[#1E1E26] mb-6">
            <span className="text-[11px] font-semibold tracking-widest uppercase text-[#63637A] block mb-2">Preview</span>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-[#63637A]">Source</span>
                <span className="font-mono text-[#67E8F9]">{selectedEvent}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#63637A]">Group By</span>
                <span className="font-mono text-[#EDEDEF]">{groupByFields.join(', ')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#63637A]">Columns</span>
                <span className="font-mono text-[#EDEDEF]">{selectColumns.map((c) => c.alias || c.field).join(', ')}</span>
              </div>
            </div>
          </div>

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep('config')}>
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!viewName || !isValidName}
              loading={createMutation.isPending}
            >
              Create View
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
