/**
 * tour/sections.ts — the guided tutorial, one section per page.
 *
 * The tutorial used to be a single forty-step march that drove the user
 * around the portal. This is the same material rearranged around how somebody
 * actually learns an app: they open a page, and the page explains itself.
 *
 * A section belongs to a route. It offers itself the first time that route is
 * visited, and never again once it has been seen — and the help icon in the
 * header brings it back on demand. Nothing here navigates: the user goes where
 * they were going anyway, and the tutorial meets them there.
 *
 * Three rules shaped this list:
 *
 * 1. **A section explains one page.** No step assumes the user arrived from
 *    another section, or that they will go on to a particular next one.
 * 2. **Nothing is shown that the viewer cannot do.** Steps declare the
 *    permissions their subject needs; a section whose steps are all filtered
 *    out stops existing for that person, icon and all.
 * 3. **A missing anchor is normal.** Empty lists, buttons that appear on
 *    selection, panels that depend on data. The controller skips them.
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

export interface TourStep {
  /** Unique within its section. */
  id: string;
  /** Element to highlight, matched as [data-tour="..."]. Omit to centre it. */
  anchor?: string;
  title: string;
  body: string;
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
          'A quick look at what is where. From here on the tutorial stays out of your ' +
          'way: open a section and it will explain that section, once. The help icon ' +
          'in the top bar brings the explanation back whenever you want it.',
      },
      {
        id: 'sidebar',
        anchor: 'sidebar',
        title: 'Everything lives here',
        body:
          'Leads are enquiries and the people trialling the software. Accounts are ' +
          'customers. Assets are the licences those customers hold. Orders is where you ' +
          'sell them something. Sections with an arrow open up to show more underneath ' +
          '— Create Lead, Create Account and the renewal views live in there.',
      },
      {
        id: 'cards',
        anchor: 'dashboard-cards',
        title: 'Or start from here',
        body:
          'The same destinations as shortcuts, each with a line saying what it is for ' +
          'and a Learn more link. Nothing is created from the dashboard — it is a ' +
          'starting point, not a workspace.',
      },
      {
        id: 'search',
        anchor: 'header-search',
        title: 'Search everything',
        body:
          'One box across customers, leads, orders and licences. Ctrl K from anywhere ' +
          'opens it without reaching for the mouse. This is usually faster than ' +
          'navigating to a section and filtering it.',
      },
      {
        id: 'recent',
        anchor: 'header-recent',
        title: 'Where you have just been',
        body:
          'The records you opened most recently, so going back to the order you were ' +
          'looking at five minutes ago does not mean searching for it again.',
      },
      {
        id: 'notifications',
        anchor: 'header-notifications',
        title: 'What needs you',
        body:
          'Licences coming up for renewal, orders that have moved on, anything the ' +
          'portal thinks you should know. The dot means there is something unread.',
      },
      {
        id: 'your-menu',
        anchor: 'user-menu',
        title: 'Your account, and this tutorial',
        body:
          'Your details and role, the theme, and the switch that turns these ' +
          'walkthroughs off. Restart, beside it, makes every section introduce itself ' +
          'again — useful when somebody new sits at your desk.',
      },
      {
        id: 'support',
        anchor: 'support-launcher',
        title: 'Ask, in your own words',
        body:
          'The help assistant knows this portal and your permissions. Ask it how to do ' +
          'something, or why a button is missing, and it will tell you which page to go ' +
          'to and link you straight there. It cannot see your data, so it will not read ' +
          'a specific order to you — but it will say where to look.',
      },
      {
        id: 'help',
        anchor: 'header-help',
        title: 'This icon explains the page you are on',
        body:
          'Every section of the portal has a short walkthrough like this one. It plays ' +
          'itself the first time you open that section, and this icon replays it any ' +
          'time. You can turn the whole thing off under your name at the bottom left.',
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
        id: 'lead-vs-prospect',
        anchor: 'leads-search',
        title: 'Leads and prospects both live here',
        body:
          'A lead is an enquiry who has not tried the software yet — somebody who ' +
          'filled in a form on the website or came in through marketing. A prospect ' +
          'has downloaded a free trial and is evaluating it, but has not bought. Two ' +
          'things mark a prospect out: the status column reads Prospect, and the ' +
          'evaluation filter can show only those holding a trial.',
      },
      {
        id: 'list',
        anchor: 'leads-results',
        title: 'What you can do with each',
        body:
          'The stage decides what is possible. A lead you edit, work and record notes ' +
          'against — there is nothing to licence yet. A prospect already holds a trial ' +
          'and is what an order is raised against when they decide to buy. Click a ' +
          'column heading to sort; click a row to open one.',
      },
      {
        id: 'creating',
        title: 'Adding one yourself',
        body:
          'Create Lead, under Leads in the sidebar, takes a name, a company and an ' +
          'email. Everything else — phone, website, industry, country, source, the ' +
          'products they asked about — is optional, and is what makes the lead worth ' +
          'having in three months.',
      },
    ],
  },
  {
    id: 'lead-create',
    title: 'Creating a lead',
    path: buildPath('create-lead'),
    steps: [
      {
        id: 'form',
        anchor: 'lead-form',
        title: 'What actually matters',
        body:
          'Name, company and email. The rest is optional but useful later — and if you ' +
          'are a distributor you also choose which of your resellers owns the lead.',
      },
      {
        id: 'submit',
        anchor: 'lead-create-submit',
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
        id: 'record',
        title: 'The record itself',
        body:
          'The badge beside the name says whether this is a lead or a prospect, and ' +
          'hovering it explains the difference. The details underneath are editable in ' +
          'place — contact details, status, industry, the products they are interested ' +
          'in — then Save Changes. Below that are any contacts, orders and trial ' +
          'licences attached to them.',
      },
      {
        id: 'evaluations',
        anchor: 'lead-evaluations',
        title: 'Giving them a trial',
        body:
          'Create Evaluation issues a 30-day trial licence, and holding one is what ' +
          'makes somebody a prospect rather than a lead. There is a cap on how many one ' +
          'customer can have, and a longer trial needs a separate permission. ' +
          'Evaluations are never renewed: when the trial ends they buy a commercial ' +
          'licence.',
        requires: ['canCreateEvaluations'],
      },
      {
        id: 'convert',
        anchor: 'lead-convert',
        title: 'Lead to prospect',
        body:
          'Convert to Prospect is the step between the two — press it once they have ' +
          'downloaded the trial. Their details come across, a contact is created for ' +
          'them, and from then on they can hold trial licences and be ordered against. ' +
          'It is one-way, so convert when they have actually taken the trial rather ' +
          'than in advance.',
        requires: ['canConvertLeads'],
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
          'Search by company name, a contact email, or just the email domain. Domain is ' +
          'the useful one: somebody emails you from an address you do not recognise and ' +
          'you need to know whether their company is already in here.',
      },
      {
        id: 'open',
        anchor: 'accounts-results',
        title: 'Everything happens inside a customer',
        body:
          'Open one and you get their contacts, their orders, their licences, and the ' +
          'buttons that raise an order or a renewal. Create Account, under Accounts in ' +
          'the sidebar, adds a new one.',
      },
    ],
  },
  {
    id: 'account-create',
    title: 'Creating a customer',
    path: buildPath('create-account'),
    steps: [
      {
        id: 'form',
        anchor: 'account-create-submit',
        title: 'Company plus a primary contact',
        body:
          'That is the minimum, and the contact matters because it is the person orders ' +
          'and licence keys are addressed to. Fill the address in properly if they are ' +
          'buying on account terms; it ends up on the paperwork.',
      },
      {
        id: 'duplicates',
        anchor: 'account-duplicates',
        title: 'Read the duplicate warning',
        body:
          'If the name looks like one already in the portal you get a warning before it ' +
          'saves. Two records for one company splits their licence history in half, and ' +
          'it is unpleasant to unpick later.',
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
          'Contacts are the individuals at that company. One is marked primary — that ' +
          'is who orders and licence keys go to — and you can mark a secondary as well. ' +
          'Use Set As on any contact to change which is which, and Add Contact to add ' +
          'somebody new.',
      },
      {
        id: 'orders',
        anchor: 'account-orders',
        title: 'Their orders',
        body:
          'Everything this customer has bought and where each order got to — Draft, ' +
          'Approved or Sent. Click any of them to open it.',
      },
      {
        id: 'new-order',
        anchor: 'new-order-button',
        title: 'Raising an order',
        body:
          'Orders always start from a customer, which is why this button is here and ' +
          'not in the Orders section. It carries the customer, their primary contact ' +
          'and your pricing into the order for you.',
        requires: ['canCreateInvoices'],
      },
      {
        id: 'evaluations',
        anchor: 'account-evaluations',
        title: 'Trial licences',
        body:
          'The same 30-day evaluations as on a lead. Their existing trials are listed ' +
          'here, so you can see what they have already had before issuing another.',
        requires: ['canCreateEvaluations'],
      },
      {
        id: 'assets',
        anchor: 'account-assets',
        title: 'Their licences, and how renewals start',
        body:
          'Every licence this customer currently holds, with its serial key and renewal ' +
          'date. Tick any row and two buttons appear above the table: Generate Renewal, ' +
          'which raises the renewal order, and Send Keys, which emails the existing keys ' +
          'to you or to the customer. Trials, educational and NFR licences cannot be ' +
          'renewed, and the button says which ones are blocking it.',
        requires: ['canCreateInvoices'],
      },
      {
        id: 'subscriptions',
        anchor: 'account-new-subscription',
        title: 'Monthly subscriptions',
        body:
          'A 30-day licence you renew a month at a time instead of buying a year up ' +
          'front. Prices are quoted in US dollars with your own currency alongside, less ' +
          'your commission. Renew Monthly beside it renews all of this customer\'s ' +
          'subscriptions at once.',
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
        id: 'list',
        anchor: 'orders-search',
        title: 'Every order you have raised',
        body:
          'Search by order number, subject or customer, and filter by status and by ' +
          'type — New Product, Renewal, Co-Term (lining a licence up with an existing ' +
          'renewal date) or Add To Contract. New orders are not raised from here; they ' +
          'start on the customer.',
      },
      {
        id: 'statuses',
        anchor: 'orders-results',
        title: 'Draft, Approved, Sent',
        body:
          'A Draft can still be changed. Approved means licence keys have been issued ' +
          'against it. Sent means it has gone out for payment. Once an order leaves ' +
          'Draft it locks, because the keys and the money are settled off its totals.',
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
          'The header carries the customer, contact, dates, currency and totals; the ' +
          'table underneath carries the line items. While it is a Draft the quantities ' +
          'and products can be changed. Once it is Approved or Sent it shows a Locked ' +
          'badge and corrections go through CSA.',
      },
      {
        id: 'coupon',
        anchor: 'order-coupon',
        title: 'Discount codes',
        body:
          'Enter a code here and it is checked against its rules — products, region, ' +
          'order type, minimum and maximum value, expiry — before it applies. The ' +
          'discount then appears as its own line.',
      },
      {
        id: 'po',
        anchor: 'order-po',
        title: 'Purchase orders',
        body:
          'Buying on account terms needs both a purchase order number and the document ' +
          'attached, and both have to be here before the order will go through. Drag ' +
          'the file straight onto the panel.',
        requires: ['canUploadPO'],
      },
      {
        id: 'send-to',
        anchor: 'order-send-to',
        title: 'Where the order and keys go',
        body:
          'Reseller sends everything to you, copying the CSA sales rep, and you pass it ' +
          'on. Customer sends it straight to the end customer, copying you. Switching ' +
          'this also reprices the line items, because what you pay and what they pay are ' +
          'different numbers.',
      },
      {
        id: 'actions',
        anchor: 'order-actions',
        title: 'Finishing the order',
        body:
          'This is the step that issues licence keys. Place Order approves it on your ' +
          'account terms. Pay Now opens a card payment page and the keys follow when ' +
          'payment clears. Pay Later sends it out for payment. Which you see depends on ' +
          'whether your partner account is set up for card, account terms, or both.',
        requires: ['canApproveInvoices'],
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
          'The whole estate across all your customers, searchable by customer, product ' +
          'or serial key, and filterable by status and by how soon it renews. This is ' +
          'the page for "what do they actually have".',
      },
      {
        id: 'groups',
        anchor: 'assets-groups',
        title: 'Grouped by customer',
        body:
          'Licences are individual records but you think in customers, so they are ' +
          'grouped. Each group collapses, and the header shows how many licences and ' +
          'when the next one is due.',
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
          'Every licence renewing within 60 days, soonest first. Recently Expired is the ' +
          'same list for the 60 days behind you — worth a look weekly, because a lapsed ' +
          'licence is usually somebody who meant to renew and forgot.',
      },
      {
        id: 'generate',
        anchor: 'assets-groups',
        title: 'Raising the renewal from here',
        body:
          'Tick the licences under a customer and a Generate Renewal button appears on ' +
          'that customer\'s row. It creates the order and opens it. Licences that cannot ' +
          'be renewed cannot be ticked, and hovering one says why.',
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
        id: 'renewing',
        title: 'Rolling monthly licences',
        body:
          'Every monthly subscription you hold, with its next renewal date and a renew ' +
          'button per customer. These need renewing every 30 days — this is the page ' +
          'that stops one quietly lapsing.',
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
          'customer, picks the product and builds a draft for you to check. It can also ' +
          'create a lead, customer or contact when they are not in the portal yet. It ' +
          'never approves, sends or pays for anything; that stays on the order.',
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
        id: 'using',
        title: 'Finding a code and using it',
        body:
          'Coupons are set up by CSA. This page is where you check one is live and what ' +
          'it covers — products, regions, order types, order values, and the dates it ' +
          'runs between — before promising it to a customer. To redeem it, open the ' +
          'order and enter the code in the Coupon panel.',
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
        id: 'cards',
        anchor: 'reports-cards',
        title: 'How you are doing',
        body:
          'New customers, new leads, approved orders and revenue over the months you ' +
          'choose, with your commission alongside. Amounts show in their original ' +
          'currency with an Australian dollar equivalent. Click any card to drill into ' +
          'the records behind it.',
      },
      {
        id: 'assistant',
        title: 'Or just ask',
        body:
          'The Reports Assistant, under Reports in the sidebar, answers the same ' +
          'questions as a conversation if you would rather ask than work the filters.',
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
        title: 'What is owed, and to whom',
        body:
          'Monthly Statement is the month-end reconciliation: approved orders and active ' +
          'subscriptions, netted against whoever you settle with — your distributor if ' +
          'you sit under one, CSA if you do not. Billing Schedule is forward-looking: ' +
          'what your subscriptions cost per month and per year. Both export.',
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
          'Your own details — address, region, currency, commission percentages, ' +
          'payment methods and permissions — and, if you are a distributor, the ' +
          'resellers underneath you. Open one to see how it is set up.',
      },
      {
        id: 'users',
        title: 'The people at your organisation',
        body:
          'Open your partner record and the users list is on it: who has an account, ' +
          'their role, when they last logged in, with Add User, Edit User and Reset ' +
          'Password. Each person\'s permissions sit inside the organisation\'s — you ' +
          'cannot grant somebody something the organisation itself does not have.',
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
        title: 'Marketing material, documentation and training',
        body:
          'Logos and brand guidelines, brochures and datasheets, co-branded email ' +
          'templates and social assets on the marketing side. Documentation, knowledge ' +
          'base articles, release notes, tutorials and webinar recordings on the product ' +
          'side. The link to raise a support ticket with CSA is here too.',
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
