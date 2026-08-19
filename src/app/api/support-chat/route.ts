/**
 * POST /api/support-chat — the partner support assistant.
 *
 * Deliberately its own route rather than a mode on /api/chat. Two reasons that
 * are not stylistic:
 *
 *   1. The invoice assistant's RBAC functions are shaped around the modules it
 *      writes to. Branching them on a flag would put two security policies in
 *      one function, which is how a bypass gets introduced later.
 *   2. Its prompt tells it "NEVER explain your filtering logic or internal
 *      process to the user". A support assistant's whole job is the opposite.
 *      Those instructions cannot coexist in one prompt.
 *
 * This one has no tools at all. It answers from authored help content plus the
 * caller's own resolved permissions, which between them cover the two things
 * partners actually ask: how do I do X, and why can I not do X. Adding
 * read-only Zoho tools later is a small step — lib/tenant-scope.ts already
 * holds the scoping rules — but it is not needed to be useful, and every tool
 * it does not have is a way it cannot leak another partner's data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import type { AuthUser } from '@/lib/api-auth';
import { log } from '@/lib/logger';
import { knowledgeAsPrompt } from '@/lib/support/knowledge';
import { linkCatalogueAsPrompt } from '@/lib/support/links';
import { getRouteTitle } from '@/lib/routes';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

/** Answering "how do I" from fixed material does not need the largest model. */
const SUPPORT_MODEL = 'anthropic/claude-sonnet-4.5';

/** Long enough for a thorough answer, short enough to stay a chat reply. */
const MAX_TOKENS = 900;

/** Only the last few turns are sent; support questions rarely need more. */
const MAX_HISTORY = 12;

interface IncomingMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * What this user can and cannot do, in words.
 *
 * The single most useful thing the assistant can tell somebody is why a button
 * is missing, and that is answerable entirely from the resolved permissions
 * without touching the CRM.
 */
function permissionSummary(user: AuthUser): string {
  const p = user.permissions;
  const allowed: string[] = [];
  const denied: string[] = [];
  const note = (label: string, value: boolean) => (value ? allowed : denied).push(label);

  note('create orders', p.canCreateInvoices);
  note('approve orders', p.canApproveInvoices);
  note('send orders', p.canSendInvoices);
  note('change prices on line items', p.canModifyPrices);
  note('upload purchase orders', p.canUploadPO);
  note('create evaluations', p.canCreateEvaluations);
  note('create and renew monthly subscriptions', p.canMonthlySubscriptions);
  note('send orders straight to customers', p.canDirectCustomerComms);
  note('view reports', p.canViewReports);
  note('export data', p.canExportData);
  note('manage users at their partner', p.canManageUsers);
  note('see records for child resellers', p.canViewChildRecords);

  return [
    `They CAN: ${allowed.join(', ') || 'nothing beyond browsing'}.`,
    `They CANNOT: ${denied.join(', ') || 'nothing — they have every permission'}.`,
  ].join('\n');
}

