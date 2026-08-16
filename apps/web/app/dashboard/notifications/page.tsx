'use client';

import { useEffect, useState } from 'react';
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

export default function NotificationsPage() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const data = await apiClient.get<NotificationItem[]>('/enterprise/notifications');
      setItems(data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load notifications.');
    }
  };

  useEffect(() => { void load(); }, []);

  const read = async (id: string) => {
    try {
      await apiClient.patch(`/enterprise/notifications/${id}/read`, {});
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update notification.');
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-xl font-semibold">Notifications</h2>
        <p className="mt-1 text-sm text-muted-foreground">Important ERP updates in one place. Email/SMS/push delivery remains governed by notification preferences and backend delivery workers.</p>
      </header>
      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
      <Card>
        <CardHeader><CardTitle className="text-base">Your notifications</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {!items.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">You have no notifications.</p>
          ) : items.map((item) => (
            <article key={item.id} className={`rounded-lg border p-3 ${item.readAt ? '' : 'bg-muted/40'}`}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="font-medium">{item.subject || 'ERP notification'}</h3>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{item.body}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</p>
                </div>
                {!item.readAt && <Button size="sm" variant="outline" onClick={() => void read(item.id)}>Mark read</Button>}
              </div>
            </article>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
