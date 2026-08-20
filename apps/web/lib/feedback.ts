export type FeedbackTone = 'success' | 'error' | 'info';

export type FeedbackEvent = {
  id: string;
  tone: FeedbackTone;
  title: string;
  message: string;
  durationMs?: number;
};

type FeedbackListener = (event: FeedbackEvent) => void;

const listeners = new Set<FeedbackListener>();

export function subscribeFeedback(listener: FeedbackListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishFeedback(
  event: Omit<FeedbackEvent, 'id'> & { id?: string },
): void {
  const next: FeedbackEvent = {
    id: event.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    durationMs: 4500,
    ...event,
  };
  listeners.forEach((listener) => listener(next));
}
