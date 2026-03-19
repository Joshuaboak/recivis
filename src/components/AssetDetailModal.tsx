/**
 * AssetDetailModal — Full asset and licence key detail overlay.
 *
 * Shows two sections:
 * 1. Asset info from Zoho CRM: product, status, dates, quantity, upgrade chain
 * 2. QLM licence key details: licence model, version, seats, activations,
 *    registered user, computer name, creation date, subscription expiry
 *
 * Admin/IBM actions:
 * - Edit renewal date (with auto-reactivation if new date is in the future)
 * - Deactivate licence (release activation via QLM for device transfer)
 *
 * Data: Fetches full asset from /api/assets?id=... and QLM details from
 * POST /api/assets with assetId. Licence release via PUT /api/assets.
 *
 * Closes on Escape key or backdrop click.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Package, Loader2, Key, AlertCircle, Calendar, User, Shield, Monitor, Pencil, Save, ShieldOff } from 'lucide-react';
import { useAppStore } from '@/lib/store';

interface AssetDetailModalProps {
  assetId: string;
  assetData: Record<string, unknown>;
  onClose: () => void;
  onAssetUpdated?: () => void;
}

export default function AssetDetailModal({ assetId, assetData, onClose, onAssetUpdated }: AssetDetailModalProps) {
  const { user } = useAppStore();
  const [asset, setAsset] = useState<Record<string, unknown> | null>(null);
  const [keyDetails, setKeyDetails] = useState<Record<string, string> | null>(null);
  const [activationError, setActivationError] = useState<string | null>(null);
  const [loadingAsset, setLoadingAsset] = useState(true);
  const [loadingKey, setLoadingKey] = useState(true);

  // Edit state
  const isEditor = user?.role === 'admin' || user?.role === 'ibm';
  const [editingDate, setEditingDate] = useState(false);
  const [editRenewalDate, setEditRenewalDate] = useState('');
  const [savingDate, setSavingDate] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [deactivateMessage, setDeactivateMessage] = useState<string | null>(null);
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  /** Close the modal when the Escape key is pressed. */
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const loadData = useCallback(() => {
    setLoadingAsset(true);
    setLoadingKey(true);

    fetch(`/api/assets?id=${assetId}`)
      .then(res => res.json())
      .then(data => setAsset(data.asset))
      .catch(() => setAsset(assetData))
      .finally(() => setLoadingAsset(false));

    fetch('/api/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assetId }),
    })
      .then(res => res.json())
      .then(data => {
        setKeyDetails(data.keyDetails);
        setActivationError(data.activationError);
      })
      .catch(() => setActivationError('Failed to load key details'))
      .finally(() => setLoadingKey(false));
  }, [assetId, assetData]);

  useEffect(() => { loadData(); }, [loadData, refreshKey]);

  const record = asset || assetData;
  const product = record.Product as { name?: string } | null;
  const upgradedTo = record.Upgraded_To_Key as string | null;
  const upgradedFrom = record.Upgraded_From as { name?: string } | string | null;

  const formatDate = (d: unknown) => {
    if (!d || typeof d !== 'string') return '\u2014';
    const date = new Date(d);
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
  };

  const formatDateTime = (d: string | undefined) => {
    if (!d) return '\u2014';
    try {
      const date = new Date(d);
      return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    } catch { return d; }
  };

  const startEditDate = () => {
    setEditRenewalDate(record.Renewal_Date as string || '');
    setEditingDate(true);
  };

  const saveRenewalDate = async () => {
    if (!editRenewalDate) return;
    setSavingDate(true);

    const body: Record<string, unknown> = {
      assetId,
      Renewal_Date: editRenewalDate,
    };

    // If new date is after today, set status to Active
    if (new Date(editRenewalDate) > new Date()) {
      body.Status = 'Active';
    }

    try {
      const res = await fetch('/api/assets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setEditingDate(false);
        setRefreshKey(k => k + 1);
        onAssetUpdated?.();
      }
    } catch { /* handled */ }
    setSavingDate(false);
  };

  const deactivateLicence = async () => {
    setDeactivating(true);
    setDeactivateMessage(null);
    try {
      const res = await fetch('/api/assets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId }),
      });
      const data = await res.json();
      setDeactivateMessage(data.message || 'Licence released');
      // Refresh key details after deactivation
      setRefreshKey(k => k + 1);
    } catch {
      setDeactivateMessage('Failed to deactivate licence');
    }
    setDeactivating(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-csa-dark border-2 border-border rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle flex-shrink-0">
          <div className="flex items-center gap-3">
            <Package size={20} className="text-success" />
            <div>
              <h3 className="text-base font-bold text-text-primary">{product?.name || record.Name as string || 'Asset'}</h3>
              {record.Serial_Key ? (
                <p className="text-xs text-text-muted font-mono mt-0.5">{record.Serial_Key as string}</p>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isEditor && keyDetails ? (
              <button
                onClick={() => setShowDeactivateConfirm(true)}
                disabled={deactivating}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-error bg-error/10 border border-error/30 rounded-xl hover:bg-error/20 transition-colors cursor-pointer disabled:opacity-50"
              >
                {deactivating ? <Loader2 size={13} className="animate-spin" /> : <ShieldOff size={13} />}
                {deactivating ? 'Releasing...' : 'Deactivate Licence'}
              </button>
            ) : null}
            <button onClick={onClose} className="p-1.5 text-text-muted hover:text-text-primary transition-colors cursor-pointer">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loadingAsset ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="text-csa-accent animate-spin" />
            </div>
          ) : (
            <>
              {/* Asset Info Grid */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                <DetailField label="Status" value={
                  <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-md ${
                    record.Status === 'Active' ? 'bg-success/20 text-success' : 'bg-text-muted/20 text-text-muted'
                  }`}>{record.Status as string}</span>
                } />
                <DetailField label="Quantity" value={String(record.Quantity || 1)} />
                <DetailField label="Start Date" value={formatDate(record.Start_Date)} />

                {/* Renewal Date — editable for admin/ibm */}
                <div>
                  <div className="flex items-center gap-1 text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-0.5">
                    <Calendar size={12} />
                    Renewal Date
                    {isEditor && !editingDate ? (
                      <button onClick={startEditDate} className="ml-1 text-csa-accent hover:text-csa-highlight transition-colors cursor-pointer">
                        <Pencil size={10} />
                      </button>
                    ) : null}
                  </div>
                  {editingDate ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={editRenewalDate}
                        onChange={(e) => setEditRenewalDate(e.target.value)}
                        className="bg-surface border border-csa-accent/50 rounded-lg px-2 py-1 text-sm text-text-primary outline-none focus:border-csa-accent"
                      />
                      <button
                        onClick={saveRenewalDate}
                        disabled={savingDate}
                        className="p-1 text-success hover:text-success/80 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {savingDate ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                      </button>
                      <button
                        onClick={() => setEditingDate(false)}
                        className="p-1 text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="text-sm text-text-primary">{formatDate(record.Renewal_Date)}</div>
                  )}
                </div>

                <DetailField label="Upgraded To" value={upgradedTo || '\u2014'} />
                <DetailField label="Upgraded From" value={
                  typeof upgradedFrom === 'object' && upgradedFrom !== null
                    ? upgradedFrom.name || '\u2014'
                    : (upgradedFrom as string) || '\u2014'
                } />
              </div>

              {/* Deactivation message */}
              {deactivateMessage ? (
                <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 mb-4 ${
                  deactivateMessage.toLowerCase().includes('error') || deactivateMessage.toLowerCase().includes('warning')
                    ? 'text-warning bg-warning/10 border border-warning/20'
                    : 'text-success bg-success/10 border border-success/20'
                }`}>
                  <AlertCircle size={14} />
                  {deactivateMessage}
                </div>
              ) : null}

              {/* QLM Key Details */}
              <div className="border-t border-border-subtle pt-5">
                <h4 className="text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
                  <Key size={16} className="text-csa-accent" />
                  Licence Key Details
                </h4>

                {loadingKey ? (
                  <div className="flex items-center justify-center py-6 gap-2">
                    <Loader2 size={16} className="text-csa-accent animate-spin" />
                    <span className="text-xs text-text-muted">Loading from QLM...</span>
                  </div>
                ) : keyDetails ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <DetailField label="Licence Model" value={keyDetails.LicenseModel} icon={<Shield size={12} />} />
                      <DetailField label="Version Activated" value={`${keyDetails.ProductName} v${keyDetails.MajorVersion}.${keyDetails.MinorVersion}`} icon={<Package size={12} />} />
                      <DetailField label="Available Seats" value={keyDetails.AvailableLicenses} icon={<Monitor size={12} />} />
                      <DetailField label="Activations" value={keyDetails.ActivationCount} />
                      <DetailField label="Created" value={formatDateTime(keyDetails.CreationDate)} icon={<Calendar size={12} />} />
                      {keyDetails.SubscriptionExpiryDate ? (
                        <DetailField label="Subscription Expiry" value={formatDateTime(keyDetails.SubscriptionExpiryDate)} icon={<Calendar size={12} />} />
                      ) : null}
                      <DetailField label="Computer Name" value={keyDetails.ComputerName || '\u2014'} icon={<Monitor size={12} />} />
                      {keyDetails.LicenseModel?.toLowerCase() === 'on_premise' || keyDetails.LicenseModel?.toLowerCase() === 'on premise' ? (
                        <DetailField label="Path" value={keyDetails.ComputerKey || keyDetails.Path || '\u2014'} />
                      ) : null}
                    </div>

                    {/* Registered To */}
                    <div className="bg-surface rounded-xl p-3 border border-border-subtle">
                      <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">Registered To</div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex items-center gap-1.5 text-sm text-text-primary">
                          <User size={12} className="text-text-muted" />
                          {keyDetails.FullName || '\u2014'}
                        </div>
                        <div className="text-sm text-text-secondary">{keyDetails.Email || '\u2014'}</div>
                      </div>
                    </div>

                    {keyDetails.CreatedByAffiliate ? (
                      <div className="text-xs text-text-muted">
                        Created by: {keyDetails.CreatedByAffiliate}
                      </div>
                    ) : null}

                    {activationError ? (
                      <div className="flex items-center gap-2 text-xs text-warning bg-warning/10 border border-warning/20 rounded-lg px-3 py-2">
                        <AlertCircle size={14} />
                        {activationError}
                      </div>
                    ) : null}
                  </div>
                ) : activationError ? (
                  <div className="flex items-center gap-2 text-xs text-warning bg-warning/10 border border-warning/20 rounded-lg px-3 py-2">
                    <AlertCircle size={14} />
                    {activationError}
                  </div>
                ) : (
                  <p className="text-sm text-text-muted py-4">No key details available</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Deactivate Confirmation */}
      {showDeactivateConfirm ? (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4" onClick={() => setShowDeactivateConfirm(false)}>
          <div className="bg-csa-dark border-2 border-error/30 rounded-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <ShieldOff size={20} className="text-error" />
              <h4 className="text-base font-bold text-text-primary">Deactivate Licence</h4>
            </div>
            <p className="text-sm text-text-secondary mb-5">
              Deactivating will remove and disable the existing activation and allow activation on another device.
            </p>
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => setShowDeactivateConfirm(false)}
                className="px-4 py-2 text-xs font-semibold text-text-muted bg-surface-raised border border-border-subtle rounded-xl hover:bg-surface-overlay transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowDeactivateConfirm(false); deactivateLicence(); }}
                className="px-4 py-2 text-xs font-semibold text-white bg-error border border-error rounded-xl hover:bg-error/80 transition-colors cursor-pointer"
              >
                Deactivate
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DetailField({ label, value, icon }: { label: string; value: string | React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-0.5">
        {icon}
        {label}
      </div>
      <div className="text-sm text-text-primary">{value || '\u2014'}</div>
    </div>
  );
}
