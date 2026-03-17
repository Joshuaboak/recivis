'use client';

import { useState, useRef } from 'react';
import { Send } from 'lucide-react';

const COUNTRIES = [
  'Afghanistan','Albania','Algeria','Andorra','Angola','Antigua and Barbuda','Argentina','Armenia','Australia','Austria',
  'Azerbaijan','Bahamas','Bahrain','Bangladesh','Barbados','Belarus','Belgium','Belize','Benin','Bhutan',
  'Bolivia','Bosnia and Herzegovina','Botswana','Brazil','Brunei','Bulgaria','Burkina Faso','Burundi','Cambodia','Cameroon',
  'Canada','Cape Verde','Central African Republic','Chad','Chile','China','Colombia','Comoros','Congo','Costa Rica',
  'Croatia','Cuba','Cyprus','Czech Republic','Denmark','Djibouti','Dominica','Dominican Republic','East Timor','Ecuador',
  'Egypt','El Salvador','Equatorial Guinea','Eritrea','Estonia','Eswatini','Ethiopia','Fiji','Finland','France',
  'Gabon','Gambia','Georgia','Germany','Ghana','Greece','Grenada','Guatemala','Guinea','Guinea-Bissau',
  'Guyana','Haiti','Honduras','Hungary','Iceland','India','Indonesia','Iran','Iraq','Ireland',
  'Israel','Italy','Ivory Coast','Jamaica','Japan','Jordan','Kazakhstan','Kenya','Kiribati','Kosovo',
  'Kuwait','Kyrgyzstan','Laos','Latvia','Lebanon','Lesotho','Liberia','Libya','Liechtenstein','Lithuania',
  'Luxembourg','Madagascar','Malawi','Malaysia','Maldives','Mali','Malta','Marshall Islands','Mauritania','Mauritius',
  'Mexico','Micronesia','Moldova','Monaco','Mongolia','Montenegro','Morocco','Mozambique','Myanmar','Namibia',
  'Nauru','Nepal','Netherlands','New Zealand','Nicaragua','Niger','Nigeria','North Korea','North Macedonia','Norway',
  'Oman','Pakistan','Palau','Palestine','Panama','Papua New Guinea','Paraguay','Peru','Philippines','Poland',
  'Portugal','Qatar','Romania','Russia','Rwanda','Saint Kitts and Nevis','Saint Lucia','Saint Vincent and the Grenadines',
  'Samoa','San Marino','Sao Tome and Principe','Saudi Arabia','Senegal','Serbia','Seychelles','Sierra Leone','Singapore',
  'Slovakia','Slovenia','Solomon Islands','Somalia','South Africa','South Korea','South Sudan','Spain','Sri Lanka','Sudan',
  'Suriname','Sweden','Switzerland','Syria','Taiwan','Tajikistan','Tanzania','Thailand','Togo','Tonga',
  'Trinidad and Tobago','Tunisia','Turkey','Turkmenistan','Tuvalu','Uganda','Ukraine','United Arab Emirates',
  'United Kingdom','United States','Uruguay','Uzbekistan','Vanuatu','Vatican City','Venezuela','Vietnam','Yemen','Zambia','Zimbabwe',
];

interface FormField {
  label: string;
  cleanLabel: string;
  key: string;
  defaultValue: string;
  placeholder?: string;
  type: 'text' | 'email' | 'country';
  required: boolean;
}

interface DataFormProps {
  fields: FormField[];
  onSubmit: (values: string) => void;
  disabled?: boolean;
}

