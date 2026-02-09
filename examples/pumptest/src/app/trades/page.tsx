"use client";

/**
 * Trades page.
 * Displays trade events with optional mint address filter.
 * Can be linked from the tokens page via ?mint= query param.
 */

import { Suspense, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ArrowLeftRight, RefreshCw, Search, X } from "lucide-react";
import { useTradeEvents } from "@/lib/hooks";
import { CopyButton } from "@/components/CopyButton";
import { Pagination } from "@/components/Pagination";
import { LoadingSpinner, ErrorState } from "@/components/LoadingSpinner";
import {
  formatTime,
  lamportsToSol,
  formatTokenAmount,
  truncateAddress,
} from "@/lib/utils";

const PAGE_SIZE = 20;

function TradesContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [offset, setOffset] = useState(0);
  const [mintFilter, setMintFilter] = useState(searchParams.get("mint") ?? "");
  const [inputValue, setInputValue] = useState(mintFilter);

  // Sync URL mint param to filter state
  useEffect(() => {
    const urlMint = searchParams.get("mint") ?? "";
    setMintFilter(urlMint);
    setInputValue(urlMint);
    setOffset(0);
  }, [searchParams]);

  const { data, isLoading, isError, isFetching } = useTradeEvents({
    limit: PAGE_SIZE,
    offset,
    order: "desc",
    mint: mintFilter || undefined,
  });

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    setMintFilter(trimmed);
    setOffset(0);
    if (trimmed) {
      router.push(`/trades?mint=${trimmed}`);
    } else {
      router.push("/trades");
    }
  };

  const clearFilter = () => {
    setMintFilter("");
    setInputValue("");
    setOffset(0);
    router.push("/trades");
  };

  if (isLoading) return <LoadingSpinner message="Loading trades..." />;
  if (isError) return <ErrorState message="Failed to fetch trades" />;

  const trades = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <ArrowLeftRight size={24} className="text-accent-blue" />
            Trades
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            pump.fun trade events · Auto-refreshes every 10s
          </p>
        </div>
        {isFetching && (
          <RefreshCw size={16} className="animate-spin text-accent-blue" />
        )}
      </div>

      {/* Mint filter */}
      <form onSubmit={handleFilterSubmit} className="flex gap-2">
        <div className="relative flex-1 max-w-lg">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Filter by mint address..."
            className="w-full rounded-lg border border-border bg-bg-tertiary py-2 pl-9 pr-10 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-purple focus:outline-none focus:ring-1 focus:ring-accent-purple/30"
          />
          {inputValue && (
            <button
              type="button"
              onClick={clearFilter}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <button
          type="submit"
          className="rounded-lg bg-accent-blue/15 px-4 py-2 text-sm text-accent-blue hover:bg-accent-blue/25 transition-colors"
        >
          Filter
        </button>
      </form>

      {/* Active filter badge */}
      {mintFilter && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">Filtering by mint:</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-blue/10 border border-accent-blue/20 px-3 py-1 text-xs font-mono text-accent-blue">
            {truncateAddress(mintFilter, 8)}
            <button onClick={clearFilter} className="hover:text-text-primary">
              <X size={12} />
            </button>
          </span>
        </div>
      )}

      {/* Trades table */}
      <div className="card">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Token Mint</th>
                <th>SOL Amount</th>
                <th>Token Amount</th>
                <th>Trader</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {trades.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-text-muted">
                    {mintFilter
                      ? "No trades found for this token."
                      : "No trades found. The indexer may still be catching up."}
                  </td>
                </tr>
              ) : (
                trades.map((trade) => (
                  <tr key={trade.id}>
                    <td>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          trade.is_buy
                            ? "bg-accent-green/15 text-accent-green"
                            : "bg-accent-red/15 text-accent-red"
                        }`}
                      >
                        {trade.is_buy ? "Buy" : "Sell"}
                      </span>
                    </td>
                    <td>
                      <CopyButton text={trade.mint} chars={5} />
                    </td>
                    <td>
                      <span className="font-mono text-text-primary">
                        {lamportsToSol(trade.sol_amount)}{" "}
                        <span className="text-text-muted">SOL</span>
                      </span>
                    </td>
                    <td>
                      <span className="font-mono text-text-secondary">
                        {formatTokenAmount(trade.token_amount)}
                      </span>
                    </td>
                    <td>
                      <span className="font-mono text-xs text-text-muted">
                        {truncateAddress(trade.user, 4)}
                      </span>
                    </td>
                    <td>
                      <span className="text-sm text-text-muted whitespace-nowrap">
                        {formatTime(trade.block_time)}
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

/** Wrap in Suspense for useSearchParams (required by Next.js app router) */
export default function TradesPage() {
  return (
    <Suspense fallback={<LoadingSpinner message="Loading trades..." />}>
      <TradesContent />
    </Suspense>
  );
}
