import { Suspense } from 'react';
import { VerifyForm } from '@/components/auth/verify-form';
import { Spinner } from '@/components/ui/spinner';

export default function VerifyPage() {
  return (
    <div>
      <h1 className="text-[22px] font-semibold leading-7 text-[#EDEDEF] text-center mb-2">
        Verify your email
      </h1>
      <p className="text-sm text-[#A0A0AB] text-center mb-8">
        Enter the 6-digit code we sent you
      </p>
      <Suspense fallback={<div className="flex justify-center"><Spinner /></div>}>
        <VerifyForm />
      </Suspense>
    </div>
  );
}
