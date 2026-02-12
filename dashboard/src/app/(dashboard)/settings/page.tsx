'use client';

import { useQuery } from '@tanstack/react-query';
import { PageContainer } from '@/components/layout/page-container';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { Tabs } from '@/components/ui/tabs';
import { ProfileForm } from '@/components/settings/profile-form';
import { ApiKeyList } from '@/components/settings/api-key-list';
import { UsageDisplay } from '@/components/settings/usage-display';
import { getMe } from '@/lib/api';
import { useAuth } from '@/components/auth/auth-provider';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LogOut } from 'lucide-react';

const tabs = [
  { value: 'profile', label: 'Profile' },
  { value: 'api-keys', label: 'API Keys' },
  { value: 'usage', label: 'Usage' },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('profile');
  const { logout } = useAuth();
  const router = useRouter();

  const { data: profile, isLoading, refetch } = useQuery({
    queryKey: ['user-profile'],
    queryFn: getMe,
  });

  return (
    <PageContainer title="Settings">
      <div className="space-y-6">
        <Tabs tabs={tabs} value={activeTab} onChange={setActiveTab} />

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Spinner size="lg" />
          </div>
        ) : (
          <>
            {activeTab === 'profile' && profile && (
              <Card>
                <ProfileForm profile={profile} onUpdate={() => refetch()} />
              </Card>
            )}

            {activeTab === 'api-keys' && (
              <Card>
                <ApiKeyList />
              </Card>
            )}

            {activeTab === 'usage' && profile && (
              <Card>
                <h3 className="text-[15px] font-semibold text-[#EDEDEF] mb-1">Usage & Limits</h3>
                <p className="text-xs text-[#63637A] mb-6">Your current usage against free tier limits</p>
                <UsageDisplay profile={profile} />
              </Card>
            )}
          </>
        )}

        {/* Sign Out */}
        <div className="pt-4 border-t border-[#1E1E26]">
          <button
            onClick={async () => {
              await logout();
              router.push('/login');
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </div>
    </PageContainer>
  );
}
