export type UserRole = 'admin' | 'ibm' | 'distributor' | 'reseller' | 'unauthorized';

export interface User {
  email: string;
  name: string;
  role: UserRole;
  resellerId?: string;
  resellerName?: string;
  region?: string;
  allowedResellerIds?: string[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  components?: MessageComponent[];
  isStreaming?: boolean;
}

export type MessageComponent =
  | { type: 'table'; data: TableData }
  | { type: 'invoice-summary'; data: InvoiceSummary }
  | { type: 'sku-builder'; data: SKUBuilderState }
  | { type: 'options'; data: OptionSet }
  | { type: 'confirmation'; data: ConfirmationData }
  | { type: 'link'; data: LinkData };

export interface TableData {
  headers: string[];
  rows: (string | number)[][];
  selectable?: boolean;
  onSelect?: string;
}

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

export interface LineItemSummary {
  product: string;
  quantity: number;
  startDate: string;
  endDate: string;
  unitPrice: number;
  total: number;
}

export interface SKUBuilderState {
  step: number;
  product?: string;
  userType?: string;
  licensing?: string;
  model?: string;
  sku?: string;
}

export interface OptionSet {
  question: string;
  options: { label: string; value: string }[];
  allowCustom?: boolean;
}

export interface ConfirmationData {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

export interface LinkData {
  label: string;
  url: string;
  icon?: string;
}

export interface ZohoRecord {
  id: string;
  [key: string]: unknown;
}

export interface ZohoSearchResult {
  data: ZohoRecord[];
  info?: {
    per_page: number;
    count: number;
    page: number;
    more_records: boolean;
  };
}

export interface ConversationContext {
  phase: 'identify' | 'build' | 'confirm' | 'post' | 'report';
  account?: ZohoRecord;
  contact?: ZohoRecord;
  reseller?: ZohoRecord;
  lineItems?: unknown[];
  invoiceId?: string;
  invoiceType?: 'new' | 'renewal';
}
