'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useLibrarySearch, useMyLoans, useBorrowItem, useReturnItem, useRenewLoan } from '@/hooks/use-library';
import { useAuthStore } from '@/stores/auth.store';
import { cn, formatDate, formatNgn } from '@/lib/utils';

const CATEGORIES = ['TEXTBOOK','REFERENCE','JOURNAL','THESIS','NOVEL','PERIODICAL','MULTIMEDIA','OTHER'];
const LOAN_COLORS: Record<string,string> = { ACTIVE:'badge-success', RETURNED:'badge-neutral', OVERDUE:'badge-danger', LOST:'badge-warning' };

export default function LibraryPage() {
  const user = useAuthStore((s) => s.user);
  const [tab, setTab]       = useState<'search'|'loans'>('search');
  const [q, setQ]           = useState('');
  const [cat, setCat]       = useState('');
  const [query, setQuery]   = useState('');
  const [dueDate, setDue]   = useState('');
  const [borrowId, setBorId] = useState('');
  const [err, setErr]       = useState('');
  const [msg, setMsg]       = useState('');
  const [returnResult, setReturn] = useState<{ overdueDays: number; fineAmount: number } | null>(null);

  const { data: searchRes, isLoading } = useLibrarySearch(query || undefined, cat || undefined, 1, { enabled: Boolean(user) });
  const { data: loans = [] }           = useMyLoans({ enabled: Boolean(user) });
  const { mutate: borrow,  isPending: borrowing } = useBorrowItem();
  const { mutate: ret,     isPending: returning } = useReturnItem();
  const { mutate: renew,   isPending: renewing  } = useRenewLoan();

  const items = searchRes?.items ?? [];

  const handleBorrow = (itemId: string) => {
    if (!dueDate) { setErr('Select a due date before borrowing'); return; }
    setErr(''); setMsg('');
    borrow({ libraryItemId: itemId, dueDate }, {
      onSuccess: () => setMsg('✓ Book borrowed successfully'),
      onError:   (e) => setErr(e.message),
    });
  };

  const handleReturn = (loanId: string) => {
    setErr(''); setMsg(''); setReturn(null);
    ret(loanId, {
      onSuccess: (r) => { setReturn(r); setMsg('✓ Book returned'); },
      onError:   (e) => setErr(e.message),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-semibold text-foreground">Library</h2>
        <div className="flex gap-2">
          {[{k:'search',l:'Catalogue'},{k:'loans',l:`My Loans (${loans.length})`}].map((t) => (
            <button key={t.k} onClick={() => setTab(t.k as typeof tab)}
              className={cn('rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                tab===t.k?'bg-[--color-primary] text-white':'bg-muted text-muted-foreground hover:text-foreground')}>
              {t.l}
            </button>
          ))}
        </div>
      </div>

      {err && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-[--color-danger]">{err}</div>}
      {msg && <div role="status" className="rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">{msg}</div>}
      {returnResult && returnResult.overdueDays > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Overdue by {returnResult.overdueDays} day(s). Fine: {formatNgn(returnResult.fineAmount)} — please pay at the library counter.
        </div>
      )}

      {/* ── Catalogue ──────────────────────────────────────────────────── */}
      {tab === 'search' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Input placeholder="Search title, author or ISBN…" value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && setQuery(q)} className="flex-1 min-w-[200px]" />
            <select value={cat} onChange={(e) => setCat(e.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm">
              <option value="">All Categories</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <Button size="sm" onClick={() => setQuery(q)}>Search</Button>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Due Date for borrowing:</label>
            <input type="date" value={dueDate} onChange={(e) => setDue(e.target.value)}
              min={new Date(Date.now() + 86400_000).toISOString().split('T')[0]}
              className="flex h-9 w-48 rounded-md border border-input bg-background px-3 text-sm" />
          </div>

          {isLoading ? <div className="animate-pulse h-48 rounded bg-muted"/> : (
            items.length === 0 ? <p className="text-sm text-muted-foreground">{query ? 'No results found.' : 'Enter a search term above.'}</p> : (
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>{['Accession','Title','Author','Category','Shelf','Available',''].map((h)=>
                      <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">{h}</th>
                    )}</tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td className="px-3 py-2 font-mono text-xs text-[--color-primary]">{item.accessionNo}</td>
                        <td className="px-3 py-2 text-foreground font-medium">{item.title}</td>
                        <td className="px-3 py-2 text-muted-foreground">{item.author ?? '—'}</td>
                        <td className="px-3 py-2 text-muted-foreground text-xs">{item.category}</td>
                        <td className="px-3 py-2 text-muted-foreground text-xs">{item.shelfLocation ?? '—'}</td>
                        <td className="px-3 py-2">
                          <span className={cn('rounded-full px-2 py-0.5 text-xs', item.availableCopies > 0 ? 'badge-success' : 'badge-danger')}>
                            {item.availableCopies}/{item.totalCopies}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {item.availableCopies > 0 && (
                            <Button size="sm" loading={borrowing} onClick={() => handleBorrow(item.id)}>Borrow</Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      )}

      {/* ── My Loans ───────────────────────────────────────────────────── */}
      {tab === 'loans' && (
        <div className="space-y-3">
          {loans.length === 0 ? <p className="text-sm text-muted-foreground">No active loans.</p> : (
            loans.map((loan) => {
              const due  = new Date(loan.dueDate);
              const now  = new Date();
              const days = Math.ceil((due.getTime() - now.getTime()) / 86400_000);
              return (
                <Card key={loan.id} className={cn(loan.status === 'OVERDUE' && 'border-red-300')}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between flex-wrap gap-3">
                      <div>
                        <p className="text-sm font-semibold">{loan.libraryItem?.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Borrowed: {formatDate(loan.borrowedAt)} · Due: {formatDate(loan.dueDate)}
                          {loan.status === 'ACTIVE' && days > 0 && <span className="ml-1 text-[--color-warning]">({days}d left)</span>}
                          {loan.status === 'OVERDUE' && <span className="ml-1 text-[--color-danger]">(overdue)</span>}
                        </p>
                        {parseFloat(loan.fineAmount) > 0 && (
                          <p className="text-xs text-[--color-danger]">Fine: {formatNgn(parseFloat(loan.fineAmount))}</p>
                        )}
                        <p className="text-xs text-muted-foreground">Renewals: {loan.renewalCount}/2</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={cn('rounded-full px-2 py-0.5 text-xs', LOAN_COLORS[loan.status] ?? '')}>{loan.status}</span>
                        {loan.status === 'ACTIVE' && (
                          <>
                            <Button size="sm" loading={returning} onClick={() => handleReturn(loan.id)}>Return</Button>
                            {loan.renewalCount < 2 && (
                              <Button size="sm" variant="outline" loading={renewing} onClick={() => { setErr(''); renew(loan.id, { onError: (e) => setErr(e.message) }); }}>Renew</Button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
