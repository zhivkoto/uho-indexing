'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Key, Plus, Trash2, Copy, Check, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { getApiKeys, createApiKey, revokeApiKey, revealApiKey } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { EmptyState } from '@/components/ui/empty-state';
import { copyToClipboard, formatRelativeTime } from '@/lib/utils';

export function ApiKeyList() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [revealedKeys, setRevealedKeys] = useState<Record<string, string>>({});
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: getApiKeys,
  });

  const createMutation = useMutation({
    mutationFn: () => createApiKey(newKeyLabel || undefined),
    onSuccess: (result) => {
      setCreatedKey(result.key);
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      toast.success('API key created.');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to create key'),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => revokeApiKey(id),
    onSuccess: () => {
      setRevokeId(null);
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      toast.success('API key revoked.');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to revoke key'),
  });

  const keys = data?.data || [];

  const handleCopyKey = async () => {
    if (createdKey) {
      await copyToClipboard(createdKey);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  const closeCreateModal = () => {
    setShowCreate(false);
    setCreatedKey(null);
    setNewKeyLabel('');
    setCopiedKey(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[15px] font-semibold text-[#EDEDEF]">API Keys</h3>
          <p className="text-xs text-[#63637A] mt-0.5">Manage your API keys for programmatic access</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="w-3.5 h-3.5" /> Create Key
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="rounded-xl bg-[#09090B] border border-[#1E1E26] p-4">
              <div className="h-4 w-40 rounded bg-[#2A2A35] animate-pulse" />
            </div>
          ))}
        </div>
      ) : keys.length === 0 ? (
        <EmptyState
          icon={<Key className="w-6 h-6" />}
          title="No API keys"
          description="Create an API key to access your data programmatically."
          action={{ label: 'Create Key', onClick: () => setShowCreate(true) }}
        />
      ) : (
        <div className="space-y-3">
          {keys.map((key) => {
            const isRevealed = !!revealedKeys[key.id];
            const fullKey = revealedKeys[key.id];

            const handleReveal = async () => {
              if (isRevealed) {
                setRevealedKeys((prev) => { const next = { ...prev }; delete next[key.id]; return next; });
                return;
              }
              try {
                const result = await revealApiKey(key.id);
                setRevealedKeys((prev) => ({ ...prev, [key.id]: result.key }));
              } catch {
                toast.error('Could not reveal key (created before this feature)');
              }
            };

            const handleCopy = async () => {
              let keyToCopy = fullKey;
              if (!keyToCopy) {
                try {
                  const result = await revealApiKey(key.id);
                  keyToCopy = result.key;
                  setRevealedKeys((prev) => ({ ...prev, [key.id]: result.key }));
                } catch {
                  toast.error('Could not copy key');
                  return;
                }
              }
              await copyToClipboard(keyToCopy);
              setCopiedKeyId(key.id);
              toast.success('API key copied');
              setTimeout(() => setCopiedKeyId(null), 2000);
            };

            return (
              <div key={key.id} className="rounded-xl bg-[#09090B] border border-[#1E1E26] p-4 flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {isRevealed ? (
                      <span className="font-mono text-xs text-[#22D3EE] break-all">{fullKey}</span>
                    ) : (
                      <>
                        <span className="font-mono text-sm text-[#EDEDEF]">{key.keyPrefix}</span>
                        <span className="font-mono text-sm text-[#63637A]">{'•'.repeat(20)}</span>
                      </>
                    )}
                    {key.label && (
                      <span className="text-xs text-[#63637A] flex-shrink-0">({key.label})</span>
                    )}
                  </div>
                  <div className="text-xs text-[#63637A] mt-1">
                    Created {formatRelativeTime(key.createdAt)}
                    {key.lastUsed && <> · Last used {formatRelativeTime(key.lastUsed)}</>}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 ml-3 flex-shrink-0">
                  <button
                    onClick={handleReveal}
                    className="rounded-full w-8 h-8 flex items-center justify-center text-[#63637A] hover:text-[#EDEDEF] hover:bg-[#1C1C22] transition-colors cursor-pointer"
                    title={isRevealed ? 'Hide key' : 'Show key'}
                  >
                    {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={handleCopy}
                    className="rounded-full w-8 h-8 flex items-center justify-center text-[#63637A] hover:text-[#22D3EE] hover:bg-[#1C1C22] transition-colors cursor-pointer"
                    title="Copy key"
                  >
                    {copiedKeyId === key.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setRevokeId(key.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Revoke
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Key Modal */}
      <Modal
        open={showCreate}
        onClose={closeCreateModal}
        title={createdKey ? 'API Key Created' : 'Create API Key'}
        size="md"
      >
        {createdKey ? (
          <div className="space-y-4">
            <p className="text-sm text-[#A0A0AB]">
              Your new API key is ready. You can always reveal it later in Settings.
            </p>
            <div className="flex items-center gap-2 p-3 rounded-xl bg-[#09090B] border border-[#1E1E26]">
              <code className="font-mono text-xs text-[#22D3EE] flex-1 break-all">{createdKey}</code>
              <button onClick={handleCopyKey} className="text-[#63637A] hover:text-[#22D3EE] transition-colors flex-shrink-0">
                {copiedKey ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex justify-end">
              <Button onClick={closeCreateModal}>Done</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-[#EDEDEF] block mb-1.5">Label (optional)</label>
              <input
                type="text"
                value={newKeyLabel}
                onChange={(e) => setNewKeyLabel(e.target.value)}
                placeholder="e.g., Production Backend"
                className="w-full rounded-full bg-[#23232B] border border-[#2A2A35] px-4 py-2.5 text-sm leading-5 text-[#EDEDEF] placeholder:text-[#63637A] hover:border-[#3A3A48] focus:border-[#22D3EE] focus:ring-1 focus:ring-[#22D3EE]/50 focus:outline-none transition-colors duration-150"
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={closeCreateModal}>Cancel</Button>
              <Button onClick={() => createMutation.mutate()} loading={createMutation.isPending}>
                Generate Key
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Revoke Confirmation */}
      <Modal
        open={!!revokeId}
        onClose={() => setRevokeId(null)}
        title="Revoke API Key"
        size="sm"
      >
        <p className="text-sm text-[#A0A0AB] mb-4">
          Are you sure? This key will stop working immediately.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setRevokeId(null)}>Cancel</Button>
          <Button
            variant="danger"
            onClick={() => revokeId && revokeMutation.mutate(revokeId)}
            loading={revokeMutation.isPending}
          >
            Revoke
          </Button>
        </div>
      </Modal>
    </div>
  );
}
