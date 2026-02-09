'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Lock, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { resetPassword } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

function ResetPasswordForm() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const passwordValid = password.length >= 8 && /[a-zA-Z]/.test(password) && /[0-9]/.test(password);
  const passwordsMatch = password === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordValid || !passwordsMatch || !token) return;

    setLoading(true);
    try {
      await resetPassword(token, password);
      toast.success('Password reset successfully! Please sign in.');
      router.push('/login');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Reset failed';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="text-center">
        <p className="text-sm text-red-400 mb-4">Invalid or missing reset token.</p>
        <Link href="/forgot-password" className="text-sm text-[#22D3EE] hover:text-[#06B6D4] transition-colors">
          Request a new reset link
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-[#EDEDEF]">New Password</label>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Min 8 chars, 1 letter + 1 number"
            required
            className="w-full rounded-full bg-[#23232B] border border-[#2A2A35] px-4 py-2.5 pl-10 pr-10 text-sm leading-5 text-[#EDEDEF] placeholder:text-[#63637A] hover:border-[#3A3A48] focus:border-[#22D3EE] focus:ring-1 focus:ring-[#22D3EE]/50 focus:outline-none transition-colors duration-150"
          />
          <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#63637A]" />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#63637A] hover:text-[#EDEDEF] transition-colors"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {password && !passwordValid && (
          <p className="text-xs text-red-400">Min 8 characters, at least 1 letter and 1 number</p>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-[#EDEDEF]">Confirm Password</label>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
            required
            className="w-full rounded-full bg-[#23232B] border border-[#2A2A35] px-4 py-2.5 pl-10 text-sm leading-5 text-[#EDEDEF] placeholder:text-[#63637A] hover:border-[#3A3A48] focus:border-[#22D3EE] focus:ring-1 focus:ring-[#22D3EE]/50 focus:outline-none transition-colors duration-150"
          />
          <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#63637A]" />
        </div>
        {confirmPassword && !passwordsMatch && (
          <p className="text-xs text-red-400">Passwords do not match</p>
        )}
      </div>

      <Button
        type="submit"
        loading={loading}
        disabled={!passwordValid || !passwordsMatch}
        className="w-full"
      >
        Reset password
      </Button>

      <div className="text-center">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-sm text-[#A0A0AB] hover:text-[#22D3EE] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to sign in
        </Link>
      </div>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div>
      <h1 className="text-[22px] font-semibold leading-7 text-[#EDEDEF] text-center mb-2">
        Set new password
      </h1>
      <p className="text-sm text-[#A0A0AB] text-center mb-8">
        Choose a strong password for your account
      </p>
      <Suspense fallback={<div className="flex justify-center"><Spinner /></div>}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
