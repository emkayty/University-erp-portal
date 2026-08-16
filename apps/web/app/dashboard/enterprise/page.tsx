'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/stores/auth.store';

const domains = [
  { href: '/dashboard/hr', title: 'HR & Staff Lifecycle', description: 'Manage staff records, leave, employment status and salary structures.' },
  { href: '/dashboard/library', title: 'Library Operations', description: 'Catalogue, loans, renewals, returns and overdue work.' },
  { href: '/dashboard/hostel', title: 'Accommodation', description: 'View accommodation structures and student allocations.' },
  { href: '/dashboard/lms', title: 'Learning Delivery', description: 'Publish course content and communicate with enrolled students.' },
  { href: '/dashboard/research', title: 'Research', description: 'Projects, grants, outputs and research governance.' },
  { href: '/dashboard/clinic', title: 'Health Services', description: 'Appointments and controlled medicine inventory workflows.' },
  { href: '/dashboard/alumni', title: 'Alumni', description: 'Alumni profiles, engagement and institutional campaigns.' },
];

export default function EnterprisePage() {
  const role = useAuthStore((s) => s.user?.primaryRole);

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-xl font-semibold">Enterprise Operations</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Cross-functional services are separated by business responsibility. Access is still enforced by the API; this page is only a navigation and orientation layer.
        </p>
      </header>

      <Card>
        <CardHeader><CardTitle className="text-base">Your operating context</CardTitle></CardHeader>
        <CardContent className="text-sm">
          <p><span className="text-muted-foreground">Role:</span> <strong>{role?.replace(/_/g, ' ') || 'User'}</strong></p>
          <p className="mt-1 text-muted-foreground">Only actions permitted for your role and scope should be offered by each domain.</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {domains.map((domain) => (
          <Link key={domain.href} href={domain.href} className="group">
            <Card className="h-full transition-shadow group-hover:shadow-md">
              <CardHeader><CardTitle className="text-base">{domain.title}</CardTitle></CardHeader>
              <CardContent><p className="text-sm text-muted-foreground">{domain.description}</p><span className="mt-4 inline-block text-sm font-medium text-[--color-primary]">Open workspace →</span></CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
