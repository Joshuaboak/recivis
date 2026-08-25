/**
 * email-domain.ts — matching a person's email to a company already in the CRM.
 *
 * Accounts carry an `Email_Domain`, so the domain of an enquiry is usually
 * enough to tell whether the company is already a customer, and whose. That
 * decides what record a new person should become: a lead if nobody holds the
 * domain, a contact on the existing account if this partner does, and nothing
 * at all if another partner does.
 *
 * Lives in lib rather than in the route because both the pre-flight check the
 * form calls and the guard on lead creation have to reach the same verdict —
 * a check the form can pass and the write can fail is worse than no check.
 */

import { searchAllPages } from './zoho';
import { isAdmin, type AuthUser } from './api-auth';
import { filterToScope } from './record-access';

/** What the domain of an email says about who already holds the company. */
export type DomainOwner =
  /** Nobody holds this domain, or it says nothing (free mail, unparseable). */
  | { match: 'none' }
  /** An account this caller is assigned to. */
  | { match: 'mine'; account: { id: string; name: string; isProspect: boolean } }
  /** An account somebody else is assigned to. Carries no details on purpose. */
  | { match: 'other' };

/**
 * The domain part of an email address, with the `@` kept.
 *
 * Zoho stores `Email_Domain` including the leading `@`, so the comparison is
 * done in that form rather than stripping it here and adding it back later.
 * Returns null for anything that is not one address with one domain.
 */
export function emailDomain(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf('@');
  if (at < 1) return null;
  const domain = trimmed.slice(at + 1);
  // A domain with no dot is a typo, not a company, and matching on it would
  // sweep in whatever else was mistyped the same way.
  if (!domain.includes('.') || domain.includes('@') || /\s/.test(domain)) return null;
  return `@${domain}`;
}

/**
 * Free-mail domains, which say nothing about which company somebody is at.
 *
 * Matching on these would tie every gmail enquiry to whichever customer once
 * had a gmail address on their account — and, worse, could report a stranger's
 * gmail-domained account as "another partner's" and block the lead.
 */
const PUBLIC_DOMAINS = new Set([
  '@gmail.com', '@googlemail.com', '@outlook.com', '@outlook.com.au', '@hotmail.com',
  '@hotmail.co.uk', '@hotmail.com.au', '@live.com', '@live.com.au', '@msn.com',
  '@yahoo.com', '@yahoo.com.au', '@yahoo.co.uk', '@icloud.com', '@me.com', '@mac.com',
  '@aol.com', '@protonmail.com', '@proton.me', '@gmx.com', '@mail.com',
  '@bigpond.com', '@bigpond.net.au', '@optusnet.com.au', '@iinet.net.au',
  '@tpg.com.au', '@internode.on.net', '@ozemail.com.au',
]);

/** Whether a domain is worth matching on at all. */
export function isMatchableDomain(domain: string | null): domain is string {
  return !!domain && !PUBLIC_DOMAINS.has(domain);
}

/**
 * Who already holds the company behind this email domain.
 *
 * Searches every partner on purpose — noticing a company somebody else holds is
 * the point — and scopes the result here, so the unscoped half never leaves the
 * server. CSA roles see everything, so nothing is ever "another partner's" to
 * them.
 *
 * Throws if the search itself throws. Callers decide what an unanswerable check
 * means; it must not silently become a pass.
 */
export async function accountOwnerForDomain(
  user: AuthUser,
  domain: string
): Promise<DomainOwner> {
  const accounts = (
    await searchAllPages(
      'Accounts',
      `(Email_Domain:equals:${domain})`,
      'Account_Name,Email_Domain,Reseller,Account_Type,Record_Status__s',
      'desc',
      2
    )
  ).filter(a => a.Record_Status__s !== 'Trash');

  if (accounts.length === 0) return { match: 'none' };

  const mine = isAdmin(user) ? accounts : filterToScope(user, 'Accounts', accounts);
  if (mine.length === 0) return { match: 'other' };

  // Several of a partner's own accounts can share a domain (a group with more
  // than one entity). The search sorts descending, so the last is the oldest —
  // the established one, and the one a new contact most likely belongs to.
  const account = mine[mine.length - 1];
  return {
    match: 'mine',
    account: {
      id: account.id as string,
      name: (account.Account_Name as string) || 'this customer',
      isProspect: account.Account_Type === 'Prospect',
    },
  };
}
