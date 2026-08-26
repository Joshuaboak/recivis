/**
 * support/knowledge.ts — what the support assistant knows about this portal.
 *
 * Written for partners, not for engineers. PROJECT_CONTEXT.md exists and is
 * thorough, but it is architecture documentation: field gotchas, tool names,
 * permission internals. An assistant pointed at it would cheerfully explain
 * the licence module naming to a reseller who asked how to place an order.
 *
 * Two things every topic carries beyond its prose:
 *
 *   `path`     — the page it happens on, so the answer can be a link rather
 *                than a set of directions.
 *   `requires` — the permissions the actions in it need. `knowledgeAsPrompt`
 *                resolves those against the person asking and marks the topic
 *                as available or not, so the assistant never talks somebody
 *                through a button that is not on their screen.
 *
 * Coverage is the point. A partner asking "what can I do with leads" should
 * get the actual list of things, so each module has a topic describing its
 * screen and every action on it, not just the workflows people ask about most.
 *
 * Rule for editing: describe what someone sees and does. If a sentence needs
 * the reader to know how the system is built, it belongs somewhere else.
 */

import type { UserPermissions } from '@/lib/types';

export interface HelpTopic {
  id: string;
  title: string;
  /** Where in the portal this happens, in the words of the navigation. */
  where: string;
  /** The page's path, when the topic is about one page. */
  path?: string;
  /** Permissions the actions described here need. */
  requires?: (keyof UserPermissions)[];
  body: string;
}

