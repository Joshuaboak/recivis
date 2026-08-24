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
          'to convert them to an account.' +
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
          'Every licence your customers hold. Due for Renewal and Recently Expired ' +
          'are the two lists worth checking weekly.',
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
        id: 'search',
        anchor: 'header-search',
        side: 'bottom',
        align: 'end',
        title: 'Search: the fastest way to anything',
        body:
          'One box across customers, leads, orders and licences. Press <strong>Ctrl ' +
          'K</strong> from any page to open it. If you know the company, the order ' +
          'number or the serial key, searching beats working down the menu — this is ' +
          'the control worth learning first.',
      },
      {
        id: 'recent',
        anchor: 'header-recent',
        side: 'bottom',
        align: 'end',
        title: 'Recently viewed',
        body:
          'The records you opened last, so you can get back to one without searching ' +
          'for it again.',
      },
      {
        id: 'notifications',
        anchor: 'header-notifications',
        side: 'bottom',
        align: 'end',
        title: 'Notifications',
        body:
          'Licences coming up for renewal and orders that have moved on. A dot means ' +
          'there is something unread.',
      },
      {
        id: 'help',
        anchor: 'header-help',
        side: 'bottom',
        align: 'end',
        title: 'Help: replays the tutorial',
        body:
          'Every page has a short tutorial like this one. This icon replays the one ' +
          'for the page you are on.',
      },
      {
        id: 'cards',
        anchor: 'dashboard-cards',
        side: 'top',
        title: 'Or start from here',
        body:
          'The same destinations as shortcuts, each with a line saying what it is ' +
          'for.',
      },
      {
        id: 'learn-more',
        anchor: 'dashboard-learn-more',
        side: 'top',
        align: 'start',
        title: 'Learn more',
        body: 'Opens that section and plays its tutorial when you arrive.',
      },
      {
        id: 'your-menu',
        anchor: 'user-menu',
        side: 'right',
        align: 'end',
        title: 'Your account',
        body:
          'Your name, your role and Sign Out. The Guided tutorial switch stops these ' +
          'opening on their own. Restart makes every page introduce itself again.',
      },
      {
        id: 'support',
        anchor: 'support-launcher',
        side: 'left',
        align: 'end',
        title: 'Support assistant',
        body:
          'Ask how to do something in your own words. It knows the portal and your ' +
          'permissions, but it cannot read your records.',
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
          'A lead has not trialled the software yet. A prospect has. Search by name, ' +
          'email or company.',
      },
      {
        id: 'eval-filter',
        anchor: 'leads-eval-filter',
        title: 'Filter by evaluation',
        body:
          'Has Evaluation shows who is currently trialling something. You can also ' +
          'pick a single product.',
      },
      {
        id: 'list',
        anchor: 'leads-results',
        onlyIfPresent: true,
        side: 'top',
        title: 'Reading the list',
        body:
          'Status shows the stage. Evaluations shows what they are trialling. Created ' +
          'is the only sortable column. Click a row to open it.',
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
          'Last Name is the only field here it will not save without. Email and phone ' +
          'are optional, but a lead with no way to reach it is not worth much later.',
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
    title: 'A lead',
    path: routePattern('lead-detail'),
    steps: [
      {
        id: 'two-pages',
        title: 'One address, two pages',
        body:
          'A lead and the prospect it becomes share this page. What you see below ' +
          'depends on which of the two you are looking at.',
      },
      {
        id: 'badge',
        anchor: 'lead-badge',
        onlyIfPresent: true,
        title: 'Lead or prospect',
        body: 'The badge beside the name says which. Hover it for the difference.',
      },
      {
        id: 'record',
        anchor: 'lead-details',
        onlyIfPresent: true,
        title: 'The details',
        body:
          'Contact details, company, industry and the products they asked about. Edit ' +
          'opens the full form. Open in CRM jumps to the record in Zoho.',
      },
      {
        id: 'convert',
        anchor: 'lead-convert',
        onlyIfPresent: true,
        side: 'bottom',
        align: 'end',
        title: 'Convert to Prospect',
        body:
          'Creates a prospect account and a contact from the lead. Only a prospect ' +
          'can be given a trial or ordered against. It is one-way.',
        requires: ['canConvertLeads'],
      },
      {
        id: 'evaluations',
        anchor: 'lead-evaluations',
        onlyIfPresent: true,
        title: 'Evaluations: trial licences',
        body:
          'Create Evaluation issues a 30-day trial. Trials are not renewed — when one ' +
          'ends they buy a licence. Contacts, orders and licences are listed below.',
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
          'Search by company name, a contact email, or the email domain. Domain is ' +
          'the useful one when all you have is an address you do not recognise.',
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
          'Account Name, Country and Reseller are required. Fill in the address if ' +
          'they will be buying on account terms.',
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
          'If the name or domain matches one already in the portal you get the ' +
          'matches listed before anything saves. Two records for one company splits ' +
          'their licence history.',
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
          'One contact is primary — that is who orders and licence keys go to. The ' +
          'Set As column changes which. Add Contact adds someone new.',
      },
      {
        id: 'orders',
        anchor: 'account-orders',
        title: 'Orders',
        body:
          'Everything this customer has bought and the status of each. Click one to ' +
          'open it.',
      },
      {
        id: 'new-order',
        anchor: 'new-order-button',
        side: 'left',
        title: 'New Product Order',
        body:
          'Orders start from a customer. This carries the customer, their primary ' +
          'contact and your pricing into the order.',
        requires: ['canCreateInvoices'],
      },
      {
        id: 'evaluations',
        anchor: 'account-evaluations',
        title: 'Evaluations',
        body:
          '30-day trials, and what this customer has already had. Worth a look before ' +
          'issuing another.',
        requires: ['canCreateEvaluations'],
      },
      {
        id: 'assets',
        anchor: 'account-assets',
        title: 'Active Assets',
        body:
          'Every licence they currently hold, with its serial key and renewal date. ' +
          'Archived Assets below is the same for the lapsed ones.',
      },
      {
        id: 'asset-actions',
        anchor: 'account-assets',
        title: 'Renewals and keys',
        body:
          'Tick a licence and three buttons appear on this row: Generate Renewal, ' +
          'Send Keys to Reseller and Send Keys to Customer. If something you ticked ' +
          'cannot be renewed, Generate Renewal greys out — hover it to see what to ' +
          'untick.',
        requires: ['canCreateInvoices'],
      },
      {
        id: 'subscriptions',
        anchor: 'account-new-subscription',
        onlyIfPresent: true,
        side: 'left',
        title: 'Monthly subscriptions',
        body:
          'Create Monthly Subscription sets up a licence paid a month at a time ' +
          'instead of a year up front. Renew Monthly renews all of theirs at once.',
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
          'An order you approved yesterday is not missing, it is under Approved. Sent ' +
          'means it has already gone out.',
      },
      {
        id: 'type-filter',
        anchor: 'orders-type-filter',
        title: 'Order types',
        body:
          'New Product, Renewal, Co-Term and Add To Contract. Co-Term lines a licence ' +
          'up with a renewal date the customer already has.',
      },
      {
        id: 'list',
        anchor: 'orders-results',
        onlyIfPresent: true,
        side: 'top',
        title: 'Opening one',
        body:
          'Click a row. New orders are not raised from this page — they start on the ' +
          'customer.',
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
          'The cards at the top hold the customer, contact, dates and currency. The ' +
          'panels below are what you fill in. The table near the bottom is what they ' +
          'are buying.',
      },
      {
        id: 'po',
        anchor: 'order-po',
        title: 'Purchase Order',
        body:
          'The pencil sets the PO number. Attach PO Document uploads the file itself. ' +
          'Buying on account terms needs both before Place Order will work.',
        requires: ['canUploadPO'],
      },
      {
        id: 'send-to',
        anchor: 'order-send-to',
        title: 'Where the order and keys go',
        body:
          'Reseller sends to you, copying the CSA sales rep. Customer sends straight ' +
          'to them, copying you. Switching this also changes the prices on the lines.',
      },
      {
        id: 'line-items',
        anchor: 'order-line-items',
        title: 'What they are buying',
        body:
          'One row per product, with the quantity and the price. Changing the lines ' +
          'is a CSA job, and only while the order is still a Draft.',
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
          'for payment. Each one asks twice.',
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
          'Overdue, or the next 30, 60 or 90 days. The status filter beside it hides ' +
          'the expired and cancelled ones.',
      },
      {
        id: 'groups',
        anchor: 'assets-groups',
        onlyIfPresent: true,
        title: 'Grouped by customer',
        body:
          'Each header shows how many licences there are and when the next one is ' +
          'due. The arrow collapses the group.',
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
          'Expired is the same list for the 60 days behind you.',
      },
      {
        id: 'generate',
        anchor: 'assets-groups',
        onlyIfPresent: true,
        title: 'Raising the renewal',
        body:
          'Tick the licences under a customer and Generate Renewal appears on their ' +
          'row. It creates the order and opens it. Licences that cannot be renewed ' +
          'cannot be ticked — hover the box to see why.',
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
          'date. Renew all does a whole account in one go.',
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
          'Give it an email address, a customer name and what they are buying. It ' +
          'finds the customer, picks the product and builds a draft. It can also ' +
          'create a lead, customer or contact.',
      },
      {
        id: 'limits',
        anchor: 'order-assistant-chat',
        title: 'Nothing happens without your say-so',
        body:
          'It always builds the order as a Draft. It can then send or approve it, but ' +
          'only after showing you who it goes to and asking you to confirm. It cannot ' +
          'take a payment.',
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
          'are left. Open a row for the full conditions.',
      },
      {
        id: 'redeeming',
        title: 'Using one',
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
        anchor: 'reports-cards',
        title: 'Currency',
        body:
          'Orders come in several currencies. The selector above converts them to ' +
          'Australian dollars or shows one on its own. Your commission is on the ' +
          'Revenue tab.',
      },
      {
        id: 'assistant',
        title: 'Or ask instead',
        body:
          'AI Assistant, under Reports in the menu, answers the same questions as a ' +
          'chat.',
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
          'the month you pick, netted against whoever you settle with.',
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
        anchor: 'partner-report-tabs',
        side: 'bottom',
        align: 'end',
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
    steps: [
      {
        id: 'organisation',
        title: 'Your organisation',
        body:
          'Open your own record for your address, region, currency, commission ' +
          'percentages, payment methods and permissions. Distributors also see their ' +
          'resellers here.',
      },
      {
        id: 'users',
        title: 'Your users',
        body:
          'The users list is inside your partner record. It shows who has an account, ' +
          'their role and when they last logged in. Add User creates one; the icons ' +
          'on each row edit it, reset a password or switch it off.',
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
