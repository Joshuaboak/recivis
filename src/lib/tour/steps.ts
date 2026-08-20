/**
 * tour/steps.ts — what the guided tutorial says, and where it says it.
 *
 * Steps are plain data so the tour can be read and edited without touching the
 * controller. Paths come from routes.ts, which is the only place in the app
 * allowed to know a URL.
 *
 * Three rules shaped this list:
 *
 * 1. **No step needs a record id.** A tour that hardcoded an account id would
 *    work for whoever it was written against and nobody else. Where the tour
 *    has to get into a record, it asks the user to click one and waits — and
 *    offers Skip, because a brand new partner may have no records at all.
 * 2. **Nothing is shown that the viewer cannot do.** Steps declare the
 *    permissions their subject needs and `tourStepsFor` drops the rest, so the
 *    tour never walks somebody up to a button that is not on their screen.
 *    Numbering follows: "Step 7 of 31" counts their tour, not the longest one.
 * 3. **A missing anchor skips its step.** Empty lists, filters that hide
 *    themselves, buttons that only appear once something is selected — the
 *    target may simply not be there, and that must not stall the tour.
 */

import { ROUTES, buildPath, type LegacyViewId } from '../routes';
import type { UserPermissions } from '../types';

/**
 * The URL pattern for a route, with `[id]` left in place.
 *
 * `buildPath` is for concrete URLs and percent-encodes whatever id it is
 * given, so it cannot express "any account". Steps on a detail page need the
 * pattern, and matching happens against that.
 */
function routePattern(view: LegacyViewId): string {
  const route = ROUTES.find(r => r.legacyViewId === view);
  if (!route) throw new Error(`tour: unknown route "${view}"`);
  return route.path;
}

export interface TourStep {
  /** Stable id, used to resume where someone left off. */
  id: string;
  /** The route this step belongs to. */
  path: string;
  /** Element to highlight, matched as [data-tour="..."]. Omit to centre it. */
  anchor?: string;
  title: string;
  body: string;
  /**
   * Advance when the user opens a record rather than when they press Next.
   *
   * The controller watches where they land, not what they clicked: the row is
   * a link, the click may be a middle-click or a keyboard Enter, and the
   * navigation can still be cancelled by the unsaved-changes guard.
   */
  advanceOnClick?: boolean;
  /**
   * For an advanceOnClick step: where Next goes instead. Clicking a record is
   * the happy path, but somebody with an empty list has nothing to click, so
   * Next jumps past the steps that depend on being inside a record.
   */
  skipTo?: string;
  /**
   * Permissions this step's subject needs. Missing any one drops the step for
   * that person — the button it describes is not on their screen.
   */
  requires?: (keyof UserPermissions)[];
}

export const TOUR_ID = 'partner-onboarding';

/**
 * The full tour, in order. `tourStepsFor` narrows it to one person; nothing
 * else should read this directly.
 */
