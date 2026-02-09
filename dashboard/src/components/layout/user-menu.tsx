'use client';

import { LogOut, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/auth-provider';
import { Dropdown } from '@/components/ui/dropdown';
import { cn } from '@/lib/utils';

interface UserMenuProps {
  collapsed?: boolean;
}

export function UserMenu({ collapsed }: UserMenuProps) {
  const { user, logout } = useAuth();
  const router = useRouter();

  if (!user) return null;

  const initials = (user.displayName || user.email)
    .split(/[@.\s]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join('');

  return (
    <Dropdown
      align="left"
      trigger={
        <button
          className={cn(
            'w-full rounded-lg px-3 py-2 flex items-center gap-3 text-[#A0A0AB] hover:bg-[#1C1C22] hover:text-[#EDEDEF] transition-colors cursor-pointer',
            collapsed && 'justify-center px-0',
          )}
        >
          <span className="w-7 h-7 rounded-full bg-[#164E63]/30 flex items-center justify-center text-[10px] font-bold text-[#22D3EE] flex-shrink-0">
            {initials}
          </span>
          {!collapsed && (
            <span className="text-xs truncate flex-1 text-left">
              {user.displayName || user.email}
            </span>
          )}
        </button>
      }
      items={[
        {
          label: 'Profile & Settings',
          icon: <User className="w-4 h-4" />,
          onClick: () => router.push('/settings'),
        },
        'separator',
        {
          label: 'Sign out',
          icon: <LogOut className="w-4 h-4" />,
          danger: true,
          onClick: async () => {
            await logout();
            router.push('/login');
          },
        },
      ]}
    />
  );
}
