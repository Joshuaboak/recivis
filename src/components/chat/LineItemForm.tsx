'use client';

import { useState } from 'react';
import { Send, Hash, Calendar, DollarSign, X, Plus, FileCheck } from 'lucide-react';

interface LineItemFormProps {
  defaults: {
    quantity: number;
    startDate: string;
    endDate: string;
    price: string;
    currency: string;
  };
  onSubmit: (values: string) => void;
  disabled?: boolean;
}

export default function LineItemForm({ defaults, onSubmit, disabled }: LineItemFormProps) {
  const [quantity, setQuantity] = useState(defaults.quantity);
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [price, setPrice] = useState(defaults.price);
  const [submitted, setSubmitted] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const handleSubmit = () => {
    const parts: string[] = [];
    parts.push(`Quantity: ${quantity}`);
    parts.push(`Start date: ${startDate}`);
    parts.push(`End date: ${endDate}`);
    if (price !== defaults.price) {
      parts.push(`Custom price: ${price}`);
    } else {
      parts.push(`Price: default`);
    }
    onSubmit(parts.join('\n'));
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="mt-4 flex gap-3">
        <button
          onClick={() => onSubmit('Create the invoice')}
          disabled={disabled}
          className="flex items-center gap-2 px-5 py-2.5 bg-success/15 border-2 border-success/30 rounded-xl text-success text-sm font-semibold hover:bg-success/25 hover:border-success/50 transition-all cursor-pointer"
        >
          <FileCheck size={16} />
          Create Invoice
        </button>
        <button
          onClick={() => onSubmit('Add another line item')}
          disabled={disabled}
          className="flex items-center gap-2 px-5 py-2.5 bg-surface-raised border-2 border-border-subtle rounded-xl text-text-secondary text-sm font-semibold hover:border-csa-accent hover:text-csa-accent transition-all cursor-pointer"
        >
          <Plus size={16} />
          Add Line Item
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 bg-surface border-2 border-border-subtle rounded-2xl p-5 space-y-4 relative">
      {/* Remove button */}
      <button
        onClick={() => {
          setDismissed(true);
          onSubmit('Skip this line item');
        }}
        className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center text-text-muted hover:text-error hover:bg-error/10 rounded-lg transition-colors cursor-pointer"
        title="Remove line item"
      >
        <X size={16} />
      </button>

      <div className="grid grid-cols-2 gap-4">
        {/* Quantity */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
            <Hash size={12} />
            Quantity
          </label>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
            disabled={disabled}
            className="w-full bg-csa-dark border-2 border-border-subtle rounded-xl px-3 py-2.5 text-sm text-text-primary outline-none focus:border-csa-accent transition-colors disabled:opacity-50"
          />
        </div>

        {/* Price */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
            <DollarSign size={12} />
            Price ({defaults.currency})
          </label>
          <input
            type="text"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            disabled={disabled}
            className="w-full bg-csa-dark border-2 border-border-subtle rounded-xl px-3 py-2.5 text-sm text-text-primary outline-none focus:border-csa-accent transition-colors disabled:opacity-50"
          />
        </div>

        {/* Start Date */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
            <Calendar size={12} />
            Start Date
          </label>
          <input
            type="date"
            value={toIsoDate(startDate)}
            onChange={(e) => setStartDate(toAuDate(e.target.value))}
            disabled={disabled}
            className="w-full bg-csa-dark border-2 border-border-subtle rounded-xl px-3 py-2.5 text-sm text-text-primary outline-none focus:border-csa-accent transition-colors disabled:opacity-50 [color-scheme:dark]"
          />
          <p className="text-[10px] text-text-muted mt-1">{startDate}</p>
        </div>

        {/* End Date */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
            <Calendar size={12} />
            End Date
          </label>
          <input
            type="date"
            value={toIsoDate(endDate)}
            onChange={(e) => setEndDate(toAuDate(e.target.value))}
            disabled={disabled}
            className="w-full bg-csa-dark border-2 border-border-subtle rounded-xl px-3 py-2.5 text-sm text-text-primary outline-none focus:border-csa-accent transition-colors disabled:opacity-50 [color-scheme:dark]"
          />
          <p className="text-[10px] text-text-muted mt-1">{endDate}</p>
        </div>
      </div>

      <button
        onClick={handleSubmit}
        disabled={disabled}
        className="flex items-center gap-2 px-5 py-2.5 bg-csa-accent text-white text-sm font-semibold rounded-xl hover:bg-csa-primary transition-colors disabled:opacity-40 cursor-pointer"
      >
        <Send size={14} />
        Submit Line Item
      </button>
    </div>
  );
}

/** Convert DD/MM/YYYY to YYYY-MM-DD for date input */
function toIsoDate(auDate: string): string {
  const match = auDate.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return '';
  return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
}

/** Convert YYYY-MM-DD to DD/MM/YYYY for display */
function toAuDate(isoDate: string): string {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}