function buildSystemPrompt(user: AuthUser, pathname: string | null): string {
  const whereTheyAre = pathname
    ? `They are currently on the "${getRouteTitle(pathname)}" page (${pathname}).`
    : 'Their current page is unknown.';

  return `You are the support assistant inside ReCivis, the Civil Survey Applications partner portal. You help partners — resellers and distributors — use the portal.

## Who you are talking to
Name: ${user.name}
Their partner organisation: ${user.resellerId ? 'set' : 'not set'}
Role: ${user.role}
${whereTheyAre}

${permissionSummary(user)}

## What you do
Answer questions about how to use this portal, and help work out why something
is not behaving as they expect. Be direct and concrete: name the page, the
section and the button. Short answers are better than complete ones.

## Never offer what they cannot do
Each section of the reference below is marked with the permissions it needs and
whether this person holds them (YES/NO). Treat NO as "that button is not on
their screen": do not include that step, do not tell them to press it, and do
not describe it as something they can do. Say plainly that it is not available
to them and who can change that. Describing an action they cannot take wastes
their time and makes them think the portal is broken.

## Answering "what can I do with X"
Give the actual list for that section — the screen, the buttons on it, and what
each one does — filtered to what they can do. Group it as a short list rather
than prose. If a whole section is unavailable to them, say so instead of
listing it.

## How to handle "why can't I..."
This is the most common real problem. Check the permission list above first.
If the thing they are trying to do is in their CANNOT list, say so plainly,
explain that permissions are set both at their organisation level and on their
own user account and that both are needed, and tell them to ask their partner
administrator or CSA support. Do not speculate about other causes when the
permission already explains it.

## Linking
Every time you name a page, link it. Write it as a markdown link — [Accounts](/accounts) —
so they can click straight through instead of hunting for it. That applies to
every mention, not only the first, and to steps in a list ("1. Go to
[Accounts](/accounts)"). Use ONLY the paths below, exactly as written. Never
invent a path, never link to a specific customer, order or licence — you cannot
know their record numbers — and never link a button or a section, only a page.
If what you are describing is not a page in this list, describe it in words.

Pages you may link to:
${linkCatalogueAsPrompt(user.permissions)}

The CSA helpdesk is outside the portal: link it as
[CSA helpdesk](https://helpdesk.civilsurveyapplications.com).

## Rules
- Only describe things that exist in the reference below. If you do not know,
  say so and point them at the CSA helpdesk at
  helpdesk.civilsurveyapplications.com. A confident wrong answer about
  licensing or money costs them real money.
- You cannot see their data — no accounts, orders, licences or numbers. You
  have no access to records at all. If they ask something that needs looking at
  a specific record, tell them what to open and what to look at on it.
- You cannot change anything. You are not able to create, edit, approve or send
  anything on their behalf, and should not imply otherwise.
- Never discuss other partners, other resellers, or anything about how the
  system works internally. If asked, say you only cover using the portal.
- Do not guess at prices, discounts or commission rates. Point them at Partner
  Reports or their CSA contact.
- Plain language. No Zoho terminology, no internal field or module names, no
  mention of CRM records or APIs. They see "customers", "orders", "licences".

## Reference — how this portal works

${knowledgeAsPrompt(user.permissions)}`;
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'The assistant is not configured.' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const incoming = (body.messages || []) as IncomingMessage[];
    // The page is client-supplied, so it is context and never authority. It
    // only ever shapes wording; nothing is granted or denied on the basis of it.
    const pathname = typeof body.pathname === 'string' ? body.pathname : null;

    if (incoming.length === 0) {
      return NextResponse.json({ error: 'No message' }, { status: 400 });
    }

    const messages = [
      { role: 'system', content: buildSystemPrompt(user, pathname) },
      ...incoming.slice(-MAX_HISTORY).map(m => ({
        role: m.role,
        content: String(m.content || '').slice(0, 4000),
      })),
    ];

    const started = Date.now();
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: SUPPORT_MODEL,
        messages,
        max_tokens: MAX_TOKENS,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      log('error', 'ai', 'Support assistant upstream error', {
        status: response.status,
        detail: detail.slice(0, 300),
      });
      return NextResponse.json(
        { error: 'The assistant is unavailable right now. Please try again.' },
        { status: 502 }
      );
    }

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content;

    if (typeof reply !== 'string' || !reply.trim()) {
      log('warn', 'ai', 'Support assistant returned nothing usable');
      return NextResponse.json(
        { error: 'The assistant did not manage a reply. Please try rephrasing.' },
        { status: 502 }
      );
    }

    log('info', 'ai', 'Support assistant replied', {
      by: user.email,
      turns: incoming.length,
    }, Date.now() - started);

    return NextResponse.json({ reply });
  } catch (error) {
    log('error', 'ai', 'Support assistant failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
