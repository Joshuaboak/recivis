/**
 * Tests for links in the order assistant's replies.
 *
 * A link is the one piece of model output a reader cannot check before acting
 * on it, and this model has invented plausible-looking ones — a portal address
 * on the CRM's host, for instance. So only two destinations are clickable, and
 * everything else renders as its label. These cases are the whole of that rule.
 *
 * Structural rather than rendered: the elements are inspected directly, which
 * keeps the suite in the node environment the rest of the project uses.
 */
import { describe, it, expect } from 'vitest';
import { isValidElement, type ReactElement } from 'react';
import { renderInline } from '@/components/chat/ChatMessage';
import { GuardedLink } from '@/components/GuardedLink';

/** The elements produced, ignoring the plain strings between them. */
function elements(text: string): ReactElement[] {
  return renderInline(text).filter((n): n is ReactElement => isValidElement(n));
}

describe('renderInline links', () => {
  it('navigates in-portal for an order path', () => {
    const [link] = elements('Created: [order 03086](/orders/5577900001234)');
    expect(link.type).toBe(GuardedLink);
    expect((link.props as { href: string }).href).toBe('/orders/5577900001234');
  });

  it('opens a CRM record in a new tab', () => {
    const [link] = elements(
      'See [the record](https://crm.zoho.com.au/crm/org7002802215/tab/Invoices/123)'
    );
    expect(link.type).toBe('a');
    expect(link.props).toMatchObject({ target: '_blank', rel: 'noopener noreferrer' });
  });

  it('refuses the portal URL the model invented, which leads nowhere', () => {
    const text = 'Here: [the order](https://crm.zoho.com.au.example/portal/csa/Invoices/1)';
    expect(elements(text)).toHaveLength(0);
    // The label survives as text, so the sentence still reads.
    expect(renderInline(text).join('')).toContain('the order');
  });

  it('refuses a host that merely starts with the CRM name', () => {
    expect(elements('[x](https://crm.zoho.com.au.evil.example/a)')).toHaveLength(0);
  });

  it('refuses a protocol-relative URL, which is not an in-portal path', () => {
    expect(elements('[x](//evil.example/orders/1)')).toHaveLength(0);
  });

  it('refuses a javascript: target', () => {
    expect(elements('[x](javascript:alert(1))')).toHaveLength(0);
  });

  it('refuses plain http to anywhere', () => {
    expect(elements('[x](http://crm.zoho.com.au/crm/tab/Invoices/1)')).toHaveLength(0);
  });

  it('still renders bold and code alongside links', () => {
    const out = elements('**Draft** and `CSD-SU-CL` and [order](/orders/1)');
    expect(out.map(e => e.type)).toEqual(['strong', 'code', GuardedLink]);
  });
});
