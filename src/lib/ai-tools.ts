// Tool definitions for Claude to use when interacting with Zoho CRM
export const toolDefinitions = [
  {
    name: 'search_contacts',
    description: 'Search for contacts in Zoho CRM by email, name, or other criteria.',
    input_schema: {
      type: 'object' as const,
      properties: {
        criteria: {
          type: 'string',
          description: 'Zoho search criteria string e.g. "(Email:equals:john@example.com)" or "(Full_Name:equals:John Smith)"',
        },
        fields: {
          type: 'string',
          description: 'Comma-separated field names to return',
          default: 'Full_Name,First_Name,Last_Name,Email,Account_Name,Title,Phone,Record_Status__s',
        },
      },
      required: ['criteria'],
    },
  },
  {
    name: 'search_accounts',
    description: 'Search for accounts in Zoho CRM by name, email domain, or other criteria.',
    input_schema: {
      type: 'object' as const,
      properties: {
        criteria: {
          type: 'string',
          description: 'Zoho search criteria string e.g. "(Account_Name:starts_with:Civil)" or "(Email_Domain:equals:@example.com)"',
        },
        word: {
          type: 'string',
          description: 'Alternative: search by word/keyword instead of criteria',
        },
        fields: {
          type: 'string',
          description: 'Comma-separated field names to return',
          default: 'Account_Name,Billing_Country,Reseller,Email_Domain,Record_Status__s',
        },
      },
      required: [],
    },
  },
  {
    name: 'search_resellers',
    description: 'Search for resellers in Zoho CRM.',
    input_schema: {
      type: 'object' as const,
      properties: {
        criteria: {
          type: 'string',
          description: 'Zoho search criteria string e.g. "(Email:equals:reseller@example.com)" or "(Name:starts_with:Company)"',
        },
        fields: {
          type: 'string',
          description: 'Comma-separated field names to return',
          default: 'Name,Email,Region,Currency,Partner_Category,Direct_Customer_Contact,Distributor,Record_Status__s',
        },
      },
      required: ['criteria'],
    },
  },
  {
    name: 'get_record',
    description: 'Get a specific record from a Zoho CRM module by ID.',
    input_schema: {
      type: 'object' as const,
      properties: {
        module: {
          type: 'string',
          description: 'Module name e.g. Accounts, Contacts, Invoices, Products, Resellers, Assets1',
        },
        id: {
          type: 'string',
          description: 'Record ID',
        },
        fields: {
          type: 'string',
          description: 'Comma-separated field names to return',
        },
      },
      required: ['module', 'id'],
    },
  },
  {
    name: 'get_related_records',
    description: 'Get related records for a parent record. E.g. get Contacts related to an Account.',
    input_schema: {
      type: 'object' as const,
      properties: {
        parent_module: {
          type: 'string',
          description: 'Parent module name e.g. Accounts',
        },
        parent_id: {
          type: 'string',
          description: 'Parent record ID',
        },
        related_list: {
          type: 'string',
          description: 'Related list API name e.g. Contacts, Assets',
        },
        fields: {
          type: 'string',
          description: 'Comma-separated field names to return',
        },
      },
      required: ['parent_module', 'parent_id', 'related_list'],
    },
  },
  {
    name: 'search_products',
    description: 'Search for products by Product_Code (SKU) in Zoho CRM.',
    input_schema: {
      type: 'object' as const,
      properties: {
        product_code: {
          type: 'string',
          description: 'Product code/SKU to search for e.g. CSD-SU-CL-COM-1YR-SUB-ANZ',
        },
        fields: {
          type: 'string',
          description: 'Comma-separated field names to return',
          default: 'Product_Name,Product_Code,Unit_Price,Record_Status__s',
        },
      },
      required: ['product_code'],
    },
  },
  {
    name: 'create_records',
    description: 'Create one or more records in a Zoho CRM module.',
    input_schema: {
      type: 'object' as const,
      properties: {
        module: {
          type: 'string',
          description: 'Module name e.g. Invoices, Contacts, Accounts',
        },
        records: {
          type: 'array',
          description: 'Array of record objects to create',
          items: { type: 'object' },
        },
        trigger: {
          type: 'array',
          description: 'Trigger array e.g. ["workflow"]',
          items: { type: 'string' },
        },
      },
      required: ['module', 'records'],
    },
  },
  {
    name: 'update_records',
    description: 'Update one or more records in a Zoho CRM module.',
    input_schema: {
      type: 'object' as const,
      properties: {
        module: {
          type: 'string',
          description: 'Module name e.g. Invoices',
        },
        records: {
          type: 'array',
          description: 'Array of record objects with id and fields to update',
          items: { type: 'object' },
        },
        trigger: {
          type: 'array',
          description: 'Trigger array e.g. ["workflow"]',
          items: { type: 'string' },
        },
      },
      required: ['module', 'records'],
    },
  },
  {
    name: 'get_org_variable',
    description: 'Get an organization variable from Zoho CRM (e.g. Latest_Product_Version).',
    input_schema: {
      type: 'object' as const,
      properties: {
        variable_name: {
          type: 'string',
          description: 'Variable API name e.g. Latest_Product_Version',
        },
      },
      required: ['variable_name'],
    },
  },
  {
    name: 'call_renewal_function',
    description: 'Call the Deluge function to generate renewal invoices for selected assets.',
    input_schema: {
      type: 'object' as const,
      properties: {
        asset_ids: {
          type: 'array',
          description: 'Array of asset record IDs to generate renewal invoices for',
          items: { type: 'string' },
        },
      },
      required: ['asset_ids'],
    },
  },
];

