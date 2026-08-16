'use client';
import { useEffect, useState } from 'react';

/**
 * Returns a debounced version of value that only updates after
 * delay milliseconds have passed since the last change.
 * Used by search hooks to avoid firing on every keystroke.
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
