/**
 * export-account.ts — XLSX export for individual account data.
 *
 * Generates multi-sheet Excel workbooks from account detail views:
 * - exportFullAccount(): Summary + Contacts + Invoices + Active/Archived Assets
 * - exportContacts(): Contacts sheet only
 * - exportInvoices(): Invoices sheet only (with currency-grouped totals)
 * - exportAssets(): Active + Archived assets sheets
 *
 * Runs client-side (browser) using the SheetJS (xlsx) library.
 * Each sheet includes frozen headers and column widths tuned for the data.
 */

import * as XLSX from 'xlsx';

type R = Record<string, unknown>;

/** Format an ISO date string as DD/MM/YYYY for Australian convention. */
const formatDate = (d: unknown) => {
  if (!d || typeof d !== 'string') return '';
  const date = new Date(d);
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
};

/** Map currency code to symbol (defaults to $ for AUD/USD/NZD). */
const getCurrencySymbol = (c: string) => {
  if (c === 'EUR') return '\u20AC';
  if (c === 'GBP') return '\u00A3';
  if (c === 'INR') return '\u20B9';
  return '$';
};

/** Apply column widths and freeze the header row for readability. */
function styleSheet(ws: XLSX.WorkSheet, headerRow: number, colCount: number) {
  // Set column widths
  ws['!cols'] = Array.from({ length: colCount }, () => ({ wch: 20 }));
  // Freeze header row
  ws['!freeze'] = { xSplit: 0, ySplit: headerRow, topLeftCell: `A${headerRow + 1}` };
}

/**
 * Export everything: account summary + contacts + invoices + assets in separate sheets
 */
