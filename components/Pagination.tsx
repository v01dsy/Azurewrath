// components/Pagination.tsx
'use client';

import { useState, useRef } from 'react';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems?: number;
  pageSize?: number;
  className?: string;
}

export default function Pagination({
  page,
  totalPages,
  onPageChange,
  totalItems,
  pageSize,
  className = '',
}: PaginationProps) {
  const [jumpValue, setJumpValue] = useState('');
  const [showJump, setShowJump] = useState<'left' | 'right' | null>(null);
  const jumpRef = useRef<HTMLInputElement>(null);

  if (totalPages <= 1) return null;

  // Build page number array with ellipsis markers
  const getPages = (): (number | 'ellipsis-left' | 'ellipsis-right')[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);

    const pages: (number | 'ellipsis-left' | 'ellipsis-right')[] = [1];

    const leftEdge = Math.max(2, page - 2);
    const rightEdge = Math.min(totalPages - 1, page + 2);

    if (leftEdge > 2) pages.push('ellipsis-left');
    for (let i = leftEdge; i <= rightEdge; i++) pages.push(i);
    if (rightEdge < totalPages - 1) pages.push('ellipsis-right');

    pages.push(totalPages);
    return pages;
  };

  const handleJumpSubmit = (side: 'left' | 'right') => {
    const n = parseInt(jumpValue, 10);
    if (!isNaN(n) && n >= 1 && n <= totalPages) {
      onPageChange(n);
    }
    setShowJump(null);
    setJumpValue('');
  };

  const handleEllipsisClick = (side: 'left' | 'right') => {
    setShowJump(side);
    setJumpValue('');
    setTimeout(() => jumpRef.current?.focus(), 0);
  };

  const rangeStart = totalItems && pageSize ? (page - 1) * pageSize + 1 : null;
  const rangeEnd = totalItems && pageSize ? Math.min(page * pageSize, totalItems) : null;

  return (
    <div className={`flex items-center justify-between gap-4 ${className}`}>
      {/* Range label */}
      {rangeStart !== null && rangeEnd !== null && totalItems !== undefined ? (
        <span className="text-xs text-slate-500 shrink-0">
          {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()} of {totalItems.toLocaleString()}
        </span>
      ) : (
        <span />
      )}

      {/* Controls */}
      <div className="flex items-center gap-1">
        {/* Prev */}
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className="w-8 h-8 flex items-center justify-center rounded-md bg-slate-700/50 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition text-slate-300 text-sm"
        >
          ←
        </button>

        {getPages().map((p, i) => {
          if (p === 'ellipsis-left' || p === 'ellipsis-right') {
            const side = p === 'ellipsis-left' ? 'left' : 'right';
            return showJump === side ? (
              <input
                key={p}
                ref={jumpRef}
                type="number"
                min={1}
                max={totalPages}
                value={jumpValue}
                onChange={e => setJumpValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleJumpSubmit(side);
                  if (e.key === 'Escape') { setShowJump(null); setJumpValue(''); }
                }}
                onBlur={() => { setShowJump(null); setJumpValue(''); }}
                placeholder="pg"
                className="w-12 h-8 text-center text-xs rounded-md bg-slate-600 border border-purple-500/50 text-white outline-none focus:border-purple-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            ) : (
              <button
                key={p}
                onClick={() => handleEllipsisClick(side)}
                title="Click to jump to page"
                className="w-8 h-8 flex items-center justify-center rounded-md bg-slate-700/50 hover:bg-slate-700 text-slate-400 hover:text-white transition text-sm font-medium"
              >
                …
              </button>
            );
          }

          return (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`w-8 h-8 flex items-center justify-center rounded-md text-xs font-medium transition ${
                p === page
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/40'
                  : 'bg-slate-700/50 hover:bg-slate-700 text-slate-400 hover:text-white'
              }`}
            >
              {p}
            </button>
          );
        })}

        {/* Next */}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          className="w-8 h-8 flex items-center justify-center rounded-md bg-slate-700/50 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition text-slate-300 text-sm"
        >
          →
        </button>
      </div>
    </div>
  );
}