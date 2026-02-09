'use client';

import { ViewWizard } from '@/components/views/view-wizard';
import { PageContainer } from '@/components/layout/page-container';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function NewViewPage() {
  return (
    <PageContainer
      title="Create View"
      headerChildren={
        <Link href="/views" className="inline-flex items-center gap-1.5 text-xs text-[#A0A0AB] hover:text-[#EDEDEF] transition-colors ml-3">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Views
        </Link>
      }
    >
      <ViewWizard />
    </PageContainer>
  );
}
