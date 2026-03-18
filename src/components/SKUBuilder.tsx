'use client';

import { useState, useEffect } from 'react';
import { X, Loader2, Check, Package } from 'lucide-react';

interface SKUBuilderProps {
  region: string;
  onSelect: (product: { id: string; name: string; sku: string; unitPrice: number }) => void;
  onCancel: () => void;
}

const PRODUCTS = [
  { label: 'Civil Site Design', code: 'CSD' },
  { label: 'Civil Site Design Plus', code: 'CSP' },
  { label: 'Stringer', code: 'STR' },
  { label: 'Corridor EZ', code: 'CEZ' },
];

const USER_TYPES = [
  { label: 'Single User', code: 'SU' },
  { label: 'Multi User', code: 'MU' },
];

const LICENSING: Record<string, { label: string; code: string }[]> = {
  SU: [
    { label: 'Cloud', code: 'CL' },
    { label: 'Computer Bound', code: 'CB' },
  ],
  MU: [
    { label: 'Cloud', code: 'CL' },
    { label: 'On Premise', code: 'OP' },
  ],
};

const MODELS = [
  { label: 'Perpetual', code: 'INF' },
  { label: 'Subscription', code: 'SUB' },
];

// Region code mapping for SKUs
const REGION_MAP: Record<string, string> = {
  AU: 'ANZ', NZ: 'ANZ', AF: 'AF', AS: 'AS', EU: 'EU', NA: 'NA', WW: 'WW',
};

export default function SKUBuilder({ region, onSelect, onCancel }: SKUBuilderProps) {
  const [step, setStep] = useState(1);
  const [product, setProduct] = useState('');
  const [userType, setUserType] = useState('');
  const [licensing, setLicensing] = useState('');
  const [model, setModel] = useState('');
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [version, setVersion] = useState('');

  // Fetch latest product version for CSP
  useEffect(() => {
    fetch('/api/invoices') // We'll use a simpler approach
      .catch(() => {});
    // Fetch org variables to get Latest_Product_Version
    // For now we'll hardcode or fetch later
  }, []);

  const skuRegion = REGION_MAP[region] || region;

  const buildSKU = () => {
    if (product === 'CSP') {
      const ver = version || '26'; // Default to latest
      return `CSP-${ver}-SU-CB-COM-1YR-${model}-${skuRegion}`;
    }
    return `${product}-${userType}-${licensing}-COM-1YR-${model}-${skuRegion}`;
  };

  const selectProduct = (code: string) => {
    setProduct(code);
    setError('');
    if (code === 'CSP') {
      setUserType('SU');
      setLicensing('CB');
      setStep(4); // Skip to model
    } else {
      setStep(2);
    }
  };

  const selectUserType = (code: string) => {
    setUserType(code);
    setError('');
    setStep(3);
  };

  const selectLicensing = (code: string) => {
    setLicensing(code);
    setError('');
    setStep(4);
  };

  const selectModel = async (code: string) => {
    setModel(code);
    setError('');
    setSearching(true);

    // Build SKU and search
    let sku: string;
    if (product === 'CSP') {
      const ver = version || '26';
      sku = `CSP-${ver}-SU-CB-COM-1YR-${code}-${skuRegion}`;
    } else {
      sku = `${product}-${userType}-${licensing}-COM-1YR-${code}-${skuRegion}`;
    }

    try {
      const res = await fetch(`/api/products?sku=${encodeURIComponent(sku)}`);
      const data = await res.json();
      if (data.products && data.products.length > 0) {
        const p = data.products[0];
        onSelect({
          id: p.id as string,
          name: p.Product_Name as string,
          sku: p.Product_Code as string,
          unitPrice: p.Unit_Price as number,
        });
      } else {
        setError(`No product found for SKU: ${sku}`);
        setSearching(false);
      }
    } catch {
      setError('Failed to search products');
      setSearching(false);
    }
  };

  const goBack = () => {
    setError('');
    if (step === 4 && product === 'CSP') {
      setStep(1);
      setProduct('');
    } else if (step > 1) {
      setStep(step - 1);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-csa-dark border-2 border-border rounded-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <Package size={18} className="text-csa-accent" />
            <h3 className="text-base font-bold text-text-primary">Select Product</h3>
          </div>
          <button onClick={onCancel} className="p-1 text-text-muted hover:text-text-primary transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {/* Steps indicator */}
        <div className="px-5 pt-4 pb-2">
          <div className="flex items-center gap-2 text-xs text-text-muted">
            {['Product', product === 'CSP' ? null : 'User Type', product === 'CSP' ? null : 'Licensing', 'Model']
              .filter(Boolean)
              .map((label, i) => (
                <span key={i} className={`flex items-center gap-1 ${i + 1 <= step ? 'text-csa-accent' : ''}`}>
                  {i > 0 && <span className="text-border-subtle">/</span>}
                  {label}
                </span>
              ))}
          </div>
        </div>

        {/* Content */}
        <div className="px-5 py-4 space-y-2">
          {searching ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <Loader2 size={24} className="text-csa-accent animate-spin" />
              <span className="text-xs text-text-muted">Searching products...</span>
            </div>
          ) : error ? (
            <div className="py-4">
              <p className="text-sm text-error mb-3">{error}</p>
              <button onClick={goBack} className="text-xs text-csa-accent hover:text-csa-highlight cursor-pointer">Try different options</button>
            </div>
          ) : step === 1 ? (
            PRODUCTS.map(p => (
              <OptionButton key={p.code} label={p.label} sublabel={p.code} onClick={() => selectProduct(p.code)} />
            ))
          ) : step === 2 ? (
            USER_TYPES.map(u => (
              <OptionButton key={u.code} label={u.label} sublabel={u.code} onClick={() => selectUserType(u.code)} />
            ))
          ) : step === 3 ? (
            (LICENSING[userType] || []).map(l => (
              <OptionButton key={l.code} label={l.label} sublabel={l.code} onClick={() => selectLicensing(l.code)} />
            ))
          ) : step === 4 ? (
            MODELS.map(m => (
              <OptionButton key={m.code} label={m.label} sublabel={m.code} onClick={() => selectModel(m.code)} />
            ))
          ) : null}
        </div>

        {/* Footer */}
        {step > 1 && !searching && !error ? (
          <div className="px-5 py-3 border-t border-border-subtle">
            <button onClick={goBack} className="text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer">
              &larr; Back
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function OptionButton({ label, sublabel, onClick }: { label: string; sublabel: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-4 py-3 bg-surface border border-border-subtle rounded-xl hover:border-csa-accent/50 hover:bg-surface-raised transition-colors cursor-pointer group"
    >
      <span className="text-sm font-semibold text-text-primary group-hover:text-csa-accent transition-colors">{label}</span>
      <span className="text-xs text-text-muted font-mono">{sublabel}</span>
    </button>
  );
}
