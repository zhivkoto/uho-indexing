'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { updateMe } from '@/lib/api';
import { useAuth } from '@/components/auth/auth-provider';
import { Button } from '@/components/ui/button';
import type { UserProfile } from '@/lib/types';

interface ProfileFormProps {
  profile: UserProfile;
  onUpdate: () => void;
}

export function ProfileForm({ profile, onUpdate }: ProfileFormProps) {
  const { refreshUser } = useAuth();
  const [displayName, setDisplayName] = useState(profile.displayName || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updates: Record<string, string> = {};
      if (displayName !== (profile.displayName || '')) updates.displayName = displayName;
      if (newPassword) {
        updates.currentPassword = currentPassword;
        updates.newPassword = newPassword;
      }
      if (Object.keys(updates).length === 0) {
        toast.info('No changes to save.');
        setSaving(false);
        return;
      }
      await updateMe(updates);
      toast.success('Profile updated.');
      setCurrentPassword('');
      setNewPassword('');
      onUpdate();
      refreshUser();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-[#EDEDEF] block mb-1.5">Email</label>
          <input
            type="email"
            value={profile.email}
            disabled
            className="w-full rounded-full bg-[#16161A] border border-[#1E1E26] px-4 py-2.5 text-sm text-[#3A3A48] cursor-not-allowed"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-[#EDEDEF] block mb-1.5">Display Name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
            className="w-full rounded-full bg-[#23232B] border border-[#2A2A35] px-4 py-2.5 text-sm leading-5 text-[#EDEDEF] placeholder:text-[#63637A] hover:border-[#3A3A48] focus:border-[#22D3EE] focus:ring-1 focus:ring-[#22D3EE]/50 focus:outline-none transition-colors duration-150"
          />
        </div>
      </div>

      <div className="border-t border-[#1E1E26] pt-6">
        <h3 className="text-sm font-semibold text-[#EDEDEF] mb-4">Change Password</h3>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-[#EDEDEF] block mb-1.5">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-full bg-[#23232B] border border-[#2A2A35] px-4 py-2.5 text-sm leading-5 text-[#EDEDEF] placeholder:text-[#63637A] hover:border-[#3A3A48] focus:border-[#22D3EE] focus:ring-1 focus:ring-[#22D3EE]/50 focus:outline-none transition-colors duration-150"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-[#EDEDEF] block mb-1.5">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Min 8 chars, 1 letter + 1 number"
              className="w-full rounded-full bg-[#23232B] border border-[#2A2A35] px-4 py-2.5 text-sm leading-5 text-[#EDEDEF] placeholder:text-[#63637A] hover:border-[#3A3A48] focus:border-[#22D3EE] focus:ring-1 focus:ring-[#22D3EE]/50 focus:outline-none transition-colors duration-150"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" loading={saving}>Save Changes</Button>
      </div>
    </form>
  );
}
