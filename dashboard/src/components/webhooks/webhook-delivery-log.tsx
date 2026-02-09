'use client';

import { useState, useMemo } from 'react';
import {
  CheckCircle2, XCircle, Clock, ChevronDown, ChevronRight,
  Inbox,
} from 'lucide-react';
import { Badge, EventTag } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { cn, formatRelativeTime, truncateAddress } from '@/lib/utils';
import type { WebhookInfo, WebhookDelivery } from '@/lib/types';

interface WebhookDeliveryLogProps {
  webhooks: WebhookInfo[];
}

// Note: In a real implementation, deliveries would be fetched from
// GET /api/v1/webhooks/:id/deliveries. For now, we show a placeholder
// that can be wired up once the backend endpoint exists.

export function WebhookDeliveryLog({ webhooks }: WebhookDeliveryLogProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Placeholder: in real usage, fetch deliveries from API
  // For now, show an informative empty state
  const deliveries: WebhookDelivery[] = [];

  if (webhooks.length === 0) {
    return (
      <EmptyState
        icon={<Inbox className="w-6 h-6" />}
        title="No webhooks configured"
        description="Create a webhook to start receiving event deliveries."
      />
    );
  }

  if (deliveries.length === 0) {
    return (
      <EmptyState
        icon={<Clock className="w-6 h-6" />}
        title="No deliveries yet"
        description="Webhook deliveries will appear here once events are triggered. Deliveries are logged with status codes and response data."
      />
    );
  }

  return (
    <div className="rounded-xl border border-[#1E1E26] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#1E1E26] bg-[#0F0F12]">
              <th className="px-4 py-3 text-left text-[11px] font-semibold tracking-widest uppercase text-[#63637A] w-8" />
              <th className="px-4 py-3 text-left text-[11px] font-semibold tracking-widest uppercase text-[#63637A]">
                Status
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold tracking-widest uppercase text-[#63637A]">
                Event
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold tracking-widest uppercase text-[#63637A]">
                Webhook
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold tracking-widest uppercase text-[#63637A]">
                Response
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold tracking-widest uppercase text-[#63637A]">
                Attempt
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold tracking-widest uppercase text-[#63637A]">
                Time
              </th>
            </tr>
          </thead>
          <tbody>
            {deliveries.map((delivery) => {
              const isExpanded = expandedId === delivery.id;
              const webhookUrl = webhooks.find((w) => w.id === delivery.webhookId)?.url || '—';

              return (
                <>
                  <tr
                    key={delivery.id}
                    onClick={() => setExpandedId(isExpanded ? null : delivery.id)}
                    className="border-b border-[#1E1E26] hover:bg-[#1C1C22] transition-colors duration-100 cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5 text-[#63637A]" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-[#63637A]" />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {delivery.success ? (
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span className="text-xs text-emerald-400">Success</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <XCircle className="w-4 h-4 text-red-400" />
                          <span className="text-xs text-red-400">Failed</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <EventTag>{delivery.eventType}</EventTag>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-[#A0A0AB] truncate max-w-[200px] block">
                        {truncateAddress(webhookUrl, 12)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'font-mono text-xs',
                        delivery.responseStatus && delivery.responseStatus >= 200 && delivery.responseStatus < 300
                          ? 'text-emerald-400'
                          : delivery.responseStatus
                            ? 'text-red-400'
                            : 'text-[#63637A]'
                      )}>
                        {delivery.responseStatus || 'Timeout'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-[#A0A0AB]">
                        #{delivery.attempt}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-[#63637A]">
                        {formatRelativeTime(delivery.deliveredAt)}
                      </span>
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr key={`${delivery.id}-detail`} className="border-b border-[#1E1E26]">
                      <td colSpan={7} className="p-4 bg-[#09090B]">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <h4 className="text-xs font-medium text-[#63637A] mb-2 uppercase tracking-wide">
                              Payload
                            </h4>
                            <pre className="rounded-lg bg-[#0F0F12] border border-[#1E1E26] p-3 overflow-x-auto">
                              <code className="font-mono text-[11px] text-[#A0A0AB] leading-relaxed">
                                {JSON.stringify(delivery.payload, null, 2)}
                              </code>
                            </pre>
                          </div>
                          <div>
                            <h4 className="text-xs font-medium text-[#63637A] mb-2 uppercase tracking-wide">
                              Response Body
                            </h4>
                            <pre className="rounded-lg bg-[#0F0F12] border border-[#1E1E26] p-3 overflow-x-auto max-h-[200px]">
                              <code className="font-mono text-[11px] text-[#A0A0AB] leading-relaxed">
                                {delivery.responseBody || '(empty)'}
                              </code>
                            </pre>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
