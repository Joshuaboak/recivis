/**
 * order-recipients.ts — who an order and its licence keys go to.
 *
 * The customer page states this twice: once in the "Order and Licence Keys will
 * be sent to" panel, and again in the confirmation before anything is sent. If
 * those two disagree the confirmation is worse than useless, because it is the
 * one somebody reads while deciding — so both read it from here.
 *
 * The routing itself is one flag on the order, `Reseller_Direct_Purchase`.
 */

/** One side of the send-to toggle, described the same way everywhere. */
export interface OrderRecipient {
  /** Who receives it: the partner, or the end customer. */
  kind: 'reseller' | 'customer';
  /** Their name, or a generic stand-in when the record has none. */
  name: string;
  /** Who is copied in, as a sentence fragment. */
  copiedTo: string;
}

/** Read the recipient off an order record. */
export function orderRecipient(invoice: Record<string, unknown>): OrderRecipient {
  if (invoice.Reseller_Direct_Purchase) {
    return {
      kind: 'reseller',
      name: (invoice.Reseller as { name?: string } | null)?.name || 'the reseller',
      copiedTo: 'the CSA Geo Sales Rep',
    };
  }
  return {
    kind: 'customer',
    name: (invoice.Contact_Name as { name?: string } | null)?.name || 'the customer',
    copiedTo: 'the reseller and the CSA Geo Sales Rep',
  };
}

/**
 * The recipient as one sentence, for a confirmation dialog.
 *
 * Names the person rather than only the role, because "sent to the customer" is
 * not something anybody can check before pressing the button.
 */
export function recipientSentence(invoice: Record<string, unknown>): string {
  const { name, copiedTo } = orderRecipient(invoice);
  return `${name}, copying ${copiedTo}`;
}
