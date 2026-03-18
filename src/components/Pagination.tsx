'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({ currentPage, totalItems, pageSize, onPageChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalItems <= pageSize) return null;

  const start = ((currentPage - 1) * pageSize) + 1;
  const end = Math.min(currentPage * pageSize, totalItems);

  // Build visible page numbers: 1 ... [current-1, current, current+1] ... last
  const pages: (number | 'ellipsis')[] = [];
  const addPage = (p: number) => { if (!pages.includes(p)) pages.push(p); };

  addPage(1);
  if (currentPage > 3) pages.push('ellipsis');
  for (let p = Math.max(2, currentPage - 1); p <= Math.min(totalPages - 1, currentPage + 1); p++) {
    addPage(p);
  }
  if (currentPage < totalPages - 2) pages.push('ellipsis');
  if (totalPages > 1) addPage(totalPages);

  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-text-muted tabular-nums">
        {start}&ndash;{end} of {totalItems}
      </span>
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-raised disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft size={16} />
        </button>
        {pages.map((p, i) =>
          p === 'ellipsis' ? (
            <span key={`e${i}`} className="w-8 text-center text-xs text-text-muted select-none">&hellip;</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`min-w-[2rem] h-8 px-1.5 rounded-lg text-xs font-semibold transition-colors ${
                p === currentPage
                  ? 'bg-csa-accent text-white'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-raised'
              }`}
            >
              {p}
            </button>
          )
        )}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-raised disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
