/**
 * Tests for input validation schemas.
 * Verifies that Zod schemas correctly accept valid data
 * and reject invalid data with appropriate error messages.
 */
import { describe, it, expect } from 'vitest';
import {
  createUserSchema,
  updateUserSchema,
  resetPasswordSchema,
  createContactSchema,
  createAccountSchema,
  updateInvoiceSchema,
  validateBody,
} from '@/lib/validation';

describe('createUserSchema', () => {
  it('accepts valid user data', () => {
    const result = validateBody(createUserSchema, {
      email: 'test@example.com',
      password: 'password123',
      name: 'Test User',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing email', () => {
    const result = validateBody(createUserSchema, {
      password: 'password123',
      name: 'Test User',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email format', () => {
    const result = validateBody(createUserSchema, {
      email: 'not-an-email',
      password: 'password123',
      name: 'Test User',
    });
    expect(result.success).toBe(false);
  });

  it('rejects short password', () => {
    const result = validateBody(createUserSchema, {
      email: 'test@example.com',
      password: 'short',
      name: 'Test User',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('8 characters');
    }
  });

  it('rejects empty name', () => {
    const result = validateBody(createUserSchema, {
      email: 'test@example.com',
      password: 'password123',
      name: '',
    });
    expect(result.success).toBe(false);
  });

  it('accepts optional resellerId and userRoleName', () => {
    const result = validateBody(createUserSchema, {
      email: 'test@example.com',
      password: 'password123',
      name: 'Test User',
      resellerId: 'some-id',
      userRoleName: 'standard',
    });
    expect(result.success).toBe(true);
  });
});

describe('resetPasswordSchema', () => {
  it('accepts valid password', () => {
    const result = validateBody(resetPasswordSchema, { password: 'newpass123' });
    expect(result.success).toBe(true);
  });

  it('rejects short password', () => {
    const result = validateBody(resetPasswordSchema, { password: 'short' });
    expect(result.success).toBe(false);
  });

  it('rejects missing password', () => {
    const result = validateBody(resetPasswordSchema, {});
    expect(result.success).toBe(false);
  });
});

describe('createContactSchema', () => {
  it('accepts valid contact with required fields', () => {
    const result = validateBody(createContactSchema, {
      First_Name: 'John',
      Last_Name: 'Doe',
    });
    expect(result.success).toBe(true);
  });

  it('accepts contact with all fields', () => {
    const result = validateBody(createContactSchema, {
      First_Name: 'John',
      Last_Name: 'Doe',
      Email: 'john@example.com',
      Phone: '1234567890',
      Title: 'Manager',
      Account_Name: { id: '12345' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty first name', () => {
    const result = validateBody(createContactSchema, {
      First_Name: '',
      Last_Name: 'Doe',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing last name', () => {
    const result = validateBody(createContactSchema, {
      First_Name: 'John',
    });
    expect(result.success).toBe(false);
  });
});

describe('createAccountSchema', () => {
  it('accepts valid account', () => {
    const result = validateBody(createAccountSchema, {
      Account_Name: 'Test Company',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty account name', () => {
    const result = validateBody(createAccountSchema, {
      Account_Name: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('updateInvoiceSchema', () => {
  it('accepts partial update with dates', () => {
    const result = validateBody(updateInvoiceSchema, {
      Invoice_Date: '2026-03-19',
      Due_Date: '2026-04-18',
    });
    expect(result.success).toBe(true);
  });

  it('accepts currency update', () => {
    const result = validateBody(updateInvoiceSchema, {
      Currency: 'USD',
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty object (no fields to update)', () => {
    const result = validateBody(updateInvoiceSchema, {});
    expect(result.success).toBe(true);
  });

  it('accepts Reseller_Direct_Purchase boolean', () => {
    const result = validateBody(updateInvoiceSchema, {
      Reseller_Direct_Purchase: true,
    });
    expect(result.success).toBe(true);
  });
});

describe('updateUserSchema', () => {
  it('accepts partial name update', () => {
    const result = validateBody(updateUserSchema, { name: 'New Name' });
    expect(result.success).toBe(true);
  });

  it('accepts is_active toggle', () => {
    const result = validateBody(updateUserSchema, { is_active: false });
    expect(result.success).toBe(true);
  });

  it('accepts empty object', () => {
    const result = validateBody(updateUserSchema, {});
    expect(result.success).toBe(true);
  });
});
