'use client';

import { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ConfirmAction } from '@/components/erp/confirm-action';
import { useStudents } from '@/hooks/use-students';
import { useStaff } from '@/hooks/use-hr';
import {
  useBulkIdentityCardsPdf,
  useIdentityCards,
  useIssueIdentityCard,
  useMyIdentityCard,
  useRevokeIdentityCard,
  useSuspendIdentityCard,
  type IdentityCardRecord,
} from '@/hooks/use-identity-cards';
import { hasEffectiveRole } from '@/lib/authz';
import { useAuthStore } from '@/stores/auth.store';

const dateLabel = (value: string) => new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' });
const pretty = (value: string) => value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());

function CardVisual({ card }: { card: IdentityCardRecord }) {
  const verificationUrl = typeof window === 'undefined' || !card.verificationUrl
    ? ''
    : new URL(card.verificationUrl, window.location.origin).toString();

  return (
    <article className="id-card-print-surface relative mx-auto aspect-[1.586/1] w-full max-w-[430px] overflow-hidden rounded-2xl border border-slate-300 bg-gradient-to-br from-slate-950 via-slate-800 to-slate-700 p-5 text-white shadow-xl print:shadow-none">
      <div className="absolute -right-16 -top-20 h-52 w-52 rounded-full bg-cyan-300/15 blur-2xl" />
      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-200">UniPortal ERP</p>
            <p className="mt-1 text-xs font-medium text-white/80">Institutional identity credential</p>
          </div>
          <span className="rounded-full border border-white/25 bg-white/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider">{pretty(card.holderType)}</span>
        </div>
        <div className="flex min-h-0 items-center gap-4">
          <div className="h-20 w-16 shrink-0 overflow-hidden rounded-lg border border-white/30 bg-white/10">
            {card.photoUrl ? <img src={card.photoUrl} alt={`${card.holder.name} passport photograph`} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-2xl font-bold text-white/70">{card.holder.name.slice(0, 1).toUpperCase()}</div>}
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-bold">{card.holder.name}</p>
            <p className="mt-1 text-xs font-medium text-cyan-100">{card.holder.identifier}</p>
            <p className="mt-1 truncate text-[11px] text-white/75">{card.holderType === 'STUDENT' ? card.holder.programme?.name ?? card.holder.department?.name : card.holder.designation ?? card.holder.department?.name}</p>
          </div>
        </div>
        <div className="flex items-end justify-between gap-3">
          <div className="space-y-1 text-[9px] text-white/75">
            <p>Card no. <span className="font-semibold text-white">{card.cardNumber}</span></p>
            <p>Valid to <span className="font-semibold text-white">{dateLabel(card.expiryDate)}</span></p>
            <p>Serial <span className="font-semibold text-white">{card.serialNumber}</span></p>
          </div>
          {verificationUrl && <div className="rounded-md bg-white p-1" aria-label="QR code for card verification"><QRCodeSVG value={verificationUrl} size={64} level="M" includeMargin /></div>}
        </div>
      </div>
    </article>
  );
}

export default function IdentityCardsPage() {
  const user = useAuthStore((state) => state.user);
  const canAdmin = hasEffectiveRole(user, 'SUPER_ADMIN', 'REGISTRAR', 'HR_MANAGER');
  const canIssueStudent = hasEffectiveRole(user, 'SUPER_ADMIN', 'REGISTRAR');
  const canIssueStaff = hasEffectiveRole(user, 'SUPER_ADMIN', 'REGISTRAR', 'HR_MANAGER');
  const { data: mine, isLoading: mineLoading } = useMyIdentityCard({ enabled: Boolean(user) });
  const { data: cards = [], isLoading: cardsLoading } = useIdentityCards({ enabled: canAdmin });
  const { data: students = [] } = useStudents({ status: 'ACTIVE', page: 1, pageSize: 200, enabled: canIssueStudent });
  const { data: staff = [] } = useStaff({ employmentStatus: 'ACTIVE', page: 1, enabled: canAdmin });
  const issueCard = useIssueIdentityCard();
  const suspendCard = useSuspendIdentityCard();
  const revokeCard = useRevokeIdentityCard();
  const bulkPdf = useBulkIdentityCardsPdf();
  const [holderType, setHolderType] = useState<'STUDENT' | 'STAFF'>(canIssueStudent ? 'STUDENT' : 'STAFF');
  const [holderId, setHolderId] = useState('');
  const [expiryDate, setExpiryDate] = useState(() => `${new Date().getFullYear() + 1}-07-31`);
  const [search, setSearch] = useState('');
  const [pendingAction, setPendingAction] = useState<{ type: 'SUSPEND' | 'REVOKE'; card: IdentityCardRecord } | null>(null);
  const [reason, setReason] = useState('');
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [browserOrigin, setBrowserOrigin] = useState('');

  useEffect(() => setBrowserOrigin(window.location.origin), []);

  const filteredCards = useMemo(
    () => cards.filter((card) => `${card.holder.name} ${card.holder.identifier} ${card.cardNumber}`.toLowerCase().includes(search.toLowerCase())),
    [cards, search],
  );
  const activeCards = useMemo(() => filteredCards.filter((card) => card.status === 'ACTIVE'), [filteredCards]);
  const allActiveSelected = activeCards.length > 0 && activeCards.every((card) => selectedCardIds.includes(card.id));
  const selectedHolder = holderType === 'STUDENT' ? students.find((student) => student.id === holderId) : staff.find((member) => member.id === holderId);
  const mineVerificationUrl = mine?.verificationUrl && browserOrigin ? new URL(mine.verificationUrl, browserOrigin).toString() : '';

  const issue = () => {
    if (!holderId || !expiryDate || (holderType === 'STUDENT' && !canIssueStudent)) return;
    issueCard.mutate(
      holderType === 'STUDENT' ? { holderType, studentId: holderId, expiryDate } : { holderType, staffId: holderId, expiryDate },
      { onSuccess: () => setHolderId('') },
    );
  };

  const completeLifecycle = () => {
    if (!pendingAction || reason.trim().length < 8) return;
    const mutation = pendingAction.type === 'SUSPEND' ? suspendCard : revokeCard;
    mutation.mutate({ id: pendingAction.card.id, reason: reason.trim() }, { onSettled: () => { setPendingAction(null); setReason(''); } });
  };

  const downloadSelectedCards = async () => {
    if (!selectedCardIds.length) return;
    try {
      const result = await bulkPdf.mutateAsync(selectedCardIds);
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = result.filename ?? 'uniportal-identity-cards.pdf';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      // The API client publishes the user-facing failure feedback.
    }
  };

  return (
    <div className="erp-workspace-page">
      <header className="erp-workspace-header">
        <p className="enterprise-eyebrow">Identity and access</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight">Identity Cards</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">A secure digital credential for everyday access, with a print-ready card surface for institutional hardcopy issuance. Personal data is kept to the minimum needed for verification.</p>
      </header>

      <Card className="erp-data-surface enterprise-surface">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>My digital card</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Use Print card to produce a physical copy on a compatible card printer or A4 printer.</p>
            </div>
            {mine && <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => window.print()}>Print card</Button>{mineVerificationUrl && <Button type="button" variant="outline" onClick={() => void navigator.clipboard?.writeText(mineVerificationUrl)}>Copy verification link</Button>}</div>}
          </div>
        </CardHeader>
        <CardContent>
          {mineLoading ? <div className="h-56 animate-pulse rounded-xl bg-muted" /> : mine ? <div className="grid gap-6 lg:grid-cols-[minmax(0,460px)_1fr] lg:items-center"><CardVisual card={mine} /><div className="space-y-3 text-sm"><div className="rounded-xl border border-border bg-background/60 p-4"><p className="font-semibold">Credential status</p><p className="mt-1 text-muted-foreground">{pretty(mine.status)} · valid until {dateLabel(mine.expiryDate)}</p></div><div className="rounded-xl border border-border bg-background/60 p-4"><p className="font-semibold">Verification</p><p className="mt-1 text-muted-foreground">Anyone with the card can verify its status through the opaque link or QR code. The verification page does not expose private contact, date-of-birth, or address data.</p>{mineVerificationUrl && <a className="mt-3 inline-block break-all text-xs text-[--color-primary] underline" href={mineVerificationUrl} target="_blank" rel="noreferrer">Open public verification page</a>}</div></div></div> : <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center"><p className="font-semibold">No active identity card has been issued</p><p className="mt-2 text-sm text-muted-foreground">Contact the Registrar or HR Office to confirm your institutional identity record.</p></div>}
        </CardContent>
      </Card>

      {canAdmin && <>
        <Card className="erp-control-rail enterprise-surface">
          <CardHeader><CardTitle>Issue or replace a card</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-xs font-medium text-muted-foreground">Credential holder<select className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground" value={holderType} onChange={(event) => { setHolderType(event.target.value as 'STUDENT' | 'STAFF'); setHolderId(''); }}><option value="STUDENT" disabled={!canIssueStudent}>Student</option><option value="STAFF" disabled={!canIssueStaff}>Staff</option></select></label>
              <label className="text-xs font-medium text-muted-foreground">Person<select className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground" value={holderId} onChange={(event) => setHolderId(event.target.value)}><option value="">Select person</option>{holderType === 'STUDENT' ? students.map((student) => <option key={student.id} value={student.id}>{student.matricNo} · {student.firstName} {student.lastName}</option>) : staff.map((member) => <option key={member.id} value={member.id}>{member.employeeNo} · {member.firstName} {member.lastName}</option>)}</select></label>
              <label className="text-xs font-medium text-muted-foreground">Expiry date<Input className="mt-1" type="date" value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} /></label>
            </div>
            {selectedHolder && <p className="text-xs text-muted-foreground">Issuing to <span className="font-semibold text-foreground">{'firstName' in selectedHolder ? `${selectedHolder.firstName} ${selectedHolder.lastName}` : ''}</span>. If an active card exists, it will be retained in the audit history and marked Replaced.</p>}
            <Button type="button" onClick={issue} loading={issueCard.isPending} disabled={!holderId || !expiryDate || (holderType === 'STUDENT' && !canIssueStudent)}>Issue identity card</Button>
          </CardContent>
        </Card>

        <Card className="erp-data-surface enterprise-surface">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle>Card register</CardTitle><p className="mt-1 text-sm text-muted-foreground">Search and manage issued credentials. Destructive status changes require a reason.</p></div><Input className="sm:max-w-xs" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, ID or card number" aria-label="Search identity cards" /></div>
            <div className="flex flex-wrap items-center gap-2 pt-3"><Button type="button" variant="outline" size="sm" onClick={() => setSelectedCardIds(allActiveSelected ? [] : activeCards.map((card) => card.id))} disabled={!activeCards.length}>{allActiveSelected ? 'Clear active selection' : 'Select all active'}</Button><Button type="button" size="sm" onClick={() => void downloadSelectedCards()} loading={bulkPdf.isPending} disabled={!selectedCardIds.length}>Download selected PDF ({selectedCardIds.length})</Button><p className="text-xs text-muted-foreground">A4 duplex: 5 ATM-size card positions per sheet pair, with a matching front and back for each card; print back pages by flipping on the short edge.</p></div>
          </CardHeader>
          <CardContent>{cardsLoading ? <div className="h-40 animate-pulse rounded-xl bg-muted" /> : filteredCards.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">No identity cards found.</p> : <div className="grid gap-3 xl:grid-cols-2">{filteredCards.map((card) => <article key={card.id} className="rounded-xl border border-border bg-background/60 p-4"><div className="flex items-start justify-between gap-3"><div className="flex items-start gap-3">{card.status === 'ACTIVE' && <input type="checkbox" checked={selectedCardIds.includes(card.id)} onChange={() => setSelectedCardIds((current) => current.includes(card.id) ? current.filter((id) => id !== card.id) : [...current, card.id])} aria-label={`Select ${card.holder.name} for bulk PDF`} className="mt-1 h-4 w-4" />}<div><p className="font-semibold">{card.holder.name}</p><p className="mt-1 text-xs text-muted-foreground">{card.holder.identifier} · {pretty(card.holderType)} · {card.cardNumber}</p><p className="mt-1 text-xs text-muted-foreground">Valid to {dateLabel(card.expiryDate)}</p></div></div><span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">{pretty(card.status)}</span></div>{(card.status === 'ACTIVE' || card.status === 'SUSPENDED') && <div className="mt-4 flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={() => { setPendingAction({ type: 'SUSPEND', card }); setReason(''); }}>Suspend</Button><Button type="button" size="sm" variant="destructive" onClick={() => { setPendingAction({ type: 'REVOKE', card }); setReason(''); }}>Revoke</Button></div>}</article>)}</div>}</CardContent>
        </Card>
      </>}

      <style jsx global>{`@media print { body * { visibility: hidden !important; } .id-card-print-surface, .id-card-print-surface * { visibility: visible !important; } .id-card-print-surface { position: absolute !important; left: 0 !important; top: 0 !important; width: 3.375in !important; height: 2.125in !important; max-width: none !important; border-radius: 0 !important; } }`}</style>
      <ConfirmAction open={Boolean(pendingAction)} title={`${pendingAction?.type === 'REVOKE' ? 'Revoke' : 'Suspend'} identity card?`} description="This lifecycle action will affect the card’s verification result and must be justified in the audit record." confirmLabel={pendingAction?.type === 'REVOKE' ? 'Revoke card' : 'Suspend card'} destructive onCancel={() => { setPendingAction(null); setReason(''); }} onConfirm={completeLifecycle}><label className="text-sm font-medium">Reason<textarea className="mt-2 min-h-24 w-full rounded-lg border border-input bg-background p-3 text-sm" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Enter at least 8 characters" /></label></ConfirmAction>
    </div>
  );
}
