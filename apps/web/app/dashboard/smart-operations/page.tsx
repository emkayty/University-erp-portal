'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth.store';
import { useAlertAction, useClaimTask, useIntelligenceAlerts, useIntelligenceTasks, useUpdateTaskStatus } from '@/hooks/use-intelligence';

const SMART_ALERTS_ROUTE = '/intelligence/alerts';
const SMART_TASKS_ROUTE = '/intelligence/tasks';

export default function SmartOperationsPage() {
  const role = useAuthStore((s) => s.user?.primaryRole);
  const [status, setStatus] = useState('');
  const { data: alerts = [], isLoading: alertsLoading, isError: alertsError } = useIntelligenceAlerts();
  const { data: tasks = [], isLoading: tasksLoading, isError: tasksError } = useIntelligenceTasks(status || undefined);
  const alertAction = useAlertAction();
  const claimTask = useClaimTask();
  const updateTask = useUpdateTaskStatus();
  const privileged = ['SUPER_ADMIN', 'VC', 'REGISTRAR'].includes(role ?? '');

  return (
    <div className="space-y-6">
      <header data-alert-route={SMART_ALERTS_ROUTE} data-task-route={SMART_TASKS_ROUTE}>
        <p className="text-sm text-muted-foreground">Human-in-the-loop operations</p>
        <h2 className="text-xl font-semibold">Smart Operations</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Review prioritized signals, claim work, record decisions, and close the operational loop. Automation proposes actions; authorized staff remain accountable for consequential decisions.</p>
      </header>
      {(alertsError || tasksError) && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">Unable to load the latest operational queue. Try again shortly.</div>}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Alerts ({alerts.length})</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {alertsLoading ? <p className="text-sm text-muted-foreground">Loading alerts…</p> : alerts.length === 0 ? <p className="py-6 text-sm text-muted-foreground">No active alerts.</p> : alerts.map((alert) => (
              <article key={alert.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3"><div><h3 className="font-medium">{alert.title}</h3><p className="mt-1 text-sm text-muted-foreground">{alert.message}</p></div><span className="rounded-full bg-muted px-2 py-1 text-xs font-medium">{alert.severity}</span></div>
                <p className="mt-2 text-xs text-muted-foreground">{alert.domain} · {alert.status}</p>
                {alert.status !== 'RESOLVED' && alert.status !== 'DISMISSED' && <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={alertAction.isPending} onClick={() => alertAction.mutate({ id: alert.id, action: 'acknowledge' })}>Acknowledge</Button><Button size="sm" disabled={alertAction.isPending} onClick={() => alertAction.mutate({ id: alert.id, action: 'resolve' })}>Resolve</Button>{privileged && <Button size="sm" variant="outline" disabled={alertAction.isPending} onClick={() => alertAction.mutate({ id: alert.id, action: 'dismiss' })}>Dismiss</Button>}</div>}
              </article>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><div className="flex items-center justify-between gap-3"><CardTitle className="text-base">Human-review tasks ({tasks.length})</CardTitle><select aria-label="Filter tasks" className="h-9 rounded-md border bg-background px-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option><option value="OPEN">Open</option><option value="IN_PROGRESS">In progress</option><option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option></select></div></CardHeader>
          <CardContent className="space-y-3">
            {tasksLoading ? <p className="text-sm text-muted-foreground">Loading tasks…</p> : tasks.length === 0 ? <p className="py-6 text-sm text-muted-foreground">No tasks match this filter.</p> : tasks.map((task) => (
              <article key={task.id} className="rounded-lg border p-3"><div className="flex items-start justify-between gap-3"><div><h3 className="font-medium">{task.title}</h3><p className="mt-1 text-sm text-muted-foreground">{task.description || 'Review the item and record the appropriate institutional action.'}</p></div><span className="rounded-full bg-muted px-2 py-1 text-xs">{task.status}</span></div><p className="mt-2 text-xs text-muted-foreground">{task.domain}{task.dueAt ? ` · Due ${new Date(task.dueAt).toLocaleString()}` : ''}</p><div className="mt-3 flex flex-wrap gap-2">{!task.assignedToId && task.status !== 'COMPLETED' && task.status !== 'CANCELLED' && <Button size="sm" disabled={claimTask.isPending} onClick={() => claimTask.mutate(task.id)}>Claim task</Button>}{task.status === 'IN_PROGRESS' && <Button size="sm" variant="outline" disabled={updateTask.isPending} onClick={() => updateTask.mutate({ id: task.id, status: 'COMPLETED' })}>Mark complete</Button>}{task.status === 'OPEN' && task.assignedToId && <Button size="sm" variant="outline" disabled={updateTask.isPending} onClick={() => updateTask.mutate({ id: task.id, status: 'IN_PROGRESS' })}>Start work</Button>}</div></article>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
