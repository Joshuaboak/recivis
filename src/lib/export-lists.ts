import * as XLSX from 'xlsx';

type R = Record<string, unknown>;

const formatDate = (d: unknown) => {
  if (!d || typeof d !== 'string') return '';
  const date = new Date(d);
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
};

/**
 * Export accounts list to XLSX with contacts and assets sheets.
 * Fetches related data for each account via API.
 * onProgress called with (current, total) for UI feedback.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function exportAccountsList(
  accounts: any[],
  filters?: { search?: string; region?: string; reseller?: string },
  onProgress?: (current: number, total: number) => void
) {
  const wb = XLSX.utils.book_new();

  // --- Accounts sheet ---
  const headers = ['Account Name', 'Email Domain', 'Country', 'Reseller', 'Owner'];
  const rows = accounts.map(a => {
    const reseller = a.Reseller as { name?: string } | null;
    const owner = a.Owner as { name?: string } | null;
    return [
      a.Account_Name as string || '',
      a.Email_Domain as string || '',
      a.Billing_Country as string || '',
      reseller?.name || '',
      owner?.name || '',
    ];
  });

  const filterLines: string[][] = [];
  if (filters?.search) filterLines.push(['Search', filters.search]);
  if (filters?.region) filterLines.push(['Region', filters.region]);
  if (filters?.reseller) filterLines.push(['Reseller', filters.reseller]);

  const accountsData = [
    ...filterLines,
    ...(filterLines.length > 0 ? [[]] : []),
    headers,
    ...rows,
    [],
    ['Total Accounts', accounts.length],
  ];

  const ws = XLSX.utils.aoa_to_sheet(accountsData);
  const headerRowIdx = filterLines.length + (filterLines.length > 0 ? 1 : 0);
  ws['!cols'] = [{ wch: 35 }, { wch: 25 }, { wch: 15 }, { wch: 30 }, { wch: 20 }];
  ws['!freeze'] = { xSplit: 0, ySplit: headerRowIdx + 1, topLeftCell: `A${headerRowIdx + 2}` };
  XLSX.utils.book_append_sheet(wb, ws, 'Accounts');

  // --- Fetch contacts and assets for all accounts ---
  const allContacts: (string | number)[][] = [];
  const allAssets: (string | number)[][] = [];

  /**
   * Process accounts in parallel batches of BATCH_SIZE.
   * This dramatically speeds up exports for large account lists by making
   * concurrent API calls, while capping concurrency to avoid overwhelming
   * the API or browser network limits.
   */
  const BATCH_SIZE = 5;
  for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
    const batch = accounts.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(async (acc) => {
      const accName = acc.Account_Name as string || '';
      const accId = acc.id as string;
      const batchContacts: (string | number)[][] = [];
      const batchAssets: (string | number)[][] = [];

      try {
        const res = await fetch(`/api/accounts/${accId}`);
        const data = await res.json();

        // Contacts
        const contacts = (data.contacts || []) as R[];
        for (const c of contacts) {
          if ((c.Record_Status__s as string) === 'Trash') continue;
          batchContacts.push([
            accName,
            c.Full_Name as string || '',
            c.Email as string || '',
            c.Phone as string || '',
            c.Title as string || '',
          ]);
        }

        // Assets (active only, excluding NFR/Educational/Home Use)
        const active = (data.activeAssets || []) as R[];
        for (const a of active) {
          const product = a.Product as { name?: string } | null;
          const productName = product?.name || a.Name as string || '';
          const nameLower = productName.toLowerCase();
          if (nameLower.includes('nfr') || nameLower.includes('educational') || nameLower.includes('home use')) continue;
          batchAssets.push([
            accName,
            productName,
            a.Quantity as number || 0,
            formatDate(a.Start_Date),
            formatDate(a.Renewal_Date),
            a.Serial_Key as string || '',
            a.Status as string || '',
          ]);
        }
      } catch { /* skip failed accounts */ }

      return { contacts: batchContacts, assets: batchAssets };
    }));

    // Merge batch results into the main arrays
    for (const result of results) {
      allContacts.push(...result.contacts);
      allAssets.push(...result.assets);
    }

    onProgress?.(Math.min(i + BATCH_SIZE, accounts.length), accounts.length);
  }

  // --- Contacts sheet ---
  const contactHeaders = ['Account', 'Name', 'Email', 'Phone', 'Title'];
  const contactsSheet = [contactHeaders, ...allContacts, [], ['Total Contacts', allContacts.length]];
  const wsContacts = XLSX.utils.aoa_to_sheet(contactsSheet);
  wsContacts['!cols'] = [{ wch: 35 }, { wch: 25 }, { wch: 30 }, { wch: 18 }, { wch: 25 }];
  XLSX.utils.book_append_sheet(wb, wsContacts, 'Contacts');

  // --- Assets sheet ---
  const assetHeaders = ['Account', 'Product', 'Qty', 'Start Date', 'Renewal Date', 'Serial Key', 'Status'];
  const totalQty = allAssets.reduce((sum, r) => sum + ((r[2] as number) || 0), 0);
  const assetsSheet = [assetHeaders, ...allAssets, [], ['Total Assets', allAssets.length], ['Total Quantity', totalQty]];
  const wsAssets = XLSX.utils.aoa_to_sheet(assetsSheet);
  wsAssets['!cols'] = [{ wch: 35 }, { wch: 50 }, { wch: 6 }, { wch: 12 }, { wch: 14 }, { wch: 35 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, wsAssets, 'Assets');

  const timestamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Accounts Export - ${timestamp}.xlsx`);
}

/**
 * Export invoices list to XLSX
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function exportInvoicesList(
  invoices: any[],
  filters?: { status?: string; type?: string; region?: string; reseller?: string; search?: string }
) {
  const wb = XLSX.utils.book_new();

  const headers = ['Invoice #', 'Subject', 'Account', 'Date', 'Type', 'Status', 'Currency', 'Total', 'Reseller'];
  const rows = invoices.map(inv => {
    const account = inv.Account_Name as { name?: string } | null;
    const reseller = inv.Reseller as { name?: string } | null;
    return [
      inv.Reference_Number as string || '',
      inv.Subject as string || '',
      account?.name || '',
      formatDate(inv.Invoice_Date),
      inv.Invoice_Type as string || '',
      inv.Status as string || '',
      inv.Currency as string || '',
      inv.Grand_Total as number || 0,
      reseller?.name || '',
    ];
  });

  // Totals by currency
  const totalsByCurrency: Record<string, number> = {};
  for (const inv of invoices) {
    const curr = inv.Currency as string || 'AUD';
    totalsByCurrency[curr] = (totalsByCurrency[curr] || 0) + ((inv.Grand_Total as number) || 0);
  }
  const totalsRows = Object.entries(totalsByCurrency).map(([curr, total]) => [
    '', '', '', '', '', 'Total', curr, total, '',
  ]);

  // Count by type
  const countByType: Record<string, number> = {};
  for (const inv of invoices) {
    const type = inv.Invoice_Type as string || 'Other';
    countByType[type] = (countByType[type] || 0) + 1;
  }

  // Filter summary
  const filterLines: string[][] = [];
  if (filters?.status) filterLines.push(['Status', filters.status]);
  if (filters?.type) filterLines.push(['Type', filters.type]);
  if (filters?.region) filterLines.push(['Region', filters.region]);
  if (filters?.reseller) filterLines.push(['Reseller', filters.reseller]);
  if (filters?.search) filterLines.push(['Search', filters.search]);

  const data = [
    ...filterLines,
    ...(filterLines.length > 0 ? [[]] : []),
    headers,
    ...rows,
    [],
    ...totalsRows,
    [],
    ['Total Invoices', invoices.length],
    ...Object.entries(countByType).map(([type, count]) => [`  ${type}`, count]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  const headerRowIdx = filterLines.length + (filterLines.length > 0 ? 1 : 0);
  ws['!cols'] = [{ wch: 12 }, { wch: 45 }, { wch: 30 }, { wch: 12 }, { wch: 15 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 25 }];
  ws['!freeze'] = { xSplit: 0, ySplit: headerRowIdx + 1, topLeftCell: `A${headerRowIdx + 2}` };

  // Format total column as numbers
  for (let r = headerRowIdx + 1; r <= headerRowIdx + rows.length; r++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c: 7 })];
    if (cell) cell.t = 'n';
  }
  const totalsStart = headerRowIdx + rows.length + 2;
  for (let r = totalsStart; r < totalsStart + totalsRows.length; r++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c: 7 })];
    if (cell) cell.t = 'n';
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Invoices');

  const timestamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Invoices Export - ${filters?.status || 'All'} - ${timestamp}.xlsx`);
}
