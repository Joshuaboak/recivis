/**
 * InlineEditField — click-to-edit a single field, with optimistic save and rollback.
 *
 * Usage:
 *   Wrap a region of fields in <InlineEditFieldProvider> so that only one
 *   field can be in edit mode at a time. Each <InlineEditField> renders a
 *   read-only "card" by default. Clicking it swaps to an inline editor that
 *   matches the page-level edit form's input style.
 *
 * Behaviour (per spec):
 *   - Click outside while clean → exit edit mode
 *   - Click outside while dirty → stay in edit mode, shake + red flash
 *   - Enter (non-textarea) → confirm if dirty, else exit
 *   - Escape → revert and exit
 *   - Click another field while clean → exit current, open new
 *   - Click another field while dirty → shake current, do NOT open new
 *   - Optimistic save: parent should update state in onSave; throw on error
 *   - On error: revert local value, red background fade + shake
 *   - canEdit=false hides all edit affordances (no cursor, no click handler)
 */

'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
} from 'react';
import { motion, useAnimation } from 'framer-motion';
import { Check, X, Loader2, ChevronDown } from 'lucide-react';

// ──────────────────────────────────────────────────────────────────────────
// Provider — coordinates which field is currently editing
// ──────────────────────────────────────────────────────────────────────────

interface InlineEditContextValue {
  editingFieldId: string | null;
  /** Try to start editing fieldId. Returns true if granted, false if blocked
   *  by another dirty field (which will be shaken as a side-effect). */
  requestEdit: (fieldId: string) => boolean;
  /** Release editing of a field. Called when the field exits cleanly. */
  releaseEdit: (fieldId: string) => void;
  /** Update the dirty flag for the currently editing field. */
  markDirty: (fieldId: string, dirty: boolean) => void;
  /** Increments to signal "shake the current field". */
  shakeNonce: number;
}

const InlineEditContext = createContext<InlineEditContextValue | null>(null);

export function InlineEditFieldProvider({ children }: { children: ReactNode }) {
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const editingRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  const [shakeNonce, setShakeNonce] = useState(0);

  const requestEdit = useCallback((fieldId: string): boolean => {
    const current = editingRef.current;
    if (current === fieldId) return true;
    if (current && dirtyRef.current) {
      // Blocked — shake the dirty field
      setShakeNonce(n => n + 1);
      return false;
    }
    // Either no current edit, or current is clean — switch to new field
    editingRef.current = fieldId;
    dirtyRef.current = false;
    setEditingFieldId(fieldId);
    return true;
  }, []);

  const releaseEdit = useCallback((fieldId: string) => {
    if (editingRef.current === fieldId) {
      editingRef.current = null;
      dirtyRef.current = false;
      setEditingFieldId(null);
    }
  }, []);

  const markDirty = useCallback((fieldId: string, dirty: boolean) => {
    if (editingRef.current === fieldId) {
      dirtyRef.current = dirty;
    }
  }, []);

  return (
    <InlineEditContext.Provider value={{ editingFieldId, requestEdit, releaseEdit, markDirty, shakeNonce }}>
      {children}
    </InlineEditContext.Provider>
  );
}

function useInlineEditContext() {
  const ctx = useContext(InlineEditContext);
  if (!ctx) {
    throw new Error('InlineEditField must be used within an <InlineEditFieldProvider>');
  }
  return ctx;
}

// ──────────────────────────────────────────────────────────────────────────
// Field component
// ──────────────────────────────────────────────────────────────────────────

export type InlineEditFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'select'
  | 'email'
  | 'tel'
  | 'url'
  | 'toggle'
  | 'lookup';

export interface InlineEditSelectOption {
  value: string;
  label: string;
}

export interface InlineEditFieldProps {
  /** Unique within a provider scope. */
  fieldId: string;
  /** Card label shown above the value. */
  label: string;
  /** Optional icon shown next to the label. */
  icon?: ReactNode;
  /** Current value (string form — date as YYYY-MM-DD, select as option value,
   *  toggle as 'true'/'false', lookup as the selected option's id). */
  value: string;
  /** Optional override for the read-only display (e.g. formatted date, badge). */
  displayValue?: ReactNode;
  /** Field type. */
  type: InlineEditFieldType;
  /** Options for `type='select'` and `type='lookup'`. */
  options?: InlineEditSelectOption[];
  /** Placeholder for text-style fields and the lookup search input. */
  placeholder?: string;
  /** Whether this user can edit this field. If false the cell is inert. */
  canEdit: boolean;
  /** Save handler. Should perform optimistic state update in the parent and
   *  throw on error so this component can roll back its local state. */
  onSave: (newValue: string) => Promise<void>;
  /** Optional callback fired when the field enters edit mode. Useful for
   *  refreshing lookup options that may have changed since the parent
   *  initially loaded them. */
  onOpenEdit?: () => void;
  /** Optional className for the wrapper card. */
  className?: string;
}

