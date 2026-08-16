import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility: merge Tailwind classes without conflicts.
 * Standard Shadcn/ui cn() helper.
 *
 * @example
 *   cn('px-4 py-2', isActive && 'bg-primary', className)
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Format Nigerian Naira currency.
 * @example formatNgn(50000) → "₦50,000.00"
 */
export function formatNgn(amount: number | string | null | undefined): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : (amount ?? 0);
  return new Intl.NumberFormat('en-NG', {
    style:                 'currency',
    currency:              'NGN',
    minimumFractionDigits: 2,
  }).format(num);
}

/**
 * Format a date for display in Nigerian context.
 * @example formatDate('2024-09-01') → "1 Sep 2024"
 */
export function formatDate(
  date: string | Date | null | undefined,
  opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' },
): string {
  if (!date) return '—';
  return new Intl.DateTimeFormat('en-NG', opts).format(new Date(date));
}

/**
 * Format a relative time (e.g. "2 hours ago").
 */
export function formatRelativeTime(date: string | Date): string {
  const rtf  = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const now  = Date.now();
  const then = new Date(date).getTime();
  const diff = then - now;

  const absSeconds = Math.abs(diff) / 1000;
  if (absSeconds < 60)     return rtf.format(Math.round(diff / 1000), 'seconds');
  if (absSeconds < 3600)   return rtf.format(Math.round(diff / 60000), 'minutes');
  if (absSeconds < 86400)  return rtf.format(Math.round(diff / 3600000), 'hours');
  return rtf.format(Math.round(diff / 86400000), 'days');
}

/**
 * Truncates a string to maxLength, appending '...' if truncated.
 */
export function truncate(str: string, maxLength = 50): string {
  return str.length > maxLength ? `${str.slice(0, maxLength)}…` : str;
}

/**
 * Generates initials from a full name for avatar fallback.
 * "Adewale Adebayo" → "AA"
 */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * Checks if a feature flag is enabled.
 * Used in client components that receive featureFlags from user session.
 */
export function isFeatureEnabled(
  featureFlags: Record<string, boolean> | null | undefined,
  flagKey: string,
): boolean {
  return featureFlags?.[flagKey] === true;
}
