/**
 * InvoiceLineItems — The line items table for the invoice detail view.
 *
 * Handles both display and edit modes: quantity, price, dates, product
 * selection (via SKU Builder trigger), and add/remove rows.
 * All state mutations are forwarded to the parent via handler props.
 */
'use client';

import { motion } from 'framer-motion';
import {
  Package,
  Plus,
  Trash2,
  Replace,
} from 'lucide-react';

interface InvoiceLineItemsProps {
  /** Line items to display (filtered for non-deleted in edit mode) */
  displayLineItems: Record<string, unknown>[];
  /** Whether the user is in edit mode */
  editing: boolean;
  /** Whether the invoice is a renewal (restricts product/qty edits) */
  isRenewal: boolean;
  /** Currency symbol to display ($, EUR, GBP, INR) */
  symbol: string;
  /** Format a date value for display */
  formatDate: (d: unknown) => string;
  /** Update a single field on a line item by index */
  onUpdateLineItem: (index: number, field: string, value: unknown) => void;
  /** Add a new blank line item row */
  onAddLineItem: () => void;
  /** Remove or mark-for-deletion a line item by index */
  onRemoveLineItem: (index: number) => void;
  /** Open the SKU Builder modal for a specific line item index */
  onOpenSkuBuilder: (index: number) => void;
}

