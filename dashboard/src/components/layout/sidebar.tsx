'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Search,
  Code2,
  Table2,
  Webhook,
  ScrollText,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { UserMenu } from './user-menu';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/events', label: 'Event Explorer', icon: Search },
  { href: '/programs', label: 'Programs', icon: Code2 },
  { href: '/views', label: 'Views', icon: Table2 },
  { href: '/webhooks', label: 'Webhooks', icon: Webhook },
  { href: '/logs', label: 'Logs', icon: ScrollText },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 bottom-0',
        collapsed ? 'w-16' : 'w-60',
        'bg-[#0F0F12] border-r border-[#1E1E26]',
        'flex flex-col z-40',
        'transition-all duration-200'
      )}
    >
      {/* Logo */}
      <div className="h-14 flex items-center px-5 border-b border-[#1E1E26]">
        {collapsed ? (
          <span className="text-lg font-bold text-[#22D3EE] mx-auto">u.</span>
        ) : (
          <div className="flex items-center">
            <span className="text-lg font-bold text-[#EDEDEF] tracking-tight">uho</span>
            <span className="text-lg font-bold text-[#22D3EE] tracking-tight ml-0.5">.</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium leading-5 transition-colors duration-150',
                isActive
                  ? 'bg-[#22D3EE]/10 text-[#22D3EE]'
                  : 'text-[#A0A0AB] hover:bg-[#1C1C22] hover:text-[#EDEDEF]',
                collapsed && 'justify-center px-0'
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="w-[18px] h-[18px] flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User Menu */}
      <div className="px-3 py-2 border-t border-[#1E1E26]">
        <UserMenu collapsed={collapsed} />
      </div>

      {/* Footer: Collapse toggle */}
      <div className="px-3 py-3 border-t border-[#1E1E26]">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            'w-full rounded-lg px-3 py-2 flex items-center gap-3 text-[#63637A] hover:text-[#A0A0AB] hover:bg-[#1C1C22] transition-colors text-xs cursor-pointer',
            collapsed && 'justify-center px-0'
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="w-4 h-4" />
          ) : (
            <>
              <PanelLeftClose className="w-4 h-4" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
