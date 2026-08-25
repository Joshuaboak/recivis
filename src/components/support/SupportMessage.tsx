/**
 * SupportMessage — renders one support answer.
 *
 * The assistant is told to link every page it names, so its replies contain
 * markdown links. Rendering them as text would be worse than not asking for
 * them at all — the reader gets `[Accounts](/accounts)` instead of a way to
 * get to Accounts.
 *
 * This is a deliberately tiny renderer, not a markdown library: links and bold
 * only, which is all the prompt asks the model to produce. They nest, because
 * the model bolds the page names it links. Everything else, including the
 * whitespace, is left exactly as written.
 *
 * Link handling is fail-closed. In-portal paths (`/accounts`) navigate through
 * GuardedLink so a half-finished order still asks before it is discarded, and
 * `https://` links open in a new tab. Anything else — a relative path, a
 * `javascript:` URL, a scheme we do not recognise — renders as plain text
 * rather than as something clickable.
 */

'use client';

import { Fragment, type ReactNode } from 'react';
import { GuardedLink } from '@/components/GuardedLink';

/**
 * `[label](target)` or `**bold**`.
 *
 * Bold is matched before links so `**[Accounts](/accounts)**` — which the model
 * writes often, since it is told to link pages and to bold the things you press
 * — is taken as one bold span whose contents are then tokenised again. Matching
 * the link first would leave the `**` behind as literal asterisks; not
 * recursing left the whole `[label](path)` sitting inside the bold as text.
 *
 * A fresh instance per call: the pattern is stateful (`g`), and the renderer is
 * now re-entrant.
 */
const TOKEN = () => /\*\*([^*\n]+)\*\*|\[([^\]\n]+)\]\(([^)\s]+)\)/g;

const LINK_CLASS =
  'text-csa-accent underline underline-offset-2 hover:opacity-80 transition-opacity';

/** An in-portal path, and not a protocol-relative URL like `//evil.example`. */
function isPortalPath(href: string): boolean {
  return href.startsWith('/') && !href.startsWith('//');
}

function renderLink(label: string, href: string, key: number): ReactNode {
  if (isPortalPath(href)) {
    return (
      <GuardedLink key={key} href={href} className={LINK_CLASS}>
        {label}
      </GuardedLink>
    );
  }
  if (href.startsWith('https://') || href.startsWith('http://')) {
    return (
      <a key={key} href={href} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
        {label}
      </a>
    );
  }
  // Unrecognised target: show the label, keep it inert.
  return <Fragment key={key}>{label}</Fragment>;
}

export function renderSupportContent(content: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = TOKEN();
  let cursor = 0;
  let key = 0;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    if (match.index > cursor) {
      out.push(<Fragment key={key++}>{content.slice(cursor, match.index)}</Fragment>);
    }

    const [, bold, label, href] = match;
    if (bold !== undefined) {
      // A link inside the bold is still a link, so the contents go round again.
      out.push(
        <strong key={key++} className="font-semibold text-text-primary">
          {renderSupportContent(bold)}
        </strong>
      );
    } else {
      out.push(renderLink(label, href, key++));
    }

    cursor = match.index + match[0].length;
  }

  if (cursor < content.length) {
    out.push(<Fragment key={key++}>{content.slice(cursor)}</Fragment>);
  }

  return out;
}

export default function SupportMessage({ content }: { content: string }) {
  return <>{renderSupportContent(content)}</>;
}
