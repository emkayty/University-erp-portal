'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type NotificationItem = {
  id: string;
  subject?: string;
  body: string;
  status: string;
  createdAt: string;
  readAt?: string | null;
};

type Filter = 'all' | 'unread';
type NotificationGroup = { label: string; items: NotificationItem[] };

function groupLabel(dateValue: string): string {
  const date = new Date(dateValue);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDelta = Math.round((startOfToday - startOfDate) / 86_400_000);
  if (dayDelta === 0) return 'Today';
  if (dayDelta === 1) return 'Yesterday';
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function NotificationsPage() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiClient.get<NotificationItem[]>('/enterprise/notifications');
      setItems(data ?? []);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load notifications.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const unreadItems = useMemo(() => items.filter((item) => !item.readAt), [items]);
  const visibleItems = filter === 'unread' ? unreadItems : items;
  const groups = useMemo<NotificationGroup[]>(() => {
    const grouped = new Map<string, NotificationItem[]>();
    for (const item of visibleItems) {
      const label = groupLabel(item.createdAt);
      const existing = grouped.get(label) ?? [];
      existing.push(item);
      grouped.set(label, existing);
    }
    return Array.from(grouped, ([label, groupItems]) => ({ label, items: groupItems }));
  }, [visibleItems]);

  const read = async (id: string) => {
    setMarkingId(id);
    setError('');
    try {
      await apiClient.patch(`/enterprise/notifications/${id}/read`, {});
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update notification.');
    } finally {
      setMarkingId(null);
    }
  };

  const markAllRead = async () => {
    if (!unreadItems.length) return;
    setMarkingAll(true);
    setError('');
    try {
      await Promise.all(unreadItems.map((item) => apiClient.patch(`/enterprise/notifications/${item.id}/read`, {})));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to mark all notifications as read.');
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <div className="erp-workspace-page">
      <header className="erp-workspace-header flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="enterprise-eyebrow">Personal communication centre</p>
          <h2 className="text-xl font-semibold">Notifications</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Important ERP updates in one place. Email, SMS, and push delivery remain governed by notification preferences and backend delivery workers.</p>
        </div>
        <Button variant="outline" onClick={() => void markAllRead()} disabled={!unreadItems.length || markingAll} loading={markingAll}>
          Mark all as read{unreadItems.length ? ` (${unreadItems.length})` : ''}
        </Button>
      </header>

      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Your notifications <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">{unreadItems.length} unread</span></CardTitle>
          <div className="flex w-full gap-2 sm:w-auto" role="tablist" aria-label="Notification filter">
            <Button size="sm" variant={filter === 'all' ? 'default' : 'outline'} onClick={() => setFilter('all')} role="tab" aria-selected={filter === 'all'}>All ({items.length})</Button>
            <Button size="sm" variant={filter === 'unread' ? 'default' : 'outline'} onClick={() => setFilter('unread')} role="tab" aria-selected={filter === 'unread'}>Unread ({unreadItems.length})</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading ? (
            <div className="space-y-3" aria-label="Loading notifications"><div className="h-20 animate-pulse rounded-lg bg-muted" /><div className="h-20 animate-pulse rounded-lg bg-muted" /></div>
          ) : !visibleItems.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{filter === 'unread' ? 'You are all caught up.' : 'You have no notifications.'}</p>
          ) : groups.map((group) => (
            <section key={group.label} className="space-y-2" aria-labelledby={`notification-group-${group.label}`}>
              <h3 id={`notification-group-${group.label}`} className="enterprise-eyebrow">{group.label}</h3>
              {group.items.map((item) => (
                <article key={item.id} className={`rounded-lg border p-3 transition-colors ${item.readAt ? '' : 'bg-muted/40'}`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h4 className="font-medium">{item.subject || 'ERP notification'}</h4>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{item.body}</p>
                      <p className="mt-2 text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</p>
                    </div>
                    {!item.readAt && <Button className="shrink-0 self-start" size="sm" variant="outline" onClick={() => void read(item.id)} disabled={markingAll || markingId === item.id} loading={markingId === item.id}>Mark read</Button>}
                  </div>
                </article>
              ))}
            </section>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
