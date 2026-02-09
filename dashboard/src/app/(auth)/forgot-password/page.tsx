'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { forgotPassword } from '@/lib/api';
import { Button } from '@/components/ui/button';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    try {
      await forgotPassword(email);
      setSent(true);
      toast.success('Reset email sent if the account exists.');
    } catch {
      // Don't reveal if email exists
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-[22px] font-semibold leading-7 text-[#EDEDEF] text-center mb-2">
        Reset password
      </h1>
      <p className="text-sm text-[#A0A0AB] text-center mb-8">
        {sent
          ? 'Check your email for a reset link.'
          : "Enter your email and we'll send you a reset link."
        }
      </p>

      {!sent ? (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="relative">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full rounded-full bg-[#23232B] border border-[#2A2A35] px-4 py-2.5 pl-10 text-sm leading-5 text-[#EDEDEF] placeholder:text-[#63637A] hover:border-[#3A3A48] focus:border-[#22D3EE] focus:ring-1 focus:ring-[#22D3EE]/50 focus:outline-none transition-colors duration-150"
            />
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#63637A]" />
          </div>
          <Button type="submit" loading={loading} className="w-full">
            Send reset link
          </Button>
        </form>
      ) : (
        <div className="text-center">
          <p className="text-sm text-[#A0A0AB] mb-4">
            If an account with that email exists, we&apos;ve sent a password reset link.
          </p>
        </div>
      )}

      <div className="mt-6 text-center">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-sm text-[#A0A0AB] hover:text-[#22D3EE] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
