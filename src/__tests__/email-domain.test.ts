/**
 * Tests for email-domain matching.
 *
 * This decides whether a new person becomes a lead, a contact on an existing
 * account, or nothing at all. Two failure modes matter: matching too loosely
 * blocks a legitimate lead by tying it to a stranger's account, and matching
 * too tightly lets a duplicate account through.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/zoho', () => ({ searchAllPages: vi.fn(), executeZohoTool: vi.fn() }));
vi.mock('@/lib/db', () => ({ query: vi.fn(), initDB: vi.fn() }));

const { emailDomain, isMatchableDomain, accountOwnerForDomain } =
  await import('@/lib/email-domain');
const { searchAllPages } = await import('@/lib/zoho');

type AuthUser = Parameters<typeof accountOwnerForDomain>[0];

/** A user shaped like the real one, with only the fields these functions read. */
function userWith(role: string, allowedResellerIds: string[]): AuthUser {
  return { role, allowedResellerIds } as unknown as AuthUser;
}

const reseller = userWith('standard', ['res-1']);
const admin = userWith('admin', []);

describe('emailDomain', () => {
  it('keeps the @, because that is how Zoho stores Email_Domain', () => {
    expect(emailDomain('jane@northbridge.example')).toBe('@northbridge.example');
  });

  it('lower-cases and trims', () => {
    expect(emailDomain('  Jane@Northbridge.Example ')).toBe('@northbridge.example');
  });

  it('takes the last @, so a quoted local part cannot shift the domain', () => {
    expect(emailDomain('odd@name@northbridge.example')).toBe('@northbridge.example');
  });

  it('refuses a domain with no dot, which is a typo rather than a company', () => {
    expect(emailDomain('jane@localhost')).toBeNull();
  });

  it('refuses input that is not an address', () => {
    expect(emailDomain('')).toBeNull();
    expect(emailDomain('jane')).toBeNull();
    expect(emailDomain('@northbridge.example')).toBeNull();
    expect(emailDomain('jane@north bridge.example')).toBeNull();
  });
});

describe('isMatchableDomain', () => {
  it('accepts a company domain', () => {
    expect(isMatchableDomain('@northbridge.example')).toBe(true);
  });

  it('rejects free mail, which says nothing about which company somebody is at', () => {
    expect(isMatchableDomain('@gmail.com')).toBe(false);
    expect(isMatchableDomain('@bigpond.com')).toBe(false);
    expect(isMatchableDomain('@outlook.com.au')).toBe(false);
  });

  it('rejects nothing at all', () => {
    expect(isMatchableDomain(null)).toBe(false);
  });
});

describe('accountOwnerForDomain', () => {
  const mine = {
    id: 'acc-1',
    Account_Name: 'Northbridge Survey',
    Reseller: { id: 'res-1' },
    Account_Type: 'Customer',
  };
  const theirs = {
    id: 'acc-9',
    Account_Name: 'Someone Else Pty Ltd',
    Reseller: { id: 'res-9' },
    Account_Type: 'Customer',
  };

  /** Point the mocked search at one set of results. */
  function searchReturns(records: Record<string, unknown>[]) {
    vi.mocked(searchAllPages).mockResolvedValueOnce(records);
  }

  it('reports none when nobody holds the domain', async () => {
    searchReturns([]);
    expect(await accountOwnerForDomain(reseller, '@nobody.example')).toEqual({ match: 'none' });
  });

  it('reports the account when the caller holds it', async () => {
    searchReturns([mine]);
    expect(await accountOwnerForDomain(reseller, '@northbridge.example')).toEqual({
      match: 'mine',
      account: { id: 'acc-1', name: 'Northbridge Survey', isProspect: false },
    });
  });

  it('flags a prospect as such, since it is a different offer', async () => {
    searchReturns([{ ...mine, Account_Type: 'Prospect' }]);
    const owner = await accountOwnerForDomain(reseller, '@northbridge.example');
    expect(owner).toMatchObject({ match: 'mine', account: { isProspect: true } });
  });

  it('reports other, and names nothing, when somebody else holds it', async () => {
    searchReturns([theirs]);
    const owner = await accountOwnerForDomain(reseller, '@someone.example');
    expect(owner).toEqual({ match: 'other' });
    // The whole reply, so there is nowhere for a name or an id to hide.
    expect(JSON.stringify(owner)).not.toContain('Someone Else');
    expect(JSON.stringify(owner)).not.toContain('acc-9');
  });

  it('prefers the caller’s own account when a domain is shared', async () => {
    searchReturns([theirs, mine]);
    expect(await accountOwnerForDomain(reseller, '@shared.example')).toMatchObject({
      match: 'mine',
      account: { id: 'acc-1' },
    });
  });

  it('never says other to a CSA role', async () => {
    searchReturns([theirs]);
    expect(await accountOwnerForDomain(admin, '@someone.example')).toMatchObject({
      match: 'mine',
      account: { id: 'acc-9' },
    });
  });

  it('ignores trashed accounts, which are deleted as far as anyone is concerned', async () => {
    searchReturns([{ ...mine, Record_Status__s: 'Trash' }]);
    expect(await accountOwnerForDomain(reseller, '@northbridge.example')).toEqual({ match: 'none' });
  });

  it('lets a search failure through rather than answering none', async () => {
    vi.mocked(searchAllPages).mockRejectedValueOnce(new Error('zoho down'));
    await expect(accountOwnerForDomain(reseller, '@northbridge.example')).rejects.toThrow('zoho down');
  });
});
