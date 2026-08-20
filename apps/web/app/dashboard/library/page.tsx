'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useLibrarySearch, useMyLoans, useOverdueLoans, useBorrowItem, useReturnItem, useRenewLoan, useCreateLibraryItem } from '@/hooks/use-library';
import { useAuthStore } from '@/stores/auth.store';
import { cn, formatDate, formatNgn } from '@/lib/utils';
import { hasEffectiveRole, hasEffectiveScope } from '@/lib/authz';

const CATEGORIES = ['TEXTBOOK','REFERENCE','JOURNAL','THESIS','NOVEL','PERIODICAL','MULTIMEDIA','OTHER'];
const LOAN_COLORS: Record<string,string> = { ACTIVE:'badge-success', RETURNED:'badge-neutral', OVERDUE:'badge-danger', LOST:'badge-warning' };

export default function LibraryPage() {
  const user = useAuthStore((s) => s.user);
  const [tab, setTab]       = useState<'search'|'loans'|'overdue'>('search');
  const [q, setQ]           = useState('');
  const [cat, setCat]       = useState('');
  const [query, setQuery]   = useState('');
  const [dueDate, setDue]   = useState('');
  const [borrowId, setBorId] = useState('');
  const [err, setErr]       = useState('');
  const [msg, setMsg]       = useState('');
  const [returnResult, setReturn] = useState<{ overdueDays: number; fineAmount: number } | null>(null);
  const [catalogForm, setCatalogForm] = useState({ accessionNo: '', title: '', author: '', isbn: '', publisher: '', publishYear: '', category: 'TEXTBOOK', totalCopies: '1', shelfLocation: '' });

  const { data: searchRes, isLoading } = useLibrarySearch(query || undefined, cat || undefined, 1, { enabled: Boolean(user) });
  const { data: loans = [] }           = useMyLoans({ enabled: Boolean(user) });
  const { mutate: borrow,  isPending: borrowing } = useBorrowItem();
  const { mutate: ret,     isPending: returning } = useReturnItem();
  const { mutate: renew,   isPending: renewing  } = useRenewLoan();
  const { mutate: createItem, isPending: creatingItem } = useCreateLibraryItem();
  const canManageLibrary = hasEffectiveRole(user, 'SUPER_ADMIN', 'HOD', 'REGISTRAR') || (hasEffectiveRole(user, 'STAFF') && hasEffectiveScope(user, 'library'));
  const { data: overdueLoans = [] } = useOverdueLoans({ enabled: canManageLibrary });

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
  const handleCreateItem = () => {
    if (catalogForm.accessionNo.trim().length < 3 || !catalogForm.title.trim()) { setErr('Accession number and title are required.'); return; }
    const totalCopies = Number(catalogForm.totalCopies);
    if (!Number.isInteger(totalCopies) || totalCopies < 1) { setErr('Total copies must be a whole number of at least 1.'); return; }
    setErr(''); setMsg('');
    createItem({ accessionNo: catalogForm.accessionNo.trim(), title: catalogForm.title.trim(), author: catalogForm.author.trim() || undefined, isbn: catalogForm.isbn.trim() || undefined, publisher: catalogForm.publisher.trim() || undefined, publishYear: catalogForm.publishYear ? Number(catalogForm.publishYear) : undefined, category: catalogForm.category, totalCopies, shelfLocation: catalogForm.shelfLocation.trim() || undefined }, {
      onSuccess: () => { setMsg('✓ Library item added'); setCatalogForm({ accessionNo: '', title: '', author: '', isbn: '', publisher: '', publishYear: '', category: 'TEXTBOOK', totalCopies: '1', shelfLocation: '' }); },
      onError: (e) => setErr(e.message),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-semibold text-foreground">Library</h2>
        <div className="flex gap-2">
          {[{k:'search',l:'Catalogue'},{k:'loans',l:`My Loans (${loans.length})`}, ...(canManageLibrary ? [{ k: 'overdue', l: `Overdue (${overdueLoans.length})` }] : [])].map((t) => (
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
          {canManageLibrary && <Card><CardHeader><CardTitle className="text-sm">Add catalogue item</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-xs text-muted-foreground">Use the accession number issued by the library and record one catalogue item per title record. The API validates ISBN, year, category, and copy counts again.</p><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{([{ key: 'accessionNo', label: 'Accession number', required: true }, { key: 'title', label: 'Title', required: true }, { key: 'author', label: 'Author' }, { key: 'isbn', label: 'ISBN' }, { key: 'publisher', label: 'Publisher' }, { key: 'publishYear', label: 'Publish year', type: 'number' }, { key: 'shelfLocation', label: 'Shelf location' }] as const).map((field) => <label key={field.key} className="text-xs text-muted-foreground">{field.label}<Input className="mt-1" type={'type' in field ? field.type : 'text'} required={'required' in field ? field.required : false} value={catalogForm[field.key]} onChange={(event) => setCatalogForm((current) => ({ ...current, [field.key]: event.target.value }))} /></label>)}<label className="text-xs text-muted-foreground">Category<select className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={catalogForm.category} onChange={(event) => setCatalogForm((current) => ({ ...current, category: event.target.value }))}>{CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select></label><label className="text-xs text-muted-foreground">Total copies<Input className="mt-1" type="number" min={1} step={1} value={catalogForm.totalCopies} onChange={(event) => setCatalogForm((current) => ({ ...current, totalCopies: event.target.value }))} /></label></div><Button size="sm" onClick={handleCreateItem} loading={creatingItem}>Add item</Button></CardContent></Card>}
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

      {tab === 'overdue' && canManageLibrary && <div className="space-y-3"><div><h3 className="text-base font-semibold">Overdue loans</h3><p className="text-sm text-muted-foreground">Library staff view of overdue items. Returning a loan records the fine and removes it from this queue.</p></div>{overdueLoans.length === 0 ? <p className="text-sm text-muted-foreground">No overdue loans.</p> : overdueLoans.map((loan) => <Card key={loan.id} className="border-red-300"><CardContent className="pt-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{loan.libraryItem?.title ?? 'Library item'}</p><p className="text-xs text-muted-foreground">Due {formatDate(loan.dueDate)} · Borrowed {formatDate(loan.borrowedAt)}</p><p className="text-xs text-[--color-danger]">Current fine: {formatNgn(parseFloat(loan.fineAmount))}</p></div><Button size="sm" loading={returning} onClick={() => handleReturn(loan.id)}>Record return</Button></div></CardContent></Card>)}</div>}

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
