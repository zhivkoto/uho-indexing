import { formatDistanceToNowStrict, format } from 'date-fns';

export function truncateAddress(address: string, chars = 4): string {
  if (!address) return '';
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function formatSlot(slot: number, abbreviated = false): string {
  if (abbreviated && slot >= 1_000_000) {
    return `#${(slot / 1_000_000).toFixed(2)}M`;
  }
  return `#${slot.toLocaleString()}`;
}

export function formatNumber(num: number, abbreviated = false): string {
  if (abbreviated) {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  }
  return num.toLocaleString();
}

export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  try {
    return formatDistanceToNowStrict(d, { addSuffix: true });
  } catch {
    return 'Unknown';
  }
}

export function formatFullTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  try {
    return format(d, 'yyyy-MM-dd HH:mm:ss') + ' UTC';
  } catch {
    return 'Unknown';
  }
}

export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function solscanTxUrl(signature: string): string {
  return `https://solscan.io/tx/${signature}`;
}

export function solscanAddressUrl(address: string): string {
  return `https://solscan.io/account/${address}`;
}

export function isValidPublicKey(str: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(str);
}

export function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}
