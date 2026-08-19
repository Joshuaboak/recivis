/**
 * demo/fixtures.ts — the world a practice session sees.
 *
 * Written in raw Zoho record shapes rather than the portal's view models, so
 * demo data runs through exactly the same mappers, filters and formatters as
 * real data. A fixture that needed its own rendering path would stop being a
 * rehearsal of the real thing, which is the only reason it exists.
 *
 * Everything is deterministic. Every partner sees the same account with the
 * same name and the same order number, which is what lets a tutorial say
 * "click Northbridge Civil" and be right every time.
 *
 * Ids are prefixed `demo-`. Zoho ids are 19-digit numerics, so a demo id can
 * never collide with a real record, and one appearing in a log or an error is
 * immediately recognisable as fixture data rather than a leak.
 */

/** Dates are relative to now, so the demo world never looks stale. */
function daysFromNow(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const DEMO_RESELLER = {
  id: 'demo-reseller-1',
  name: 'Demo Partner',
};

/** Two accounts: one busy, one new, so lists have something to sort. */
export const DEMO_ACCOUNTS: Record<string, unknown>[] = [
  {
    id: 'demo-account-1',
    Account_Name: 'Northbridge Civil',
    Email_Domain: 'northbridgecivil.example',
    Account_Type: 'Customer',
    Billing_Street: '14 Wharf Road',
    Billing_City: 'Newcastle',
    Billing_State: 'NSW',
    Billing_Code: '2300',
    Billing_Country: 'Australia',
    Reseller: DEMO_RESELLER,
    Primary_Contact: { id: 'demo-contact-1', name: 'Alex Nguyen' },
    Owner: { id: 'demo-owner-1', name: 'CSA Sales' },
    Record_Status__s: 'Available',
  },
  {
    id: 'demo-account-2',
    Account_Name: 'Harbour Survey Group',
    Email_Domain: 'harboursurvey.example',
    Account_Type: 'Customer',
    Billing_Street: '2 Kembla Street',
    Billing_City: 'Wollongong',
    Billing_State: 'NSW',
    Billing_Code: '2500',
    Billing_Country: 'Australia',
    Reseller: DEMO_RESELLER,
    Primary_Contact: { id: 'demo-contact-2', name: 'Priya Shah' },
    Owner: { id: 'demo-owner-1', name: 'CSA Sales' },
    Record_Status__s: 'Available',
  },
];

export const DEMO_CONTACTS: Record<string, unknown>[] = [
  {
    id: 'demo-contact-1',
    First_Name: 'Alex',
    Last_Name: 'Nguyen',
    Full_Name: 'Alex Nguyen',
    Email: 'alex.nguyen@northbridgecivil.example',
    Phone: '+61 2 5550 0101',
    Title: 'Survey Manager',
    Account_Name: { id: 'demo-account-1', name: 'Northbridge Civil' },
    Record_Status__s: 'Available',
  },
  {
    id: 'demo-contact-2',
    First_Name: 'Priya',
    Last_Name: 'Shah',
    Full_Name: 'Priya Shah',
    Email: 'priya.shah@harboursurvey.example',
    Phone: '+61 2 5550 0202',
    Title: 'Principal Surveyor',
    Account_Name: { id: 'demo-account-2', name: 'Harbour Survey Group' },
    Record_Status__s: 'Available',
  },
];

/**
 * Assets chosen to populate every Assets view at once: one healthy, one inside
 * the 60-day renewal window, one recently lapsed, one monthly subscription.
 * A tutorial step that says "these are your upcoming renewals" needs one to
 * point at.
 */
export const DEMO_ASSETS: Record<string, unknown>[] = [
  {
    id: 'demo-asset-1',
    Name: 'Civil Site Design Single User Cloud Commercial Subscription',
    Account: { id: 'demo-account-1', name: 'Northbridge Civil' },
    Product: { id: 'demo-product-csd', name: 'Civil Site Design Single User Cloud Commercial Subscription' },
    Product_Code: 'CSD-SU-CL-COM-1YR-SUB-ANZ',
    Status: 'Active',
    Quantity: 3,
    Serial_Key: 'DEMO1-CSD00-AAAAA-BBBBB-CCCCC',
    Start_Date: daysFromNow(-300),
    Renewal_Date: daysFromNow(65),
    Reseller: DEMO_RESELLER,
    Evaluation_License: false,
    Tag: [],
    Record_Status__s: 'Available',
  },
  {
    id: 'demo-asset-2',
    Name: 'Stringer Single User Cloud Commercial Subscription',
    Account: { id: 'demo-account-1', name: 'Northbridge Civil' },
    Product: { id: 'demo-product-str', name: 'Stringer Single User Cloud Commercial Subscription' },
    Product_Code: 'STR-SU-CL-COM-1YR-SUB-ANZ',
    Status: 'Active',
    Quantity: 1,
    Serial_Key: 'DEMO2-STR00-AAAAA-BBBBB-CCCCC',
    Start_Date: daysFromNow(-340),
    // Inside the 60-day window, so it shows under Due for Renewal.
    Renewal_Date: daysFromNow(21),
    Reseller: DEMO_RESELLER,
    Evaluation_License: false,
    Tag: [],
    Record_Status__s: 'Available',
  },
  {
    id: 'demo-asset-3',
    Name: 'Corridor EZ For Civil3D Single User Computer Bound Commercial Subscription',
    Account: { id: 'demo-account-2', name: 'Harbour Survey Group' },
    Product: { id: 'demo-product-cez', name: 'Corridor EZ For Civil3D Single User Computer Bound Commercial Subscription' },
    Product_Code: 'CEZ-SU-CB-COM-1YR-SUB-ANZ',
    Status: 'Active',
    Quantity: 2,
    Serial_Key: 'DEMO3-CEZ00-AAAAA-BBBBB-CCCCC',
    Start_Date: daysFromNow(-380),
    // Lapsed inside the last 60 days, so it shows under Recently Expired.
    Renewal_Date: daysFromNow(-12),
    Reseller: DEMO_RESELLER,
    Evaluation_License: false,
    Tag: [],
    Record_Status__s: 'Available',
  },
  {
    id: 'demo-asset-4',
    Name: 'Civil Site Design Single User Cloud Commercial Subscription',
    Account: { id: 'demo-account-2', name: 'Harbour Survey Group' },
    Product: { id: 'demo-product-csd', name: 'Civil Site Design Single User Cloud Commercial Subscription' },
    Product_Code: 'CSD-SU-CL-COM-1YR-SUB-ANZ',
    Status: 'Active',
    Quantity: 1,
    Serial_Key: 'DEMO4-CSD00-AAAAA-BBBBB-CCCCC',
    Start_Date: daysFromNow(-18),
    Renewal_Date: daysFromNow(12),
    Last_Renewal_Transaction: daysFromNow(-18),
    Reseller: DEMO_RESELLER,
    Evaluation_License: false,
    // Tagged, so the Monthly Subscriptions view and its renew button have a row.
    Tag: [{ name: 'Monthly Subscription' }],
    Record_Status__s: 'Available',
  },
];

/** One sent order to look at, one draft to practise on. */
export const DEMO_INVOICES: Record<string, unknown>[] = [
  {
    id: 'demo-invoice-1',
    Subject: 'Northbridge Civil - Order - 12/07/2026',
    Reference_Number: 'DEMO-1042',
    Account_Name: { id: 'demo-account-1', name: 'Northbridge Civil' },
    Contact_Name: { id: 'demo-contact-1', name: 'Alex Nguyen' },
    Invoice_Date: daysFromNow(-37),
    Due_Date: daysFromNow(-7),
    Status: 'Sent',
    Invoice_Type: 'New Product',
    Reseller: DEMO_RESELLER,
    Reseller_Direct_Purchase: true,
    Currency: 'AUD',
    Grand_Total: 8985,
    Payment_Status: 'Paid',
    Record_Status__s: 'Available',
    Invoiced_Items: [
      {
        id: 'demo-line-1',
        Product_Name: { id: 'demo-product-csd', name: 'Civil Site Design Single User Cloud Commercial Subscription' },
        Quantity: 3,
        List_Price: 2995,
        Start_Date: daysFromNow(-37),
        Renewal_Date: daysFromNow(328),
      },
    ],
  },
  {
    id: 'demo-invoice-2',
    Subject: 'Harbour Survey Group - Order - Draft',
    Reference_Number: 'DEMO-1043',
    Account_Name: { id: 'demo-account-2', name: 'Harbour Survey Group' },
    Contact_Name: { id: 'demo-contact-2', name: 'Priya Shah' },
    Invoice_Date: daysFromNow(0),
    Due_Date: daysFromNow(30),
    Status: 'Draft',
    Invoice_Type: 'New Product',
    Reseller: DEMO_RESELLER,
    Reseller_Direct_Purchase: true,
    Currency: 'AUD',
    Grand_Total: 895,
    Record_Status__s: 'Available',
    Invoiced_Items: [
      {
        id: 'demo-line-2',
        Product_Name: { id: 'demo-product-str', name: 'Stringer Single User Cloud Commercial Subscription' },
        Quantity: 1,
        List_Price: 895,
        Start_Date: daysFromNow(0),
        Renewal_Date: daysFromNow(365),
      },
    ],
  },
];

/** Find a fixture record by id across every collection. */
export function findDemoRecord(id: string): Record<string, unknown> | null {
  const all = [...DEMO_ACCOUNTS, ...DEMO_CONTACTS, ...DEMO_ASSETS, ...DEMO_INVOICES];
  return all.find(record => record.id === id) || null;
}

/** Whether an id belongs to the demo world rather than to Zoho. */
export function isDemoId(id: string): boolean {
  return id.startsWith('demo-');
}

/** The related records the account detail view expects, for one account. */
export function demoAccountDetail(accountId: string) {
  const account = DEMO_ACCOUNTS.find(a => a.id === accountId) || null;
  const belongsHere = (record: Record<string, unknown>, field: string) =>
    (record[field] as { id?: string } | null)?.id === accountId;

  const assets = DEMO_ASSETS.filter(a => belongsHere(a, 'Account'));

  return {
    account,
    contacts: DEMO_CONTACTS.filter(c => belongsHere(c, 'Account_Name')),
    invoices: DEMO_INVOICES.filter(i => belongsHere(i, 'Account_Name')),
    evaluationAssets: assets.filter(a => a.Evaluation_License === true),
    activeAssets: assets.filter(a => a.Status === 'Active' && a.Evaluation_License !== true),
    archivedAssets: assets.filter(a => a.Status !== 'Active'),
  };
}

/**
 * A believable result for an order a demo user just "created".
 *
 * Returned instead of writing, so the tutorial can carry straight on to the
 * order detail step. The id lands in the demo world, so the next read finds
 * it — for the life of the process, at least; fixtures are in-memory and a
 * created order does not survive a restart. That is the right trade for a
 * rehearsal, and the reason nothing here is presented as durable.
 */
let createdOrderCounter = 0;
export function createDemoOrder(input: Record<string, unknown>): Record<string, unknown> {
  createdOrderCounter += 1;
  const id = `demo-invoice-new-${createdOrderCounter}`;
  const order: Record<string, unknown> = {
    ...input,
    id,
    Reference_Number: `DEMO-${1100 + createdOrderCounter}`,
    Status: 'Draft',
    Reseller: DEMO_RESELLER,
    Record_Status__s: 'Available',
  };
  DEMO_INVOICES.push(order);
  return order;
}
