/**
 * tour/sections.ts — the guided tutorial, one section per page.
 *
 * A section belongs to a route. It offers itself the first time that route is
 * visited, and the help icon in the header brings it back on demand. Nothing
 * here navigates: the user goes where they were going anyway, and the tutorial
 * meets them there.
 *
 * Four rules shaped this list:
 *
 * 1. **A section explains one page.** No step assumes the user arrived from
 *    another section, or that they will go on to a particular next one.
 * 2. **One step, one thing.** A step names a single control and says what it
 *    is for. Anything that needed a second sentence about a second control is
 *    two steps, so the highlight is always on what is being talked about.
 * 3. **Point at what you mention.** If a step names a button, a filter or a
 *    column, it anchors to it. Steps with no anchor exist only where the
 *    subject is the whole page.
 * 4. **Nothing is shown that the viewer cannot do.** Steps declare the
 *    permissions their subject needs; a section whose steps are all filtered
 *    out stops existing for that person, icon and all.
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
          'A quick tour of what is where. It takes about a minute, and it is the ' +
          'only one that covers the whole portal — every other page explains itself ' +
          'when you first open it.',
      },
      {
        id: 'sidebar',
        anchor: 'sidebar',
        side: 'right',
        align: 'start',
        title: 'The menu, top to bottom',
        body:
          'Every part of the portal is in here. The items with a chevron open up to ' +
          'show more underneath. The next few steps walk down the four you will use ' +
          'most.',
      },
      {
        id: 'nav-leads',
        anchor: 'nav-leads',
        side: 'right',
        align: 'start',
        title: 'Leads — people who have not bought yet',
        body:
          'Enquiries from the website, and the people trialling the software. Opens ' +
          'to Browse Leads and Create Lead.',
      },
      {
        id: 'nav-accounts',
        anchor: 'nav-accounts',
        side: 'right',
        align: 'start',
        title: 'Accounts — your customers',
        body:
          'Everyone who has bought. Opens to Browse Accounts and Create Account. ' +
          'This is also where orders are raised, because an order always belongs to ' +
          'a customer.',
      },
      {
        id: 'nav-assets',
        anchor: 'nav-assets',
        side: 'right',
        align: 'start',
        title: 'Assets — the licences they hold',
        body:
          'All Assets is the whole estate. Due for Renewal and Recently Expired are ' +
          'the two lists worth checking weekly.',
      },
      {
        id: 'nav-orders',
        anchor: 'nav-orders',
        side: 'right',
        align: 'start',
        title: 'Orders — what you have sold',
        body:
          'Browse Orders lists them. Order Assistant builds one from a description. ' +
          'Neither starts a new order from scratch — that begins on the customer.',
      },
      {
        id: 'cards',
        anchor: 'dashboard-cards',
        side: 'top',
        title: 'Or start from here',
        body:
          'The same destinations as shortcuts, each with a line saying what it is ' +
          'for. Nothing is created from the dashboard — it is a starting point, not ' +
          'a workspace.',
      },
      {
        id: 'learn-more',
        anchor: 'dashboard-learn-more',
        side: 'top',
        align: 'start',
        title: 'Learn more, on every card',
        body:
          'Takes you to that section and plays its walkthrough when you arrive. Use ' +
          'it when you want the explanation rather than the page.',
      },
      {
        id: 'search',
        anchor: 'header-search',
        side: 'bottom',
        align: 'end',
        title: 'Search everything',
        body:
          'One box across customers, leads, orders and licences. Ctrl K opens it from ' +
          'anywhere, which is usually quicker than navigating and filtering.',
      },
      {
        id: 'recent',
        anchor: 'header-recent',
        side: 'bottom',
        align: 'end',
        title: 'Where you have just been',
        body:
          'The records you opened most recently, so going back to the order you were ' +
          'looking at earlier does not mean searching for it again.',
      },
      {
        id: 'notifications',
        anchor: 'header-notifications',
        side: 'bottom',
        align: 'end',
        title: 'What needs you',
        body:
          'Licences coming up for renewal, orders that have moved on. The dot means ' +
          'there is something unread.',
      },
      {
        id: 'help',
        anchor: 'header-help',
        side: 'bottom',
        align: 'end',
        title: 'This icon explains the page you are on',
        body:
          'Every section has a short walkthrough like this one, and this replays the ' +
          'one for wherever you happen to be. It only appears on pages that have ' +
          'something to say.',
      },
      {
        id: 'your-menu',
        anchor: 'user-menu',
        side: 'right',
        align: 'end',
        title: 'Your account, and this tutorial',
        body:
          'Your name and role, and Sign Out. The Guided tutorial switch in here stops ' +
          'walkthroughs opening on their own; Restart beside it makes every section ' +
          'introduce itself again.',
      },
      {
        id: 'support',
        anchor: 'support-launcher',
        side: 'left',
        align: 'end',
        title: 'Ask, in your own words',
        body:
          'The help assistant knows this portal and your permissions. Ask how to do ' +
          'something, or why a button is missing, and it will point you at the right ' +
          'page. It cannot read your records, so it will not tell you what is on a ' +
          'particular order.',
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
          'A lead is an enquiry — somebody who filled in a form or came in through ' +
          'marketing. A prospect has downloaded a trial and is evaluating it. Search ' +
          'by name, email or company.',
      },
      {
        id: 'eval-filter',
        anchor: 'leads-eval-filter',
        title: 'Holding a trial is what makes a prospect',
        body:
          'Has Evaluation narrows the list to the people currently trialling ' +
          'something, and you can pick a single product instead. No Evaluation is the ' +
          'rest.',
      },
      {
        id: 'list',
        anchor: 'leads-results',
        onlyIfPresent: true,
        side: 'top',
        title: 'Reading the list',
        body:
          'Status says which stage somebody is at. Evaluations shows what they are ' +
          'trialling. Created is the one sortable column — click it to flip newest ' +
          'and oldest. Click any row to open the record.',
      },
      {
        id: 'creating',
        anchor: 'nav-leads',
        side: 'right',
        align: 'start',
        title: 'Adding one yourself',
        body:
          'Create Lead is under Leads in the menu, and takes a name, a company and ' +
          'an email.',
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
          'A name and an email. The phone numbers are optional, but a lead with no ' +
          'way to reach it is not worth much in three months.',
      },
      {
        id: 'company',
        anchor: 'lead-company',
        title: 'Where they work',
        body:
          'Company Name is required — everything downstream groups by company. The ' +
          'website, industry and country are optional.',
      },
      {
        id: 'submit',
        anchor: 'lead-create-submit',
        side: 'bottom',
        align: 'end',
        title: 'Create Lead saves and opens it',
        body:
          'If you leave this page half-finished the portal asks before discarding it, ' +
          'and offers the draft back when you return.',
      },
    ],
  },
  {
    id: 'lead-detail',
    title: 'A lead',
    path: routePattern('lead-detail'),
    steps: [
      {
        id: 'two-pages',
        title: 'One address, two pages',
        body:
          'A lead and the prospect it becomes live at the same place, and the page ' +
          'changes when you convert one. What follows describes whichever of the two ' +
          'you are looking at.',
      },
      {
        id: 'badge',
        anchor: 'lead-badge',
        onlyIfPresent: true,
        title: 'Lead or prospect',
        body:
          'The badge beside the name says which this is. Hover it for the difference ' +
          'in one line.',
      },
      {
        id: 'record',
        anchor: 'lead-details',
        onlyIfPresent: true,
        title: 'The details',
        body:
          'Contact details, company, industry, the products they asked about. Edit at ' +
          'the top opens the full form; Open in CRM jumps to the same record in Zoho.',
      },
      {
        id: 'convert',
        anchor: 'lead-convert',
        onlyIfPresent: true,
        side: 'bottom',
        align: 'end',
        title: 'Convert to Prospect',
        body:
          'Press this once they have actually downloaded a trial. It creates a ' +
          'prospect account and a contact, and from then on they can hold trial ' +
          'licences and be ordered against. It is one-way.',
        requires: ['canConvertLeads'],
      },
      {
        id: 'evaluations',
        anchor: 'lead-evaluations',
        onlyIfPresent: true,
        title: 'Trial licences',
        body:
          'A prospect can hold trials, and Create Evaluation issues them a 30-day ' +
          'one. Trials are never renewed — when one ends they buy a commercial ' +
          'licence. Their contacts, orders and licences are listed below this.',
        requires: ['canCreateEvaluations'],
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
          'By company name, a contact email, or just the email domain. Domain is the ' +
          'useful one: somebody emails you from an address you do not recognise and ' +
          'you need to know whether their company is already in here.',
      },
      {
        id: 'open',
        anchor: 'accounts-results',
        onlyIfPresent: true,
        side: 'top',
        title: 'Everything happens inside a customer',
        body:
          'Open one and you get their contacts, orders and licences, and the buttons ' +
          'that raise an order or a renewal. Created sorts the list; click any row to ' +
          'open it.',
      },
      {
        id: 'creating',
        anchor: 'nav-accounts',
        side: 'right',
        align: 'start',
        title: 'Adding one yourself',
        body:
          'Create Account is under Accounts in the menu, and needs a company and one ' +
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
          'Account Name and Country are required, and so is the reseller the account ' +
          'belongs to. Fill the address in properly if they will be buying on account ' +
          'terms — it ends up on the paperwork.',
      },
      {
        id: 'contact',
        anchor: 'account-primary-contact',
        title: 'And a person at it',
        body:
          'First name, last name and email. This is the primary contact, which ' +
          'matters because it is who orders and licence keys are addressed to.',
      },
      {
        id: 'submit',
        anchor: 'account-create-submit',
        side: 'bottom',
        align: 'end',
        title: 'Create Account, and the duplicate check',
        body:
          'If the name or domain looks like one already in the portal you get a ' +
          'warning listing the matches before anything is saved. Two records for one ' +
          'company splits their licence history in half, so read it.',
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
        title: 'Their people',
        body:
          'One contact is marked primary — that is who orders and licence keys go to. ' +
          'The Set As column changes which is which, and Add Contact adds somebody ' +
          'new.',
      },
      {
        id: 'orders',
        anchor: 'account-orders',
        title: 'Their orders',
        body:
          'Everything this customer has bought and where each order got to. Click any ' +
          'of them to open it.',
      },
      {
        id: 'new-order',
        anchor: 'new-order-button',
        side: 'left',
        title: 'New Product Order',
        body:
          'Orders start from a customer, which is why this is here and not in the ' +
          'Orders section. It carries the customer, their primary contact and your ' +
          'pricing into the order for you.',
        requires: ['canCreateInvoices'],
      },
      {
        id: 'evaluations',
        anchor: 'account-evaluations',
        title: 'Trial licences',
        body:
          'The same 30-day evaluations as on a prospect. What they have already had ' +
          'is listed here, so you can see it before issuing another.',
        requires: ['canCreateEvaluations'],
      },
      {
        id: 'assets',
        anchor: 'account-assets',
        title: 'Active Assets',
        body:
          'Every licence this customer currently holds, with its serial key and ' +
          'renewal date. Archived Assets underneath is the same for the ones that ' +
          'have lapsed.',
      },
      {
        id: 'asset-actions',
        anchor: 'account-assets',
        title: 'Renewals and keys start with a tick',
        body:
          'Tick any licence and three buttons appear along this row: Generate ' +
          'Renewal, which raises the renewal order, and Send Keys to Reseller or to ' +
          'Customer, which emails the existing keys out. A licence that cannot be ' +
          'renewed cannot be ticked — hover its box and it says why.',
        requires: ['canCreateInvoices'],
      },
      {
        id: 'subscriptions',
        anchor: 'account-new-subscription',
        onlyIfPresent: true,
        side: 'left',
        title: 'Monthly subscriptions',
        body:
          'Create Monthly Subscription sets up a licence they pay for a month at a ' +
          'time instead of a year up front. Once they have one, Renew Monthly appears ' +
          'beside this and renews all of them at once.',
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
        title: 'Every order you have raised',
        body: 'Search by order number, subject or customer.',
      },
      {
        id: 'status-filter',
        anchor: 'orders-status-filter',
        title: 'This opens on Draft',
        body:
          'Which catches people out — an order you approved yesterday is not missing, ' +
          'it is under Approved. Sent means it has gone out for payment.',
      },
      {
        id: 'type-filter',
        anchor: 'orders-type-filter',
        title: 'And by what kind of order it is',
        body:
          'New Product, Renewal, Co-Term for lining a licence up with an existing ' +
          'renewal date, or Add To Contract.',
      },
      {
        id: 'list',
        anchor: 'orders-results',
        onlyIfPresent: true,
        side: 'top',
        title: 'Opening one',
        body:
          'Click any row. New orders are not raised from this page — they start on ' +
          'the customer.',
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
        title: 'How an order is put together',
        body:
          'The cards at the top carry the customer, contact, dates and currency. The ' +
          'panels below are the parts you fill in, and the table near the bottom is ' +
          'what they are buying. All of it is editable while the order is a Draft, ' +
          'and locked once it is not.',
      },
      {
        id: 'po',
        anchor: 'order-po',
        title: 'Purchase Order',
        body:
          'The pencil sets the PO number; Attach PO Document uploads the document ' +
          'itself. Buying on account terms needs both before the order will go ' +
          'through.',
        requires: ['canUploadPO'],
      },
      {
        id: 'send-to',
        anchor: 'order-send-to',
        title: 'Where the order and keys go',
        body:
          'Reseller sends everything to you, copying the CSA sales rep, and you pass ' +
          'it on. Customer sends it straight to them, copying you. Switching this ' +
          'also changes the prices on the lines, because what you pay and what they ' +
          'pay are different numbers.',
      },
      {
        id: 'line-items',
        anchor: 'order-line-items',
        title: 'What they are buying',
        body:
          'One row per product, with the quantity and the price. On a Draft, Edit ' +
          'Line Items above the table lets you change them or add another.',
      },
      {
        id: 'actions',
        anchor: 'order-actions',
        onlyIfPresent: true,
        side: 'top',
        align: 'end',
        title: 'Finishing the order',
        body:
          'This is the step that issues licence keys. Place Order approves it on your ' +
          'account terms. Pay Now opens a card payment page. Pay Later sends it out ' +
          'for payment. Each one asks twice before it goes, because none of them can ' +
          'be undone.',
      },
      {
        id: 'coupon',
        anchor: 'order-coupon',
        onlyIfPresent: true,
        title: 'Discount codes',
        body:
          'Enter a code and Apply checks it against its rules before adding the ' +
          'discount as its own line. Do it before you place the order — a locked ' +
          'order will not take one.',
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
          'The whole estate across all your customers, searchable by customer, ' +
          'product or serial key. This is the page for "what do they actually have".',
      },
      {
        id: 'window',
        anchor: 'assets-window-filter',
        title: 'Narrow it by when it renews',
        body:
          'Overdue, or the next 30, 60 or 90 days. The status filter beside it hides ' +
          'the expired and cancelled ones.',
      },
      {
        id: 'groups',
        anchor: 'assets-groups',
        onlyIfPresent: true,
        title: 'Grouped by customer',
        body:
          'Licences are individual records but you think in customers, so they are ' +
          'stacked under one. Each header says how many there are and when the next ' +
          'one is due, and the arrow collapses it.',
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
          'Expired, next to it in the menu, is the same list for the 60 days behind ' +
          'you — worth a look weekly, because a lapsed licence is usually somebody ' +
          'who meant to renew and forgot.',
      },
      {
        id: 'generate',
        anchor: 'assets-groups',
        onlyIfPresent: true,
        title: 'Raising the renewal from here',
        body:
          'Tick the licences under a customer and Generate Renewal appears on that ' +
          'customer\'s row, counting what you have selected. It creates the order and ' +
          'opens it. Licences that cannot be renewed cannot be ticked — hover the box ' +
          'and it says why.',
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
          'A monthly subscription is a 30-day licence paid for a month at a time ' +
          'rather than a year up front. It has to be renewed every 30 days, and this ' +
          'is the page that stops one quietly lapsing.',
      },
      {
        id: 'renewing',
        anchor: 'assets-groups',
        onlyIfPresent: true,
        title: 'Renewing them',
        body:
          'Every subscription you hold, grouped by customer, with its next renewal ' +
          'date. Renew all on a customer\'s row does that whole account in one go.',
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
        id: 'what-it-does',
        anchor: 'order-assistant-chat',
        title: 'Describe the order in plain English',
        body:
          'An email address, a customer name, what they are buying — it finds the ' +
          'customer, picks the product and builds a draft for you to check. It can ' +
          'also create a lead, customer or contact when they are not in the portal ' +
          'yet.',
      },
      {
        id: 'limits',
        anchor: 'order-assistant-chat',
        title: 'It stops at the draft',
        body:
          'It never approves, sends or pays for anything. You open the order it made ' +
          'and finish it there, which is also where you would fix anything it read ' +
          'wrong.',
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
        title: 'Checking a code before you promise it',
        body:
          'Coupons are set up by CSA; this page is where you look one up. Search by ' +
          'code or name, and filter by status to see only the live ones.',
      },
      {
        id: 'reading',
        anchor: 'coupons-results',
        onlyIfPresent: true,
        side: 'top',
        title: 'What each one covers',
        body:
          'Discount is what it takes off, Valid is the window it runs between, Uses ' +
          'is how much of it is left, and Products is what it applies to. Open a row ' +
          'for the full conditions.',
      },
      {
        id: 'redeeming',
        title: 'Using it',
        body:
          'Codes are redeemed on the order, not here. Open the draft order and enter ' +
          'it in the Apply Coupon panel.',
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
          'Everything below reads from what is selected here. Pick none and you get ' +
          'the lot; Load More reaches further back.',
      },
      {
        id: 'cards',
        anchor: 'reports-cards',
        title: 'How you are doing',
        body:
          'New Accounts, New Leads, Approved Orders and Revenue for those months. ' +
          'Click any card to drill into the records behind it — that is what the tabs ' +
          'along the top are.',
      },
      {
        id: 'currency',
        anchor: 'reports-cards',
        title: 'Money is shown in one currency',
        body:
          'Orders come in several, so the selector above converts them to Australian ' +
          'dollars, or shows a single currency on its own. Your commission is on the ' +
          'Revenue tab.',
      },
      {
        id: 'assistant',
        title: 'Or just ask',
        body:
          'AI Assistant, under Reports in the menu, answers the same questions as a ' +
          'conversation if you would rather ask than work the filters.',
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
          'The month-end reconciliation: approved orders and active subscriptions for ' +
          'the month you choose, netted against whoever you settle with — your ' +
          'distributor if you sit under one, CSA if you do not.',
      },
      {
        id: 'schedule',
        anchor: 'partner-report-tabs',
        title: 'Billing Schedule',
        body:
          'The forward-looking half: what your subscriptions cost per month and per ' +
          'year, so the next few statements hold no surprises.',
      },
      {
        id: 'export',
        anchor: 'partner-report-tabs',
        side: 'bottom',
        align: 'end',
        title: 'Both export',
        body: 'Export CSV takes whichever tab you are on into a spreadsheet.',
        requires: ['canExportData'],
      },
    ],
  },

  // ── Your organisation ───────────────────────────────────────────────────
  {
    id: 'partners',
    title: 'Partners',
    path: buildPath('resellers'),
    steps: [
      {
        id: 'organisation',
        title: 'Your partner organisation',
        body:
          'Open your own record for your address, region, currency, commission ' +
          'percentages, payment methods and permissions. If you are a distributor, ' +
          'the resellers underneath you are listed here too.',
      },
      {
        id: 'users',
        title: 'The people at your organisation',
        body:
          'The users list is inside your partner record, near the bottom: who has an ' +
          'account, their role, when they last logged in, with Add User and a reset ' +
          'for a forgotten password. Nobody can be given something the organisation ' +
          'itself does not have.',
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
        title: 'Three places, not three pages',
        body:
          'Marketing Resources is the shared drive of brochures, templates and brand ' +
          'assets. YouTube Product Guides is the tutorial and webinar channel. ' +
          'Support is the help desk, where knowledge base articles live and support ' +
          'tickets are raised. Each card opens in a new tab.',
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
