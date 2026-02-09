'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Table2, Plus, Trash2, RefreshCw, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { getViews, deleteView } from '@/lib/api';
import { PageContainer } from '@/components/layout/page-container';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, EventTag } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Modal } from '@/components/ui/modal';
import { Spinner } from '@/components/ui/spinner';
import { ViewResults } from '@/components/views/view-results';
import { formatRelativeTime } from '@/lib/utils';
import type { ViewInfo } from '@/lib/types';

const statusBadge: Record<string, { variant: 'success' | 'warning' | 'error' | 'default'; pulse: boolean }> = {
  active: { variant: 'success', pulse: false },
  pending: { variant: 'warning', pulse: true },
  error: { variant: 'error', pulse: false },
  disabled: { variant: 'default', pulse: false },
};

export default function ViewsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [previewView, setPreviewView] = useState<ViewInfo | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['views'],
    queryFn: getViews,
    refetchInterval: 10000,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteView,
    onSuccess: () => {
      setDeleteId(null);
      queryClient.invalidateQueries({ queryKey: ['views'] });
      toast.success('View deleted.');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to delete view'),
  });

  const views = data?.data || [];

  return (
    <PageContainer
      title="Views"
      headerChildren={
        <Button size="sm" onClick={() => router.push('/views/new')} className="ml-auto">
          <Plus className="w-3.5 h-3.5" /> Create View
        </Button>
      }
    >
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl bg-[#0F0F12] border border-[#1E1E26] p-6">
              <div className="h-5 w-40 rounded bg-[#2A2A35] animate-pulse mb-3" />
              <div className="h-4 w-60 rounded bg-[#2A2A35] animate-pulse" />
            </div>
          ))}
        </div>
      ) : views.length === 0 ? (
        <EmptyState
          icon={<Table2 className="w-6 h-6" />}
          title="No custom views"
          description="Create a view to aggregate and group your event data with custom queries."
          action={{ label: 'Create View', onClick: () => router.push('/views/new') }}
        />
      ) : (
        <div className="space-y-4">
          {views.map((view: ViewInfo) => {
            const badge = statusBadge[view.status] || statusBadge.disabled;
            const groupBy = Array.isArray(view.definition.groupBy) ? view.definition.groupBy : [view.definition.groupBy];

            return (
              <Card
                key={view.id}
                variant="interactive"
                onClick={() => setPreviewView(view)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="text-[15px] font-semibold text-[#EDEDEF]">{view.name}</h3>
                      <Badge variant={badge.variant} dot pulse={badge.pulse}>
                        {view.status}
                      </Badge>
                      {view.materialized && (
                        <Badge variant="accent">materialized</Badge>
                      )}
                    </div>
                    <p className="text-xs text-[#63637A] mb-3">
                      Program: <span className="text-[#A0A0AB]">{view.programName}</span>
                      {' · '}
                      Source: <span className="text-[#A0A0AB]">{view.definition.source}</span>
                    </p>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-semibold tracking-widest uppercase text-[#63637A]">Group by:</span>
                      {groupBy.map((field) => (
                        <span key={field} className="font-mono text-[10px] text-[#67E8F9] bg-[#164E63]/20 rounded px-1.5 py-0.5">
                          {field}
                        </span>
                      ))}
                      <span className="text-[11px] font-semibold tracking-widest uppercase text-[#63637A] ml-2">Select:</span>
                      {Object.keys(view.definition.select).map((col) => (
                        <span key={col} className="font-mono text-[10px] text-[#A0A0AB] bg-[#16161A] rounded px-1.5 py-0.5">
                          {col}
                        </span>
                      ))}
                    </div>

                    {view.error && (
                      <div className="flex items-center gap-1.5 mt-2 text-xs text-red-400">
                        <AlertCircle className="w-3 h-3" />
                        {view.error}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 ml-4" onClick={(e) => e.stopPropagation()}>
                    {view.lastRefreshed && (
                      <span className="text-[10px] text-[#63637A] whitespace-nowrap">
                        Refreshed {formatRelativeTime(view.lastRefreshed)}
                      </span>
                    )}
                    <Button variant="danger" size="sm" onClick={() => setDeleteId(view.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Preview Modal */}
      <Modal
        open={!!previewView}
        onClose={() => setPreviewView(null)}
        title={previewView ? `View: ${previewView.name}` : ''}
        size="xl"
      >
        {previewView && previewView.status === 'active' && (
          <ViewResults
            programName={previewView.programName}
            viewName={previewView.name}
          />
        )}
        {previewView && previewView.status !== 'active' && (
          <div className="text-center py-8">
            <p className="text-sm text-[#63637A]">
              View is {previewView.status}. {previewView.error ? previewView.error : 'Results are not available yet.'}
            </p>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation */}
      <Modal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Delete View"
        size="sm"
      >
        <p className="text-sm text-[#A0A0AB] mb-4">
          This will permanently delete the view and its data. This cannot be undone.
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