export const ALL_TOUR_STEPS: TourStep[] = [
  // ── Getting your bearings ───────────────────────────────────────────────
  {
    id: 'welcome',
    path: buildPath('dashboard'),
    title: 'Welcome to the partner portal',
    body:
      'This walks through the whole portal — finding and creating customers, raising ' +
      'orders, issuing licences and renewals, and where to find what you are owed. ' +
      'It only shows the parts your account can actually use, so it is shorter for ' +
      'some people than others. Stop whenever you like; you can replay it from the ' +
      'menu under your name at the bottom left.',
  },
  {
    id: 'sidebar',
    path: buildPath('dashboard'),
    anchor: 'sidebar',
    title: 'Everything lives here',
    body:
      'Leads are enquiries. Accounts are customers. Assets are the licences those ' +
      'customers hold. Orders is where you sell them something. Sections with an ' +
      'arrow open up to show more underneath — that is where Create Lead, Create ' +
      'Account and the renewal views live.',
  },
  {
    id: 'dashboard-cards',
    path: buildPath('dashboard'),
    anchor: 'dashboard-cards',
    title: 'Or start from here',
    body:
      'The same destinations as shortcuts, with your current counts on them. Nothing ' +
      'is created from the dashboard — it is a starting point, not a workspace.',
  },

  // ── Leads ───────────────────────────────────────────────────────────────
  {
    id: 'leads-search',
    path: buildPath('leads'),
    anchor: 'leads-search',
    title: 'Leads and prospects both live here',
    body:
      'A lead is an enquiry who has not tried the software yet — somebody who filled in ' +
      'a form on the website or came in through marketing. A prospect has downloaded ' +
      'a free trial and is evaluating it, but has not bought. Both live under Leads, ' +
      'in the same list, and the Has Evaluation filter is what separates them. Search ' +
      'by name, company or email; filter by status, region, or the product they asked ' +
      'about.',
  },
  {
    id: 'leads-table',
    path: buildPath('leads'),
    anchor: 'leads-results',
    title: 'What you can do with each',
    body:
      'The difference decides what you can do with them. A lead you edit, work and ' +
      'record notes against — there is nothing to licence yet. A prospect already ' +
      'holds a trial, and is what an order is raised against when they decide to buy. ' +
      'Click a column heading to sort; click a row to open one.',
  },
  {
    id: 'lead-form',
    path: buildPath('create-lead'),
    anchor: 'lead-form',
    title: 'Creating a lead',
    body:
      'This form is under Leads in the sidebar, as Create Lead. Name, company and ' +
      'email are what matter — the rest (phone, website, industry, country, source, ' +
      'products they asked about, and free-text notes) is optional but is what makes ' +
      'the lead worth having in three months. Distributors also pick which of their ' +
      'resellers owns it.',
  },
  {
    id: 'lead-create-submit',
    path: buildPath('create-lead'),
    anchor: 'lead-create-submit',
    title: 'Create Lead saves it',
    body:
      'It saves and opens the new lead. If you leave this page half-finished the ' +
      'portal asks before discarding it, and offers to restore the draft when you ' +
      'come back.',
  },
  {
    id: 'leads-open',
    path: buildPath('leads'),
    anchor: 'leads-results',
    title: 'Open a lead to carry on',
    body:
      'Click any lead in the list and the tour follows you in. If your list is empty ' +
      'or you would rather not, press Next and we will skip ahead to customers.',
    advanceOnClick: true,
    skipTo: 'accounts-search',
  },
  {
    id: 'lead-edit',
    path: routePattern('lead-detail'),
    title: 'The record itself',
    body:
      'The badge next to the name says whether this is a lead or a prospect, and ' +
      'hovering it explains the difference. The details underneath are editable in ' +
      'place — contact details, the status as you work them, the industry, the ' +
      'products they are interested in — then Save Changes. Below that are any ' +
      'contacts, orders and trial licences attached to them.',
  },
  {
    id: 'lead-evaluations',
    path: routePattern('lead-detail'),
    anchor: 'lead-evaluations',
    title: 'Giving them a trial',
    body:
      'Create Evaluation issues a 30-day trial licence, and issuing one is what makes ' +
      'somebody a prospect rather than a lead. It only appears once the record is a ' +
      'prospect — on a plain lead the button is not there yet, and the badge by the ' +
      'name says which you are looking at. There is a cap on how many trials one ' +
      'customer can have, and a longer trial needs a separate permission. Evaluations ' +
      'are never renewed: when the trial ends they buy a commercial licence.',
    requires: ['canCreateEvaluations'],
  },
  {
    id: 'lead-convert',
    path: routePattern('lead-detail'),
    anchor: 'lead-convert',
    title: 'Lead to prospect',
    body:
      'Convert to Prospect is the step between the two: it is what happens when an ' +
      'enquiry downloads the trial. Their details come across, a contact is created ' +
      'for them, and from then on they can hold trial licences and be ordered ' +
      'against. It is one-way, and CSA does it — if a lead of yours is ready to trial ' +
      'the software, ask CSA support or your administrator.',
  },

  // ── Accounts ────────────────────────────────────────────────────────────
  {
    id: 'accounts-search',
    path: buildPath('accounts'),
    anchor: 'accounts-search',
    title: 'Accounts are your customers',
    body:
      'Search by company name, a contact email, or just the email domain. Domain is ' +
      'the useful one: somebody emails you from an address you do not recognise and ' +
      'you need to know whether their company is already in here.',
  },
  {
    id: 'account-create',
    path: buildPath('create-account'),
    anchor: 'account-create-submit',
    title: 'Creating a customer',
    body:
      'Under Accounts in the sidebar, as Create Account. Company name plus a primary ' +
      'contact is the minimum — the contact matters because that is the person orders ' +
      'and licence keys are addressed to. Fill in the address properly if they are ' +
      'buying on account terms; it ends up on the paperwork.',
  },
  {
    id: 'account-duplicates',
    path: buildPath('create-account'),
    anchor: 'account-duplicates',
    title: 'Read the duplicate warning',
    body:
      'If the name looks like one already in the portal, you get this warning before ' +
      'it saves. Two records for one company splits their licence history in half, ' +
      'and it is unpleasant to unpick later. Check before you carry on.',
  },
  {
    id: 'accounts-open',
    path: buildPath('accounts'),
    anchor: 'accounts-results',
    title: 'Open a customer to carry on',
    body:
      'Click any customer in the list. Everything else about ordering, licences and ' +
      'renewals happens inside a customer record, so the next several steps are in ' +
      'there. Press Next to skip ahead instead.',
    advanceOnClick: true,
    skipTo: 'orders-search',
  },
  {
    id: 'account-contacts',
    path: routePattern('account-detail'),
    anchor: 'account-contacts',
    title: 'Their people',
    body:
      'Contacts are the individuals at that company. One is marked primary — that is ' +
      'who orders and licence keys go to — and you can mark a secondary as well. Use ' +
      'Set As on any contact to change which is which.',
  },
  {
    id: 'account-add-contact',
    path: routePattern('account-detail'),
    anchor: 'account-add-contact',
    title: 'Adding a contact',
    body:
      'Add Contact opens a short form right here: first name, last name, email, ' +
      'phone. Worth doing before you raise an order for somebody new, so the order ' +
      'goes to the right person rather than to whoever bought last time.',
  },
  {
    id: 'account-orders',
    path: routePattern('account-detail'),
    anchor: 'account-orders',
    title: 'Their orders',
    body:
      'Everything this customer has bought and where each order got to — Draft, ' +
      'Approved or Sent. Click any of them to open it.',
  },
  {
    id: 'account-new-order',
    path: routePattern('account-detail'),
    anchor: 'new-order-button',
    title: 'Raising an order',
    body:
      'Orders always start from a customer, which is why this button is here and not ' +
      'in the Orders section. It carries the customer, their primary contact and your ' +
      'pricing into the order for you. You then add line items, pick products through ' +
      'the SKU picker, set quantities, and create it as a draft.',
    requires: ['canCreateInvoices'],
  },
  {
    id: 'account-evaluations',
    path: routePattern('account-detail'),
    anchor: 'account-evaluations',
    title: 'Trial licences',
    body:
      'The same 30-day evaluations, on a customer rather than a lead. Their existing ' +
      'trials are listed here so you can see what they have already had before ' +
      'issuing another.',
    requires: ['canCreateEvaluations'],
  },
  {
    id: 'account-assets',
    path: routePattern('account-detail'),
    anchor: 'account-assets',
    title: 'Their licences, and how renewals start',
    body:
      'Every licence this customer currently holds, with its serial key and renewal ' +
      'date. Tick the ones that are due and a Generate Renewal button appears above ' +
      'the table — that is how a renewal order is raised. Some licences cannot be ' +
      'renewed (trials, educational, NFR, anything already upgraded) and the button ' +
      'explains which ones are blocking it.',
    requires: ['canCreateInvoices'],
  },
  {
    id: 'account-new-subscription',
    path: routePattern('account-detail'),
    anchor: 'account-new-subscription',
    title: 'Monthly subscriptions',
    body:
      'A 30-day licence you renew a month at a time instead of buying a year up ' +
      'front. Prices are quoted in US dollars with your own currency alongside, less ' +
      'your commission. Renew Monthly next to it renews all of this customer\'s ' +
      'subscriptions in one go — an in-date one extends from its renewal date, a ' +
      'lapsed one from today.',
    requires: ['canMonthlySubscriptions'],
  },
  {
    id: 'account-send-keys',
    path: routePattern('account-detail'),
    anchor: 'account-send-keys',
    title: 'Sending licence keys again',
    body:
      'Tick licences and send their keys out again — to you, or straight to the ' +
      'customer. This is the answer to "they have lost their keys", and it does not ' +
      'reissue or change anything, it just emails what already exists.',
  },

  // ── Orders ──────────────────────────────────────────────────────────────
  {
    id: 'orders-search',
    path: buildPath('draft-invoices'),
    anchor: 'orders-search',
    title: 'Every order you have raised',
    body:
      'Search by order number, subject or customer, and filter by status and by type ' +
      '— New Product, Renewal, Co-Term (lining a licence up with an existing renewal ' +
      'date) or Add To Contract. New orders are not raised from here; they start on ' +
      'the customer.',
  },
  {
    id: 'orders-open',
    path: buildPath('draft-invoices'),
    anchor: 'orders-results',
    title: 'Open an order to carry on',
    body:
      'Click any order and the tour follows you in, to show what the panels on an ' +
      'order do. Press Next to skip ahead if you have none yet.',
    advanceOnClick: true,
    skipTo: 'assets-search',
  },
  {
    id: 'order-lines',
    path: routePattern('invoice-detail'),
    title: 'The order itself',
    body:
      'The header carries the customer, contact, dates, currency and totals; the ' +
      'table underneath carries the line items. While the order is still a Draft the ' +
      'quantities and products can be changed. Once it is Approved or Sent it locks ' +
      'and shows a Locked badge — licence keys may already exist against it and the ' +
      'money is settled off its totals, so corrections go through CSA.',
  },
  {
    id: 'order-coupon',
    path: routePattern('invoice-detail'),
    anchor: 'order-coupon',
    title: 'Discount codes',
    body:
      'Enter a coupon code here and it is checked against its rules — products, ' +
      'region, order type, minimum and maximum value, expiry — before it applies. ' +
      'The discount then appears as its own line on the order.',
  },
  {
    id: 'order-po',
    path: routePattern('invoice-detail'),
    anchor: 'order-po',
    title: 'Purchase orders',
    body:
      'Buying on account terms needs both a purchase order number and the purchase ' +
      'order document attached, and both have to be here before the order will go ' +
      'through. Drag the file straight onto the panel.',
    requires: ['canUploadPO'],
  },
  {
    id: 'order-send-to',
    path: routePattern('invoice-detail'),
    anchor: 'order-send-to',
    title: 'Where the order and keys go',
    body:
      'Reseller sends everything to you, copying the CSA sales rep, and you pass it ' +
      'on. Customer sends it straight to the end customer, copying you. The Customer ' +
      'option only exists if your partner account is set up for direct customer ' +
      'contact. Switching this also reprices the line items, because what you pay and ' +
      'what they pay are different numbers.',
  },
  {
    id: 'order-actions',
    path: routePattern('invoice-detail'),
    anchor: 'order-actions',
    title: 'Finishing the order',
    body:
      'This is the step that issues licence keys. Place Order approves it on your ' +
      'account terms and the keys are generated. Pay Now opens a card payment page ' +
      'and the keys follow when payment clears. Pay Later sends it out for payment ' +
      'and the keys follow when it is paid. Which of these you see depends on whether ' +
      'your partner account is set up for card, account terms, or both.',
    requires: ['canApproveInvoices'],
  },

  // ── Assets and renewals ─────────────────────────────────────────────────
  {
    id: 'assets-search',
    path: buildPath('assets'),
    anchor: 'assets-search',
    title: 'Every licence you can see',
    body:
      'All Assets is the whole estate across all your customers, searchable by ' +
      'customer, product or serial key, and filterable by status and by how soon it ' +
      'renews. Use this when somebody asks "what do they actually have".',
  },
  {
    id: 'assets-groups',
    path: buildPath('assets'),
    anchor: 'assets-groups',
    title: 'Grouped by customer',
    body:
      'Licences are individual records but you think in customers, so they are ' +
      'grouped. Each group collapses, and the header shows how many licences and when ' +
      'the next one is due.',
  },
  {
    id: 'assets-renewals',
    path: buildPath('assets-renewals'),
    title: 'What is coming up',
    body:
      'Due for Renewal is every licence renewing in the next 60 days, soonest first. ' +
      'Recently Expired is the same for the ones that lapsed in the last 60 days — ' +
      'worth a look weekly, because a lapsed licence is usually somebody who meant ' +
      'to renew and forgot. Raise the renewal from here: tick the licences under a ' +
      'customer and a Generate Renewal button appears on that customer row. It ' +
      'creates the order and opens it. Licences that cannot be renewed cannot be ' +
      'ticked, and hovering one says why.',
  },
  {
    id: 'assets-subscriptions',
    path: buildPath('assets-subscriptions'),
    title: 'Rolling monthly licences',
    body:
      'Every monthly subscription you hold, with its next renewal date, and a renew ' +
      'button per customer. These need renewing every 30 days — this is the page that ' +
      'stops one quietly lapsing.',
    requires: ['canMonthlySubscriptions'],
  },

  // ── Assistants ──────────────────────────────────────────────────────────
  {
    id: 'order-assistant',
    path: buildPath('invoice'),
    anchor: 'order-assistant-chat',
    title: 'The Order Assistant',
    body:
      'Describe what you want in plain English — an email address, a customer name, ' +
      'what they are buying — and it finds the customer, picks the product and builds ' +
      'a draft order for you to check. It can also create a lead, customer or contact ' +
      'when they are not in the portal yet. It never approves, sends or pays for ' +
      'anything; that stays on the order.',
    requires: ['canCreateInvoices'],
  },

  // ── Coupons ─────────────────────────────────────────────────────────────
  {
    id: 'coupons',
    path: buildPath('coupons'),
    title: 'Discount codes',
    body:
      'Every coupon you can use, with its discount, what it is restricted to, how ' +
      'many times it has been used, and whether it is currently valid. Codes are ' +
      'redeemed on an order, in the Coupon panel — this page is where you check one ' +
      'is live before promising it to a customer.',
  },

  // ── Reports and money ───────────────────────────────────────────────────
  {
    id: 'reports-dashboard',
    path: buildPath('reports-dashboard'),
    anchor: 'reports-cards',
    title: 'How you are doing',
    body:
      'New customers, new leads, approved orders and revenue over the months you ' +
      'choose, with your commission alongside. Amounts are shown in their original ' +
      'currency with an Australian dollar equivalent. Click any card to drill into ' +
      'the records behind it. The Reports Assistant answers the same questions as a ' +
      'conversation if you would rather ask than filter.',
  },
  {
    id: 'partner-reports',
    path: buildPath('partner-reports'),
    anchor: 'partner-report-tabs',
    title: 'What is owed, and to whom',
    body:
      'Monthly Statement is the month-end reconciliation: approved orders and active ' +
      'subscriptions, netted against whoever you settle with — your distributor if ' +
      'you sit under one, CSA if you do not. Billing Schedule is forward-looking: ' +
      'what your subscriptions cost per month and per year. Both export.',
    requires: ['canViewReports'],
  },

  // ── Your organisation ───────────────────────────────────────────────────
  {
    id: 'partners',
    path: buildPath('resellers'),
    title: 'Your partner organisation',
    body:
      'Your own details — address, region, currency, commission percentages, payment ' +
      'methods and permissions — and, if you are a distributor, the resellers ' +
      'underneath you. Open one to see how it is set up.',
  },
  {
    id: 'partner-users',
    path: buildPath('resellers'),
    title: 'The people at your organisation',
    body:
      'Open your partner record and the users list is on it: who has an account, ' +
      'their role, when they last logged in, with Add User, Edit User and Reset ' +
      'Password. Each person\'s permissions sit inside the organisation\'s — you ' +
      'cannot grant somebody something the organisation itself does not have.',
    requires: ['canManageUsers'],
  },

  // ── Help ────────────────────────────────────────────────────────────────
  {
    id: 'support-launcher',
    path: buildPath('dashboard'),
    anchor: 'support-launcher',
    title: 'Stuck? Ask here',
    body:
      'The help assistant knows this portal and your permissions. Ask it how to do ' +
      'something, or why a button is missing, and it will tell you which page to go ' +
      'to and link you straight there. It cannot see your data, so it will not tell ' +
      'you what is on a specific order — but it will tell you where to look.',
  },
  {
    id: 'user-menu',
    path: buildPath('dashboard'),
    anchor: 'user-menu',
    title: 'Your menu',
    body:
      'Your account, the theme, and the switch for this tutorial. Replay starts it ' +
      'again from the beginning whenever you want it — it is per person, so turning ' +
      'it off does not affect anybody else at your organisation.',
  },
  {
    id: 'finish',
    path: buildPath('dashboard'),
    title: 'That is the tour',
    body:
      'For anything not covered, the help assistant in the bottom right is the ' +
      'fastest route, and Partner Resources has the documentation, training videos ' +
      'and a link to raise a support ticket with CSA.',
  },
];

