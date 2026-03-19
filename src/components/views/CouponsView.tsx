/**
 * CouponsView — Browse and search discount coupons.
 *
 * Features:
 * - Paginated coupon list (20 per page)
 * - Search by coupon code or name
 * - Status filter (Active / Draft / Expired)
 * - Shows discount value, validity period, remaining uses, and allowed products
 * - "Create Coupon" button (admin/ibm only)
 * - Click any row to navigate to CouponDetailView
 *
 * Data: Fetches from /api/coupons which returns all coupons (Redis-cached).
 * All filtering and search are client-side.
 */

'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Ticket, Loader2, Plus, Search, ChevronDown, Percent, DollarSign } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import Pagination from '../Pagination';

interface Coupon {
  id: string;
  Name: string;
  Coupon_Name: string;
  Status: string;
  Discount_Type: string;
  Discount_Percentage: number;
  Discount_Amount: number;
  Currency: string;
  Coupon_Start_Date: string;
  Coupon_End_Date: string;
  Remaining_Uses: number;
  Total_Usage_Allowance: number;
  Regions: string;
  Allowed_Products: string;
}

export default function CouponsView() {
  const { user, setCurrentView, setSelectedCouponId } = useAppStore();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  const isAdmin = user?.role === 'admin' || user?.role === 'ibm';

  useEffect(() => {
    setLoading(true);
    fetch('/api/coupons')
      .then(res => res.json())
      .then(data => setCoupons(data.coupons || []))
      .catch(() => setCoupons([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let result = [...coupons];
    if (statusFilter) result = result.filter(c => c.Status === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(c =>
        (c.Name || '').toLowerCase().includes(q) ||
        (c.Coupon_Name || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [coupons, statusFilter, search]);

  const safePage = Math.min(currentPage, Math.max(1, Math.ceil(filtered.length / pageSize)));
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => { setCurrentPage(1); }, [statusFilter, search]);

  const formatDate = (d: string) => {
    if (!d) return '\u2014';
    const date = new Date(d);
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
  };

  const openCoupon = (id: string) => {
    setSelectedCouponId(id);
    setCurrentView('coupon-detail');
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-text-primary">Coupons</h1>
            {isAdmin ? (
              <button
                onClick={() => setCurrentView('create-coupon')}
                className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-csa-accent bg-csa-accent/10 border border-csa-accent/30 rounded-xl hover:bg-csa-accent/20 transition-colors cursor-pointer"
              >
                <Plus size={14} />
                Create Coupon
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[220px] relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by code or name..."
                className="w-full bg-surface border-2 border-border-subtle pl-10 pr-4 py-2.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-xl"
              />
            </div>
            <div className="relative min-w-[130px]">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="w-full bg-surface border-2 border-border-subtle px-4 py-2.5 text-sm text-text-primary outline-none focus:border-csa-accent rounded-xl appearance-none cursor-pointer pr-10"
              >
                <option value="">All Status</option>
                <option value="Active">Active</option>
                <option value="Draft">Draft</option>
                <option value="Expired">Expired</option>
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            </div>
          </div>
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 size={24} className="text-csa-accent animate-spin" />
            <span className="text-xs text-text-muted">Loading coupons...</span>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <>
            <div className="mb-3">
              <Pagination currentPage={safePage} totalItems={filtered.length} pageSize={pageSize} onPageChange={setCurrentPage} />
            </div>
            <div className="border border-border-subtle rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-surface-raised">
                    <th>Code</th>
                    <th>Name</th>
                    <th>Discount</th>
                    <th>Status</th>
                    <th>Valid</th>
                    <th>Uses</th>
                    <th>Products</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(c => (
                    <motion.tr
                      key={c.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      onClick={() => openCoupon(c.id)}
                      className="cursor-pointer hover:bg-csa-accent/5 transition-colors"
                    >
                      <td className="font-semibold text-csa-accent font-mono">{c.Name}</td>
                      <td className="text-text-primary">{c.Coupon_Name || '\u2014'}</td>
                      <td className="text-text-primary whitespace-nowrap">
                        {c.Discount_Type === 'Percentage Based' ? (
                          <span className="font-semibold">{c.Discount_Percentage}%</span>
                        ) : c.Discount_Type === 'Fixed Amount' ? (
                          <span className="font-semibold">{c.Currency === 'EUR' ? '\u20AC' : c.Currency === 'GBP' ? '\u00A3' : '$'}{c.Discount_Amount?.toFixed(2)}</span>
                        ) : '\u2014'}
                      </td>
                      <td>
                        <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-md ${
                          c.Status === 'Active' ? 'bg-success/20 text-success'
                            : c.Status === 'Draft' ? 'bg-warning/20 text-warning'
                            : 'bg-text-muted/20 text-text-muted'
                        }`}>{c.Status || '\u2014'}</span>
                      </td>
                      <td className="text-text-secondary text-sm whitespace-nowrap">
                        {formatDate(c.Coupon_Start_Date)} &ndash; {formatDate(c.Coupon_End_Date)}
                      </td>
                      <td className="text-text-secondary">
                        {c.Remaining_Uses != null ? `${c.Remaining_Uses}/${c.Total_Usage_Allowance}` : '\u2014'}
                      </td>
                      <td className="text-text-muted text-xs">{Array.isArray(c.Allowed_Products) ? c.Allowed_Products.join(', ') : c.Allowed_Products || 'All'}</td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-16">
            <Ticket size={32} className="text-text-muted mx-auto mb-3" />
            <p className="text-sm text-text-muted">
              {search ? `No coupons matching "${search}"` : 'No coupons found'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
