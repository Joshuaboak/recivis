/**
 * tour/sections.ts — the guided tutorial, one section per page.
 *
 * A section belongs to a route. It offers itself the first time that route is
 * visited, and the help icon in the header brings it back on demand. Nothing
 * here navigates: the user goes where they were going anyway, and the tutorial
 * meets them there.
 *
 * Five rules shaped this list:
 *
 * 1. **A section explains one page.** No step assumes the user arrived from
 *    another section, or that they will go on to a particular next one.
 * 2. **One step, one thing.** A step names a single control and says what it
 *    is for. Anything that needed a second sentence about a second control is
 *    two steps, so the highlight is always on what is being talked about.
 * 3. **Point at what you mention.** If a step names a button, a filter or a
 *    column, it anchors to it. Steps with no anchor exist only where the
 *    subject is the whole page.
 * 4. **Say it plainly.** Titles are short, and name the thing before glossing
 *    it — "Assets: your customer licences". Bodies are one to three sentences
 *    of plain statement. No asides, no throat-clearing, no selling.
 * 5. **Nothing is shown that the viewer cannot do.** Steps declare the
 *    permissions their subject needs; a section whose steps are all filtered
 *    out stops existing for that person, icon and all.
 * 6. **Every claim comes from the code.** What a control does is read out of
 *    the thing that implements it, not inferred from its name or its
 *    neighbours. Copy written from context reads perfectly well and is wrong
 *    in ways nobody notices until a partner follows it: the notifications
 *    step described renewal reminders for a bell that reports new leads,
 *    evaluations, order status and expiries. If the source has not been
 *    opened, the sentence does not go in.
 *
 * A missing anchor is normal — empty lists, buttons that appear on selection,
 * panels that depend on data. The controller skips them.
 */

import { ROUTES, buildPath, type LegacyViewId } from '../routes';
import type { UserPermissions } from '../types';

/**
 * The URL pattern for a route, with `[id]` left in place.
 *
 * `buildPath` is for concrete URLs and percent-encodes whatever id it is
 * given, so it cannot express "any account".
 */
function routePattern(view: LegacyViewId): string {
  const route = ROUTES.find(r => r.legacyViewId === view);
  if (!route) throw new Error(`tour: unknown route "${view}"`);
  return route.path;
}

/** Which side of the anchor the popover sits on. driver.js's own vocabulary. */
export type TourSide = 'top' | 'right' | 'bottom' | 'left';
export type TourAlign = 'start' | 'center' | 'end';

export interface TourStep {
  /** Unique within its section. */
  id: string;
  /** Element to highlight, matched as [data-tour="..."]. Omit to centre it. */
  anchor?: string;
  title: string;
  /**
   * What the step says.
   *
   * Rendered as HTML, so `<strong>` and `<br>` are available where a step is
   * really a short definition list. Everything here is written by us — none of
   * it comes from a record — so there is nothing to escape.
   */
  body: string;
  /**
   * Where to put the popover relative to the anchor. Defaults to below it,
   * which is wrong for anything down the left edge or hard against the top
   * right — the arrow ends up pointing at nothing.
   */
  side?: TourSide;
  align?: TourAlign;
  /**
   * Drop this step when its anchor is not on the page as the section opens.
   *
   * For controls that belong to one version of a page rather than to the page
   * itself: a lead and the prospect it became are the same route and share
   * almost no markup, and an order's coupon and action panels are there while
   * it is a Draft and gone once it is not. Without this the walkthrough either
   * counts steps it cannot show or, where every step belongs to the other
   * version, opens with nothing in it.
   */
  onlyIfPresent?: boolean;
  /** Permissions this step's subject needs. Missing any one drops the step. */
  requires?: (keyof UserPermissions)[];
}

export interface TourSection {
  /** Stable id. Stored against the user once they have seen it. */
  id: string;
  /** What this section is called, shown in the popover's progress line. */
  title: string;
  /** The route it explains. `[id]` matches any single segment. */
  path: string;
  /**
   * Permissions needed for the section to exist at all. A section can also
   * disappear by having every one of its steps filtered out.
   */
  requires?: (keyof UserPermissions)[];
  steps: TourStep[];
}

