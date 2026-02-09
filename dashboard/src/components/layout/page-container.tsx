'use client';

import { Header } from './header';

interface PageContainerProps {
  title: string;
  headerChildren?: React.ReactNode;
  children: React.ReactNode;
}

export function PageContainer({ title, headerChildren, children }: PageContainerProps) {
  return (
    <div className="flex flex-col min-h-screen">
      <Header title={title}>{headerChildren}</Header>
      <main className="flex-1 px-6 py-6 max-w-[1440px] w-full mx-auto">
        {children}
      </main>
    </div>
  );
}
