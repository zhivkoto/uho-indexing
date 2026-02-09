"use client";

/**
 * Overview / Home page.
 * Shows quick stats and a recent activity feed.
 */

import { Activity, Coins, ArrowLeftRight, Zap } from "lucide-react";
import Link from "next/link";
import { useStatus, useCreateEvents, useTradeEvents } from "@/lib/hooks";
import { StatCard } from "@/components/StatCard";
import { CopyButton } from "@/components/CopyButton";
import { LoadingSpinner, ErrorState } from "@/components/LoadingSpinner";
import { formatTime, lamportsToSol } from "@/lib/utils";

export default function OverviewPage() {
  const status = useStatus();
  const tokens = useCreateEvents({ limit: 5 });
  const trades = useTradeEvents({ limit: 5 });

  const isLoading = status.isLoading || tokens.isLoading || trades.isLoading;
  const isError = status.isError && tokens.isError && trades.isError;

  if (isLoading) return <LoadingSpinner message="Connecting to Uho..." />;
  if (isError) return <ErrorState message="Failed to connect to Uho API" />;

  const totalTokens = tokens.data?.pagination.total ?? 0;
  const totalTrades = trades.data?.pagination.total ?? 0;
  const indexerStatus = status.data?.status ?? "unknown";

  // Mix recent tokens and trades into an activity feed, sorted by time
  const activities = [
    ...(tokens.data?.data ?? []).map((t) => ({
      type: "token" as const,
      time: t.block_time,
      data: t,
    })),
    ...(trades.data?.data ?? []).map((t) => ({
      type: "trade" as const,
      time: t.block_time,
      data: t,
    })),
  ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Overview</h1>
        <p className="mt-1 text-sm text-text-muted">
          Real-time pump.fun event dashboard powered by Uho
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Indexer Status"
          value={indexerStatus === "running" ? "Online" : indexerStatus}
          icon={Activity}
          color={indexerStatus === "running" ? "text-accent-green" : "text-accent-orange"}
          subtitle="Auto-refreshing every 10s"
        />
        <StatCard
          label="Tokens Created"
          value={totalTokens.toLocaleString()}
          icon={Coins}
          color="text-accent-purple"
        />
        <StatCard
          label="Total Trades"
          value={totalTrades.toLocaleString()}
          icon={ArrowLeftRight}
          color="text-accent-blue"
        />
        <StatCard
          label="Programs Indexed"
          value={status.data?.programs?.length ?? 1}
          icon={Zap}
          color="text-accent-orange"
        />
      </div>

      {/* Recent activity feed */}
      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold text-text-primary">Recent Activity</h2>
          <div className="flex gap-2">
            <Link
              href="/tokens"
              className="text-xs text-accent-purple hover:text-accent-purple-light transition-colors"
            >
              All tokens →
            </Link>
            <Link
              href="/trades"
              className="text-xs text-accent-purple hover:text-accent-purple-light transition-colors"
            >
              All trades →
            </Link>
          </div>
        </div>
        <div className="divide-y divide-border/50">
          {activities.length === 0 ? (
            <div className="py-12 text-center text-text-muted text-sm">
              No events yet. Make sure the Uho indexer is running.
            </div>
          ) : (
            activities.slice(0, 10).map((activity, i) => (
              <div
                key={`${activity.type}-${i}`}
                className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-bg-hover"
              >
                {/* Type indicator */}
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                    activity.type === "token"
                      ? "bg-accent-purple/15 text-accent-purple"
                      : "bg-accent-blue/15 text-accent-blue"
                  }`}
                >
                  {activity.type === "token" ? (
                    <Coins size={14} />
                  ) : (
                    <ArrowLeftRight size={14} />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {activity.type === "token" ? (
                    <div>
                      <Link
                        href={`/trades?mint=${activity.data.mint}`}
                        className="font-medium text-text-primary hover:text-accent-purple transition-colors"
                      >
                        {(activity.data as { name: string }).name}{" "}
                        <span className="text-text-muted">
                          ${(activity.data as { symbol: string }).symbol}
                        </span>
                      </Link>
                      <div className="flex items-center gap-2 text-xs text-text-muted">
                        <span>New token created</span>
                        <span>·</span>
                        <CopyButton text={activity.data.mint} chars={4} />
                      </div>
                    </div>
                  ) : (
                    <div>
                      <span className="font-medium text-text-primary">
                        {(activity.data as { is_buy: boolean }).is_buy ? (
                          <span className="text-accent-green">Buy</span>
                        ) : (
                          <span className="text-accent-red">Sell</span>
                        )}{" "}
                        {lamportsToSol(
                          (activity.data as { sol_amount: string }).sol_amount
                        )}{" "}
                        SOL
                      </span>
                      <div className="flex items-center gap-2 text-xs text-text-muted">
                        <span>Trade</span>
                        <span>·</span>
                        <CopyButton text={activity.data.mint} chars={4} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Timestamp */}
                <span className="text-xs text-text-muted whitespace-nowrap">
                  {formatTime(activity.time)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
