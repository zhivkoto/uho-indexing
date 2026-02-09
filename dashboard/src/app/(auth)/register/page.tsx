import { RegisterForm } from '@/components/auth/register-form';

export default function RegisterPage() {
  return (
    <div>
      <h1 className="text-[22px] font-semibold leading-7 text-[#EDEDEF] text-center mb-2">
        Create your account
      </h1>
      <p className="text-sm text-[#A0A0AB] text-center mb-8">
        Start indexing Solana events in minutes
      </p>
      <RegisterForm />
    </div>
  );
}
