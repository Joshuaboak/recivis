'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Loader2, Building2, UserSearch, User, FileText, ExternalLink } from 'lucide-react';
import { useAppStore } from '@/lib/store';

interface SearchResult {
  id: string;
  module: string;
  title: string;
  subtitle: string;
  meta?: string;
}

const MODULE_CONFIG: Record<string, { icon: typeof Building2; color: string; label: string }> = {
  Accounts:  { icon: Building2,  color: 'text-csa-accent',  label: 'Account' },
  Leads:     { icon: UserSearch,  color: 'text-csa-accent',  label: 'Lead' },
  Prospects: { icon: Building2,  color: 'text-csa-purple',  label: 'Prospect' },
  Contacts:  { icon: User,       color: 'text-success',     label: 'Contact' },
  Invoices:  { icon: FileText,   color: 'text-csa-purple',  label: 'Invoice' },
};

const MODULE_BADGE_COLORS: Record<string, string> = {
  Accounts:  'bg-csa-accent/15 text-csa-accent',
  Leads:     'bg-csa-accent/15 text-csa-accent',
  Prospects: 'bg-csa-purple/15 text-csa-purple',
  Contacts:  'bg-success/15 text-success',
  Invoices:  'bg-csa-purple/15 text-csa-purple',
};

interface SearchModalProps {
  onClose: () => void;
}

export default function SearchModal({ onClose }: SearchModalProps) {
  const { setCurrentView, setSelectedAccountId, setSelectedLeadId, setSelectedLeadSource, setSelectedInvoiceId, setInvoiceReturnView } = useAppStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const handleSearch = async () => {
    const q = query.trim();
    if (q.length < 2) return;
    setLoading(true);
    setSearched(true);

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(data.results || []);
    } catch {
      setResults([]);
    }
    setLoading(false);
  };

  const handleNavigate = (result: SearchResult) => {
    switch (result.module) {
      case 'Accounts':
        setSelectedAccountId(result.id);
        setCurrentView('account-detail');
        break;
      case 'Leads':
        setSelectedLeadId(result.id);
        setSelectedLeadSource('lead');
        setCurrentView('lead-detail');
        break;
      case 'Prospects':
        setSelectedLeadId(result.id);
        setSelectedLeadSource('prospect');
        setCurrentView('lead-detail');
        break;
      case 'Contacts':
        // Navigate to the contact's account if available
        // For now, we can't navigate directly to contacts — skip or go to accounts
        break;
      case 'Invoices':
        setSelectedInvoiceId(result.id);
        setInvoiceReturnView('draft-invoices');
        setCurrentView('invoice-detail');
        break;
    }
    onClose();
  };

  // Group results by module
  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    if (!acc[r.module]) acc[r.module] = [];
    acc[r.module].push(r);
    return acc;
  }, {});

  const moduleOrder = ['Accounts', 'Prospects', 'Leads', 'Contacts', 'Invoices'];
  const orderedGroups = moduleOrder.filter(m => grouped[m]);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-[10vh]" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: -20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.97 }}
        transition={{ duration: 0.15 }}
        className="bg-csa-dark border border-border rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border-subtle">
          <Search size={20} className="text-text-muted flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
            placeholder="Search accounts, leads, contacts, invoices..."
            className="flex-1 bg-transparent text-base text-text-primary placeholder-text-muted/40 outline-none"
          />
          {loading ? (
            <Loader2 size={18} className="text-csa-accent animate-spin flex-shrink-0" />
          ) : query.length > 0 ? (
            <button onClick={() => { setQuery(''); setResults([]); setSearched(false); inputRef.current?.focus(); }} className="p-1 text-text-muted hover:text-text-primary transition-colors cursor-pointer flex-shrink-0">
              <X size={16} />
            </button>
          ) : null}
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {!searched && !loading && (
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-text-muted">Type at least 2 characters and press Enter to search</p>
              <div className="flex items-center justify-center gap-2 mt-3">
                <kbd className="px-2 py-0.5 text-[10px] font-mono font-bold text-text-muted bg-surface border border-border-subtle rounded">Enter</kbd>
                <span className="text-[10px] text-text-muted">to search</span>
                <span className="text-[10px] text-text-muted mx-1">&middot;</span>
                <kbd className="px-2 py-0.5 text-[10px] font-mono font-bold text-text-muted bg-surface border border-border-subtle rounded">Esc</kbd>
                <span className="text-[10px] text-text-muted">to close</span>
              </div>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-12 gap-2">
              <Loader2 size={18} className="text-csa-accent animate-spin" />
              <span className="text-sm text-text-muted">Searching...</span>
            </div>
          )}

          {searched && !loading && results.length === 0 && (
            <div className="px-5 py-12 text-center">
              <Search size={28} className="text-text-muted/30 mx-auto mb-2" />
              <p className="text-sm text-text-muted">No results for &ldquo;{query}&rdquo;</p>
            </div>
          )}

          {!loading && orderedGroups.length > 0 && (
            <div className="py-2">
              {orderedGroups.map(moduleName => {
                const items = grouped[moduleName];
                const config = MODULE_CONFIG[moduleName];
                const Icon = config?.icon || Building2;
                const badgeColor = MODULE_BADGE_COLORS[moduleName] || 'bg-text-muted/15 text-text-muted';

                return (
                  <div key={moduleName}>
                    {/* Module header */}
                    <div className="px-5 pt-3 pb-1.5 flex items-center gap-2">
                      <span className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded-md ${badgeColor}`}>
                        {config?.label || moduleName}
                      </span>
                      <span className="text-[10px] text-text-muted">{items.length} result{items.length !== 1 ? 's' : ''}</span>
                    </div>

                    {/* Results */}
                    {items.slice(0, 10).map(result => (
                      <button
                        key={`${result.module}-${result.id}`}
                        onClick={() => handleNavigate(result)}
                        className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-csa-accent/5 transition-colors cursor-pointer text-left group"
                      >
                        <Icon size={16} className={`${config?.color || 'text-text-muted'} flex-shrink-0`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-text-primary truncate group-hover:text-csa-accent transition-colors">
                            {result.title}
                          </p>
                          {result.subtitle && (
                            <p className="text-xs text-text-muted truncate">{result.subtitle}</p>
                          )}
                        </div>
                        {result.meta && (
                          <span className="text-xs text-text-muted flex-shrink-0">{result.meta}</span>
                        )}
                        <ExternalLink size={12} className="text-text-muted/0 group-hover:text-text-muted/50 transition-colors flex-shrink-0" />
                      </button>
                    ))}
                    {items.length > 10 && (
                      <p className="px-5 py-1.5 text-[10px] text-text-muted">+{items.length - 10} more</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {searched && !loading && results.length > 0 && (
          <div className="px-5 py-2.5 border-t border-border-subtle flex items-center justify-between">
            <span className="text-[10px] text-text-muted">{results.length} result{results.length !== 1 ? 's' : ''} found</span>
            <span className="text-[10px] text-text-muted">Click to navigate</span>
          </div>
        )}
      </motion.div>
    </div>
  );
}
