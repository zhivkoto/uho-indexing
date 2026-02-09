import { LoginForm } from '@/components/auth/login-form';

export default function LoginPage() {
  return (
    <div>
      <h1 className="text-[22px] font-semibold leading-7 text-[#EDEDEF] text-center mb-2">
        Welcome back
      </h1>
      <p className="text-sm text-[#A0A0AB] text-center mb-8">
        Sign in to your Uho account
      </p>
      <LoginForm />
    </div>
  );
}
