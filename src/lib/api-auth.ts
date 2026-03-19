/**
 * api-auth.ts — Server-side authentication middleware for API routes.
 *
 * Auth flow:
 * 1. Client authenticates via POST /api/auth (email + password)
 * 2. Server sets an HTTP-only `recivis-token` cookie containing a JWT
 * 3. On subsequent API requests, this module reads the cookie, verifies the JWT,
 *    and loads the user's full permissions from PostgreSQL (user_role + reseller_role)
 *
 * Helper functions:
 * - getAuthUser()       — Extract user from request (returns null if unauthenticated)
 * - requireAuth()       — Returns 401 if not authenticated
 * - requireRole()       — Returns 403 if user lacks the required role
 * - isAdmin()           — Check if user is admin or IBM
 * - canManageReseller() — Check if user has access to a specific reseller's data
 */

import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { query, initDB } from './db';
import type { UserPermissions } from './types';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.warn('JWT_SECRET not set — authentication will fail in production');
}

/** The authenticated user context available to API route handlers. */
export interface AuthUser {
  userId: number;
  email: string;
  name: string;
  role: string;
  resellerId: string | null;
  permissions: UserPermissions;
  allowedResellerIds: string[];
}

/**
 * Extract and verify the authenticated user from a request.
 * Reads the JWT from the `recivis-token` cookie.
 * Returns the user with full permissions, or null if not authenticated.
 */
export async function getAuthUser(request: NextRequest): Promise<AuthUser | null> {
  const secret = JWT_SECRET || 'recivis-dev-secret-change-in-production';

  // Read token from cookie
  const token = request.cookies.get('recivis-token')?.value;
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, secret) as {
      userId: number;
      email: string;
      userRole: string;
    };

    await initDB();

    const result = await query(
      `SELECT u.id, u.email, u.name, u.reseller_id, u.is_active,
              ur.name AS user_role_name,
              ur.can_create_invoices AS ur_create, ur.can_approve_invoices AS ur_approve,
              ur.can_send_invoices AS ur_send, ur.can_modify_prices AS ur_price,
              ur.can_upload_po AS ur_po, ur.can_manage_users AS ur_users,
              ur.can_view_reports AS ur_reports, ur.can_export_data AS ur_export,
              rr.can_create_invoices AS rr_create, rr.can_approve_invoices AS rr_approve,
              rr.can_send_invoices AS rr_send, rr.can_view_all_records AS rr_all,
              rr.can_view_child_records AS rr_child, rr.can_modify_prices AS rr_price,
              rr.can_upload_po AS rr_po, rr.can_view_reports AS rr_reports,
              rr.can_export_data AS rr_export
       FROM users u
       LEFT JOIN user_roles ur ON ur.id = u.user_role_id
       LEFT JOIN resellers r ON r.id = u.reseller_id
       LEFT JOIN reseller_roles rr ON rr.id = r.reseller_role_id
       WHERE u.id = $1 AND u.is_active = true`,
      [decoded.userId]
    );

    if (result.rows.length === 0) return null;
    const row = result.rows[0];

    const isSystemAdmin = row.user_role_name === 'admin' || row.user_role_name === 'ibm';
    const permissions: UserPermissions = {
      canCreateInvoices: isSystemAdmin || ((row.ur_create ?? false) && (row.rr_create ?? false)),
      canApproveInvoices: isSystemAdmin || ((row.ur_approve ?? false) && (row.rr_approve ?? false)),
      canSendInvoices: isSystemAdmin || ((row.ur_send ?? false) && (row.rr_send ?? false)),
      canViewAllRecords: isSystemAdmin || (row.rr_all ?? false),
      canViewChildRecords: isSystemAdmin || (row.rr_child ?? false),
      canModifyPrices: isSystemAdmin || ((row.ur_price ?? false) && (row.rr_price ?? false)),
      canUploadPO: isSystemAdmin || ((row.ur_po ?? false) && (row.rr_po ?? false)),
      canManageUsers: isSystemAdmin || (row.ur_users ?? false),
      canViewReports: isSystemAdmin || ((row.ur_reports ?? false) && (row.rr_reports ?? false)),
      canExportData: isSystemAdmin || ((row.ur_export ?? false) && (row.rr_export ?? false)),
    };

    // Compute allowed reseller IDs
    let allowedResellerIds: string[] = [];
    if (!isSystemAdmin && row.reseller_id) {
      allowedResellerIds = [row.reseller_id];
      if (permissions.canViewChildRecords) {
        const children = await query(
          'SELECT id FROM resellers WHERE distributor_id = $1 AND is_active = true',
          [row.reseller_id]
        );
        for (const child of children.rows) {
          allowedResellerIds.push(child.id);
        }
      }
    }

    return {
      userId: row.id,
      email: row.email,
      name: row.name,
      role: row.user_role_name || 'standard',
      resellerId: row.reseller_id,
      permissions,
      allowedResellerIds,
    };
  } catch {
    return null;
  }
}

/**
 * Require authentication. Returns 401 if not authenticated.
 */
export async function requireAuth(request: NextRequest): Promise<AuthUser | NextResponse> {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  return user;
}

/**
 * Require specific role. Returns 403 if insufficient permissions.
 */
export function requireRole(user: AuthUser, ...roles: string[]): NextResponse | null {
  if (roles.includes(user.role)) return null;
  return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
}

/**
 * Check if user is admin or IBM.
 */
export function isAdmin(user: AuthUser): boolean {
  return user.role === 'admin' || user.role === 'ibm';
}

/**
 * Check if user can manage the given reseller.
 */
export function canManageReseller(user: AuthUser, resellerId: string): boolean {
  if (isAdmin(user)) return true;
  if (user.allowedResellerIds.length === 0) return false;
  return user.allowedResellerIds.includes(resellerId);
}
