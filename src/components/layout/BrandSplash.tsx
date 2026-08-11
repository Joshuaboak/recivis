/**
 * BrandSplash — Full-screen brand mark shown while the portal resolves.
 *
 * Rendered by the (portal) loading.tsx boundary and by the portal layout
 * while it rehydrates the session from GET /api/auth.
 */

import Image from 'next/image';

export default function BrandSplash() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#021A26' }}>
      <div className="flex flex-col items-center gap-4">
        <Image src="/logo.svg" alt="Civil Survey Applications" width={36} height={72} priority />
        <div className="flex gap-1">
          <div className="w-2 h-2 animate-pulse" style={{ background: '#0077B7' }} />
          <div className="w-2 h-2 animate-pulse" style={{ background: '#0077B7', animationDelay: '0.15s' }} />
          <div className="w-2 h-2 animate-pulse" style={{ background: '#0077B7', animationDelay: '0.3s' }} />
        </div>
      </div>
    </div>
  );
}