export const HELP_TOPICS: HelpTopic[] = [
  // ── The map ─────────────────────────────────────────────────────────────
  {
    id: 'whats-here',
    title: 'What is in the portal',
    where: 'The sidebar',
    path: '/dashboard',
    body:
      'Dashboard is the landing page and links to the sections you use most. Leads ' +
      'holds both enquiries who have not tried the software and prospects who have ' +
      'downloaded the trial but not bought. Accounts are your customers. Assets are the ' +
      'licences those customers hold. Orders are what you raise to sell them something. ' +
      'Order Assistant drafts an order for you from a conversation. Coupons are discount ' +
      'codes. Reports cover your own sales; Partners covers your organisation, what is ' +
      'owed, and the resources CSA publishes for you. Which of these you see depends on ' +
      'your permissions.',
  },
  {
    id: 'dashboard',
    title: 'The Dashboard',
    where: 'Dashboard',
    path: '/dashboard',
    body:
      'The landing page. Shortcut cards into Leads, Accounts, Orders, Order Assistant, ' +
      'Reports Dashboard and the Reports Assistant, each with a line saying what it is ' +
      'for and a Learn more link. Nothing is created or changed from here — it is a ' +
      'starting point.',
  },

  // ── Leads ───────────────────────────────────────────────────────────────
  {
    id: 'leads-module',
    title: 'What you can do with leads',
    where: 'Leads',
    path: '/leads',
    requires: ['canExportData'],
    body:
      'A lead is an enquiry who has not tried the software yet — somebody who filled ' +
      'in a form on the website or came in through marketing. A prospect has ' +
      'downloaded a free trial and is evaluating it, but has not bought. Both live ' +
      'under Leads, in the same list. Two things tell them apart: the status column ' +
      'reads Prospect, and the evaluation filter can show only those holding a trial. The stage decides what you can do: a lead is edited and worked, a ' +
      'prospect holds trial licences and can be ordered against. Convert to Prospect, ' +
      'on the lead itself, is the step between the two — press it once they have ' +
      'downloaded the trial. On the Leads list you ' +
      'can: search by name, company or email; filter by status, by product of interest, ' +
      'and by whether they hold a trial licence; sort the table; open any lead; create ' +
      'a new one with New Lead; and export the filtered list to a spreadsheet if you ' +
      'have the export permission. Distributors and CSA also get region and partner ' +
      'filters, so they can look at one reseller at a time. Neither a lead nor ' +
      'a prospect is a customer: they become one when they buy.',
  },
  {
    id: 'leads-create',
    title: 'Creating a lead',
    where: 'Leads → New Lead',
    path: '/leads/new',
    body:
      'Name, company and email are the ones that matter; everything else — phone, ' +
      'mobile, website, job title, industry, country, lead source, status, products of ' +
      'interest and free-text notes — is optional but makes the lead worth having later. ' +
      'If you are a distributor you also choose which of your resellers the lead belongs ' +
      'to. Create Lead saves it and opens it.',
  },
  {
    id: 'leads-detail',
    title: 'What you can do on a lead',
    where: 'Leads → open a lead',
    path: '/leads',
    requires: ['canCreateEvaluations', 'canConvertLeads'],
    body:
      'The badge beside the name says whether this is a lead or a prospect, and hovering ' +
      'it explains the difference. The details panel is editable in place — contact ' +
      'details, status, industry, products of interest — then Save Changes. The panels ' +
      'underneath show any contacts, orders and trial licences attached. Create ' +
      'Evaluation issues a 30-day trial, and it appears once the record is a prospect ' +
      'and you have the evaluation permission. Convert to Prospect is what moves a lead ' +
      'to that stage. It is one-way, so convert when they have actually taken the ' +
      'trial rather than in advance.',
  },

  // ── Accounts ────────────────────────────────────────────────────────────
  {
    id: 'finding-customers',
    title: 'Finding a customer',
    where: 'Accounts',
    path: '/accounts',
    body:
      'Accounts are your customers. Search by company name, a contact email, or the ' +
      'email domain. Domain search is the useful one when you have an email from ' +
      'someone but do not know what their company is called in the portal. Leads are ' +
      'separate: a lead is an enquiry who has not tried the software, a prospect has ' +
      'downloaded the trial, and neither is a customer until they buy.',
  },
  {
    id: 'accounts-module',
    title: 'What you can do with customers',
    where: 'Accounts',
    path: '/accounts',
    requires: ['canExportData'],
    body:
      'On the Accounts list you can: search; filter by region, country and — if you are ' +
      'a distributor — by which of your resellers owns them; sort; open a customer; ' +
      'create one with New Account; and export the filtered list if you have the export ' +
      'permission. Creating a customer warns you about possible duplicates before it ' +
      'saves, which is worth reading: two records for one company splits their licence ' +
      'history in half.',
  },
  {
    id: 'account-detail',
    title: 'What you can do on a customer',
    where: 'Accounts → open a customer',
    path: '/accounts',
    requires: [
      'canCreateInvoices',
      'canCreateEvaluations',
      'canMonthlySubscriptions',
      'canExportData',
    ],
    body:
      'Everything about one customer lives here, in panels down the page. ' +
      'Details: their address and contact fields, with Edit Account to change them. ' +
      'Contacts: New Contact to add one, and Make primary or Make secondary in the ' +
      'Role column to mark which is which — the primary is who orders and licence ' +
      'keys go to. ' +
      'Orders: every order raised for them, and New Product Order to raise another. ' +
      'Evaluations: their trial licences, with Create Evaluation. ' +
      'Active Assets: the licences they currently hold, where you can tick licences and ' +
      'press Generate Renewal, press Create Monthly Subscription, press Renew All Monthly ' +
      'Licences to extend their rolling subscriptions in one go or tick some and press ' +
      'Renew Selected Monthly Assets, and send licence keys out again with ' +
      'Send Keys to Reseller or Send Keys to Customer. Monthly subscriptions renew by the ' +
      'month rather than by renewal order, so Generate Renewal does not apply to them and ' +
      'a selection cannot mix the two. ' +
      'Archived Assets: expired and superseded licences, kept for history. ' +
      'Each table has an export button if you have the export permission. Which buttons ' +
      'appear depends on your permissions.',
  },

  // ── Orders ──────────────────────────────────────────────────────────────
  {
    id: 'orders-module',
    title: 'What you can do with orders',
    where: 'Orders',
    path: '/orders',
    requires: ['canExportData'],
    body:
      'Existing Orders lists every order you have raised. You can search, filter by ' +
      'status (Draft, Approved, Sent), filter by order type (New Product, Renewal, ' +
      'Co-Term, Add To Contract), filter by region and by reseller if you are a ' +
      'distributor, sort by date or value, open any order, and export the filtered list ' +
      'if you have the export permission. New orders are raised from the customer, not ' +
      'from here.',
  },
  {
    id: 'placing-an-order',
    title: 'Placing a new order',
    where: 'Accounts → open a customer → New Product Order',
    path: '/accounts',
    requires: ['canCreateInvoices'],
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
    path: '/orders',
    requires: ['canCreateInvoices'],
    body:
      'Creating orders needs the Create Orders permission. If you do not have it the ' +
      'order will not be created and the page will tell you so. Permissions are set by ' +
      'your organisation and by CSA together, so ask whoever administers your partner ' +
      'account, or contact CSA support.',
  },
  {
    id: 'order-detail',
    title: 'What you can do on an order',
    where: 'Orders → open an order',
    path: '/orders',
    requires: ['canApproveInvoices', 'canSendInvoices', 'canModifyPrices', 'canUploadPO'],
    body:
      'An open order shows its header (customer, contact, dates, currency, totals) and ' +
      'its line items. Depending on your permissions and the order status you can: ' +
      'change line item quantities and prices while it is still a Draft; apply a coupon ' +
      'code in the Coupon panel; choose whether the order and keys go to you or to the ' +
      'customer in the Send To panel; enter a purchase order number and attach the ' +
      'purchase order document; change the status; and finish the order with Place ' +
      'Order, Pay Now or Pay Later. Editing prices needs the change-prices permission — ' +
      'without it the prices are shown but fixed.',
  },
  {
    id: 'sending-an-order',
    title: 'Sending an order and getting licence keys',
    where: 'Orders → open an order',
    path: '/orders',
    requires: ['canApproveInvoices', 'canSendInvoices'],
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
    path: '/orders',
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
    path: '/orders',
    requires: ['canDirectCustomerComms'],
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
    path: '/orders',
    requires: ['canUploadPO'],
    body:
      'Placing an order on account terms needs both a purchase order number and an ' +
      'attached purchase order document. Both go in the Purchase Order panel on the ' +
      'order, and both have to be there before Place Order will go through.',
  },
  {
    id: 'order-assistant',
    title: 'The Order Assistant',
    where: 'Order Assistant',
    path: '/order-assistant',
    requires: ['canCreateInvoices'],
    body:
      'A conversation that drafts an order for you. Tell it who the customer is and what ' +
      'they want and it finds the customer, picks the product, and builds a draft for ' +
      'you to check before anything is created. It can also create a lead, a customer ' +
      'or a contact when the person you name is not in the portal yet, and it asks for ' +
      'the details it needs rather than guessing. It will not approve, send or pay for ' +
      'anything — that stays on the order itself. This is a different assistant from the ' +
      'help window you are reading now: that one explains the portal, this one does the ' +
      'work of building an order.',
  },

  // ── Assets and renewals ─────────────────────────────────────────────────
  {
    id: 'assets-views',
    title: 'The Assets section',
    where: 'Assets',
    path: '/assets',
    body:
      'All Assets is every licence you can see, with filters for status and renewal ' +
      'window and a search box. Due for Renewal and Recently Expired are the 60-day ' +
      'windows either side of today. Monthly Subscriptions lists rolling monthly ' +
      'licences and lets you renew them. Everything is grouped by customer, each group ' +
      'expands and collapses, and the group header shows the next renewal date — because ' +
      'licences are individual records but you think in customers. Opening a customer ' +
      'from here gets you to the buttons that raise renewals.',
  },
  {
    id: 'renewals',
    title: 'Renewing licences',
    where: 'Assets → Due for Renewal, or a customer record',
    path: '/assets/renewals',
    requires: ['canCreateInvoices'],
    body:
      'Due for Renewal lists every licence across all your customers renewing in the ' +
      'next 60 days, soonest first and grouped by customer. Recently Expired does the ' +
      'same for ones that lapsed in the last 60 days. To raise a renewal, open the ' +
      'customer, tick the licences on the Active Assets table, and the Generate Renewal ' +
      'button appears above the table. Some licences cannot be renewed — evaluations, ' +
      'educational and NFR licences, and anything already upgraded — and hovering the ' +
      'button explains which ones are blocking it. The renewal arrives as a draft order ' +
      'you still have to place.',
  },
  {
    id: 'evaluations',
    title: 'Evaluation licences',
    where: 'Accounts → open a customer → Evaluations',
    path: '/accounts',
    requires: ['canCreateEvaluations', 'canExtendEvaluations'],
    body:
      'Evaluations are 30-day trial licences. Create Evaluation sits on the customer ' +
      'record and on a lead. There is usually a limit on how many evaluations one ' +
      'customer can have, and longer than 30 days needs a separate permission. ' +
      'Evaluations cannot be renewed — the customer buys a commercial licence instead.',
  },
  {
    id: 'monthly-subscriptions',
    title: 'Monthly subscriptions',
    where: 'Accounts → open a customer → Active Assets → Create Monthly Subscription',
    path: '/assets/subscriptions',
    requires: ['canMonthlySubscriptions'],
    body:
      'A monthly subscription is a 30-day licence that you renew a month at a time. ' +
      'Prices are quoted in US dollars with your own currency alongside, and you are ' +
      'charged the list price less your commission. Civil Site Design can also be bought ' +
      'on a perpetual purchase plan, which costs more per month and works towards owning ' +
      'the licence outright. Renewing extends by 30 days: a subscription still in date ' +
      'extends from its existing renewal date, one that has lapsed extends from today. ' +
      'Renew one at a time from the Monthly Subscriptions list, a chosen few by ticking ' +
      'them on a customer record and pressing Renew Selected Monthly Assets, or a whole ' +
      'customer at once with Renew All Monthly Licences. The whole feature only appears ' +
      'if your partner account has monthly subscriptions enabled.',
  },

  // ── Coupons ─────────────────────────────────────────────────────────────
  {
    id: 'coupons-module',
    title: 'What you can do with coupons',
    where: 'Coupons',
    path: '/coupons',
    body:
      'A coupon is a discount code you apply to an order. Coupons are set up by CSA, ' +
      'not by partners: this page is where you find one and check it is usable before ' +
      'promising it to a customer. The list shows each code, its discount, what it is ' +
      'valid on, how many times it has been used, and whether it is Draft, Active or ' +
      'Expired, with a status filter and a search box. Open one to see its ' +
      'restrictions — which products, regions, order types and order values it covers, ' +
      'and the dates it runs between. To redeem it, open the order and enter the code ' +
      'in the Coupon panel; it is checked against those restrictions and the discount ' +
      'then appears as its own line on the order. If a code will not apply, the reason ' +
      'is almost always one of those restrictions or the date. Ask CSA for a code you ' +
      'do not have.',
  },

  // ── Reports ─────────────────────────────────────────────────────────────
  {
    id: 'reports-module',
    title: 'Reports on your own sales',
    where: 'Reports',
    path: '/reports/dashboard',
    requires: ['canExportData'],
    body:
      'The Reports Dashboard is the numbers view: revenue, your commission or earnings, ' +
      'and counts of leads, prospects, customers and orders, filtered by month range, ' +
      'region and — for distributors — by partner. Amounts are shown in the original ' +
      'currency with an Australian dollar equivalent, and there is a breakdown by ' +
      'currency underneath. It exports if you have the export permission. The Reports ' +
      'Assistant is the same material as a conversation: ask it a question about your ' +
      'sales in plain English instead of working the filters yourself.',
  },
  {
    id: 'partner-reports',
    title: 'Working out what you owe',
    where: 'Partners → Partner Reports',
    path: '/partners/reports',
    requires: ['canViewReports'],
    body:
      'The Monthly Statement is the month-end reconciliation: approved orders and active ' +
      'monthly subscriptions, netted against whoever you settle with. If you sit under a ' +
      'distributor you settle with them; if not, you settle with CSA. Distributors also ' +
      'get a per-reseller breakdown. The Billing Schedule is forward-looking: what your ' +
      'active subscriptions cost per month and per year. Both export to a spreadsheet.',
  },

  // ── Partners and account admin ──────────────────────────────────────────
  {
    id: 'partners-module',
    title: 'Managing your partner organisation and its users',
    where: 'Partners → Manage Partners',
    path: '/partners',
    requires: ['canManageUsers', 'canViewChildRecords'],
    body:
      'Manage Partners shows the partner organisations you can see — your own, and any ' +
      'resellers underneath you if you are a distributor. Opening one shows its address, ' +
      'region, currency, partner category, commission percentages, payment methods, ' +
      'customer communication preference and its permissions. Edit Partner changes those ' +
      'settings; each permission can follow the preset for that kind of partner or be ' +
      'overridden for this one. The users list on the same record has Add User, Edit ' +
      'User and Reset Password, and shows each person their role and last login. Most of ' +
      'this needs the manage-users permission; without it you can look but not change.',
  },
  {
    id: 'partner-resources',
    title: 'Marketing material, documentation and training',
    where: 'Partner Resources',
    path: '/partner-resources',
    body:
      'Logos and brand guidelines, product brochures and datasheets, co-branded email ' +
      'templates and social media assets on the marketing side. Technical documentation, ' +
      'knowledge base articles, release notes, getting-started tutorials, feature ' +
      'deep-dives, workflow demonstrations and webinar recordings on the product side. ' +
      'The link to submit a support ticket is here too.',
  },

  // ── Everything else ─────────────────────────────────────────────────────
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
    id: 'guided-tutorial',
    title: 'The guided tutorial',
    where: 'Your name, bottom of the sidebar',
    body:
      'The walkthrough that points at things and explains them as you go. Open the menu ' +
      'under your name to turn it on or off, and Replay starts it again from the ' +
      'beginning whenever you want it. Turning it off is per person, so it does not ' +
      'affect your colleagues.',
  },
  {
    id: 'getting-help',
    title: 'Getting a person',
    where: 'Partner Resources',
    path: '/partner-resources',
    body:
      'The CSA helpdesk at helpdesk.civilsurveyapplications.com takes tickets and has a ' +
      'knowledge base. Partner Resources also links marketing material and product ' +
      'training videos.',
  },
];