export function InlineEditField({
  fieldId,
  label,
  icon,
  value,
  displayValue,
  type,
  options,
  placeholder,
  canEdit,
  onSave,
  onOpenEdit,
  className = '',
}: InlineEditFieldProps) {
  const { editingFieldId, requestEdit, releaseEdit, markDirty, shakeNonce } = useInlineEditContext();
  const isEditing = editingFieldId === fieldId;

  const [editValue, setEditValue] = useState(value);
  const initialValueRef = useRef(value);
  const [saving, setSaving] = useState(false);
  const [errorFlash, setErrorFlash] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null);
  const controls = useAnimation();

  const isDirty = isEditing && editValue !== initialValueRef.current;

  // Sync external value updates while not editing.
  useEffect(() => {
    if (!isEditing) {
      setEditValue(value);
    }
  }, [value, isEditing]);

  // When entering edit mode: capture the initial value, focus the input,
  // and notify the parent (e.g. to refresh lookup options).
  useEffect(() => {
    if (isEditing) {
      initialValueRef.current = value;
      setEditValue(value);
      onOpenEdit?.();
      // Defer focus until the input has mounted.
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
    // We intentionally only fire onOpenEdit on the *transition* into edit
    // mode, not on every value change while editing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing]);

  // Notify the provider whenever this field's dirty state changes.
  useEffect(() => {
    if (isEditing) {
      markDirty(fieldId, isDirty);
    }
  }, [isEditing, isDirty, fieldId, markDirty]);

  // Click-outside detection.
  useEffect(() => {
    if (!isEditing) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (wrapperRef.current?.contains(e.target as Node)) return;
      if (isDirty) {
        controls.start({ x: [0, -8, 8, -8, 8, 0], transition: { duration: 0.4 } });
      } else {
        releaseEdit(fieldId);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isEditing, isDirty, fieldId, releaseEdit, controls]);

  // Listen for shake requests from the provider (another field tried to open).
  const lastShakeNonce = useRef(shakeNonce);
  useEffect(() => {
    if (!isEditing) {
      lastShakeNonce.current = shakeNonce;
      return;
    }
    if (shakeNonce !== lastShakeNonce.current) {
      lastShakeNonce.current = shakeNonce;
      controls.start({ x: [0, -8, 8, -8, 8, 0], transition: { duration: 0.4 } });
    }
  }, [shakeNonce, isEditing, controls]);

  const handleClick = () => {
    if (!canEdit || isEditing) return;
    requestEdit(fieldId);
  };

  const handleConfirm = async () => {
    if (!isDirty) {
      releaseEdit(fieldId);
      return;
    }
    setSaving(true);
    const newValue = editValue;
    try {
      await onSave(newValue);
      releaseEdit(fieldId);
    } catch {
      setEditValue(initialValueRef.current);
      releaseEdit(fieldId);
      setErrorFlash(true);
      controls.start({ x: [0, -8, 8, -8, 8, 0], transition: { duration: 0.4 } });
      setTimeout(() => setErrorFlash(false), 1200);
    } finally {
      setSaving(false);
    }
  };

  const handleRevert = () => {
    setEditValue(initialValueRef.current);
    releaseEdit(fieldId);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && type !== 'textarea') {
      e.preventDefault();
      if (isDirty) handleConfirm();
      else releaseEdit(fieldId);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleRevert();
    }
  };

  // Background colour reflects state: red on error, green while editing,
  // default surface otherwise. Long transition so the red fades back smoothly.
  const backgroundClass = errorFlash
    ? 'bg-error/15 border-error/40'
    : isEditing
    ? 'bg-success/10 border-success/40'
    : 'bg-surface border-border-subtle';

  const cursorClass =
    canEdit && !isEditing ? 'cursor-pointer hover:border-csa-accent/40' : '';

  return (
    <motion.div
      ref={wrapperRef}
      animate={controls}
      onClick={handleClick}
      className={`border rounded-xl px-4 py-3 transition-colors duration-700 ${backgroundClass} ${cursorClass} ${className}`}
    >
      <div className="flex items-center gap-1.5 text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">
        {icon}
        {label}
      </div>

      {isEditing ? (
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            {renderEditor({
              type,
              editValue,
              setEditValue,
              handleKeyDown,
              inputRef,
              options,
              placeholder,
            })}
          </div>

          {/* Tick / cross only appear when the value has changed */}
          {isDirty && (
            <div className="flex items-center gap-1 flex-shrink-0 pt-0.5">
              <button
                onMouseDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); handleConfirm(); }}
                disabled={saving}
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-success/20 text-success hover:bg-success/30 transition-colors cursor-pointer disabled:opacity-40"
                title="Confirm (Enter)"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              </button>
              <button
                onMouseDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); handleRevert(); }}
                disabled={saving}
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-error/20 text-error hover:bg-error/30 transition-colors cursor-pointer disabled:opacity-40"
                title="Revert (Escape)"
              >
                <X size={14} />
              </button>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-text-primary truncate">
          {displayValue ?? value ?? '\u2014'}
        </p>
      )}
    </motion.div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Editor renderers — split out so the main component stays readable
