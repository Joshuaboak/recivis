'use client';

import { useState, useEffect } from 'react';
import { X, Package, Loader2, Key, AlertCircle, Calendar, Hash, User, Shield, Monitor } from 'lucide-react';

interface AssetDetailModalProps {
  assetId: string;
  assetData: Record<string, unknown>;
  onClose: () => void;
}

export default function AssetDetailModal({ assetId, assetData, onClose }: AssetDetailModalProps) {
  const [asset, setAsset] = useState<Record<string, unknown> | null>(null);
  const [keyDetails, setKeyDetails] = useState<Record<string, string> | null>(null);
  const [activationError, setActivationError] = useState<string | null>(null);
  const [loadingAsset, setLoadingAsset] = useState(true);
  const [loadingKey, setLoadingKey] = useState(true);

  // Fetch full asset record and key details in parallel
  useEffect(() => {
    // Fetch full asset record
    fetch(`/api/assets?id=${assetId}`)
      .then(res => res.json())
      .then(data => setAsset(data.asset))
      .catch(() => setAsset(assetData))
      .finally(() => setLoadingAsset(false));

    // Fetch QLM key details
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
          <button onClick={onClose} className="p-1.5 text-text-muted hover:text-text-primary transition-colors cursor-pointer">
            <X size={18} />
          </button>
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
                <DetailField label="Renewal Date" value={formatDate(record.Renewal_Date)} />
                <DetailField label="Upgraded To" value={upgradedTo || '\u2014'} />
                <DetailField label="Upgraded From" value={
                  typeof upgradedFrom === 'object' && upgradedFrom !== null
                    ? upgradedFrom.name || '\u2014'
                    : (upgradedFrom as string) || '\u2014'
                } />
              </div>

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
                    {/* Key Info */}
                    <div className="grid grid-cols-2 gap-3">
                      <DetailField label="Licence ID" value={keyDetails.LicenseID} icon={<Hash size={12} />} />
                      <DetailField label="Licence Model" value={keyDetails.LicenseModel} icon={<Shield size={12} />} />
                      <DetailField label="Product" value={`${keyDetails.ProductName} v${keyDetails.MajorVersion}.${keyDetails.MinorVersion}`} icon={<Package size={12} />} />
                      <DetailField label="Order Status" value={keyDetails.OrderStatus} />
                      <DetailField label="Seats" value={`${keyDetails.AvailableLicenses} / ${keyDetails.NumLicenses}`} icon={<Monitor size={12} />} />
                      <DetailField label="Activations" value={keyDetails.ActivationCount} />
                      <DetailField label="Created" value={formatDateTime(keyDetails.CreationDate)} icon={<Calendar size={12} />} />
                      <DetailField label="Maintenance Expiry" value={formatDateTime(keyDetails.MaintenanceRenewalDate)} icon={<Calendar size={12} />} />
                      {keyDetails.SubscriptionExpiryDate !== keyDetails.MaintenanceRenewalDate ? (
                        <DetailField label="Subscription Expiry" value={formatDateTime(keyDetails.SubscriptionExpiryDate)} icon={<Calendar size={12} />} />
                      ) : null}
                      <DetailField label="Disabled" value={keyDetails.Disabled === 'true' ? 'Yes' : 'No'} />
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

                    {/* Affiliate */}
                    {keyDetails.CreatedByAffiliate ? (
                      <div className="text-xs text-text-muted">
                        Created by: {keyDetails.CreatedByAffiliate}
                      </div>
                    ) : null}

                    {/* Activation Error */}
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
