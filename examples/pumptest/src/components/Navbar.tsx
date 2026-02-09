"use client";

/**
 * Top navigation bar with links to all dashboard pages.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Coins, ArrowLeftRight, BarChart3 } from "lucide-react";

const navItems = [
  { href: "/", label: "Overview", icon: Activity },
  { href: "/tokens", label: "New Tokens", icon: Coins },
  { href: "/trades", label: "Trades", icon: ArrowLeftRight },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-bg-secondary/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-purple/20 text-accent-purple font-bold text-sm transition-colors group-hover:bg-accent-purple/30">
            U
          </div>
          <span className="font-semibold text-text-primary">
            Pump<span className="text-accent-purple">test</span>
          </span>
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "bg-accent-purple/15 text-accent-purple"
                    : "text-text-secondary hover:text-text-primary hover:bg-bg-hover"
                }`}
              >
                <Icon size={16} />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <div className="h-2 w-2 rounded-full bg-accent-green animate-pulse" />
          <span className="hidden md:inline">Live</span>
        </div>
      </div>
    </nav>
  );
}
