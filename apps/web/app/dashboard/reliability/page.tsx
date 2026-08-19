'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useDeadLetters, useReplayDeadLetter } from '@/hooks/use-reliability';
import { useAuthStore } from '@/stores/auth.store';
import { hasEffectiveRole } from '@/lib/authz';
import { formatDate } from '@/lib/utils';

export default function ReliabilityPage() {
  const user = useAuthStore((state) => state.user);
  const isSuperAdmin = hasEffectiveRole(user, 'SUPER_ADMIN');
  const { data, isLoading, isError, refetch } = useDeadLetters({ enabled: isSuperAdmin });
  const replay = useReplayDeadLetter();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  if (!isSuperAdmin) {
    return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900" role="alert"><p className="font-semibold">Reliability operations are restricted</p><p className="mt-1">Only a Super Administrator can inspect or replay dead-lettered domain events.</p></div>;
  }

  const events = data?.events ?? [];
  const replayEvent = (id: string) => {
    if (!window.confirm('Replay this event through the normal worker dispatcher?')) return;
    setMessage('');
    setError('');
    replay.mutate(id, {
      onSuccess: (result) => setMessage(`${result.eventType} queued for worker replay.`),
      onError: (cause) => setError(cause.message),
    });
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">BullMQ and transactional outbox operations</p>
          <h1 className="text-2xl font-semibold">Reliability Operations</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Dead-lettered events remain durable until an authorized operator explicitly returns them to the worker-owned dispatcher.</p>
        </div>
        <Button variant="outline" onClick={() => void refetch()} loading={isLoading}>Refresh</Button>
      </header>

      {message && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800" role="status">{message}</div>}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">{error}</div>}
      {isError && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">Unable to load dead-letter events. Refresh after confirming the worker and database are available.</div>}

      <Card>
        <CardHeader><CardTitle>Dead-letter queue ({events.length})</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <p className="text-sm text-muted-foreground">Loading reliability events…</p> : events.length === 0 ? <p className="py-6 text-sm text-muted-foreground">No dead-lettered outbox events require operator attention.</p> : (
            <div className="space-y-3">
              {events.map((event) => (
                <article key={event.id} className="rounded-xl border border-border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-semibold">{event.eventType}</h2>
                      <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{event.id}</p>
                      <p className="mt-2 text-xs text-muted-foreground">Created {formatDate(event.createdAt)} · Dead-lettered {event.deadLetteredAt ? formatDate(event.deadLetteredAt) : '—'} · {event.attempts} attempts</p>
                      {event.lastError && <p className="mt-2 text-xs text-red-700">Last error: {event.lastError}</p>}
                      <p className="mt-2 text-xs text-muted-foreground">Payload is intentionally not rendered here because domain events may contain personal or financial data.</p>
                    </div>
                    <Button size="sm" loading={replay.isPending} onClick={() => replayEvent(event.id)}>Replay through worker</Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

