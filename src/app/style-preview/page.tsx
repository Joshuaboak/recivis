import { notFound } from 'next/navigation';
import StylePreview from '@/components/StylePreview';

/**
 * /style-preview — a development-only specimen page for the CSA design system as
 * applied to this portal.
 *
 * Why it exists: reviewing the restyle otherwise requires a database and a Zoho key,
 * because every real screen sits behind login and loads live records. This renders the
 * actual token layer and the real component patterns with static data, so the visual
 * work can be judged locally with no environment at all.
 *
 * It 404s in production. It is deliberately outside the (portal) route group so the
 * shell, the auth gate and the 401 interceptor never mount here — and it is excluded
 * from the middleware matcher so it is reachable without a session.
 */
export default function StylePreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <StylePreview />;
}
