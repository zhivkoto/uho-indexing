/**
 * Utility functions for formatting and display.
 */

/** Truncate a Solana address for display: "FFCZu...Q1fUf" */
export function truncateAddress(address: string, chars = 4): string {
  if (!address || address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/** Convert lamports (string) to SOL with fixed decimal places */
export function lamportsToSol(lamports: string, decimals = 4): string {
  const sol = Number(lamports) / 1e9;
  return sol.toFixed(decimals);
}

/** Format a large token amount for readability */
export function formatTokenAmount(amount: string): string {
  const num = Number(amount);
  if (num >= 1e12) return `${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
  return num.toFixed(2);
}

/** Format a timestamp/ISO string to a relative or absolute time */
export function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);

  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Format a unix timestamp (seconds) to a readable string */
export function formatUnixTimestamp(ts: string): string {
  return formatTime(new Date(Number(ts) * 1000).toISOString());
}

/** Copy text to clipboard */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
