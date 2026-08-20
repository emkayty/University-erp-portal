'use client';

import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { subscribeFeedback, type FeedbackEvent } from '@/lib/feedback';
import { cn } from '@/lib/utils';

const toneConfig = {
  success: {
    icon: CheckCircle2,
    label: 'Success',
    iconClass: 'text-emerald-700',
    accentClass: 'border-l-emerald-600',
  },
  error: {
    icon: XCircle,
    label: 'Action could not be completed',
    iconClass: 'text-red-700',
    accentClass: 'border-l-red-600',
  },
  info: {
    icon: Info,
    label: 'Information',
    iconClass: 'text-[--color-primary]',
    accentClass: 'border-l-[--color-primary]',
  },
} as const;

export function FeedbackToaster() {
  const [events, setEvents] = useState<FeedbackEvent[]>([]);

  useEffect(() => {
    const timers = new Map<string, number>();
    const unsubscribe = subscribeFeedback((event) => {
      setEvents((current) => [...current.slice(-2), event]);
      const timer = window.setTimeout(() => {
        setEvents((current) => current.filter((item) => item.id !== event.id));
        timers.delete(event.id);
      }, event.durationMs ?? 4500);
      timers.set(event.id, timer);
    });
    return () => {
      unsubscribe();
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  function dismiss(id: string) {
    setEvents((current) => current.filter((event) => event.id !== id));
  }

  return (
    <div
      className="pointer-events-none fixed inset-x-4 bottom-4 z-[200] flex flex-col items-end gap-3 sm:left-auto sm:max-w-md"
      aria-live="polite"
      aria-atomic="false"
    >
      {events.map((event) => {
        const config = toneConfig[event.tone];
        const Icon = config.icon;
        return (
          <div
            key={event.id}
            role={event.tone === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto w-full rounded-2xl border border-border border-l-4 bg-card/95 p-4 text-card-foreground shadow-xl backdrop-blur-md motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2',
              config.accentClass,
            )}
          >
            <div className="flex items-start gap-3">
              <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', config.iconClass)} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{event.title || config.label}</p>
                <p className="mt-1 text-sm leading-5 text-foreground/75">{event.message}</p>
              </div>
              <button
                type="button"
                className="touch-target -mr-2 -mt-2 inline-flex items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-primary]"
                onClick={() => dismiss(event.id)}
                aria-label="Dismiss notification"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
