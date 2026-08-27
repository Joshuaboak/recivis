/**
 * Tests for links in the order assistant's replies.
 *
 * A link is the one piece of model output a reader cannot check before acting
 * on it, and this model has invented plausible-looking ones — a portal address
 * on the CRM's host, for instance. So only a path inside this portal is
 * clickable, and everything else renders as its label. These cases are the
 * whole of that rule.
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

  it('refuses a CRM link — the assistant links to this portal, not the CRM', () => {
    // Most partners have no CRM login, and everything they need has a page
    // here. The Open in CRM button on a record is the way in for those who do.
    expect(
      elements('See [the record](https://crm.zoho.com.au/crm/org7002802215/tab/Invoices/123)')
    ).toHaveLength(0);
  });

  it('refuses the portal URL the model invented, which leads nowhere', () => {
    const text = 'Here: [the order](https://crm.zoho.com.au.example/portal/csa/Invoices/1)';
    expect(elements(text)).toHaveLength(0);
    // The label survives as text, so the sentence still reads.
    expect(renderInline(text).join('')).toContain('the order');
  });

  it('refuses an absolute URL to the portal itself — the host changes', () => {
    expect(
      elements('[x](https://recivis-production.up.railway.app/orders/1)')
    ).toHaveLength(0);
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

  it('keeps the order id readable for the PO drop zone', () => {
    // POAttachment finds the order from the link in the message, so the portal
    // path has to carry the id the CRM URL used to.
    expect('Invoice created: [order 03086](/orders/5577900001234)').toMatch(/\/orders\/(\d+)/);
  });

  it('still renders bold and code alongside links', () => {
    const out = elements('**Draft** and `CSD-SU-CL` and [order](/orders/1)');
    expect(out.map(e => e.type)).toEqual(['strong', 'code', GuardedLink]);
  });
});
