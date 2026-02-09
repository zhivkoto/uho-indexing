"use client";

/**
 * New Tokens page.
 * Displays recently created tokens from pump.fun's CreateEvent.
 * Clickable rows link to the token's trades.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Coins, RefreshCw } from "lucide-react";
import { useCreateEvents } from "@/lib/hooks";
import { CopyButton } from "@/components/CopyButton";
import { Pagination } from "@/components/Pagination";
import { LoadingSpinner, ErrorState } from "@/components/LoadingSpinner";
import { formatTime, truncateAddress } from "@/lib/utils";

const PAGE_SIZE = 20;

export default function TokensPage() {
  const router = useRouter();
  const [offset, setOffset] = useState(0);

  const { data, isLoading, isError, isFetching } = useCreateEvents({
    limit: PAGE_SIZE,
    offset,
    order: "desc",
  });

  if (isLoading) return <LoadingSpinner message="Loading tokens..." />;
  if (isError) return <ErrorState message="Failed to fetch tokens" />;

  const tokens = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <Coins size={24} className="text-accent-purple" />
            New Tokens
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Recently created pump.fun tokens · Auto-refreshes every 10s
          </p>
        </div>
        {isFetching && (
          <RefreshCw size={16} className="animate-spin text-accent-purple" />
        )}
      </div>

      {/* Tokens table */}
      <div className="card">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Token</th>
                <th>Symbol</th>
                <th>Mint Address</th>
                <th>Creator</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {tokens.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-text-muted">
                    No tokens found. The indexer may still be catching up.
                  </td>
                </tr>
              ) : (
                tokens.map((token) => (
                  <tr
                    key={token.id}
                    onClick={() => router.push(`/trades?mint=${token.mint}`)}
                    className="cursor-pointer"
                  >
                    <td>
                      <div className="flex items-center gap-3">
                        {/* Token avatar */}
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-purple/15 text-accent-purple text-xs font-bold">
                          {token.symbol.slice(0, 2)}
                        </div>
                        <span className="font-medium text-text-primary">
                          {token.name}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="rounded-md bg-bg-tertiary px-2 py-0.5 font-mono text-xs text-accent-purple-light">
                        ${token.symbol}
                      </span>
                    </td>
                    <td>
                      <CopyButton text={token.mint} chars={5} />
                    </td>
                    <td>
                      <span className="font-mono text-xs text-text-muted">
                        {truncateAddress(token.user, 4)}
                      </span>
                    </td>
                    <td>
                      <span className="text-sm text-text-muted whitespace-nowrap">
                        {formatTime(token.block_time)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination && (
          <div className="border-t border-border px-2">
            <Pagination
              offset={offset}
              limit={PAGE_SIZE}
              total={pagination.total}
              onPageChange={setOffset}
            />
          </div>
        )}
      </div>
    </div>
  );
}
