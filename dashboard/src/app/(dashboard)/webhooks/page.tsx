'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  Webhook, Plus, Trash2, Copy, Check, MoreVertical,
  Power, PowerOff, AlertCircle, ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { getWebhooks, deleteWebhook, updateWebhook, getPrograms } from '@/lib/api';
import { PageContainer } from '@/components/layout/page-container';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, EventTag } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Modal } from '@/components/ui/modal';
import { Dropdown } from '@/components/ui/dropdown';
import { Tabs } from '@/components/ui/tabs';
import { Spinner } from '@/components/ui/spinner';
import { WebhookForm } from '@/components/webhooks/webhook-form';
import { WebhookDeliveryLog } from '@/components/webhooks/webhook-delivery-log';
import { truncateAddress, formatRelativeTime, copyToClipboard } from '@/lib/utils';
import type { WebhookInfo } from '@/lib/types';

export default function WebhooksPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('webhooks');
  const [showCreate, setShowCreate] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedWebhook, setSelectedWebhook] = useState<WebhookInfo | null>(null);

  const { data: webhookData, isLoading } = useQuery({
    queryKey: ['webhooks'],
    queryFn: getWebhooks,
    refetchInterval: 10000,
  });

  const { data: programsData } = useQuery({
    queryKey: ['programs'],
    queryFn: getPrograms,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteWebhook,
    onSuccess: () => {
      setDeleteId(null);
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      toast.success('Webhook deleted.');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => updateWebhook(id, { active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      toast.success('Webhook updated.');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed'),
  });

  const webhooks = webhookData?.data || [];
  const programs = programsData?.data || [];

  const getProgName = (userProgramId: string) =>
    programs.find((p) => p.id === userProgramId)?.name || truncateAddress(userProgramId, 4);

  const tabs = [
    { value: 'webhooks', label: 'Webhooks', count: webhooks.length },
    { value: 'deliveries', label: 'Delivery Log' },
  ];

  return (
    <PageContainer
      title="Webhooks"
      headerChildren={
        <Button size="sm" onClick={() => setShowCreate(true)} className="ml-auto">
          <Plus className="w-3.5 h-3.5" /> Create Webhook
        </Button>
      }
    >
      <div className="space-y-6">
        <Tabs tabs={tabs} value={activeTab} onChange={setActiveTab} />

        {activeTab === 'webhooks' && (
          <>
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2].map((i) => (
                  <div key={i} className="rounded-xl bg-[#0F0F12] border border-[#1E1E26] p-6">
                    <div className="h-5 w-40 rounded bg-[#2A2A35] animate-pulse mb-3" />
                    <div className="h-4 w-60 rounded bg-[#2A2A35] animate-pulse" />
                  </div>
                ))}
              </div>
            ) : webhooks.length === 0 ? (
              <EmptyState
                icon={<Webhook className="w-6 h-6" />}
                title="No webhooks configured"
                description="Create a webhook to receive real-time HTTP notifications when new events are indexed."
                action={{ label: 'Create Webhook', onClick: () => setShowCreate(true) }}
              />
            ) : (
              <div className="space-y-4">
                {webhooks.map((wh: WebhookInfo) => (
                  <Card key={wh.id}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          <span className="font-mono text-sm text-[#67E8F9] truncate max-w-[400px]">
                            {wh.url}
                          </span>
                          <Badge
                            variant={wh.active ? 'success' : 'default'}
                            dot
                            pulse={wh.active}
                          >
                            {wh.active ? 'Active' : 'Disabled'}
                          </Badge>
                          {wh.failureCount > 0 && (
                            <Badge variant="error">
                              {wh.failureCount} failures
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-[#63637A] mb-2">
                          Program: <span className="text-[#A0A0AB]">{getProgName(wh.userProgramId)}</span>
                          {wh.lastTriggered && (
                            <>
                              {' · '}
                              Last triggered: <span className="text-[#A0A0AB]">{formatRelativeTime(wh.lastTriggered)}</span>
                            </>
                          )}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {wh.events.length > 0 ? (
                            wh.events.map((evt) => (
                              <EventTag key={evt}>{evt}</EventTag>
                            ))
                          ) : (
                            <span className="text-xs text-[#63637A]">All events</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 ml-4">
                        <Dropdown
                          align="right"
                          trigger={
                            <Button variant="icon" size="sm">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          }
                          items={[
                            wh.active
                              ? { label: 'Disable', icon: <PowerOff className="w-4 h-4" />, onClick: () => toggleMutation.mutate({ id: wh.id, active: false }) }
                              : { label: 'Enable', icon: <Power className="w-4 h-4" />, onClick: () => toggleMutation.mutate({ id: wh.id, active: true }) },
                            'separator',
                            { label: 'Delete', icon: <Trash2 className="w-4 h-4" />, danger: true, onClick: () => setDeleteId(wh.id) },
                          ]}
                        />
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'deliveries' && (
          <WebhookDeliveryLog webhooks={webhooks} />
        )}
      </div>

      {/* Create Webhook Modal */}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Create Webhook"
        size="lg"
      >
        <WebhookForm
          programs={programs}
          onSuccess={() => {
            setShowCreate(false);
            queryClient.invalidateQueries({ queryKey: ['webhooks'] });
          }}
          onCancel={() => setShowCreate(false)}
        />
      </Modal>

      {/* Delete Confirmation */}
      <Modal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Delete Webhook"
        size="sm"
      >
        <p className="text-sm text-[#A0A0AB] mb-4">
          This webhook will be permanently deleted. No more events will be delivered to this URL.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button
            variant="danger"
            onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            loading={deleteMutation.isPending}
          >
            Delete
          </Button>
        </div>
      </Modal>
    </PageContainer>
  );
}