export function exportFullAccount(
  account: R,
  contacts: R[],
  invoices: R[],
  activeAssets: R[],
  archivedAssets: R[],
  primaryContactId?: string,
  secondaryContactId?: string
) {
  const wb = XLSX.utils.book_new();
  const accountName = account.Account_Name as string || 'Account';

  // --- Account Summary Sheet ---
  const reseller = account.Reseller as { name?: string } | null;
  const owner = account.Owner as { name?: string } | null;
  const primary = account.Primary_Contact as { name?: string } | null;
  const secondary = account.Secondary_Contact as { name?: string } | null;

  const summaryData = [
    ['Account Summary'],
    [],
    ['Account Name', accountName],
    ['Email Domain', account.Email_Domain || ''],
    ['Country', account.Billing_Country || ''],
    ['Reseller', reseller?.name || ''],
    ['CSA Sales Rep', owner?.name || ''],
    ['Primary Contact', primary?.name || ''],
    ['Secondary Contact', secondary?.name || ''],
    ['Street', account.Billing_Street || ''],
    ['City', account.Billing_City || ''],
    ['State', account.Billing_State || ''],
    ['Post Code', account.Billing_Code || ''],
    [],
    ['Totals'],
    ['Contacts', contacts.length],
    ['Invoices', invoices.length],
    ['Active Assets', activeAssets.length],
    ['Archived Assets', archivedAssets.length],
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  wsSummary['!cols'] = [{ wch: 20 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  // --- Contacts Sheet ---
  addContactsSheet(wb, contacts, primaryContactId, secondaryContactId);

  // --- Invoices Sheet ---
  addInvoicesSheet(wb, invoices);

  // --- Active Assets Sheet ---
  addAssetsSheet(wb, activeAssets, 'Active Assets');

  // --- Archived Assets Sheet ---
  if (archivedAssets.length > 0) {
    addAssetsSheet(wb, archivedAssets, 'Archived Assets');
  }

  XLSX.writeFile(wb, `${accountName} - Full Export.xlsx`);
}

/**
 * Export contacts only
 */
export function exportContacts(contacts: R[], accountName: string, primaryContactId?: string, secondaryContactId?: string) {
  const wb = XLSX.utils.book_new();
  addContactsSheet(wb, contacts, primaryContactId, secondaryContactId);
  XLSX.writeFile(wb, `${accountName} - Contacts.xlsx`);
}

/**
 * Export invoices only
 */
export function exportInvoices(invoices: R[], accountName: string) {
  const wb = XLSX.utils.book_new();
  addInvoicesSheet(wb, invoices);
  XLSX.writeFile(wb, `${accountName} - Invoices.xlsx`);
}

/**
 * Export assets only
 */
export function exportAssets(activeAssets: R[], archivedAssets: R[], accountName: string) {
  const wb = XLSX.utils.book_new();
  addAssetsSheet(wb, activeAssets, 'Active Assets');
  if (archivedAssets.length > 0) {
    addAssetsSheet(wb, archivedAssets, 'Archived Assets');
  }
  XLSX.writeFile(wb, `${accountName} - Assets.xlsx`);
}

// --- Sheet builders ---

function addContactsSheet(wb: XLSX.WorkBook, contacts: R[], primaryId?: string, secondaryId?: string) {
  const headers = ['Name', 'Email', 'Phone', 'Title', 'Role'];
  const rows = contacts.map(c => {
    const id = c.id as string;
    let role = '';
    if (primaryId && id === primaryId) role = 'Primary';
    else if (secondaryId && id === secondaryId) role = 'Secondary';
    return [
      c.Full_Name as string || '',
      c.Email as string || '',
      c.Phone as string || '',
      c.Title as string || '',
      role,
    ];
  });

  const data = [headers, ...rows, [], ['Total Contacts', contacts.length]];
  const ws = XLSX.utils.aoa_to_sheet(data);
  styleSheet(ws, 1, headers.length);
  ws['!cols'] = [{ wch: 25 }, { wch: 30 }, { wch: 18 }, { wch: 25 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Contacts');
}

function addInvoicesSheet(wb: XLSX.WorkBook, invoices: R[]) {
  const headers = ['Invoice #', 'Subject', 'Date', 'Type', 'Status', 'Currency', 'Total'];
  const rows = invoices.map(inv => [
    inv.Reference_Number as string || '',
    inv.Subject as string || '',
    formatDate(inv.Invoice_Date),
    inv.Invoice_Type as string || '',
    inv.Status as string || '',
    inv.Currency as string || '',
    inv.Grand_Total as number || 0,
  ]);

  // Group totals by currency
  const totalsByCurrency: Record<string, number> = {};
  for (const inv of invoices) {
    const curr = inv.Currency as string || 'AUD';
    totalsByCurrency[curr] = (totalsByCurrency[curr] || 0) + ((inv.Grand_Total as number) || 0);
  }

  const totalsRows = Object.entries(totalsByCurrency).map(([curr, total]) => [
    '', '', '', '', 'Total', curr, total,
  ]);

  const data = [headers, ...rows, [], ...totalsRows, ['Total Invoices', invoices.length]];
  const ws = XLSX.utils.aoa_to_sheet(data);
  styleSheet(ws, 1, headers.length);
  ws['!cols'] = [{ wch: 12 }, { wch: 45 }, { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 10 }, { wch: 14 }];

  // Format the Total column as numbers
  for (let r = 1; r <= rows.length; r++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c: 6 })];
    if (cell) cell.t = 'n';
  }
  for (let r = rows.length + 2; r < rows.length + 2 + totalsRows.length; r++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c: 6 })];
    if (cell) cell.t = 'n';
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Invoices');
}

function addAssetsSheet(wb: XLSX.WorkBook, assets: R[], sheetName: string) {
  const headers = ['Product', 'Qty', 'Start Date', 'Renewal Date', 'Serial Key', 'Status'];
  const rows = assets.map(a => {
    const product = a.Product as { name?: string } | null;
    return [
      product?.name || a.Name as string || '',
      a.Quantity as number || 0,
      formatDate(a.Start_Date),
      formatDate(a.Renewal_Date),
      a.Serial_Key as string || '',
      a.Status as string || '',
    ];
  });

  const totalQty = assets.reduce((sum, a) => sum + ((a.Quantity as number) || 0), 0);

  const data = [headers, ...rows, [], ['Total Assets', assets.length, '', '', '', ''], ['Total Quantity', totalQty]];
  const ws = XLSX.utils.aoa_to_sheet(data);
  styleSheet(ws, 1, headers.length);
  ws['!cols'] = [{ wch: 50 }, { wch: 6 }, { wch: 12 }, { wch: 14 }, { wch: 35 }, { wch: 10 }];

  XLSX.utils.book_append_sheet(wb, ws, sheetName);
}
