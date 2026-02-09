'use client';

import { useState, useMemo } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Copy, Check, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { createWebhook, getProgram } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge, EventTag } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { copyToClipboard } from '@/lib/utils';
import type { ProgramInfo, WebhookCreated } from '@/lib/types';

interface WebhookFormProps {
  programs: ProgramInfo[];
  onSuccess: () => void;
  onCancel: () => void;
}

export function WebhookForm({ programs, onSuccess, onCancel }: WebhookFormProps) {
  const [selectedProgramId, setSelectedProgramId] = useState(programs[0]?.id || '');
  const [url, setUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [createdWebhook, setCreatedWebhook] = useState<WebhookCreated | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

  const programOptions = programs.map((p) => ({ value: p.id, label: p.name }));

  // Fetch program detail for event list
  const { data: programDetail } = useQuery({
    queryKey: ['program', selectedProgramId],
    queryFn: () => getProgram(selectedProgramId),
    enabled: !!selectedProgramId,
  });

  const availableEvents = useMemo(() => {
    if (!programDetail) return [];
    return programDetail.events.filter((e) => e.enabled).map((e) => e.name);
  }, [programDetail]);

  const toggleEvent = (event: string) => {
    setSelectedEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  };

  const isValidUrl = url.startsWith('http://') || url.startsWith('https://');

  const createMutation = useMutation({
    mutationFn: () =>
      createWebhook({
        userProgramId: selectedProgramId,
        url,
        events: selectedEvents.length > 0 ? selectedEvents : undefined,
      }),
    onSuccess: (result) => {
      setCreatedWebhook(result);
      toast.success('Webhook created!');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to create webhook'),
  });

  const handleCopySecret = async () => {
    if (createdWebhook?.secret) {
      await copyToClipboard(createdWebhook.secret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    }
  };

  // After creation — show the secret
  if (createdWebhook) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-900/10 border border-amber-500/20">
          <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-200">
            Save this signing secret now. It will not be shown again.
          </p>
        </div>

        <div>
          <label className="text-xs font-medium text-[#63637A] block mb-1">Webhook URL</label>
          <p className="font-mono text-sm text-[#67E8F9] break-all">{createdWebhook.url}</p>
        </div>

        <div>
          <label className="text-xs font-medium text-[#63637A] block mb-1">Signing Secret</label>
          <div className="flex items-center gap-2 p-3 rounded-xl bg-[#09090B] border border-[#1E1E26]">
            <code className="font-mono text-xs text-[#22D3EE] flex-1 break-all">{createdWebhook.secret}</code>
            <button
              onClick={handleCopySecret}
              className="text-[#63637A] hover:text-[#22D3EE] transition-colors flex-shrink-0 cursor-pointer"
            >
              {copiedSecret ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {createdWebhook.events.length > 0 && (
          <div>
            <label className="text-xs font-medium text-[#63637A] block mb-1">Events</label>
            <div className="flex flex-wrap gap-1.5">
              {createdWebhook.events.map((e) => (
                <EventTag key={e}>{e}</EventTag>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button onClick={onSuccess}>Done</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Program */}
      <div>
        <label className="text-sm font-medium text-[#EDEDEF] block mb-1.5">Program</label>
        {programs.length === 0 ? (
          <p className="text-sm text-[#63637A]">No programs available. Add a program first.</p>
        ) : (
          <Select
            options={programOptions}
            value={selectedProgramId}
            onChange={(v) => { setSelectedProgramId(v); setSelectedEvents([]); }}
            className="w-full"
          />
        )}
      </div>

      {/* URL */}
      <div>
        <label className="text-sm font-medium text-[#EDEDEF] block mb-1.5">Webhook URL</label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://your-server.com/webhooks/uho"
          className="w-full rounded-full bg-[#23232B] border border-[#2A2A35] px-4 py-2.5 font-mono text-sm text-[#EDEDEF] placeholder:text-[#63637A] hover:border-[#3A3A48] focus:border-[#22D3EE] focus:ring-1 focus:ring-[#22D3EE]/50 focus:outline-none transition-colors duration-150"
        />
        {url && !isValidUrl && (
          <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> URL must start with http:// or https://
          </p>
        )}
      </div>

      {/* Event filter */}
      <div>
        <label className="text-sm font-medium text-[#EDEDEF] block mb-1.5">
          Events to watch <span className="text-[#63637A] font-normal">(empty = all events)</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {availableEvents.map((evt) => (
            <button
              key={evt}
              type="button"
              onClick={() => toggleEvent(evt)}
              className={`rounded-full px-3 py-1.5 font-mono text-xs font-medium transition-colors cursor-pointer ${
                selectedEvents.includes(evt)
                  ? 'bg-[#22D3EE]/10 text-[#22D3EE] border border-[#22D3EE]/30'
                  : 'bg-[#16161A] text-[#63637A] border border-[#1E1E26] hover:text-[#A0A0AB]'
              }`}
            >
              {evt}
            </button>
          ))}
          {availableEvents.length === 0 && (
            <span className="text-xs text-[#63637A]">Loading events...</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-2">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button
          onClick={() => createMutation.mutate()}
          disabled={!selectedProgramId || !isValidUrl}
          loading={createMutation.isPending}
        >
          Create Webhook
        </Button>
      </div>
    </div>
  );
}
