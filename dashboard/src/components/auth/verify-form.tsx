'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { verifyEmail } from '@/lib/api';
import { useAuth } from './auth-provider';
import { Button } from '@/components/ui/button';

export function VerifyForm() {
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const { loginWithToken } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get('email') || '';

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleChange = (index: number, value: string) => {
    if (value.length > 1) {
      // Handle paste
      const chars = value.replace(/\D/g, '').slice(0, 6).split('');
      const newCode = [...code];
      chars.forEach((char, i) => {
        if (index + i < 6) newCode[index + i] = char;
      });
      setCode(newCode);
      const nextIdx = Math.min(index + chars.length, 5);
      inputRefs.current[nextIdx]?.focus();
      return;
    }

    if (!/^\d?$/.test(value)) return;
    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const fullCode = code.join('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fullCode.length !== 6 || !email) return;

    setLoading(true);
    try {
      const data = await verifyEmail(email, fullCode);
      loginWithToken(data.accessToken, data.refreshToken, data.user);
      toast.success('Email verified! Welcome to Uho.');
      router.push('/dashboard');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Verification failed';
      toast.error(message);
      setCode(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="text-center">
        <p className="text-sm text-[#A0A0AB]">
          We sent a 6-digit code to
        </p>
        {email && (
          <p className="text-sm font-medium text-[#EDEDEF] mt-1">{email}</p>
        )}
      </div>

      <div className="flex justify-center gap-2">
        {code.map((digit, i) => (
          <input
            key={i}
            ref={(el) => { inputRefs.current[i] = el; }}
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={digit}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            className="w-12 h-14 rounded-xl bg-[#23232B] border border-[#2A2A35] text-center font-mono text-xl font-bold text-[#EDEDEF] focus:border-[#22D3EE] focus:ring-1 focus:ring-[#22D3EE]/50 focus:outline-none transition-colors duration-150"
          />
        ))}
      </div>

      <Button
        type="submit"
        loading={loading}
        disabled={fullCode.length !== 6}
        className="w-full"
      >
        Verify email
      </Button>

      <p className="text-center text-xs text-[#63637A]">
        Didn&apos;t receive the code? Check your spam folder.
      </p>
    </form>
  );
}
