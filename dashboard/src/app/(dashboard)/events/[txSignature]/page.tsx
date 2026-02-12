'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, Copy, Check, Search } from 'lucide-react';
import { useState } from 'react';
import { getPrograms, getEventByTx } from '@/lib/api';
import { PageContainer } from '@/components/layout/page-container';
import { Card } from '@/components/ui/card';
import { Badge, EventTag } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { JsonViewer } from '@/components/shared/json-viewer';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import {
  truncateAddress,
  copyToClipboard,
  solscanTxUrl,
  formatRelativeTime,
  formatFullTime,
  isValidPublicKey,
  formatSlot,
} from '@/lib/utils';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await copyToClipboard(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="text-[#63637A] hover:text-[#22D3EE] transition-colors cursor-pointer"
      title="Copy"
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

export default function EventDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const txSignature = params.txSignature as string;
  const qsProgram = searchParams.get('program') || '';
  const qsEvent = searchParams.get('event') || '';

  const { data: programsData } = useQuery({
    queryKey: ['programs'],
    queryFn: getPrograms,
    retry: 1,
  });

  const userPrograms = programsData?.data || [];
  const programName = qsProgram || userPrograms[0]?.name;
  const matchedProgram = userPrograms.find(p => p.name === programName);
  const eventName = qsEvent || matchedProgram?.events?.find(e => e.enabled)?.name;

  const { data: eventData, isLoading, error } = useQuery({
    queryKey: ['event-detail', programName, eventName, txSignature],
    queryFn: () => getEventByTx(programName!, eventName!, txSignature),
    enabled: !!programName && !!eventName && !!txSignature,
    retry: 1,
  });

  const events = eventData?.data || [];
  const mainEvent = events[0];

  return (
    <PageContainer
      title="Event Detail"
      headerChildren={
        <Link
          href="/events"
          className="inline-flex items-center gap-1.5 text-xs text-[#A0A0AB] hover:text-[#EDEDEF] transition-colors ml-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Explorer
        </Link>
      }
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : error || !mainEvent ? (
        <EmptyState
          icon={<Search className="w-6 h-6" />}
          title="Event not found"
          description={error ? 'Could not load event data.' : `No events found for transaction ${truncateAddress(txSignature, 8)}`}
          action={{ label: 'Back to Explorer', onClick: () => window.history.back() }}
        />
      ) : (
        <div className="space-y-6">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <EventTag className="text-sm px-3 py-1">
                  {String(mainEvent.eventType || mainEvent.event_type || eventName || 'Event')}
                </EventTag>
                <Badge variant="success" dot>Confirmed</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => copyToClipboard(window.location.href)}>
                  Copy Link
                </Button>
                <a
                  href={solscanTxUrl(txSignature)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-[#A0A0AB] hover:bg-[#1C1C22] hover:text-[#EDEDEF] transition-colors"
                >
                  View on Solscan <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-[#63637A] min-w-[100px]">Transaction</span>
                <span className="font-mono text-[13px] text-[#67E8F9]">{truncateAddress(txSignature, 12)}</span>
                <CopyButton text={txSignature} />
              </div>
              {mainEvent.slot != null && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-[#63637A] min-w-[100px]">Slot</span>
                  <span className="font-mono text-[13px] text-[#EDEDEF]">{formatSlot(Number(mainEvent.slot))}</span>
                </div>
              )}
              {Boolean(mainEvent.timestamp || mainEvent.blockTime || mainEvent.block_time) && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-[#63637A] min-w-[100px]">Time</span>
                  <span className="text-sm text-[#A0A0AB]">
                    {formatRelativeTime((mainEvent.timestamp || mainEvent.blockTime || mainEvent.block_time) as string)}
                  </span>
                  <span className="text-xs text-[#63637A]">
                    ({formatFullTime((mainEvent.timestamp || mainEvent.blockTime || mainEvent.block_time) as string)})
                  </span>
                </div>
              )}
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <h3 className="text-[15px] font-semibold leading-5 text-[#EDEDEF] mb-4">Event Fields</h3>
              <div className="divide-y divide-[#1E1E26]">
                {Object.entries(mainEvent)
                  .filter(([k]) => !k.startsWith('_') && k !== 'id')
                  .map(([key, value]) => (
                    <div key={key} className="flex items-start justify-between py-3">
                      <span className="text-xs font-medium text-[#63637A] min-w-[120px]">{key}</span>
                      <div className="flex items-center gap-1.5 text-right">
                        {value === null || value === undefined ? (
                          <span className="text-[#3A3A48] italic text-xs">null</span>
                        ) : typeof value === 'boolean' ? (
                          <span className={`font-mono text-[13px] ${value ? 'text-emerald-400' : 'text-[#63637A]'}`}>
                            {String(value)}
                          </span>
                        ) : typeof value === 'number' ? (
                          <span className="font-mono text-[13px] text-[#EDEDEF]">{value.toLocaleString()}</span>
                        ) : isValidPublicKey(String(value)) ? (
                          <>
                            <span className="font-mono text-[13px] text-[#67E8F9]">{truncateAddress(String(value), 4)}</span>
                            <CopyButton text={String(value)} />
                          </>
                        ) : (
                          <span className="font-mono text-[13px] text-[#EDEDEF] break-all">{String(value)}</span>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </Card>
            <JsonViewer data={mainEvent} />
          </div>

          {events.length > 1 && (
            <Card>
              <h3 className="text-[15px] font-semibold leading-5 text-[#EDEDEF] mb-3">
                Other events in this transaction ({events.length - 1})
              </h3>
              <div className="flex flex-wrap gap-2">
                {events.slice(1).map((evt, i) => (
                  <EventTag key={i}>
                    {String(evt.eventType || evt.event_type || 'Event')}
                  </EventTag>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </PageContainer>
  );
}
