'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Upload, Search, Check, AlertCircle, Info } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import Link from 'next/link';
import { discoverIdl, createProgram } from '@/lib/api';
import { PageContainer } from '@/components/layout/page-container';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { isValidPublicKey } from '@/lib/utils';

type Step = 'program-id' | 'idl' | 'events' | 'review';

interface EventSelection {
  name: string;
  type: 'event' | 'instruction';
  enabled: boolean;
  fields: Array<{ name: string; type: string }>;
}

export default function AddProgramPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('program-id');
  const [programId, setProgramId] = useState('');
  const [programName, setProgramName] = useState('');
  const [idl, setIdl] = useState<object | null>(null);
  const [idlSource, setIdlSource] = useState<string>('');
  const [events, setEvents] = useState<EventSelection[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [includeHistoricalData, setIncludeHistoricalData] = useState(false);
  const [startFromSlot, setStartFromSlot] = useState('');

  // Step 1: Discover IDL
  const handleDiscover = async () => {
    if (!isValidPublicKey(programId)) {
      toast.error('Invalid Solana program ID');
      return;
    }
    setDiscovering(true);
    try {
      const result = await discoverIdl(programId);
      if (result.found && result.idl) {
        setIdl(result.idl);
        setIdlSource(result.source);
        const evts: EventSelection[] = (result.events || []).map((e) => ({
          name: e.name,
          type: e.type as 'event' | 'instruction',
          enabled: true,
          fields: e.fields,
        }));
        setEvents(evts);
        // Try to get name from IDL
        const idlAny = result.idl as Record<string, unknown>;
        const meta = idlAny.metadata as Record<string, unknown> | undefined;
        setProgramName((meta?.name as string) || (idlAny.name as string) || '');
        setStep('events');
        toast.success(`IDL found via ${result.source}`);
      } else {
        toast.info(result.message || 'IDL not found. Please upload manually.');
        setStep('idl');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Discovery failed');
      setStep('idl');
    } finally {
      setDiscovering(false);
    }
  };

  // Step 2: Manual IDL upload
  const handleIdlUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('IDL file must be under 5MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        setIdl(parsed);
        setIdlSource('manual');
        // Extract events from IDL
        const idlEvents: EventSelection[] = [];
        if (parsed.events) {
          for (const event of parsed.events) {
            idlEvents.push({
              name: event.name,
              type: 'event',
              enabled: true,
              fields: (event.fields || []).map((f: { name: string; type: unknown }) => ({
                name: f.name,
                type: typeof f.type === 'string' ? f.type : JSON.stringify(f.type),
              })),
            });
          }
        }
        if (parsed.instructions) {
          for (const ix of parsed.instructions) {
            if (ix.args?.length > 0) {
              idlEvents.push({
                name: ix.name,
                type: 'instruction',
                enabled: false,
                fields: (ix.args || []).map((a: { name: string; type: unknown }) => ({
                  name: a.name,
                  type: typeof a.type === 'string' ? a.type : JSON.stringify(a.type),
                })),
              });
            }
          }
        }
        setEvents(idlEvents);
        const meta = parsed.metadata as Record<string, unknown> | undefined;
        if (!programName) setProgramName((meta?.name as string) || (parsed.name as string) || '');
        setStep('events');
        toast.success('IDL parsed successfully');
      } catch {
        toast.error('Invalid JSON file');
      }
    };
    reader.readAsText(file);
  }, [programName]);

  const toggleEvent = (idx: number) => {
    setEvents((prev) => prev.map((e, i) => i === idx ? { ...e, enabled: !e.enabled } : e));
  };

  const enabledEvents = events.filter((e) => e.enabled);

  // Step 4: Create
  const createMutation = useMutation({
    mutationFn: () =>
      createProgram({
        programId,
        name: programName || undefined,
        idl: idl!,
        events: events.map((e) => ({ name: e.name, type: e.type, enabled: e.enabled })),
        includeHistoricalData,
        startFromSlot: startFromSlot && !isNaN(Number(startFromSlot)) ? Number(startFromSlot) : undefined,
      }),
    onSuccess: (result) => {
      toast.success('Program created! Indexing will start shortly.');
      router.push(`/programs/${result.id}`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to create program'),
  });

  return (
    <PageContainer
      title="Add Program"
      headerChildren={
        <Link href="/programs" className="inline-flex items-center gap-1.5 text-xs text-[#A0A0AB] hover:text-[#EDEDEF] transition-colors ml-3">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Programs
        </Link>
      }
    >
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Step indicator */}
        <div className="flex items-center gap-2 text-xs text-[#63637A]">
          {(['program-id', 'idl', 'events', 'review'] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <span className="text-[#3A3A48]">→</span>}
              <span className={step === s ? 'text-[#22D3EE] font-medium' : ''}>
                {s === 'program-id' ? 'Program ID' : s === 'idl' ? 'Upload IDL' : s === 'events' ? 'Select Events' : 'Review'}
              </span>
            </div>
          ))}
        </div>

        {/* Step 1: Program ID */}
        {step === 'program-id' && (
          <Card>
            <h2 className="text-lg font-semibold text-[#EDEDEF] mb-1">Enter Program ID</h2>
            <p className="text-sm text-[#A0A0AB] mb-6">
              Paste the Solana program address you want to index.
            </p>
            <div className="space-y-4">
              <input
                type="text"
                value={programId}
                onChange={(e) => setProgramId(e.target.value.trim())}
                placeholder="e.g., 675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"
                className="w-full rounded-full bg-[#23232B] border border-[#2A2A35] px-4 py-2.5 font-mono text-sm text-[#EDEDEF] placeholder:text-[#63637A] hover:border-[#3A3A48] focus:border-[#22D3EE] focus:ring-1 focus:ring-[#22D3EE]/50 focus:outline-none transition-colors duration-150"
              />
              {programId && !isValidPublicKey(programId) && (
                <p className="text-xs text-red-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Invalid Solana program address
                </p>
              )}
              <div className="flex justify-end">
                <Button
                  onClick={() => setStep('idl')}
                  disabled={!isValidPublicKey(programId)}
                >
                  Next <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Step 2: Manual IDL Upload */}
        {step === 'idl' && (
          <Card>
            <h2 className="text-lg font-semibold text-[#EDEDEF] mb-1">Load IDL</h2>
            <p className="text-sm text-[#A0A0AB] mb-6">
              Discover the IDL on-chain or upload it manually.
            </p>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <button
                onClick={handleDiscover}
                disabled={discovering}
                className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-[#2A2A35] rounded-xl hover:border-[#22D3EE]/50 transition-colors cursor-pointer"
              >
                {discovering ? <Spinner size="md" /> : <Search className="w-8 h-8 text-[#22D3EE] mb-3" />}
                <span className="text-sm font-medium text-[#EDEDEF]">Discover IDL</span>
                <span className="text-xs text-[#63637A] mt-1">Auto-detect from on-chain</span>
              </button>
              <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-[#2A2A35] rounded-xl hover:border-[#22D3EE]/50 transition-colors cursor-pointer">
                <Upload className="w-8 h-8 text-[#63637A] mb-3" />
                <span className="text-sm font-medium text-[#EDEDEF]">Upload IDL</span>
                <span className="text-xs text-[#63637A] mt-1">Anchor IDL JSON · Max 5MB</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleIdlUpload}
                  className="hidden"
                />
              </label>
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep('program-id')}>
                <ArrowLeft className="w-4 h-4" /> Back
              </Button>
            </div>
          </Card>
        )}

        {/* Step 3: Event Selection */}
        {step === 'events' && (
          <Card>
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-semibold text-[#EDEDEF]">Select Events to Index</h2>
              <Badge variant="accent">{idlSource}</Badge>
            </div>
            <p className="text-sm text-[#A0A0AB] mb-6">
              Choose which events and instructions to capture. You can change this later.
            </p>
            <div className="space-y-1.5 mb-6">
              <div>
                <label className="text-sm font-medium text-[#EDEDEF] block mb-1.5">Program Name</label>
                <input
                  type="text"
                  value={programName}
                  onChange={(e) => setProgramName(e.target.value)}
                  placeholder="e.g., raydium_amm"
                  className="w-full rounded-full bg-[#23232B] border border-[#2A2A35] px-4 py-2.5 text-sm text-[#EDEDEF] placeholder:text-[#63637A] hover:border-[#3A3A48] focus:border-[#22D3EE] focus:ring-1 focus:ring-[#22D3EE]/50 focus:outline-none transition-colors duration-150"
                />
              </div>
            </div>
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
                          <span key={f.name} className="text-[10px] font-mono text-[#63637A] bg-[#16161A] rounded px-1.5 py-0.5">
                            {f.name}: {f.type}
                          </span>
                        ))}
                        {evt.fields.length > 6 && (
                          <span className="text-[10px] text-[#63637A]">+{evt.fields.length - 6} more</span>
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

            {/* Data Source */}
            {events.length > 0 && (
              <div className="mt-6 pt-6 border-t border-[#1E1E26]">
                <h3 className="text-[15px] font-semibold text-[#EDEDEF] mb-3">Data Source</h3>
                <div className="space-y-3">
                  {/* Real-time — always on */}
                  <div className="flex items-center gap-3 p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04]">
                    <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 text-emerald-400" />
                    </div>
                    <div className="flex-1">
                      <span className="text-sm font-medium text-[#EDEDEF]">Real-time indexing</span>
                      <p className="text-xs text-[#63637A] mt-0.5">Captures new events as they happen on-chain.</p>
                    </div>
                    <Badge variant="success">Always on</Badge>
                  </div>

                  {/* Historical toggle */}
                  <div className={`p-3 rounded-xl border transition-colors ${includeHistoricalData ? 'border-[#22D3EE]/20 bg-[#22D3EE]/[0.04]' : 'border-[#1E1E26] hover:border-[#2A2A35]'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <span className="text-sm font-medium text-[#EDEDEF]">Historical backfill</span>
                        <p className="text-xs text-[#63637A] mt-0.5">Fetch past events from the Solana archive.</p>
                      </div>
                      <button
                        onClick={() => setIncludeHistoricalData(!includeHistoricalData)}
                        className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ml-3 ${includeHistoricalData ? 'bg-[#22D3EE]' : 'bg-[#2A2A35]'}`}
                      >
                        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${includeHistoricalData ? 'left-[22px]' : 'left-0.5'}`} />
                      </button>
                    </div>

                    {includeHistoricalData && (
                      <div className="mt-3 space-y-3">
                        <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-[rgba(34,211,238,0.06)] border border-[rgba(34,211,238,0.12)]">
                          <Info className="w-3.5 h-3.5 text-[#22D3EE] mt-0.5 shrink-0" />
                          <p className="text-xs text-[#A0A0AB] leading-relaxed">
                            <span className="text-[#22D3EE] font-medium">Demo limit:</span> backfill covers the last ~2,000 slots (~13 minutes of chain history). Full archival backfill available in production.
                          </p>
                        </div>
                        <div className="p-2.5 rounded-lg bg-[#16161A] border border-[#1E1E26]">
                          <label className="text-xs text-[#63637A] block mb-1.5">
                            Start from slot <span className="text-[#A0A0AB]">(optional)</span>
                          </label>
                          <input
                            type="number"
                            value={startFromSlot}
                            onChange={(e) => setStartFromSlot(e.target.value)}
                            placeholder="Auto-detect from program deployment"
                            className="w-full rounded-lg bg-[#23232B] border border-[#2A2A35] px-3 py-2 font-mono text-xs text-[#EDEDEF] placeholder:text-[#63637A] hover:border-[#3A3A48] focus:border-[#22D3EE] focus:ring-1 focus:ring-[#22D3EE]/50 focus:outline-none transition-colors duration-150"
                          />
                          <p className="text-[10px] text-[#63637A] mt-1">
                            Useful if the program was upgraded and you only want events from a specific version.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-between mt-6">
              <Button variant="ghost" onClick={() => setStep('program-id')}>
                <ArrowLeft className="w-4 h-4" /> Back
              </Button>
              <Button
                onClick={() => setStep('review')}
                disabled={enabledEvents.length === 0}
              >
                Review <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </Card>
        )}

        {/* Step 4: Review & Create */}
        {step === 'review' && (
          <Card>
            <h2 className="text-lg font-semibold text-[#EDEDEF] mb-6">Review & Create</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between py-3 border-b border-[#1E1E26]">
                <span className="text-sm text-[#63637A]">Program ID</span>
                <span className="font-mono text-sm text-[#67E8F9]">{programId.slice(0, 12)}...{programId.slice(-4)}</span>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-[#1E1E26]">
                <span className="text-sm text-[#63637A]">Name</span>
                <span className="text-sm text-[#EDEDEF]">{programName || '(auto)'}</span>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-[#1E1E26]">
                <span className="text-sm text-[#63637A]">IDL Source</span>
                <Badge variant="accent">{idlSource}</Badge>
              </div>
              <div className="py-3">
                <span className="text-sm text-[#63637A] block mb-2">
                  Events to index ({enabledEvents.length})
                </span>
                <div className="flex flex-wrap gap-2">
                  {enabledEvents.map((e) => (
                    <Badge key={e.name} variant={e.type === 'event' ? 'accent' : 'info'}>
                      <Check className="w-3 h-3" /> {e.name}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Data Source Summary */}
              <div className="flex items-center justify-between py-3 border-t border-[#1E1E26]">
                <span className="text-sm text-[#63637A]">Data Source</span>
                <div className="flex items-center gap-2">
                  <Badge variant="success">Real-time</Badge>
                  {includeHistoricalData && <Badge variant="accent">+ Historical backfill</Badge>}
                </div>
              </div>
              {includeHistoricalData && startFromSlot && (
                <div className="flex items-center justify-between py-3 border-t border-[#1E1E26]">
                  <span className="text-sm text-[#63637A]">Start Slot</span>
                  <span className="font-mono text-sm text-[#EDEDEF]">{Number(startFromSlot).toLocaleString()}</span>
                </div>
              )}
            </div>
            <div className="flex justify-between mt-6">
              <Button variant="ghost" onClick={() => setStep('events')}>
                <ArrowLeft className="w-4 h-4" /> Back
              </Button>
              <Button
                onClick={() => createMutation.mutate()}
                loading={createMutation.isPending}
              >
                Create Program
              </Button>
            </div>
          </Card>
        )}
      </div>
    </PageContainer>
  );
}
