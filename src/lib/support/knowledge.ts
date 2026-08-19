/**
 * support/knowledge.ts — what the support assistant knows about this portal.
 *
 * Written for partners, not for engineers. PROJECT_CONTEXT.md exists and is
 * thorough, but it is architecture documentation: Zoho field gotchas, MCP tool
 * names, RBAC internals. An assistant pointed at it would cheerfully explain
 * the Assets1 module naming to a reseller who asked how to place an order.
 *
 * Kept as data rather than prose in the prompt so each section can be cited,
 * revised, and eventually retrieved rather than sent whole.
 *
 * Rule for editing: describe what someone sees and does. If a sentence needs
 * the reader to know what Zoho is, it belongs somewhere else.
 */

export interface HelpTopic {
  id: string;
  title: string;
  /** Where in the portal this happens. */
  where: string;
  body: string;
}

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: 'finding-customers',
    title: 'Finding a customer',
    where: 'Accounts',
    body:
      'Accounts are your customers. Search by company name, a contact email, or the ' +
      'email domain. Domain search is the useful one when you have an email from ' +
      'someone but do not know what their company is called in the portal. Leads are ' +
      'separate: those are enquiries that have not become customers yet.',
  },
  {
    id: 'placing-an-order',
    title: 'Placing a new order',
    where: 'Accounts → open a customer → New Product Order',
    body:
      'Orders always start from a customer record, which is why the button is on the ' +
      'account page and not in the Orders section. Opening an order from there carries ' +
      'the customer, their contact and your pricing across automatically. Add a line ' +
      'item, choose the product through the SKU picker, set quantity, then Create Order. ' +
      'The order starts as a Draft and nothing is sent until you send it.',
  },
  {
    id: 'order-cannot-create',
    title: 'The Create Order button does nothing',
    where: 'Orders',
    body:
      'Creating orders needs the Create Orders permission. If you do not have it the ' +
      'order will not be created and the page will tell you so. Permissions are set by ' +
      'your organisation and by CSA together, so ask whoever administers your partner ' +
      'account, or contact CSA support.',
  },
  {
    id: 'sending-an-order',
    title: 'Sending an order and getting licence keys',
    where: 'Orders → open an order',
    body:
      'An order has to be approved before licence keys exist. Place Order approves it ' +
      'and generates the keys. Pay Now opens a card payment page and the keys follow ' +
      'automatically once payment clears. Pay Later sends the order out for payment and ' +
      'the keys follow when it is paid. Which of these you see depends on whether your ' +
      'partner account is set up for card payment, account terms, or both.',
  },
  {
    id: 'order-locked',
    title: 'Why an order cannot be edited any more',
    where: 'Orders → open an order',
    body:
      'Once an order is Approved or Sent it is locked and shows a Locked badge. That is ' +
      'deliberate: licence keys may already have been issued against it and the money is ' +
      'settled off its totals. If something is wrong on a locked order, contact CSA ' +
      'rather than trying to work around it.',
  },
  {
    id: 'send-to',
    title: 'Who the order and keys get emailed to',
    where: 'Orders → open an order → Order and Licence Keys will be sent to',
    body:
      'Reseller sends everything to you, copying the CSA sales rep. Customer sends it ' +
      'straight to the end customer, copying you and the CSA rep. The Customer option ' +
      'only appears if your partner account is allowed to communicate directly with ' +
      'customers; if you cannot see it, that setting is off.',
  },
  {
    id: 'purchase-orders',
    title: 'Purchase orders',
    where: 'Orders → open an order → Purchase Order',
    body:
      'Placing an order on account terms needs both a PO number and an attached PO ' +
      'document. Both go in the Purchase Order panel on the order, and both have to be ' +
      'there before Place Order will go through.',
  },
  {
    id: 'renewals',
    title: 'Renewing licences',
    where: 'Assets → Due for Renewal, or a customer record',
    body:
      'Due for Renewal lists every licence across all your customers renewing in the ' +
      'next 60 days, soonest first and grouped by customer. Recently Expired does the ' +
      'same for ones that lapsed in the last 60 days. To raise a renewal, open the ' +
      'customer, tick the licences on the Active Assets table, and the Generate Renewal ' +
      'button appears above the table. Some licences cannot be renewed — evaluations, ' +
      'educational and NFR licences, and anything already upgraded — and hovering the ' +
      'button explains which ones are blocking it.',
  },
  {
    id: 'evaluations',
    title: 'Evaluation licences',
    where: 'Accounts → open a customer → Evaluations',
    body:
      'Evaluations are 30-day trial licences. Create Evaluation sits on the customer ' +
      'record. There is usually a limit on how many evaluations one customer can have, ' +
      'and longer than 30 days needs a separate permission. Evaluations cannot be ' +
      'renewed — the customer buys a commercial licence instead.',
  },
  {
    id: 'monthly-subscriptions',
    title: 'Monthly subscriptions',
    where: 'Accounts → open a customer → Active Assets → Create Monthly Subscription',
    body:
      'A monthly subscription is a 30-day licence that you renew a month at a time. ' +
      'Prices are quoted in US dollars with your own currency alongside, and you are ' +
      'charged the list price less your commission. Civil Site Design can also be bought ' +
      'on a perpetual purchase plan, which costs more per month and works towards owning ' +
      'the licence outright. Renewing extends by 30 days: a subscription still in date ' +
      'extends from its existing renewal date, one that has lapsed extends from today. ' +
      'The whole feature only appears if your partner account has monthly subscriptions ' +
      'enabled.',
  },
  {
    id: 'assets-views',
    title: 'The Assets section',
    where: 'Assets',
    body:
      'All Assets is every licence you can see, with filters for status and renewal ' +
      'window. Due for Renewal and Recently Expired are the 60-day windows either side ' +
      'of today. Monthly Subscriptions lists rolling monthly licences and lets you renew ' +
      'them. Everything is grouped by customer, because licences are individual records ' +
      'but you think in customers.',
  },
  {
    id: 'partner-reports',
    title: 'Working out what you owe',
    where: 'Partners → Partner Reports',
    body:
      'The Monthly Statement is the month-end reconciliation: approved orders and active ' +
      'monthly subscriptions, netted against whoever you settle with. If you sit under a ' +
      'distributor you settle with them; if not, you settle with CSA. Distributors also ' +
      'get a per-reseller breakdown. The Billing Schedule is forward-looking: what your ' +
      'active subscriptions cost per month and per year. Both export to CSV.',
  },
  {
    id: 'permissions',
    title: 'Why something is missing or greyed out',
    where: 'Anywhere',
    body:
      'Most things that are hidden or disabled are permissions. They are set in two ' +
      'layers: what your partner organisation is allowed to do, and what your own user ' +
      'account is allowed to do within it. You need both. That is why a colleague can ' +
      'sometimes do something you cannot even though you work at the same company. Your ' +
      'partner administrator or CSA can change them.',
  },
  {
    id: 'getting-help',
    title: 'Getting a person',
    where: 'Partner Resources',
    body:
      'The CSA helpdesk at helpdesk.civilsurveyapplications.com takes tickets and has a ' +
      'knowledge base. Partner Resources also links marketing material and product ' +
      'training videos.',
  },
];

/** The knowledge base as prompt text. */
export function knowledgeAsPrompt(): string {
  return HELP_TOPICS
    .map(topic => `### ${topic.title}\nWhere: ${topic.where}\n${topic.body}`)
    .join('\n\n');
}