function CountryInput({ value, onChange, disabled, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = value.length > 0
    ? COUNTRIES.filter((c) => c.toLowerCase().startsWith(value.toLowerCase())).slice(0, 8)
    : [];

  return (
    <div className="relative flex-1">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setShowSuggestions(true); }}
        onFocus={() => { setFocused(true); setShowSuggestions(true); }}
        onBlur={() => { setFocused(false); setTimeout(() => setShowSuggestions(false), 150); }}
        disabled={disabled}
        placeholder={placeholder}
        className="w-full bg-csa-dark border-2 border-border-subtle rounded-xl px-3 py-2.5 text-sm text-text-primary outline-none focus:border-csa-accent transition-colors disabled:opacity-50 placeholder-text-muted/40"
      />
      {showSuggestions && focused && filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-csa-dark border-2 border-border-subtle rounded-xl overflow-hidden z-50 shadow-lg max-h-48 overflow-y-auto">
          {filtered.map((country) => (
            <button
              key={country}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(country);
                setShowSuggestions(false);
              }}
              className="w-full text-left px-3 py-2 text-sm text-text-secondary hover:bg-csa-accent/15 hover:text-csa-accent transition-colors cursor-pointer"
            >
              {country}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DataForm({ fields, onSubmit, disabled }: DataFormProps) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(fields.map((f) => [f.key, f.defaultValue]))
  );

  const handleSubmit = () => {
    const parts = fields
      .filter((f) => values[f.key]?.trim())
      .map((f) => `${f.cleanLabel}: ${values[f.key].trim()}`);
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
            <label className="text-xs font-semibold text-text-muted uppercase tracking-wider w-36 flex-shrink-0 text-right">
              {field.cleanLabel}
              {field.required && <span className="text-csa-accent ml-0.5">*</span>}
            </label>
            {field.type === 'country' ? (
              <CountryInput
                value={values[field.key]}
                onChange={(v) => updateValue(field.key, v)}
                disabled={disabled}
                placeholder={field.placeholder}
              />
            ) : (
              <input
                type={field.type === 'email' ? 'email' : 'text'}
                value={values[field.key]}
                onChange={(e) => updateValue(field.key, e.target.value)}
                disabled={disabled}
                placeholder={field.placeholder || ''}
                className="flex-1 bg-csa-dark border-2 border-border-subtle rounded-xl px-3 py-2.5 text-sm text-text-primary outline-none focus:border-csa-accent transition-colors disabled:opacity-50 placeholder-text-muted/40"
              />
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between pt-1">
        <p className="text-[10px] text-text-muted"><span className="text-csa-accent">*</span> Required fields</p>
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
  // Don't match line-item fields (quantity+date+price together = LineItemForm)
  const lineItemIndicators = /\b(start date|end date|custom price|quantity)\b/i;
  const lineItemCount = items.filter((item) => lineItemIndicators.test(item)).length;
  if (lineItemCount >= 3) return null;

  const fieldIndicators = /\b(name|first name|last name|email|address|country|phone|details|notes|account|contact|company|reseller|po|order|street|city|state)\b/i;
  const fieldCount = items.filter((item) => fieldIndicators.test(item)).length;
  if (fieldCount < items.length * 0.5) return null;
  if (items.length < 2) return null;

  return items.map((item, i) => {
    const clean = item.replace(/\*\*/g, '').trim();

    // Extract the field name (before parenthetical, colon, dash)
    const rawLabel = clean.split(/[\(\—\-–:]/)[0].trim();

    // Clean label for display — remove junk like "please provide"
    const cleanLabel = rawLabel
      .replace(/\s*\(.*\)\s*/g, '')
      .replace(/please provide/i, '')
      .trim();

    // Detect field type
    let type: 'text' | 'email' | 'country' = 'text';
    if (/\bemail\b/i.test(clean)) type = 'email';
    if (/\bcountry\b/i.test(clean)) type = 'country';

    // Extract pre-filled values
    const defaultMatch = clean.match(/\((?:pre-?filled[:\s]*|suggested[:\s]*)([^)]+)\)/i)
      || clean.match(/[:\—\-–]\s+([A-Z].+)$/); // Only after colon/dash if starts with uppercase (looks like a value)
    let defaultValue = defaultMatch ? defaultMatch[1].trim().replace(/\*\*/g, '') : '';

    // Determine placeholder and handle special fields
    let placeholder = '';
    const isReseller = /reseller/i.test(clean);
    const isRequired = !isReseller; // All fields required except reseller

    if (isReseller) {
      placeholder = 'Defaults to Civil Survey Applications if left blank';
      defaultValue = ''; // Always empty — placeholder explains the default
    }

    return {
      label: rawLabel,
      cleanLabel,
      key: `field_${i}`,
      defaultValue,
      placeholder,
      type,
      required: isRequired,
    };
  });
}
