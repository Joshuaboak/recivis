'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';

interface FormField {
  label: string;
  key: string;
  defaultValue: string;
  placeholder?: string;
  type: 'text' | 'email' | 'number';
}

interface DataFormProps {
  fields: FormField[];
  onSubmit: (values: string) => void;
  disabled?: boolean;
}

export default function DataForm({ fields, onSubmit, disabled }: DataFormProps) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(fields.map((f) => [f.key, f.defaultValue]))
  );

  const handleSubmit = () => {
    const parts = fields
      .filter((f) => values[f.key]?.trim())
      .map((f) => `${f.label}: ${values[f.key].trim()}`);
    if (parts.length === 0) return;
    onSubmit(parts.join('\n'));
  };

  const updateValue = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="mt-4 bg-surface border-2 border-border-subtle rounded-2xl p-5 space-y-3">
      <div className="space-y-3">
        {fields.map((field) => (
          <div key={field.key} className="flex items-center gap-3">
            <label className="text-xs font-semibold text-text-muted uppercase tracking-wider w-32 flex-shrink-0 text-right">
              {field.label}
            </label>
            <input
              type={field.type}
              value={values[field.key]}
              onChange={(e) => updateValue(field.key, e.target.value)}
              disabled={disabled}
              placeholder={field.placeholder || field.label}
              className="flex-1 bg-csa-dark border-2 border-border-subtle rounded-xl px-3 py-2.5 text-sm text-text-primary outline-none focus:border-csa-accent transition-colors disabled:opacity-50 placeholder-text-muted/40"
            />
          </div>
        ))}
      </div>
      <div className="flex justify-end pt-1">
        <button
          onClick={handleSubmit}
          disabled={disabled}
          className="flex items-center gap-2 px-5 py-2.5 bg-csa-accent text-white text-sm font-semibold rounded-xl hover:bg-csa-primary transition-colors disabled:opacity-40 cursor-pointer"
        >
          <Send size={14} />
          Submit
        </button>
      </div>
    </div>
  );
}

/**
 * Parse a numbered list of field-like labels into FormField array.
 * Returns null if the list doesn't look like a data collection form.
 */
export function parseFieldList(items: string[]): FormField[] | null {
  // Only match data-collection fields, NOT line-item fields (quantity+date+price together = LineItemForm)
  const lineItemIndicators = /\b(start date|end date|custom price|quantity)\b/i;
  const lineItemCount = items.filter((item) => lineItemIndicators.test(item)).length;
  if (lineItemCount >= 3) return null; // This is a line item form, not a data form

  const fieldIndicators = /\b(name|email|address|country|phone|details|notes|account|contact|company|reseller|po|order|street|city|state)\b/i;
  const fieldCount = items.filter((item) => fieldIndicators.test(item)).length;

  // Need at least 50% of items to look like fields
  if (fieldCount < items.length * 0.5) return null;
  if (items.length < 2) return null;

  return items.map((item, i) => {
    // Strip markdown bold
    const clean = item.replace(/\*\*/g, '').trim();
    // Extract just the field name (before any parenthetical or dash)
    const label = clean.split(/[\(\—\-–]/)[0].trim();

    // Guess the input type — only number for explicitly numeric fields
    let type: 'text' | 'email' | 'number' = 'text';
    if (/\bemail\b/i.test(clean)) type = 'email';
    if (/\b(quantity|qty|count)\b/i.test(clean)) type = 'number';

    // Check for default values in parentheses
    const defaultMatch = clean.match(/\((?:default[:\s]*|or[:\s]*)([^)]+)\)/i);
    let defaultValue = defaultMatch ? defaultMatch[1].trim() : '';

    // Special placeholder for reseller field
    let placeholder = label;
    if (/reseller/i.test(clean)) {
      placeholder = 'Defaults to Civil Survey Applications if left blank';
      if (/default to civil survey/i.test(clean) || /I'll default/i.test(clean)) {
        defaultValue = '';
      }
    }

    return {
      label,
      key: `field_${i}`,
      defaultValue,
      placeholder,
      type,
    };
  });
}
