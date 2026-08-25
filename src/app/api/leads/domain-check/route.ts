/**
 * GET /api/leads/domain-check?email=... — is this person's company already a
 * customer?
 *
 * A lead is an enquiry from a company nobody is dealing with yet. Half the time
 * the company is already in the CRM and the person emailing is simply a new
 * face at an existing customer — in which case a lead is the wrong record: it
 * starts a parallel history that has to be merged by hand later, and the
 * evaluation and order flows both hang off the account, not the lead.
 *
 * So the Create Lead form asks this before it creates anything, and gets one of
 * three answers (see `DomainOwner`): create the lead, offer the contact
 * instead, or stop because another partner holds the company.
 *
 * The `other` reply carries no account name, no partner name and no id.
 * "Somebody else has this company" is the whole of what a partner is entitled
 * to know; the rest would make this a way to enumerate other partners'
 * customers one domain at a time.
 */

import { NextRequest, NextResponse } from 'next/server';
import { log } from '@/lib/logger';
import { requireAuth } from '@/lib/api-auth';
import { accountOwnerForDomain, emailDomain, isMatchableDomain } from '@/lib/email-domain';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  const email = new URL(request.url).searchParams.get('email') || '';
  const domain = emailDomain(email);

  if (!isMatchableDomain(domain)) {
    return NextResponse.json({ match: 'none' });
  }

  try {
    return NextResponse.json(await accountOwnerForDomain(user, domain));
  } catch (error) {
    log('error', 'api', 'Lead domain check failed', {
      domain,
      error: error instanceof Error ? error.message : String(error),
    });
    // 502 rather than a cheerful `none`: the form stops and offers a retry,
    // because "we could not look" and "there is nothing there" should not read
    // the same to somebody about to create a duplicate.
    //
    // This only covers a throw. `searchAllPages` answers a no-match and a Zoho
    // outage the same way — with an empty array — so an outage mid-search still
    // reads as `none`. Worth knowing before treating this as a duplicate
    // guarantee rather than a duplicate check.
    return NextResponse.json({ error: 'Could not check the email domain' }, { status: 502 });
  }
}
