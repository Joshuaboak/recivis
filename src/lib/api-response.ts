/**
 * Standardized API response helpers.
 * All error responses follow the same shape: { success: false, error: string }
 * All success responses follow: { success: true, ...data }
 *
 * Usage (in future API routes):
 *   return apiError('Not found', 404);
 *   return apiSuccess({ invoices: [...] });
 */
import { NextResponse } from 'next/server';

/** Return a JSON error response with a consistent shape. */
export function apiError(message: string, status: number = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

/** Return a JSON success response, merging any extra data fields. */
export function apiSuccess(data: Record<string, unknown> = {}) {
  return NextResponse.json({ success: true, ...data });
}
