/**
 * /api/notifications — Poll-based notification system.
 *
 * GET: Fetches notifications by querying Zoho for recent events
 *      (leads assigned, evaluations started, invoices approved/paid).
 *      Filters out dismissed notifications via PostgreSQL.
 *      Results cached in Redis per reseller (3 min TTL).
 *
 * POST: Dismiss one notification or all notifications for the user.
 *       Body: { action: 'dismiss', key: '...' } or { action: 'dismiss-all', keys: [...] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { searchAllPages } from '@/lib/zoho';
import { query, initDB } from '@/lib/db';
import { log } from '@/lib/logger';
import { requireAuth, isAdmin } from '@/lib/api-auth';
import { cacheGet, cacheSet } from '@/lib/cache';

interface Notification {
  key: string;
  type: 'lead' | 'evaluation' | 'invoice';
  title: string;
  message: string;
  recordId: string;
  recordModule: string;
  timestamp: string;
}

/** Build reseller criteria for one or multiple reseller IDs. */
function resellerCriteria(ids: string[]): string {
  if (ids.length === 1) return `(Reseller:equals:${ids[0]})`;
  return `(${ids.map(id => `(Reseller:equals:${id})`).join('or')})`;
}

/** Fetch raw notification data from Zoho for given reseller IDs. */
async function fetchNotificationsFromZoho(resellerIds: string[]): Promise<Notification[]> {
  const notifications: Notification[] = [];
  const criteria = resellerCriteria(resellerIds);

  // Run all 3 queries in parallel
  const [leads, prospects, invoices] = await Promise.all([
    // 1. Recent leads assigned to these resellers
    searchAllPages(
      'Leads',
      criteria,
      'Company,Full_Name,Email,Lead_Status,Reseller,Created_Time,Converted__s,Record_Status__s',
      'desc',
      1 // Just first page
    ).catch(() => [] as Record<string, unknown>[]),

    // 2. Recent prospect accounts (= evaluation started)
    searchAllPages(
      'Accounts',
      `((Account_Type:equals:Prospect)and${criteria})`,
      'Account_Name,Reseller,Created_Time,Record_Status__s',
      'desc',
      1
    ).catch(() => [] as Record<string, unknown>[]),

    // 3. Recently approved/paid invoices
    searchAllPages(
      'Invoices',
      `(((Status:equals:Approved)or(Status:equals:Sent))and${criteria})`,
      'Subject,Reference_Number,Account_Name,Status,Payment_Status,Reseller,Modified_Time,Record_Status__s',
      'desc',
      1
    ).catch(() => [] as Record<string, unknown>[]),
  ]);

  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

  // Process leads
  for (const lead of leads) {
    if (lead.Record_Status__s === 'Trash' || lead.Converted__s) continue;
    const created = new Date(lead.Created_Time as string).getTime();
    if (created < thirtyDaysAgo) continue;

    const name = (lead.Company as string) || (lead.Full_Name as string) || 'Unknown';
    notifications.push({
      key: `lead-${lead.id}`,
      type: 'lead',
      title: 'New Lead Assigned',
      message: name,
      recordId: lead.id as string,
      recordModule: 'Leads',
      timestamp: lead.Created_Time as string,
    });
  }

  // Process prospects (evaluations) — check if any overlap with leads
  const leadKeys = new Set(notifications.map(n => n.message.toLowerCase()));
  for (const acc of prospects) {
    if (acc.Record_Status__s === 'Trash') continue;
    const created = new Date(acc.Created_Time as string).getTime();
    if (created < thirtyDaysAgo) continue;

    const name = acc.Account_Name as string || 'Unknown';

    // Check if there's a matching lead notification — combine them
    const matchingLead = notifications.find(
      n => n.type === 'lead' && n.message.toLowerCase() === name.toLowerCase()
    );

    if (matchingLead) {
      // Combine: update the existing lead notification
      matchingLead.title = 'New Lead — Evaluation Started';
      matchingLead.message = name;
    } else {
      notifications.push({
        key: `eval-${acc.id}`,
        type: 'evaluation',
        title: 'Evaluation Started',
        message: name,
        recordId: acc.id as string,
        recordModule: 'Prospects',
        timestamp: acc.Created_Time as string,
      });
    }
  }

  // Process invoices
  for (const inv of invoices) {
    if (inv.Record_Status__s === 'Trash') continue;
    const modified = new Date(inv.Modified_Time as string).getTime();
    if (modified < thirtyDaysAgo) continue;

    const accountName = (inv.Account_Name as { name?: string })?.name || '';
    const ref = inv.Reference_Number as string || '';
    const paymentStatus = (inv.Payment_Status as string || '').toLowerCase();
    const status = inv.Status as string;

    if (paymentStatus === 'paid' || paymentStatus === 'succeeded') {
      notifications.push({
        key: `inv-${inv.id}-paid`,
        type: 'invoice',
        title: 'Invoice Paid',
        message: `${ref}${accountName ? ` — ${accountName}` : ''}`,
        recordId: inv.id as string,
        recordModule: 'Invoices',
        timestamp: inv.Modified_Time as string,
      });
    } else if (status === 'Approved' || status === 'Sent') {
      notifications.push({
        key: `inv-${inv.id}-approved`,
        type: 'invoice',
        title: `Invoice ${status}`,
        message: `${ref}${accountName ? ` — ${accountName}` : ''}`,
        recordId: inv.id as string,
        recordModule: 'Invoices',
        timestamp: inv.Modified_Time as string,
      });
    }
  }

  // Sort by timestamp descending, cap at 50
  notifications.sort((a, b) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return notifications.slice(0, 50);
}

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  try {
    await initDB();

    // Determine which reseller IDs to check
    let resellerIds: string[] = [];
    if (isAdmin(user)) {
      // Admins don't get reseller-specific notifications
      return NextResponse.json({ notifications: [], unreadCount: 0 });
    } else if (user.resellerId) {
      resellerIds = user.allowedResellerIds.length > 0
        ? user.allowedResellerIds
        : [user.resellerId];
    } else {
      return NextResponse.json({ notifications: [], unreadCount: 0 });
    }

    // Check Redis cache first (keyed by reseller set, 3 min TTL)
    const cacheKey = `notifications:${resellerIds.sort().join(',')}`;
    let allNotifications: Notification[] | null = await cacheGet<Notification[]>(cacheKey);

    if (!allNotifications) {
      allNotifications = await fetchNotificationsFromZoho(resellerIds);
      await cacheSet(cacheKey, allNotifications, 180); // 3 min
    }

    // Filter out dismissed notifications for this user
    const dismissedResult = await query(
      `SELECT notification_key FROM notification_dismissals
       WHERE user_id = $1 AND created_at > NOW() - INTERVAL '30 days'`,
      [user.userId]
    );
    const dismissedKeys = new Set(dismissedResult.rows.map(r => r.notification_key));

    const visible = allNotifications.filter(n => !dismissedKeys.has(n.key));

    // Cleanup old dismissals (> 30 days)
    await query(
      `DELETE FROM notification_dismissals WHERE created_at < NOW() - INTERVAL '30 days'`
    ).catch(() => {});

    return NextResponse.json({
      notifications: visible,
      unreadCount: visible.length,
    });
  } catch (error) {
    log('error', 'api', 'Notifications fetch failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ notifications: [], unreadCount: 0 });
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  try {
    await initDB();
    const body = await request.json();

    if (body.action === 'dismiss' && body.key) {
      await query(
        `INSERT INTO notification_dismissals (user_id, notification_key)
         VALUES ($1, $2)
         ON CONFLICT (user_id, notification_key) DO UPDATE SET created_at = NOW()`,
        [user.userId, body.key]
      );
      return NextResponse.json({ success: true });
    }

    if (body.action === 'dismiss-all' && Array.isArray(body.keys)) {
      for (const key of body.keys) {
        await query(
          `INSERT INTO notification_dismissals (user_id, notification_key)
           VALUES ($1, $2)
           ON CONFLICT (user_id, notification_key) DO UPDATE SET created_at = NOW()`,
          [user.userId, key]
        );
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    log('error', 'api', 'Notification dismiss failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
