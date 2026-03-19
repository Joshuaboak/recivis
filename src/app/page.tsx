'use client';

import dynamic from 'next/dynamic';

const AppShell = dynamic(() => import('@/components/layout/AppShell'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#021A26' }}>
      <div className="flex flex-col items-center gap-4">
        <img src="/logo.svg" alt="Civil Survey Applications" style={{ width: 36, height: 72 }} />
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
