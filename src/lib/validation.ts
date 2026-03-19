/**
 * Input validation schemas using Zod.
 * Applied at API route level to validate request bodies
 * before processing.
 */
import { z } from 'zod';

/** User creation schema */
export const createUserSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required'),
  resellerId: z.string().optional(),
  userRoleName: z.string().optional(),
});

/** User update schema */
export const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  is_active: z.boolean().optional(),
  user_role_name: z.string().optional(),
  reseller_id: z.string().optional(),
});

/** Password reset schema */
export const resetPasswordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

/** Contact creation schema */
export const createContactSchema = z.object({
  First_Name: z.string().min(1, 'First name is required'),
  Last_Name: z.string().min(1, 'Last name is required'),
  Email: z.string().email().optional(),
  Phone: z.string().optional(),
  Title: z.string().optional(),
  Account_Name: z.object({ id: z.string() }).optional(),
});

/** Account creation schema */
export const createAccountSchema = z.object({
  Account_Name: z.string().min(1, 'Account name is required'),
  Billing_Country: z.string().optional(),
  Reseller: z.object({ id: z.string() }).optional(),
});

/** Invoice date/field update schema */
export const updateInvoiceSchema = z.object({
  Invoice_Date: z.string().optional(),
  Due_Date: z.string().optional(),
  Currency: z.string().optional(),
  Purchase_Order: z.string().optional(),
  Reseller_Direct_Purchase: z.boolean().optional(),
  Invoiced_Items: z.array(z.record(z.string(), z.unknown())).optional(),
});

/**
 * Validate a request body against a schema.
 * Returns the parsed data or an error response.
 */
export function validateBody<T>(schema: z.ZodSchema<T>, body: unknown):
  { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(body);
  if (!result.success) {
    // Zod v4 uses .issues instead of .errors
    const firstIssue = result.error.issues[0];
    return { success: false, error: firstIssue?.message || 'Validation failed' };
  }
  return { success: true, data: result.data };
}