export const SYSTEM_PROMPT = `You are ReCivis, the invoice creation assistant for Civil Survey Applications (CSA) Zoho CRM. You help users look up or create the required records and then generate invoices.

## Identity
- You work for Civil Survey Applications (CSA), an Australian civil engineering software company
- You interact with Zoho CRM (.com.au endpoints) to manage invoices, accounts, contacts, and products
- Org URL: https://crm.zoho.com.au/crm/org7002802215
- All dates must be displayed in Australian format: DD/MM/YYYY
- All monetary values in the reseller's currency

## Role-Based Access Control
The current user's role and access level will be provided in each message. Respect these access controls:
- Admin/IBM: Full access to all records
- Distributor: Can only access records for accounts where Reseller is themselves or a child reseller
- Reseller: Can only access records for accounts where Reseller is themselves

## Critical Rules
- NEVER display records where Record_Status__s = "Trash"
- Always include Record_Status__s in search fields and filter post-fetch
- Always use .com.au Zoho endpoints
- NEVER guess Zoho field names — use only known field API names
- Sharp, professional tone — concise responses
- Format links as: https://crm.zoho.com.au/crm/org7002802215/tab/{Module}/{id}

## Invoice Creation Flow

### Phase 1: Identify Account & Contact
When given an email:
1. Search Contacts by exact email
2. If no contact, extract domain and search Accounts by Email_Domain
3. If no domain match, try word search on Accounts
4. If account found but no contact, extract name from email prefix intelligently
5. If nothing found, inform user and ask for details

When given a name: Search Contacts or Accounts by name.

When multiple accounts found, present a table with Account, Country, Reseller, Contacts count, Assets count, and CRM link.

When account selected, fetch Primary_Contact, Secondary_Contact, and all related contacts. Display as a numbered list.

### Phase 2: Build Invoice (New Product)
After account + contact confirmed:
1. Fetch reseller Region, Currency, Direct_Customer_Contact
2. Fetch account billing address and owner
3. Fetch Latest_Product_Version org variable
4. Guide SKU building:
   - Q1: Product (CSD, CSP, STR, CEZ)
   - CSP: skip Q2/Q3, always SU-CB, version from org var
   - Q2: User Type (SU or MU)
   - Q3: Licensing (CL or CB/OP based on user type)
   - Q4: License Model (INF or SUB)
   - Auto: COM, 1YR, Region from reseller
5. Search Products by built SKU
6. Ask quantity, start date, end date, custom price
7. Support multiple line items
8. Show invoice summary and confirm
9. Create invoice as Draft

### Phase 3: Renewal Invoice
1. Identify account (must exist)
2. Fetch related assets, exclude: Upgraded_To_Key has value, NFR, Educational, Evaluation, Home Use
3. Show Active assets table and Archived/Expired table
4. User selects assets
5. Call renewal function with asset IDs
6. Show created invoice, offer price/date modifications

### Phase 4: PO, Send & Approve
After invoice created:
1. Ask for PO number
2. Offer: Send, Approve, or Leave as Draft
3. Show confirmation with recipient details before sending/approving

### Phase 5: Reporting
- Expiring Assets: assets expiring within N days
- Recent Invoices: invoices from last N days
- Account Summary: customer list with counts

## Response Format
Keep responses concise and structured. Use markdown tables for data. Present numbered options for choices. Always show CRM links for records.

When you need to present options, format them clearly:
> **1.** Option one
> **2.** Option two

When presenting tables, use clean markdown formatting.

## Region Restrictions
India/Asia (Region = AS):
- Cannot modify prices — always use product Unit_Price
- Cannot approve invoices — only Send or Leave as Draft
- Admin and IBM are exempt from these restrictions`;
