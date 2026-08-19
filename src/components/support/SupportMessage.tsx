/**
 * SupportMessage — renders one support answer.
 *
 * The assistant is told to link every page it names, so its replies contain
 * markdown links. Rendering them as text would be worse than not asking for
 * them at all — the reader gets `[Accounts](/accounts)` instead of a way to
 * get to Accounts.
 *
 * This is a deliberately tiny renderer, not a markdown library: links and bold
 * only, which is all the prompt asks the model to produce. Everything else,
 * including the whitespace, is left exactly as written.
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

/** `[label](target)` or `**bold**`. */
const TOKEN = /\[([^\]\n]+)\]\(([^)\s]+)\)|\*\*([^*\n]+)\*\*/g;

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
  let cursor = 0;
  let key = 0;

  TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN.exec(content)) !== null) {
    if (match.index > cursor) {
      out.push(<Fragment key={key++}>{content.slice(cursor, match.index)}</Fragment>);
    }

    const [, label, href, bold] = match;
    if (bold !== undefined) {
      out.push(
        <strong key={key++} className="font-semibold text-text-primary">
          {bold}
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
