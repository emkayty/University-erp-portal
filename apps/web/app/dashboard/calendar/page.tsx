'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Button }  from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input }   from '@/components/ui/input';
import { Label }   from '@/components/ui/label';
import {
  useCalendars, useCreateCalendar, useActivateCalendar,
  useSuspendCalendar, useResumeCalendar, useAddCalendarEvent,
} from '@/hooks/use-calendar';
import { useAuthStore } from '@/stores/auth.store';
import { cn, formatDate } from '@/lib/utils';
import type { CalendarV1 } from '@uniportal/types';

// ── Status badge ──────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  DRAFT:     { label: 'Draft',     cls: 'badge-neutral' },
  ACTIVE:    { label: 'Active',    cls: 'badge-success' },
  SUSPENDED: { label: 'Suspended', cls: 'badge-warning' },
  COMPLETED: { label: 'Completed', cls: 'badge-info' },
} as const;

// ── Schemas ───────────────────────────────────────────────────────────────────
const createSchema = z.object({
  academicYear: z.string().regex(/^\d{4}\/\d{4}$/, 'Must be in YYYY/YYYY format e.g. 2025/2026')
    .refine((y) => { const [a, b] = y.split('/').map(Number); return b === a + 1; }, 'End year must be start year + 1'),
  startDate: z.string().min(1),
  endDate:   z.string().min(1),
});

const suspendSchema = z.object({
  reason: z.string().min(10, 'Reason must be at least 10 characters').max(500),
});

const eventSchema = z.object({
  name:      z.string().min(2).max(255),
  eventType: z.string().min(1),
  startDate: z.string().min(1),
  endDate:   z.string().optional(),
  description: z.string().optional(),
});

type CreateForm  = z.infer<typeof createSchema>;
type SuspendForm = z.infer<typeof suspendSchema>;
type EventForm   = z.infer<typeof eventSchema>;

const EVENT_TYPES = [
  'REGISTRATION_OPEN', 'REGISTRATION_CLOSE', 'EXAM_START', 'EXAM_END',
  'RESULT_RELEASE', 'GRADUATION', 'ORIENTATION', 'HOLIDAY', 'ADMINISTRATIVE', 'OTHER',
];

