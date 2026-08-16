'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useGlobalSearch } from '@/hooks/use-search';
import { cn } from '@/lib/utils';

const SECTION_ICONS: Record<string, string> = {
  students: '🎓', courses: '📚', staff: '👤', library: '📖',
};

const SECTION_LABELS: Record<string, string> = {
  students: 'Students', courses: 'Courses', staff: 'Staff', library: 'Library Items',
};

function getResultUrl(type: string, id: string): string {
  switch (type) {
    // Detail pages are rendered inside their management dashboards. Preserve
    // the result identifier in query state rather than linking to routes that
    // do not exist in the compiled Next.js app.
    case 'students': return `/dashboard/students?studentId=${encodeURIComponent(id)}`;
    case 'courses':  return `/dashboard/curriculum?panel=courses&courseId=${encodeURIComponent(id)}`;
    case 'staff':    return `/dashboard/hr?staffId=${encodeURIComponent(id)}`;
    case 'library':  return `/dashboard/library?item=${id}`;
    default:         return '#';
  }
}

function getResultTitle(type: string, item: Record<string, string>): string {
  switch (type) {
    case 'students': return `${item['firstName']} ${item['lastName']}`;
    case 'courses':  return `${item['code']} — ${item['title']}`;
    case 'staff':    return `${item['firstName']} ${item['lastName']}`;
    case 'library':  return item['title'] ?? '';
    default:         return '';
  }
}

function getResultSubtitle(type: string, item: Record<string, string>): string {
  switch (type) {
    case 'students': return `${item['matricNo']} · ${item['programme']} · Level ${item['level']} · CGPA ${item['cgpa']}`;
    case 'courses':  return `${item['creditUnits']} units · ${item['department']}`;
    case 'staff':    return `${item['jobTitle']} · ${item['department']}`;
    case 'library':  return `${item['author'] ?? 'Unknown author'} · ${item['availableCopies']} available`;
    default:         return '';
  }
}

interface GlobalSearchProps {
  className?: string;
}

export function GlobalSearch({ className }: GlobalSearchProps) {
  const router        = useRouter();
  const inputRef      = useRef<HTMLInputElement>(null);
  const containerRef  = useRef<HTMLDivElement>(null);
  const [open, setOpen]       = useState(false);
  const [query, setQuery]     = useState('');
  const [cursor, setCursor]   = useState(-1);

  const { data: results, isFetching } = useGlobalSearch(query);

  // ── Keyboard shortcut: ⌘K / Ctrl+K ──────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
        if (!open) inputRef.current?.focus();
      }
      if (e.key === 'Escape') { setOpen(false); setQuery(''); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  // ── Click outside to close ────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Build flat list of all results for keyboard navigation
  const allResults = results
    ? (Object.entries(results) as [string, Record<string,string>[]][])
        .flatMap(([type, items]) => items.map((item) => ({ type, item })))
    : [];

  // ── Arrow key + Enter navigation ─────────────────────────────────────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, allResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, -1));
    } else if (e.key === 'Enter' && cursor >= 0) {
      const target = allResults[cursor];
      if (target) {
        router.push(getResultUrl(target.type, target.item['id'] ?? ''));
        setOpen(false); setQuery(''); setCursor(-1);
      }
    }
  }, [open, cursor, allResults, router]);

  const handleSelect = (type: string, item: Record<string, string>) => {
    router.push(getResultUrl(type, item['id'] ?? ''));
    setOpen(false); setQuery(''); setCursor(-1);
  };

  const hasResults = allResults.length > 0;
  const showDropdown = open && query.length >= 2;

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Trigger button */}
      <button
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
        className={cn(
          'flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2',
          'text-sm text-muted-foreground transition-colors hover:border-[--color-primary]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-primary]',
          'w-full sm:w-64',
        )}
        aria-label="Open global search"
      >
        <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 1 0 6.5 6.5a7.5 7.5 0 0 0 10.6 10.6Z" />
        </svg>
        <span className="flex-1 text-left">Search…</span>
        <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono sm:inline">
          ⌘K
        </kbd>
      </button>

      {/* Search modal overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4"
          style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="w-full max-w-xl rounded-xl border border-border bg-background shadow-xl overflow-hidden">

            {/* Input row */}
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              {isFetching ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-[--color-primary] border-t-transparent" />
              ) : (
                <svg className="h-4 w-4 text-muted-foreground shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 1 0 6.5 6.5a7.5 7.5 0 0 0 10.6 10.6Z" />
                </svg>
              )}
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setCursor(-1); }}
                onKeyDown={handleKeyDown}
                placeholder="Search students, courses, staff, library…"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                autoComplete="off"
                aria-label="Search input"
                aria-expanded={showDropdown}
                aria-autocomplete="list"
              />
              <button onClick={() => { setOpen(false); setQuery(''); }}
                className="rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
                Esc
              </button>
            </div>

            {/* Results */}
            <div className="max-h-[28rem] overflow-y-auto p-2" role="listbox">
              {query.length < 2 && (
                <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                  Type at least 2 characters to search
                </p>
              )}

              {query.length >= 2 && !hasResults && !isFetching && (
                <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                  No results found for &ldquo;{query}&rdquo;
                </p>
              )}

              {results && hasResults && (
                (() => {
                  let globalIdx = -1;
                  return (
                    <div className="space-y-1">
                      {(Object.entries(results) as [string, Record<string,string>[]][]).map(([type, items]) => {
                        if (!items || items.length === 0) return null;
                        return (
                          <div key={type}>
                            <p className="mb-1 mt-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              {SECTION_ICONS[type]} {SECTION_LABELS[type] ?? type}
                            </p>
                            {items.map((item) => {
                              globalIdx++;
                              const idx   = globalIdx;
                              const isActive = cursor === idx;
                              return (
                                <button
                                  key={item['id']}
                                  role="option"
                                  aria-selected={isActive}
                                  onClick={() => handleSelect(type, item)}
                                  onMouseEnter={() => setCursor(idx)}
                                  className={cn(
                                    'w-full rounded-md px-3 py-2 text-left transition-colors',
                                    isActive
                                      ? 'bg-[--color-primary] text-white'
                                      : 'hover:bg-muted',
                                  )}
                                >
                                  <p className={cn('text-sm font-medium truncate',
                                    isActive ? 'text-white' : 'text-foreground')}>
                                    {getResultTitle(type, item)}
                                  </p>
                                  <p className={cn('text-xs truncate',
                                    isActive ? 'text-white/80' : 'text-muted-foreground')}>
                                    {getResultSubtitle(type, item)}
                                  </p>
                                </button>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-border px-4 py-2 flex gap-4 text-[10px] text-muted-foreground">
              <span>↑↓ Navigate</span>
              <span>↵ Select</span>
              <span>Esc Close</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
