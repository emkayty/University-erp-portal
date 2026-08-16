import { redirect } from 'next/navigation';

// Root "/" redirects to dashboard (handled in next.config.ts redirects)
// This file is a safety fallback
export default function RootPage() {
  redirect('/dashboard');
}