/**
 * The tour as this person will see it.
 *
 * Steps whose subject they cannot use are dropped rather than shown and
 * disabled: a tutorial that spends four steps on buttons you do not have
 * teaches you that the portal is broken.
 */
export function tourStepsFor(permissions?: UserPermissions | null): TourStep[] {
  if (!permissions) return ALL_TOUR_STEPS.filter(step => !step.requires?.length);
  return ALL_TOUR_STEPS.filter(step =>
    (step.requires ?? []).every(key => permissions[key] === true)
  );
}

/** The steps in `steps` that belong to a concrete pathname. */
export function stepsForPath(steps: TourStep[], pathname: string): TourStep[] {
  return steps.filter(step => pathMatches(step.path, pathname));
}

/**
 * Whether a step's path covers a pathname.
 *
 * `[id]` matches any single segment, so detail-page steps work for whichever
 * record the user opened.
 */
export function pathMatches(stepPath: string, pathname: string): boolean {
  const stepParts = stepPath.split('/');
  const pathParts = pathname.replace(/\/$/, '').split('/');
  if (stepParts.length !== pathParts.length) return false;
  return stepParts.every((part, i) => part === '[id]' || part === pathParts[i]);
}

/** Index of a step by id within `steps`, or -1. */
export function indexOfStep(steps: TourStep[], stepId: string): number {
  return steps.findIndex(step => step.id === stepId);
}

/** True when a path can be navigated to directly — no record id needed. */
export function isDirectPath(path: string): boolean {
  return !path.includes('[id]');
}
