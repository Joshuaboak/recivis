/**
 * Tests for the support answer renderer.
 *
 * The assistant emits markdown links, so this is what stands between a reply
 * and a wall of `[Accounts](/accounts)`. It is also the only thing deciding
 * what becomes clickable, so the inert cases matter as much as the live ones.
 *
 * Structural rather than rendered: the elements are inspected directly, which
 * keeps the suite in the node environment the rest of the project uses.
 */
import { describe, it, expect } from 'vitest';
import { Fragment, isValidElement, type ReactElement } from 'react';
import { renderSupportContent } from '@/components/support/SupportMessage';
import { GuardedLink } from '@/components/GuardedLink';

/** The elements produced, ignoring the plain-text fragments between them. */
function elements(content: string): ReactElement[] {
  return renderSupportContent(content).filter(
    (node): node is ReactElement => isValidElement(node) && node.type !== Fragment
  );
}

/** The text a node carries, whether it is a fragment, a link or bold. */
function textOf(node: ReactElement): unknown {
  return (node.props as { children?: unknown }).children;
}

describe('renderSupportContent', () => {
  it('leaves plain prose alone', () => {
    const out = renderSupportContent('Open the order and press Place Order.');
    expect(out).toHaveLength(1);
  });

  it('turns an in-portal path into a guarded link', () => {
    const [link] = elements('Go to [Accounts](/accounts) and search.');
    expect(link.type).toBe(GuardedLink);
    expect((link.props as { href: string }).href).toBe('/accounts');
    expect(textOf(link)).toBe('Accounts');
  });

  it('keeps the surrounding text', () => {
    const out = renderSupportContent('Go to [Accounts](/accounts) and search.');
    expect(out[0]).toMatchObject({ props: { children: 'Go to ' } });
    expect(out[2]).toMatchObject({ props: { children: ' and search.' } });
  });

  it('opens an external link in a new tab', () => {
    const [link] = elements('Ask [CSA helpdesk](https://helpdesk.civilsurveyapplications.com).');
    expect(link.type).toBe('a');
    expect(link.props).toMatchObject({ target: '_blank', rel: 'noopener noreferrer' });
  });

  it('refuses to make a javascript: URL clickable', () => {
    expect(elements('Try [this](javascript:alert(1)).')).toHaveLength(0);
  });

  it('refuses a protocol-relative URL, which is not an in-portal path', () => {
    expect(elements('Try [this](//evil.example/accounts).')).toHaveLength(0);
  });

  it('renders bold, since the model emits it alongside links', () => {
    const [bold] = elements('You need an **Account** record.');
    expect(bold.type).toBe('strong');
    expect(textOf(bold)).toBe('Account');
  });

  it('handles several links in one answer', () => {
    const links = elements('[Accounts](/accounts) then [Orders](/orders) then [Assets](/assets)');
    expect(links).toHaveLength(3);
    expect(links.map(l => (l.props as { href: string }).href)).toEqual([
      '/accounts',
      '/orders',
      '/assets',
    ]);
  });

  it('is not confused by a second call, so a re-render matches the first', () => {
    const once = elements('[Accounts](/accounts)');
    const twice = elements('[Accounts](/accounts)');
    expect(twice).toHaveLength(once.length);
  });
});