export const ALL_SECTIONS: TourSection[] = [
  // ── The dashboard, and the furniture that is on every page ──────────────
  {
    id: 'dashboard',
    title: 'Getting your bearings',
    path: buildPath('dashboard'),
    steps: [
      {
        id: 'welcome',
        title: 'Welcome to the partner portal',
        body:
          'This is a quick tour of how to use the basics of the partner portal. As ' +
          'you continue to explore the portal more quick tutorials will appear.',
      },
      {
        id: 'sidebar',
        anchor: 'sidebar',
        side: 'right',
        align: 'start',
        title: 'The menu, top to bottom',
        body:
          'Every part of the portal is in here. The menu options with arrows open up ' +
          'to sub-menus underneath. The next few steps explain the four you will use ' +
          'most.',
      },
      {
        id: 'nav-leads',
        anchor: 'nav-leads',
        side: 'right',
        align: 'start',
        title: 'Leads: people who have not bought',
        body:
          '<strong>Important:</strong> this menu stores both leads and prospects.' +
          '<br><br><strong>Leads</strong> have interacted with marketing material but ' +
          'have not yet trialled the software. To place an order for a lead you need ' +
          'to convert them to a prospect.' +
          '<br><br><strong>Prospects</strong> have trialled the software. You can ' +
          'create new orders for prospects.' +
          '<br><br>Opens to Browse Leads and Create Lead.',
      },
      {
        id: 'nav-accounts',
        anchor: 'nav-accounts',
        side: 'right',
        align: 'start',
        title: 'Accounts: customers',
        body:
          'Everyone who has bought. Opens to Browse Accounts and Create Account. ' +
          'Renewals and new orders are created from an account.',
      },
      {
        id: 'nav-assets',
        anchor: 'nav-assets',
        side: 'right',
        align: 'start',
        title: 'Assets: your customer licences',
        body:
          'Every licence your customers hold. Opens to All Assets, Due for Renewal ' +
          'and Recently Expired, plus Monthly Subscriptions if your account has them.',
      },
      {
        id: 'nav-orders',
        anchor: 'nav-orders',
        side: 'right',
        align: 'start',
        title: 'Orders: new and renewal sales',
        body:
          'Browse Orders lists them. Order Assistant is a chatbot you can use to ' +
          'place orders.',
      },
      {
        id: 'collapse',
        anchor: 'sidebar-collapse',
        side: 'right',
        title: 'Narrowing the menu',
        body:
          'The arrow on the edge of the menu shrinks it to icons. Labels and ' +
          'sub-menus come back when you open it again.',
      },
      {
        id: 'search',
        anchor: 'header-search',
        side: 'bottom',
        align: 'end',
        title: 'Search: the fastest way to anything',
        body:
          'One box across accounts, prospects, leads, contacts and orders. Press ' +
          '<strong>Ctrl K</strong> from any page, type at least two characters and ' +
          'press Enter. The pills above the results narrow it to one type.',
      },
      {
        id: 'recent',
        anchor: 'header-recent',
        side: 'bottom',
        align: 'end',
        title: 'Recently viewed',
        body:
          'The last ten records you opened — customers, leads, orders, coupons and ' +
          'partners — so you can get back to one without searching again.',
      },
      {
        id: 'notifications',
        anchor: 'header-notifications',
        side: 'bottom',
        align: 'end',
        title: 'Notifications',
        body:
          'New leads, evaluations started, orders approved, sent or paid, and ' +
          'licences that have expired. Anything from the last 30 days. The number is ' +
          'how many are waiting; opening one clears it.',
      },
      {
        id: 'help',
        anchor: 'header-help',
        side: 'bottom',
        align: 'end',
        title: 'Help: replays the tutorial',
        body:
          'Most pages have a short tutorial like this one. This icon replays the one ' +
          'for the page you are on.',
      },
      {
        id: 'cards',
        anchor: 'dashboard-cards',
        side: 'top',
        title: 'Or start from here',
        body:
          'Six shortcuts: Leads, Accounts, Orders, Reports Dashboard, Order Assistant ' +
          'and Reports Assistant. They only take you there. Nothing is created from ' +
          'this page.',
      },
      {
        id: 'learn-more',
        anchor: 'dashboard-learn-more',
        side: 'top',
        align: 'start',
        title: 'Learn more',
        body:
          'Every card has one. It opens that section and plays its tutorial when you ' +
          'arrive.',
      },
      {
        id: 'your-menu',
        anchor: 'user-menu',
        side: 'right',
        align: 'end',
        title: 'Your account',
        body:
          'Your name, email, role, partner and Sign Out. The Guided tutorial switch ' +
          'stops these opening on their own. Restart makes every page introduce ' +
          'itself again.',
      },
      {
        id: 'support',
        anchor: 'support-launcher',
        side: 'left',
        align: 'end',
        title: 'Support assistant',
        body:
          'Ask how to do something in your own words. It knows the portal and what ' +
          'your account is allowed to do. It cannot see your records or change ' +
          'anything.',
      },
    ],
  },

  // ── Leads ───────────────────────────────────────────────────────────────
  {
    id: 'leads',
    title: 'Leads',
    path: buildPath('leads'),
    steps: [
      {
        id: 'whats-here',
        anchor: 'leads-search',
        title: 'Leads and prospects both live here',
        body:
          'A lead is an enquiry that has not been converted yet. A prospect is a ' +
          'converted lead, and most have trialled the software. Search matches the ' +
          'company name from the start.',
      },
      {
        id: 'eval-filter',
        anchor: 'leads-eval-filter',
        title: 'Filter by trial',
        body:
          'Narrows the prospects to those holding an evaluation licence, those with ' +
          'none, or one product. Leads stay in the list either way.',
      },
      {
        id: 'list',
        anchor: 'leads-results',
        onlyIfPresent: true,
        side: 'top',
        title: 'Reading the list',
        body:
          'Status is the stage, and a prospect always reads Prospect. Evaluations ' +
          'lists the trials a prospect holds and is blank for leads. Created sorts. ' +
          'Click any row to open it.',
      },
      {
        id: 'creating',
        anchor: 'nav-leads',
        side: 'right',
        align: 'start',
        title: 'Adding one',
        body:
          'Create Lead is under Leads in the menu. A last name and a company are all ' +
          'it needs.',
      },
    ],
  },
  {
    id: 'lead-create',
    title: 'Creating a lead',
    path: buildPath('create-lead'),
    steps: [
      {
        id: 'contact',
        anchor: 'lead-form',
        title: 'Who they are',
        body:
          'Last Name is the only required field here. First name, email, phone, ' +
          'mobile and job title are all optional.',
      },
      {
        id: 'company',
        anchor: 'lead-company',
        title: 'Where they work',
        body:
          'Company Name is required. Website, industry and country are optional.',
      },
      {
        id: 'submit',
        anchor: 'lead-create-submit',
        side: 'bottom',
        align: 'end',
        title: 'Create Lead',
        body:
          'Saves the lead and opens it. If you leave the page half-finished the ' +
          'portal offers the draft back when you return.',
      },
    ],
  },
  {
    id: 'lead-detail',
    title: 'Lead or prospect',
    path: routePattern('lead-detail'),
    steps: [
      {
        id: 'badge',
        anchor: 'lead-badge',
        title: 'Which one this is',
        body:
          'The badge beside the name says lead or prospect. Hover it for the ' +
          'difference. The page shows different things for each.',
      },
      {
        id: 'record',
        anchor: 'lead-details',
        title: 'The details',
        body:
          'Who they are and who owns them. Open in CRM, at the top, jumps to the same ' +
          'record in Zoho.',
      },
      {
        id: 'convert',
        anchor: 'lead-convert',
        onlyIfPresent: true,
        side: 'bottom',
        align: 'end',
        title: 'Convert to Prospect',
        body:
          'Converts them to a prospect, creating their contact at the same time. Only ' +
          'a prospect can be given a trial or ordered against. It is one-way.',
        requires: ['canConvertLeads'],
      },
      {
        id: 'evaluations',
        anchor: 'lead-evaluations',
        onlyIfPresent: true,
        title: 'Evaluations: their trials',
        body:
          'The trial licences this prospect holds, with the product, dates and serial ' +
          'key for each.',
      },
      {
        id: 'create-evaluation',
        anchor: 'lead-evaluations',
        onlyIfPresent: true,
        title: 'Issuing a trial',
        body:
          'Create Evaluation issues a trial licence. The end date defaults to 30 days ' +
          'out, and 30 days is the maximum unless your role may extend them.',
        requires: ['canCreateEvaluations'],
      },
      {
        id: 'contacts',
        anchor: 'prospect-contacts',
        onlyIfPresent: true,
        title: 'Contacts',
        body:
          'The people at this company. One is marked primary — that is who orders and ' +
          'licence keys go to.',
      },
      {
        id: 'orders',
        anchor: 'prospect-orders',
        onlyIfPresent: true,
        title: 'Orders',
        body:
          'Every order raised for this prospect, drafts included, with its type, ' +
          'status and total. Click one to open it.',
      },
      {
        id: 'new-order',
        anchor: 'prospect-new-order',
        onlyIfPresent: true,
        side: 'left',
        title: 'New Product Order',
        body:
          'Raises an order against this prospect, carrying their contact, reseller ' +
          'and currency into it.',
        requires: ['canCreateInvoices'],
      },
      {
        id: 'assets',
        anchor: 'prospect-assets',
        onlyIfPresent: true,
        title: 'Assets: licences they own',
        body:
          'The licences they have bought, not their trials. Tick one to email its ' +
          'keys to the reseller or the customer.',
      },
    ],
  },

  // ── Accounts ────────────────────────────────────────────────────────────
  {
    id: 'accounts',
    title: 'Customers',
    path: buildPath('accounts'),
    steps: [
      {
        id: 'search',
        anchor: 'accounts-search',
        title: 'Finding a customer',
        body:
          'Search for an account here, by the start of its name. Prospects are not ' +
          'listed on this page.',
      },
      {
        id: 'open',
        anchor: 'accounts-results',
        onlyIfPresent: true,
        side: 'top',
        title: 'Everything happens inside a customer',
        body:
          'Open one for their contacts, orders and licences. Created is the only ' +
          'sortable column. Click a row to open it.',
      },
      {
        id: 'creating',
        anchor: 'nav-accounts',
        side: 'right',
        align: 'start',
        title: 'Adding one',
        body:
          'Create Account is under Accounts in the menu. It needs a company and one ' +
          'contact at it.',
      },
    ],
  },
  {
    id: 'account-create',
    title: 'Creating a customer',
    path: buildPath('create-account'),
    steps: [
      {
        id: 'details',
        anchor: 'account-details-form',
        title: 'The company',
        body:
          'Account Name and Country are required. Reseller is filled in for you ' +
          'unless you sell through other resellers, in which case you pick one. The ' +
          'address is optional.',
      },
      {
        id: 'contact',
        anchor: 'account-primary-contact',
        title: 'The primary contact',
        body:
          'First name, last name and email. This is who orders and licence keys are ' +
          'addressed to.',
      },
      {
        id: 'submit',
        anchor: 'account-create-submit',
        side: 'bottom',
        align: 'end',
        title: 'Create Account',
        body:
          'The button stays greyed until every required field is filled. If an ' +
          'existing account name looks like a match you get it listed first, with ' +
          'Create Anyway underneath.',
      },
    ],
  },
  {
    id: 'account-detail',
    title: 'A customer',
    path: routePattern('account-detail'),
    steps: [
      {
        id: 'contacts',
        anchor: 'account-contacts',
        title: 'Contacts',
        body:
          'The primary contact is who a new order and Send Keys to Customer go to. ' +
          'Set As switches a row to Primary or Secondary. Add Contact needs a first ' +
          'and last name.',
      },
      {
        id: 'orders',
        anchor: 'account-orders',
        title: 'Orders',
        body:
          'Every order raised for this customer, including drafts. Type says whether ' +
          'it is New or a Renewal. Click a row to open it.',
      },
      {
        id: 'new-order',
        anchor: 'new-order-button',
        side: 'left',
        title: 'New Product Order',
        body:
          'Opens a new order already carrying this customer, their primary contact, ' +
          'and the currency and commission for your reseller. An order cannot be ' +
          'started without a customer.',
        requires: ['canCreateInvoices'],
      },
      {
        id: 'evaluations',
        anchor: 'account-evaluations',
        title: 'Evaluations',
        body:
          'The trials this customer holds now. Create Evaluation issues a 30-day one. ' +
          'Expired trials move to Archived Assets but still count against any ' +
          'per-account limit.',
        requires: ['canCreateEvaluations'],
      },
      {
        id: 'assets',
        anchor: 'account-assets',
        title: 'Active Assets',
        body:
          'The licences this customer holds, with serial key and renewal date. Trials ' +
          'are in Evaluations above. Archived Assets below lists the expired ones ' +
          'without their keys.',
      },
      {
        id: 'asset-actions',
        anchor: 'account-assets',
        title: 'Renewals and keys',
        body:
          'Tick any licence and three buttons appear above the table: Generate ' +
          'Renewal, Send Keys to Reseller and Send Keys to Customer. You can tick one ' +
          'that cannot be renewed; Generate Renewal then greys out, and hovering it ' +
          'lists why.',
        requires: ['canCreateInvoices'],
      },
      {
        id: 'send-keys',
        anchor: 'account-assets',
        title: 'Sending licence keys',
        body:
          'Both Send Keys buttons open a confirmation naming the recipient: the ' +
          'primary contact and their email address, or the reseller. Confirm Send ' +
          'emails the keys for every ticked licence.',
        requires: ['canCreateInvoices'],
      },
      {
        id: 'subscriptions',
        anchor: 'account-new-subscription',
        onlyIfPresent: true,
        side: 'left',
        title: 'Monthly subscriptions',
        body:
          'Create Monthly Subscription issues a licence that runs 30 days and renews ' +
          '30 at a time. Renew Monthly extends all of them at once. Both make you ' +
          'tick who is billing you and for how much.',
        requires: ['canMonthlySubscriptions'],
      },
    ],
  },

  // ── Orders ──────────────────────────────────────────────────────────────
  {
    id: 'orders',
    title: 'Orders',
    path: buildPath('draft-invoices'),
    steps: [
      {
        id: 'search',
        anchor: 'orders-search',
        title: 'Finding an order',
        body:
          'Matches order number, subject and account name. It searches only the ' +
          'orders currently listed, which is one status at a time.',
      },
      {
        id: 'status-filter',
        anchor: 'orders-status-filter',
        title: 'This opens on Draft',
        body:
          'An order you approved yesterday is not missing, it is under Approved. Sent ' +
          'is the third: it has already gone out.',
      },
      {
        id: 'type-filter',
        anchor: 'orders-type-filter',
        title: 'Order types',
        body:
          'New Product, Renewal, Co-Term and Add To Contract. Co-Term lines a new ' +
          'licence up with a renewal date the customer already has, so everything ' +
          'renews together.',
      },
      {
        id: 'list',
        anchor: 'orders-results',
        onlyIfPresent: true,
        side: 'top',
        title: 'Opening one',
        body:
          'Click anywhere on a row to open the order. Nothing here creates one. New ' +
          'product orders start on the customer, renewals start from their licences.',
      },
    ],
  },
  {
    id: 'order-detail',
    title: 'An order',
    path: routePattern('invoice-detail'),
    steps: [
      {
        id: 'shape',
        title: 'How an order is built',
        body:
          'The cards at the top hold the account, contact, reseller, dates and ' +
          'currency. Below them are the purchase order and routing panels, then the ' +
          'line items table, then the totals.',
      },
      {
        id: 'header-actions',
        anchor: 'order-header-actions',
        side: 'bottom',
        align: 'end',
        title: 'The buttons at the top',
        body:
          'Approve and Send Order sit here while the order is a Draft, each asking to ' +
          'confirm first. Once it is neither, a Locked badge replaces them and only ' +
          'CSA can change anything.',
      },
      {
        id: 'po',
        anchor: 'order-po',
        title: 'Purchase Order',
        body:
          'The pencil sets the PO number while the order is a Draft. Attach PO ' +
          'Document uploads the file. Place Order needs both before it will run.',
      },
      {
        id: 'send-to',
        anchor: 'order-send-to',
        title: 'Where the order and keys go',
        body:
          'Reseller sends to you, copying the CSA Geo Sales Rep. Customer sends to ' +
          'them, copying you and the rep. Switching also reprices the lines. Draft ' +
          'only.',
      },
      {
        id: 'line-items',
        anchor: 'order-line-items',
        title: 'What they are buying',
        body:
          'One row per product with quantity, price, start and renewal dates. Only ' +
          'CSA can change the lines, and only on a Draft. On a renewal the product ' +
          'and quantity are fixed.',
      },
      {
        id: 'actions',
        anchor: 'order-actions',
        onlyIfPresent: true,
        side: 'top',
        align: 'end',
        title: 'Finishing the order',
        body:
          'Place Order approves it on account terms and issues the keys. Pay Now ' +
          'opens a Stripe page. Pay Later emails the order for payment; keys follow ' +
          'the payment. Each asks twice.',
      },
      {
        id: 'coupon',
        anchor: 'order-coupon',
        onlyIfPresent: true,
        title: 'Discount codes',
        body:
          'Enter a code and press Apply. The discount appears as its own line. Do it ' +
          'before you place the order.',
      },
    ],
  },

  // ── Licences ────────────────────────────────────────────────────────────
  {
    id: 'assets',
    title: 'Assets',
    path: buildPath('assets'),
    steps: [
      {
        id: 'search',
        anchor: 'assets-search',
        title: 'Every licence you can see',
        body:
          'The whole estate across your customers. Search by customer, product or ' +
          'serial key.',
      },
      {
        id: 'window',
        anchor: 'assets-window-filter',
        title: 'Filter by renewal date',
        body:
          'Overdue, or the next 30, 60 or 90 days. The status filter beside it ' +
          'narrows to Active, Expired or Cancelled.',
      },
      {
        id: 'groups',
        anchor: 'assets-groups',
        onlyIfPresent: true,
        title: 'Grouped by customer',
        body:
          'Each header shows how many licences there are and when the next one is ' +
          'due. The arrow collapses the group, and the customer name opens their ' +
          'record.',
      },
    ],
  },
  {
    id: 'assets-renewals',
    title: 'Due for Renewal',
    path: buildPath('assets-renewals'),
    steps: [
      {
        id: 'window',
        title: 'The next 60 days',
        body:
          'Every active licence renewing within 60 days, soonest first. Recently ' +
          'Expired covers the 60 days behind you, whatever status the licence ended ' +
          'on.',
      },
      {
        id: 'generate',
        anchor: 'assets-groups',
        onlyIfPresent: true,
        title: 'Raising the renewal',
        body:
          'Tick the licences under a customer and Generate Renewal appears on their ' +
          'row, with the number ticked in the button. It creates the order and opens ' +
          'it. Licences that cannot be renewed cannot be ticked; hover the box to see ' +
          'why.',
        requires: ['canCreateInvoices'],
      },
      {
        id: 'select-all',
        anchor: 'assets-groups',
        onlyIfPresent: true,
        title: 'Ticking a whole customer',
        body:
          'The box in the column header ticks every licence under that customer that ' +
          'can be renewed, and skips the ones that cannot.',
        requires: ['canCreateInvoices'],
      },
    ],
  },
  {
    id: 'assets-expired',
    title: 'Recently Expired',
    path: buildPath('assets-expired'),
    steps: [
      {
        id: 'window',
        title: 'The last 60 days',
        body:
          'Every licence that lapsed in the last 60 days, most recent first. Status ' +
          'is not filtered here, so cancelled ones appear too.',
      },
      {
        id: 'generate',
        anchor: 'assets-groups',
        onlyIfPresent: true,
        title: 'Renewing a lapsed licence',
        body:
          'Tick the licences under a customer and Generate Renewal appears on their ' +
          'row, with the number ticked in the button. It creates the order and opens ' +
          'it. Licences that cannot be renewed cannot be ticked.',
        requires: ['canCreateInvoices'],
      },
    ],
  },
  {
    id: 'assets-subscriptions',
    title: 'Monthly Subscriptions',
    path: buildPath('assets-subscriptions'),
    requires: ['canMonthlySubscriptions'],
    steps: [
      {
        id: 'what-it-is',
        title: 'Rolling monthly licences',
        body:
          'A 30-day licence paid for a month at a time instead of a year up front. It ' +
          'has to be renewed every 30 days.',
      },
      {
        id: 'renewing',
        anchor: 'assets-groups',
        onlyIfPresent: true,
        title: 'Renewing them',
        body:
          'Every subscription you hold, grouped by customer, with its next renewal ' +
          'date. Renew all covers everything under one customer; the icon on a row ' +
          'renews just that one.',
      },
      {
        id: 'confirming',
        title: 'Confirming a renewal',
        body:
          'Both open the same box: what is being renewed, another 30 days each, and ' +
          'what you will be billed. Tick the acknowledgement, then Confirm Renewal.',
      },
    ],
  },

  // ── The assistants ──────────────────────────────────────────────────────
  {
    id: 'order-assistant',
    title: 'Order Assistant',
    path: buildPath('invoice'),
    requires: ['canCreateInvoices'],
    steps: [
      {
        id: 'po-upload',
        anchor: 'order-assistant-po',
        side: 'bottom',
        title: 'Or drop a purchase order on it',
        body:
          'Drag a PO onto this strip, or click to pick one. It reads the customer and ' +
          'the products off it and starts the order from there. PDF, PNG or JPG.',
      },
      {
        id: 'what-it-does',
        anchor: 'order-assistant-chat',
        title: 'Start with an email or a name',
        body:
          'Give it an email, contact name or account name. It finds the customer, ' +
          'walks you through the product options, and builds a Draft order. It can ' +
          'also create a lead, account or contact.',
      },
      {
        id: 'limits',
        anchor: 'order-assistant-chat',
        title: 'Nothing happens without your say-so',
        body:
          'It always builds a Draft. It can then send or approve, but only after ' +
          'naming who it goes to and asking you to confirm, and only if you have that ' +
          'permission. It cannot take a payment.',
      },
    ],
  },

  // ── Coupons ─────────────────────────────────────────────────────────────
  {
    id: 'coupons',
    title: 'Coupons',
    path: buildPath('coupons'),
    steps: [
      {
        id: 'finding',
        anchor: 'coupons-filters',
        title: 'Checking a code',
        body:
          'Coupons are set up by CSA. Search by code or name, and filter by status to ' +
          'see the live ones.',
      },
      {
        id: 'reading',
        anchor: 'coupons-results',
        onlyIfPresent: true,
        side: 'top',
        title: 'What each one covers',
        body:
          'Discount is what it takes off. Valid is the date range. Uses is how many ' +
          'are left out of the total. Open a row for the full conditions.',
      },
      {
        id: 'redeeming',
        title: 'Using one',
        body:
          'Codes are redeemed on the order, not here. Open the draft order and enter ' +
          'it in the Apply Coupon panel.',
        requires: ['canModifyPrices'],
      },
    ],
  },

  // ── Reports and money ───────────────────────────────────────────────────
  {
    id: 'reports',
    title: 'Reports',
    path: buildPath('reports-dashboard'),
    steps: [
      {
        id: 'months',
        anchor: 'reports-months',
        title: 'Pick your months first',
        body:
          'Everything below reads from what you select here. Load More reaches ' +
          'further back.',
      },
      {
        id: 'cards',
        anchor: 'reports-cards',
        title: 'How you are doing',
        body:
          'New Accounts, New Leads, Approved Orders and Revenue. Clicking a card ' +
          'opens its tab; clicking a month in that tab lists the records.',
      },
      {
        id: 'currency',
        anchor: 'reports-currency',
        onlyIfPresent: true,
        title: 'Currency',
        body:
          'Orders come in the currency they were raised in. All (AUD) converts them; ' +
          'picking a code shows that one on its own. What you earn is on the Revenue ' +
          'tab.',
      },
      {
        id: 'assistant',
        title: 'Or ask instead',
        body:
          'AI Assistant, under Reports in the menu, is a chat over the records. Ask ' +
          'it about expiring assets, orders or accounts. It does not do the monthly ' +
          'totals on this page.',
      },
    ],
  },
  {
    id: 'partner-reports',
    title: 'Partner Reports',
    path: buildPath('partner-reports'),
    requires: ['canViewReports'],
    steps: [
      {
        id: 'statement',
        anchor: 'partner-report-tabs',
        title: 'Monthly Statement',
        body:
          'Approved orders and active subscriptions for the month you pick, netted ' +
          'per currency. You settle with your distributor, or with Civil Survey ' +
          'Applications if you have none. The top of the page names yours.',
      },
      {
        id: 'schedule',
        anchor: 'partner-report-tabs',
        title: 'Billing Schedule',
        body:
          'The forward-looking half: what your subscriptions cost per month and per ' +
          'year.',
      },
      {
        id: 'export',
        anchor: 'partner-report-export',
        onlyIfPresent: true,
        title: 'Export CSV',
        body: 'Takes whichever tab you are on into a spreadsheet.',
        requires: ['canExportData'],
      },
    ],
  },

  // ── Your organisation ───────────────────────────────────────────────────
  {
    id: 'partners',
    title: 'Partners',
    path: buildPath('resellers'),
    requires: ['canManageUsers'],
    steps: [
      {
        id: 'whos-here',
        title: 'The partners under you',
        body:
          'Your resellers, one card each, with their region and user count. Open one ' +
          'for its details, permissions and users.',
      },
    ],
  },
  {
    id: 'partner-detail',
    title: 'A partner',
    path: routePattern('reseller-detail'),
    requires: ['canManageUsers'],
    steps: [
      {
        id: 'info',
        anchor: 'partner-info',
        title: 'The organisation',
        body:
          'Address, region, currency and the commission percentages. Open in CRM, top ' +
          'right, jumps to the same record in Zoho.',
      },
      {
        id: 'permissions',
        anchor: 'partner-permissions',
        onlyIfPresent: true,
        title: 'What this partner can do',
        body:
          'The permission preset, and any changes made on top of it. It is the ' +
          'ceiling for the organisation. What each person can actually do is this, ' +
          'narrowed by their own role.',
      },
      {
        id: 'users',
        anchor: 'partner-users',
        onlyIfPresent: true,
        title: 'Users',
        body:
          'Who has an account, their role, and when they last logged in. Add User ' +
          'creates one. The icons on each row edit it, reset a password, or switch ' +
          'it off.',
        requires: ['canManageUsers'],
      },
    ],
  },
  {
    id: 'partner-resources',
    title: 'Partner Resources',
    path: buildPath('partner-resources'),
    steps: [
      {
        id: 'whats-here',
        anchor: 'partner-resources-cards',
        side: 'top',
        title: 'Three links, not three pages',
        body:
          'Marketing Resources is the shared drive of brochures and brand assets. ' +
          'YouTube Product Guides is the tutorial channel. Support is the help desk, ' +
          'for knowledge base articles and tickets. Each opens in a new tab.',
      },
    ],
  },
];

