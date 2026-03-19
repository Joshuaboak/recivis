/**
 * types.ts — Shared TypeScript interfaces for ReCivis.
 *
 * Contains all type definitions used across the client and server:
 * - User/permission models (three-tier RBAC)
 * - Chat message types (AI assistant conversation)
 * - Zoho CRM record shapes
 * - Invoice workflow context
 */

// --- Permission Model ---

/**
 * Effective permissions for a user session.
 * Computed as the intersection of their user_role AND reseller_role capabilities.
 * System admins (admin/ibm) bypass this — they get all permissions unconditionally.
 */
export interface UserPermissions {
  canCreateInvoices: boolean;
  canApproveInvoices: boolean;
  canSendInvoices: boolean;
  canViewAllRecords: boolean;
  canViewChildRecords: boolean;
  canModifyPrices: boolean;
  canUploadPO: boolean;
  canManageUsers: boolean;
  canViewReports: boolean;
  canExportData: boolean;
}

// --- Organisation Model ---

/** A reseller/partner organisation. Synced from Zoho CRM Resellers module. */
export interface Reseller {
  id: string;
  name: string;
  email?: string;
  region?: string;
  currency?: string;
  partnerCategory?: string;
  directCustomerContact?: boolean;
  distributorId?: string;
  resellerRoleName?: string;
}

/**
 * Authenticated user session data.
 * Includes role info, permissions, and the reseller org they belong to.
 * Legacy compat fields (role, resellerId, etc.) are maintained for the AI system prompt.
 */
export interface User {
  email: string;
  name: string;
  reseller?: Reseller;
  userRoleName?: string;
  userRoleDisplayName?: string;
  resellerRoleName?: string;
  allowedResellerIds?: string[];
  permissions?: UserPermissions;
  // Legacy compat fields used by the AI system prompt
  role?: string;
  resellerId?: string;
  resellerName?: string;
  region?: string;
}

// --- Chat / AI Assistant ---

/** A single message in the AI invoice assistant conversation. */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  apiContent?: string; // Full content sent to API (may differ from display content, e.g. PO data)
  content: string;
  timestamp: Date;
  components?: MessageComponent[];
  isStreaming?: boolean;
}

/** Rich components embedded in assistant messages (tables, invoice previews, etc). */
export type MessageComponent =
  | { type: 'table'; data: TableData }
  | { type: 'invoice-summary'; data: InvoiceSummary }
  | { type: 'sku-builder'; data: SKUBuilderState }
  | { type: 'options'; data: OptionSet }
  | { type: 'confirmation'; data: ConfirmationData }
  | { type: 'link'; data: LinkData };

/** Tabular data rendered as an HTML table in the chat. */
export interface TableData {
  headers: string[];
  rows: (string | number)[][];
  selectable?: boolean;
  onSelect?: string;
}

/** Invoice preview card shown in the chat before creation. */
export interface InvoiceSummary {
  account: string;
  contact: string;
  reseller: string;
  region: string;
  currency: string;
  invoiceDate: string;
  dueDate: string;
  lineItems: LineItemSummary[];
  subtotal: number;
  invoiceId?: string;
  invoiceUrl?: string;
}

/** A single line item within an invoice summary. */
export interface LineItemSummary {
  product: string;
  quantity: number;
  startDate: string;
  endDate: string;
  unitPrice: number;
  total: number;
}

/** State for the interactive product SKU builder wizard. */
export interface SKUBuilderState {
  step: number;
  product?: string;
  userType?: string;
  licensing?: string;
  model?: string;
  sku?: string;
}

/** Multiple-choice options presented to the user in chat. */
export interface OptionSet {
  question: string;
  options: { label: string; value: string }[];
  allowCustom?: boolean;
}

/** Confirm/cancel prompt shown before destructive actions. */
export interface ConfirmationData {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

/** Clickable link rendered in the chat (e.g. "Open in CRM"). */
export interface LinkData {
  label: string;
  url: string;
  icon?: string;
}

// --- Zoho CRM ---

/** Generic Zoho CRM record with an ID and arbitrary fields. */
export interface ZohoRecord {
  id: string;
  [key: string]: unknown;
}

/** Paginated search result envelope from the Zoho CRM API. */
export interface ZohoSearchResult {
  data: ZohoRecord[];
  info?: {
    per_page: number;
    count: number;
    page: number;
    more_records: boolean;
  };
}

// --- Invoice Workflow ---

/**
 * Tracks the AI assistant's progress through the invoice creation workflow.
 * Phases: identify (find account) -> build (add line items) -> confirm -> post (create in CRM) -> report.
 */
export interface ConversationContext {
  phase: 'identify' | 'build' | 'confirm' | 'post' | 'report';
  account?: ZohoRecord;
  contact?: ZohoRecord;
  reseller?: ZohoRecord;
  lineItems?: unknown[];
  invoiceId?: string;
  invoiceType?: 'new' | 'renewal';
}
