/**
 * A single stat card for the overview dashboard.
 */

import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color?: string;
  subtitle?: string;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  color = "text-accent-purple",
  subtitle,
}: StatCardProps) {
  return (
    <div className="rounded-xl border border-border bg-bg-secondary p-5 transition-colors hover:border-border-light">
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-muted">{label}</span>
        <Icon size={18} className={color} />
      </div>
      <div className="mt-2 text-2xl font-bold text-text-primary">{value}</div>
      {subtitle && (
        <div className="mt-1 text-xs text-text-muted">{subtitle}</div>
      )}
    </div>
  );
}
