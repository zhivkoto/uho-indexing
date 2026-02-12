'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { login } from '@/lib/api';
import { useAuth } from './auth-provider';
import { Button } from '@/components/ui/button';
import { OAuthButtons } from './oauth-buttons';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { loginWithToken, isAuthenticated } = useAuth();
  const router = useRouter();

  // Redirect when authenticated (e.g. after Privy wallet sign-in via bridge)
  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    try {
      const data = await login(email, password);
      loginWithToken(data.accessToken, data.refreshToken, data.user);
      toast.success('Welcome back!');
      router.push('/dashboard');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <OAuthButtons />
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm font-medium text-[#EDEDEF]">
          Email
        </label>
        <div className="relative">
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
            className="w-full rounded-full bg-[#23232B] border border-[#2A2A35] px-4 py-2.5 pl-10 text-sm leading-5 text-[#EDEDEF] placeholder:text-[#63637A] hover:border-[#3A3A48] focus:border-[#22D3EE] focus:ring-1 focus:ring-[#22D3EE]/50 focus:outline-none transition-colors duration-150"
          />
          <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#63637A]" />
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="password" className="text-sm font-medium text-[#EDEDEF]">
            Password
          </label>
          <Link
            href="/forgot-password"
            className="text-xs text-[#22D3EE] hover:text-[#06B6D4] transition-colors"
          >
            Forgot password?
          </Link>
        </div>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
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
      </div>

      <Button type="submit" loading={loading} className="w-full">
        Sign in
      </Button>

      <p className="text-center text-sm text-[#A0A0AB]">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="text-[#22D3EE] hover:text-[#06B6D4] transition-colors font-medium">
          Sign up
        </Link>
      </p>
    </form>
    </div>
  );
}