export default function InvoiceLineItems({
  displayLineItems,
  editing,
  isRenewal,
  symbol,
  formatDate,
  onUpdateLineItem,
  onAddLineItem,
  onRemoveLineItem,
  onOpenSkuBuilder,
}: InvoiceLineItemsProps) {
  // Permission flags derived from editing + invoice type
  const canEditProduct = editing && !isRenewal; // Can't change product on renewals
  const canEditQty = editing && !isRenewal;     // Can't change qty on renewals
  const canEditPrice = editing;                  // Can always edit price in edit mode
  const canEditDates = editing;                  // Can always edit dates in edit mode

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-8">
      {/* Section heading */}
      <h2 className="text-lg font-bold text-text-primary mb-3 flex items-center gap-2">
        <Package size={18} className="text-csa-accent" />
        Line Items ({displayLineItems.length})
        {editing && <span className="text-xs font-normal text-warning ml-2">Editing</span>}
        {editing && isRenewal && <span className="text-xs font-normal text-text-muted ml-1">(You can not modify the product or quantity for a renewal)</span>}
      </h2>

      {/* Line items table */}
      {displayLineItems.length > 0 ? (
        <div className="border border-border-subtle rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-surface-raised">
                <th>Product</th>
                <th className="text-right">Qty</th>
                <th className="text-right">List Price</th>
                <th>Start</th>
                <th>Renewal</th>
                <th className="text-right">Total</th>
                {canEditProduct && <th className="w-10"></th>}
              </tr>
            </thead>
            <tbody>
              {displayLineItems.map((li, i) => {
                const product = li.Product_Name as { name?: string; id?: string } | string | null;
                const productName = typeof product === 'object' && product !== null ? product.name : (product as string);
                const qty = li.Quantity as number;
                const unitPrice = li.List_Price as number;
                const total = li.Net_Total as number;
                const desc = li.Description as string | undefined;

                return (
                  <tr key={i}>
                    {/* Product — clickable to change via SKU builder (not for renewals) */}
                    <td>
                      {canEditProduct && !productName ? (
                        <button
                          onClick={() => onOpenSkuBuilder(i)}
                          className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-csa-accent bg-csa-accent/10 border border-csa-accent/30 border-dashed rounded-lg hover:bg-csa-accent/20 transition-colors cursor-pointer"
                        >
                          <Plus size={12} />
                          Select Product
                        </button>
                      ) : canEditProduct ? (
                        <button
                          onClick={() => onOpenSkuBuilder(i)}
                          className="text-left group cursor-pointer"
                        >
                          <div className="font-semibold text-csa-accent group-hover:text-csa-highlight transition-colors flex items-center gap-1.5">
                            {productName}
                            <Replace size={12} className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                          {desc ? (
                            <p className="text-xs text-text-muted mt-0.5 max-w-md truncate">{desc}</p>
                          ) : null}
                        </button>
                      ) : (
                        <>
                          <div className="font-semibold text-text-primary">{productName || '\u2014'}</div>
                          {desc ? (
                            <p className="text-xs text-text-muted mt-0.5 max-w-md truncate">{desc}</p>
                          ) : null}
                        </>
                      )}
                    </td>

                    {/* Quantity */}
                    <td className="text-right">
                      {canEditQty ? (
                        <input
                          type="text"
                          inputMode="numeric"
                          value={qty}
                          onChange={(e) => onUpdateLineItem(i, 'Quantity', parseInt(e.target.value.replace(/\D/g, '')) || 1)}
                          className="bg-surface border border-csa-accent/50 rounded-lg px-3 py-1.5 text-sm text-text-primary outline-none focus:border-csa-accent w-[60px] text-right"
                        />
                      ) : (
                        <span className="text-text-secondary">{qty}</span>
                      )}
                    </td>

                    {/* List Price */}
                    <td className="text-right">
                      {canEditPrice ? (
                        <div className="inline-flex items-center bg-surface border border-csa-accent/50 rounded-lg overflow-hidden focus-within:border-csa-accent">
                          <span className="text-xs text-text-muted pl-2.5">{symbol}</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={unitPrice}
                            onChange={(e) => {
                              const val = e.target.value.replace(/[^\d.]/g, '');
                              onUpdateLineItem(i, 'List_Price', val === '' ? 0 : parseFloat(val));
                            }}
                            style={{ outline: 'none', boxShadow: 'none' }}
                            className="bg-transparent border-none px-1.5 py-1.5 text-sm text-text-primary w-[80px] text-right"
                          />
                        </div>
                      ) : (
                        <span className="text-text-secondary">{symbol}{unitPrice?.toFixed(2)}</span>
                      )}
                    </td>

                    {/* Start Date */}
                    <td>
                      {canEditDates ? (
                        <input
                          type="date"
                          value={li.Start_Date as string || ''}
                          onChange={(e) => onUpdateLineItem(i, 'Start_Date', e.target.value)}
                          className="bg-surface border border-csa-accent/50 rounded-lg px-2 py-1 text-sm text-text-primary outline-none focus:border-csa-accent w-[130px]"
                        />
                      ) : (
                        <span className="text-text-secondary">{formatDate(li.Start_Date)}</span>
                      )}
                    </td>

                    {/* Renewal Date */}
                    <td>
                      {canEditDates ? (
                        <input
                          type="date"
                          value={li.Renewal_Date as string || ''}
                          onChange={(e) => onUpdateLineItem(i, 'Renewal_Date', e.target.value)}
                          className="bg-surface border border-csa-accent/50 rounded-lg px-2 py-1 text-sm text-text-primary outline-none focus:border-csa-accent w-[130px]"
                        />
                      ) : (
                        <span className="text-text-secondary">{formatDate(li.Renewal_Date)}</span>
                      )}
                    </td>

                    {/* Total */}
                    <td className="text-right text-text-primary font-semibold">{symbol}{total?.toFixed(2)}</td>

                    {/* Remove button */}
                    {canEditProduct ? (
                      <td>
                        <button
                          onClick={() => onRemoveLineItem(i)}
                          className="p-1 text-text-muted hover:text-error transition-colors cursor-pointer"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-text-muted py-4">No line items found</p>
      )}

      {/* Add Line Item button — new invoices only (not renewals) */}
      {canEditProduct ? (
        <button
          onClick={onAddLineItem}
          className="mt-3 flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-csa-accent bg-csa-accent/10 border border-csa-accent/30 border-dashed rounded-xl hover:bg-csa-accent/20 transition-colors cursor-pointer w-full justify-center"
        >
          <Plus size={14} />
          Add Line Item
        </button>
      ) : null}
    </motion.div>
  );
}