export default function CalendarPage() {
  const user  = useAuthStore((s) => s.user);
  const canManage = ['SUPER_ADMIN', 'REGISTRAR', 'VC'].includes(user?.primaryRole ?? '');

  const { data: calendars = [], isLoading } = useCalendars();
  const { mutate: createCalendar,  isPending: creating   } = useCreateCalendar();
  const { mutate: activateCalendar, isPending: activating } = useActivateCalendar();
  const { mutate: suspendCalendar,  isPending: suspending } = useSuspendCalendar();
  const { mutate: resumeCalendar,   isPending: resuming   } = useResumeCalendar();
  const { mutate: addEvent,         isPending: addingEvent } = useAddCalendarEvent();

  const [selected,       setSelected]       = useState<string | null>(null);
  const [showCreate,     setShowCreate]      = useState(false);
  const [showSuspend,    setShowSuspend]     = useState(false);
  const [showAddEvent,   setShowAddEvent]    = useState(false);
  const [actionError,    setActionError]     = useState('');

  const selectedCalendar = calendars.find((c) => c.id === selected) ?? null;

  const createForm  = useForm<CreateForm>({ resolver: zodResolver(createSchema) });
  const suspendForm = useForm<SuspendForm>({ resolver: zodResolver(suspendSchema) });
  const eventForm   = useForm<EventForm>({ resolver: zodResolver(eventSchema) });

  const handleCreate = createForm.handleSubmit((data) => {
    setActionError('');
    createCalendar(data, {
      onSuccess: (cal) => { setShowCreate(false); setSelected(cal.id); createForm.reset(); },
      onError:   (e)   => setActionError(e.message),
    });
  });

  const handleSuspend = suspendForm.handleSubmit(({ reason }) => {
    if (!selected) return;
    setActionError('');
    suspendCalendar({ id: selected, reason }, {
      onSuccess: () => { setShowSuspend(false); suspendForm.reset(); },
      onError:   (e)  => setActionError(e.message),
    });
  });

  const handleAddEvent = eventForm.handleSubmit((data) => {
    if (!selected) return;
    setActionError('');
    addEvent({ calendarId: selected, data }, {
      onSuccess: () => { setShowAddEvent(false); eventForm.reset(); },
      onError:   (e)  => setActionError(e.message),
    });
  });

  if (isLoading) return <div className="animate-pulse space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 rounded-lg bg-muted" />)}</div>;

  return (
    <div className="flex gap-6">
      {/* ── Left: Calendar list ──────────────────────────────────────────── */}
      <div className="w-80 flex-shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Academic Calendars</h2>
          {canManage && (
            <Button size="sm" onClick={() => setShowCreate(!showCreate)}>+ New</Button>
          )}
        </div>

        {/* Create form */}
        {showCreate && (
          <Card className="border-[--color-primary]/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Create Calendar</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="academicYear" required>Academic Year</Label>
                  <Input id="academicYear" placeholder="2025/2026" error={createForm.formState.errors.academicYear?.message} {...createForm.register('academicYear')} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="startDate" required>Start Date</Label>
                  <Input id="startDate" type="date" error={createForm.formState.errors.startDate?.message} {...createForm.register('startDate')} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="endDate" required>End Date</Label>
                  <Input id="endDate" type="date" error={createForm.formState.errors.endDate?.message} {...createForm.register('endDate')} />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" size="sm" loading={creating}>Create</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Calendar list */}
        {calendars.length === 0 && !showCreate && (
          <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            No calendars yet.{canManage ? ' Create one to get started.' : ''}
          </p>
        )}

        {calendars.map((cal) => {
          const cfg = STATUS_CONFIG[cal.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.DRAFT;
          return (
            <button
              key={cal.id}
              onClick={() => { setSelected(cal.id); setActionError(''); setShowSuspend(false); setShowAddEvent(false); }}
              className={cn(
                'w-full rounded-lg border p-4 text-left transition-colors',
                selected === cal.id
                  ? 'border-[--color-primary] bg-blue-50/60 dark:bg-blue-950/30'
                  : 'border-border hover:border-[--color-primary]/40 hover:bg-muted/50',
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">{cal.academicYear}</span>
                <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', cfg.cls)}>{cfg.label}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatDate(cal.startDate)} — {formatDate(cal.endDate)}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{cal.events?.length ?? 0} event(s)</p>
            </button>
          );
        })}
      </div>

      {/* ── Right: Calendar detail ───────────────────────────────────────── */}
      <div className="flex-1">
        {!selectedCalendar ? (
          <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border">
            <p className="text-sm text-muted-foreground">Select a calendar to view details</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Header + FSM actions */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-foreground">{selectedCalendar.academicYear}</h3>
                <p className="text-sm text-muted-foreground">
                  {formatDate(selectedCalendar.startDate)} → {formatDate(selectedCalendar.endDate)}
                </p>
              </div>

              {canManage && (
                <div className="flex flex-wrap gap-2">
                  {selectedCalendar.status === 'DRAFT' && (
                    <Button size="sm" onClick={() => { setActionError(''); activateCalendar(selectedCalendar.id, { onError: (e) => setActionError(e.message) }); }} loading={activating}>
                      ▶ Activate
                    </Button>
                  )}
                  {selectedCalendar.status === 'ACTIVE' && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setShowAddEvent(!showAddEvent)}>+ Add Event</Button>
                      <Button size="sm" variant="destructive" onClick={() => setShowSuspend(!showSuspend)}>⏸ Suspend (ASUU)</Button>
                    </>
                  )}
                  {selectedCalendar.status === 'SUSPENDED' && (
                    <Button size="sm" onClick={() => { setActionError(''); resumeCalendar(selectedCalendar.id, { onError: (e) => setActionError(e.message) }); }} loading={resuming}>
                      ▶ Resume
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* ASUU suspend warning */}
            {selectedCalendar.status === 'SUSPENDED' && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">⏸ Calendar Suspended</p>
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{selectedCalendar.suspendedReason}</p>
                <p className="mt-0.5 text-xs text-amber-600">Suspended: {formatDate(selectedCalendar.suspendedAt!)}</p>
              </div>
            )}

            {/* Error */}
            {actionError && (
              <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-[--color-danger]">
                {actionError}
              </div>
            )}

            {/* Suspend form */}
            {showSuspend && (
              <Card className="border-amber-300 dark:border-amber-700">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm text-amber-800 dark:text-amber-200">Suspend Calendar — ASUU Strike Mode</CardTitle>
                  <CardDescription className="text-xs">All operations requiring an active calendar will be blocked immediately.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSuspend} className="space-y-3">
                    <div className="space-y-1">
                      <Label htmlFor="reason" required>Reason</Label>
                      <Input id="reason" placeholder="e.g. ASUU industrial action — suspension effective 15 March 2026"
                        error={suspendForm.formState.errors.reason?.message} {...suspendForm.register('reason')} />
                    </div>
                    <div className="flex gap-2">
                      <Button type="submit" variant="destructive" size="sm" loading={suspending}>Confirm Suspension</Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => setShowSuspend(false)}>Cancel</Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}

            {/* Add event form */}
            {showAddEvent && (
              <Card className="border-[--color-primary]/30">
                <CardHeader className="pb-3"><CardTitle className="text-sm">Add Calendar Event</CardTitle></CardHeader>
                <CardContent>
                  <form onSubmit={handleAddEvent} className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="evName" required>Event Name</Label>
                      <Input id="evName" placeholder="First Semester Registration" error={eventForm.formState.errors.name?.message} {...eventForm.register('name')} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="evType" required>Type</Label>
                      <select id="evType" {...eventForm.register('eventType')}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <option value="">Select type…</option>
                        {EVENT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="evStart" required>Start Date</Label>
                      <Input id="evStart" type="date" error={eventForm.formState.errors.startDate?.message} {...eventForm.register('startDate')} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="evEnd">End Date</Label>
                      <Input id="evEnd" type="date" {...eventForm.register('endDate')} />
                    </div>
                    <div className="sm:col-span-2 flex gap-2">
                      <Button type="submit" size="sm" loading={addingEvent}>Add Event</Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => setShowAddEvent(false)}>Cancel</Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}

            {/* Events list */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Calendar Events ({selectedCalendar.events?.length ?? 0})</CardTitle>
              </CardHeader>
              <CardContent>
                {(!selectedCalendar.events || selectedCalendar.events.length === 0) ? (
                  <p className="text-sm text-muted-foreground">No events scheduled yet.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedCalendar.events.map((ev) => (
                      <div key={ev.id} className="flex items-center justify-between rounded-md border border-border p-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">{ev.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {ev.eventType.replace(/_/g, ' ')} · {formatDate(ev.startDate)}
                            {ev.endDate ? ` — ${formatDate(ev.endDate)}` : ''}
                          </p>
                        </div>
                        <span className={cn('rounded-full px-2 py-0.5 text-xs', ev.isPublic ? 'badge-info' : 'badge-neutral')}>
                          {ev.isPublic ? 'Public' : 'Internal'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