/** How each permission reads to somebody who is not a system administrator. */
const PERMISSION_LABELS: Record<keyof UserPermissions, string> = {
  canCreateInvoices: 'create orders',
  canApproveInvoices: 'approve orders',
  canSendInvoices: 'send orders',
  canViewAllRecords: 'see all records',
  canViewChildRecords: 'see records for child partners',
  canModifyPrices: 'change prices on line items',
  canUploadPO: 'upload purchase orders',
  canManageUsers: 'manage users',
  canViewReports: 'view reports',
  canExportData: 'export data',
  canCreateEvaluations: 'create evaluations',
  canConvertLeads: 'convert a lead to a prospect',
  maxEvaluationsPerAccount: 'a limit on evaluations per customer',
  canExtendEvaluations: 'extend evaluations',
  canDirectCustomerComms: 'send straight to customers',
  canMonthlySubscriptions: 'create and renew monthly subscriptions',
};

/** True when the permission is held. The evaluation cap is a number, not a flag. */
function holds(permissions: UserPermissions, key: keyof UserPermissions): boolean {
  const value = permissions[key];
  return typeof value === 'number' ? value !== 0 : value === true;
}

/**
 * The line telling the assistant which parts of a topic this person can use.
 *
 * Spelled out per permission rather than as one verdict, because most topics
 * describe a screen with several buttons on it and only some of them are gated.
 */
function availability(topic: HelpTopic, permissions: UserPermissions): string {
  if (!topic.requires?.length) return '';
  const parts = topic.requires.map(key => {
    const label = PERMISSION_LABELS[key];
    return holds(permissions, key) ? `${label}: YES` : `${label}: NO`;
  });
  return `Permissions in play — ${parts.join('; ')}\n`;
}

/**
 * The knowledge base as prompt text.
 *
 * With permissions, each topic is annotated with what this person can and
 * cannot do in it. Without them the material is returned plain, which is only
 * useful for tests and tooling — a real answer should always be scoped.
 */
export function knowledgeAsPrompt(permissions?: UserPermissions): string {
  return HELP_TOPICS
    .map(topic => {
      const link = topic.path ? ` (${topic.path})` : '';
      const gate = permissions ? availability(topic, permissions) : '';
      return `### ${topic.title}\nWhere: ${topic.where}${link}\n${gate}${topic.body}`;
    })
    .join('\n\n');
}
