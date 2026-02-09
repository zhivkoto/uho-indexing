"use client";

/**
 * Token Analytics page — powered by Uho Custom Views.
 *
 * Demonstrates the custom views feature by displaying per-token aggregate
 * statistics computed server-side via materialized views. Data is fetched
 * from three views: token_volume, token_buys, and token_sells, then joined
 * client-side with CreateEvent data for token names/symbols.
 *
 * Auto-refreshes every 30 seconds.
 */

import { useMemo, useState } from "react";
import { BarChart3, RefreshCw, TrendingUp, TrendingDown } from "lucide-react";
import { useTokenVolume, useTokenBuys, useTokenSells, useCreateEvents } from "@/lib/hooks";
import { CopyButton } from "@/components/CopyButton";
import { Pagination } from "@/components/Pagination";
import { LoadingSpinner, ErrorState } from "@/components/LoadingSpinner";
import { lamportsToSol } from "@/lib/utils";

const PAGE_SIZE = 20;

export default function AnalyticsPage() {
  const [offset, setOffset] = useState(0);

  // Fetch the three custom views + token metadata
  const volume = useTokenVolume({ limit: PAGE_SIZE, offset, order: "desc" });
  const buys = useTokenBuys({ limit: 1000 });
  const sells = useTokenSells({ limit: 1000 });
  const tokens = useCreateEvents({ limit: 1000, order: "desc" });

  const isLoading = volume.isLoading;
  const isError = volume.isError;
  const isFetching = volume.isFetching || buys.isFetching || sells.isFetching;

  // Build lookup maps for buy/sell counts and token metadata
  const buyMap = useMemo(() => {
    const map = new Map<string, { count: number; volume: string }>();
    for (const row of buys.data?.data ?? []) {
      map.set(row.mint, { count: Number(row.buy_count), volume: row.buy_sol_volume });
    }
    return map;
  }, [buys.data]);

  const sellMap = useMemo(() => {
    const map = new Map<string, { count: number; volume: string }>();
    for (const row of sells.data?.data ?? []) {
      map.set(row.mint, { count: Number(row.sell_count), volume: row.sell_sol_volume });
    }
    return map;
  }, [sells.data]);

  const tokenMap = useMemo(() => {
    const map = new Map<string, { name: string; symbol: string }>();
    for (const t of tokens.data?.data ?? []) {
      map.set(t.mint, { name: t.name, symbol: t.symbol });
    }
    return map;
  }, [tokens.data]);

  if (isLoading) return <LoadingSpinner message="Loading analytics..." />;
  if (isError) return <ErrorState message="Failed to load analytics. Make sure custom views are created." />;

  const rows = volume.data?.data ?? [];
  const pagination = volume.data?.pagination;

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <BarChart3 size={24} className="text-accent-purple" />
            Token Analytics
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Powered by Uho Custom Views · Materialized aggregates · Auto-refreshes every 30s
          </p>
        </div>
        {isFetching && (
          <RefreshCw size={16} className="animate-spin text-accent-purple" />
        )}
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card px-5 py-4">
          <div className="text-xs text-text-muted uppercase tracking-wider">Tokens Tracked</div>
          <div className="mt-1 text-2xl font-bold text-text-primary">
            {pagination?.total.toLocaleString() ?? "—"}
          </div>
        </div>
        <div className="card px-5 py-4">
          <div className="text-xs text-text-muted uppercase tracking-wider">Total Trades</div>
          <div className="mt-1 text-2xl font-bold text-text-primary">
            {rows.reduce((sum, r) => sum + Number(r.total_trades), 0).toLocaleString()}
          </div>
        </div>
        <div className="card px-5 py-4">
          <div className="text-xs text-text-muted uppercase tracking-wider">Total Volume</div>
          <div className="mt-1 text-2xl font-bold text-text-primary">
            {lamportsToSol(
              rows.reduce((sum, r) => sum + Number(r.total_sol_volume), 0).toString(),
              2
            )}{" "}
            <span className="text-sm font-normal text-text-muted">SOL</span>
          </div>
        </div>
      </div>

      {/* Analytics table */}
      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold text-text-primary">Per-Token Statistics</h2>
          <span className="text-xs text-text-muted">
            Data from 3 materialized views
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Token</th>
                <th>Mint</th>
                <th className="text-right">Trades</th>
                <th className="text-right">Volume (SOL)</th>
                <th className="text-right">Buys</th>
                <th className="text-right">Sells</th>
                <th>Buy/Sell Ratio</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-text-muted">
                    No analytics data yet. Make sure the custom views are created.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const meta = tokenMap.get(row.mint);
                  const buyInfo = buyMap.get(row.mint);
                  const sellInfo = sellMap.get(row.mint);
                  const buyCount = buyInfo?.count ?? 0;
                  const sellCount = sellInfo?.count ?? 0;
                  const total = buyCount + sellCount;
                  const buyPct = total > 0 ? (buyCount / total) * 100 : 50;

                  return (
                    <tr key={row.mint}>
                      {/* Token name/symbol */}
                      <td>
                        {meta ? (
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-purple/15 text-accent-purple text-xs font-bold">
                              {meta.symbol.slice(0, 2)}
                            </div>
                            <div>
                              <div className="font-medium text-text-primary">{meta.name}</div>
                              <div className="text-xs text-text-muted">${meta.symbol}</div>
                            </div>
                          </div>
                        ) : (
                          <span className="text-text-muted text-xs">Unknown</span>
                        )}
                      </td>

                      {/* Mint address */}
                      <td>
                        <CopyButton text={row.mint} chars={5} />
                      </td>

                      {/* Total trades */}
                      <td className="text-right font-mono text-sm">
                        {Number(row.total_trades).toLocaleString()}
                      </td>

                      {/* SOL volume */}
                      <td className="text-right font-mono text-sm">
                        {lamportsToSol(row.total_sol_volume, 2)}
                      </td>

                      {/* Buy count */}
                      <td className="text-right">
                        <span className="inline-flex items-center gap-1 text-accent-green text-sm font-mono">
                          <TrendingUp size={12} />
                          {buyCount.toLocaleString()}
                        </span>
                      </td>

                      {/* Sell count */}
                      <td className="text-right">
                        <span className="inline-flex items-center gap-1 text-accent-red text-sm font-mono">
                          <TrendingDown size={12} />
                          {sellCount.toLocaleString()}
                        </span>
                      </td>

                      {/* Buy/Sell ratio bar */}
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 rounded-full bg-accent-red/30 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-accent-green transition-all duration-300"
                              style={{ width: `${buyPct}%` }}
                            />
                          </div>
                          <span className="text-xs text-text-muted font-mono w-10">
                            {total > 0 ? `${Math.round(buyPct)}%` : "—"}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })
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
