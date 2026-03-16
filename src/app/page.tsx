'use client';

import dynamic from 'next/dynamic';

const AppShell = dynamic(() => import('@/components/layout/AppShell'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#021A26' }}>
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 flex items-center justify-center" style={{ background: '#0077B7' }}>
          <span className="text-white text-3xl font-bold">R</span>
        </div>
        <div className="flex gap-1">
          <div className="w-2 h-2 animate-pulse" style={{ background: '#0077B7' }} />
          <div className="w-2 h-2 animate-pulse" style={{ background: '#0077B7', animationDelay: '0.15s' }} />
          <div className="w-2 h-2 animate-pulse" style={{ background: '#0077B7', animationDelay: '0.3s' }} />
        </div>
      </div>
    </div>
  ),
});

export default function Home() {
  return <AppShell />;
}
