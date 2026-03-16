'use client';

import { useState } from 'react';
import { Send, Hash, Calendar, DollarSign } from 'lucide-react';

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
  };

  return (
    <div className="mt-4 bg-surface border-2 border-border-subtle rounded-2xl p-5 space-y-4">
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