/** The section covering a pathname, or undefined. */
export function sectionForPath(
  pathname: string,
  permissions?: UserPermissions | null
): TourSection | undefined {
  const available = sectionsFor(permissions);
  return available.find(section => pathMatches(section.path, pathname));
}

/**
 * The sections this person gets, with steps they cannot use removed.
 *
 * A section whose every step is filtered out disappears rather than opening
 * empty, which is what makes the help icon honest: if it is there, it has
 * something to say.
 */
export function sectionsFor(permissions?: UserPermissions | null): TourSection[] {
  return ALL_SECTIONS
    .filter(section => holdsAll(section.requires, permissions))
    .map(section => ({
      ...section,
      steps: section.steps.filter(step => holdsAll(step.requires, permissions)),
    }))
    .filter(section => section.steps.length > 0);
}

function holdsAll(
  required: (keyof UserPermissions)[] | undefined,
  permissions?: UserPermissions | null
): boolean {
  if (!required?.length) return true;
  if (!permissions) return false;
  return required.every(key => permissions[key] === true);
}

/** Every route with no `[id]` in it — the pages that are pages, not records. */
const STATIC_PATHS = new Set<string>(ROUTES.filter(r => !r.needsId).map(r => r.path));

/**
 * Whether a section's path covers a pathname.
 *
 * `[id]` matches any single segment, so a detail section works for whichever
 * record was opened — but not when the concrete path is a real page in its own
 * right. `/leads/new` is the Create Lead form, not a lead whose id is "new".
 */
export function pathMatches(sectionPath: string, pathname: string): boolean {
  const path = pathname.replace(/\/$/, '');
  if (sectionPath === path) return true;
  if (sectionPath.includes('[id]') && STATIC_PATHS.has(path)) return false;

  const sectionParts = sectionPath.split('/');
  const pathParts = path.split('/');
  if (sectionParts.length !== pathParts.length) return false;
  return sectionParts.every((part, i) => part === '[id]' || part === pathParts[i]);
}