// ──────────────────────────────────────────────────────────────────────────

interface EditorProps {
  type: InlineEditFieldType;
  editValue: string;
  setEditValue: (v: string) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  inputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>;
  options?: InlineEditSelectOption[];
  placeholder?: string;
}

function renderEditor({ type, editValue, setEditValue, handleKeyDown, inputRef, options, placeholder }: EditorProps): ReactNode {
  switch (type) {
    case 'textarea':
      return (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement | null>}
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={3}
          className="w-full bg-csa-dark border border-border-subtle px-3 py-2 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-lg resize-none"
        />
      );

    case 'select':
      return (
        <div className="relative">
          <select
            ref={inputRef as React.RefObject<HTMLSelectElement | null>}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full bg-csa-dark border border-border-subtle px-3 py-2 text-sm text-text-primary outline-none focus:border-csa-accent rounded-lg appearance-none cursor-pointer pr-8"
          >
            {options?.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
        </div>
      );

    case 'toggle':
      return <ToggleEditor value={editValue} onChange={setEditValue} onKeyDown={handleKeyDown} />;

    case 'lookup':
      return (
        <LookupEditor
          value={editValue}
          options={options || []}
          placeholder={placeholder}
          onChange={setEditValue}
          inputRef={inputRef as React.RefObject<HTMLInputElement | null>}
        />
      );

    default: {
      // text, number, date, email, tel, url
      const inputType =
        type === 'date' ? 'date' :
        type === 'email' ? 'email' :
        type === 'tel' ? 'tel' :
        type === 'url' ? 'url' :
        'text';

      return (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement | null>}
          type={inputType}
          inputMode={type === 'number' ? 'decimal' : undefined}
          value={editValue}
          onChange={e => {
            if (type === 'number') {
              setEditValue(e.target.value.replace(/[^\d.-]/g, ''));
            } else {
              setEditValue(e.target.value);
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full bg-csa-dark border border-border-subtle px-3 py-2 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-lg"
        />
      );
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Toggle editor — for boolean fields. Value is 'true' or 'false'.
// ──────────────────────────────────────────────────────────────────────────

function ToggleEditor({ value, onChange, onKeyDown }: { value: string; onChange: (v: string) => void; onKeyDown: (e: React.KeyboardEvent) => void }) {
  const enabled = value === 'true';
  return (
    <button
      type="button"
      onMouseDown={e => e.stopPropagation()}
      onClick={e => { e.stopPropagation(); onChange(enabled ? 'false' : 'true'); }}
      onKeyDown={onKeyDown}
      autoFocus
      className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${enabled ? 'bg-csa-accent' : 'bg-border'}`}
      aria-pressed={enabled}
    >
      <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${enabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
    </button>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Lookup editor — searchable dropdown of {id, label} options.
// Selecting an option immediately updates the value (which makes the field
// dirty); the user then clicks tick or presses Enter to confirm the save.
// ──────────────────────────────────────────────────────────────────────────

function LookupEditor({
  value,
  options,
  placeholder,
  onChange,
  inputRef,
}: {
  value: string;
  options: InlineEditSelectOption[];
  placeholder?: string;
  onChange: (v: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const selected = options.find(o => o.value === value);

  // Seed the search box with the currently-selected label so re-opening the
  // lookup shows what's already chosen instead of an empty field. We also
  // select-all on focus so the first keystroke replaces the seed cleanly.
  const [search, setSearch] = useState(selected?.label ?? '');

  // If the selected option arrives after mount (async options load), update
  // the seed once — but only while the user hasn't typed anything yet.
  const seededRef = useRef(false);
  useEffect(() => {
    if (!seededRef.current && selected?.label) {
      setSearch(selected.label);
      seededRef.current = true;
    }
  }, [selected?.label]);

  const filtered = search && search !== selected?.label
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  return (
    <div>
      <input
        ref={inputRef}
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        onFocus={e => e.target.select()}
        placeholder={placeholder || 'Search...'}
        className="w-full bg-csa-dark border border-border-subtle px-3 py-2 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-lg mb-1.5"
      />
      <div className="max-h-[160px] overflow-y-auto space-y-0.5">
        {filtered.length === 0 ? (
          <p className="text-xs text-text-muted px-2 py-1.5">No matches</p>
        ) : (
          filtered.map(opt => (
            <button
              key={opt.value}
              type="button"
              onMouseDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); onChange(opt.value); setSearch(opt.label); }}
              className={`w-full text-left px-2 py-1.5 text-xs rounded-lg transition-colors cursor-pointer ${
                selected?.value === opt.value
                  ? 'text-csa-accent bg-csa-accent/10'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-raised'
              }`}
            >
              {opt.label}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
