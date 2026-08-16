'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiClient } from '@/lib/api-client';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/lib/utils';
import type { HostelBlockV1, RoomAllocationV1 } from '@uniportal/types';

export default function HostelPage() {
  const user  = useAuthStore((s) => s.user);
  const isStudent = user?.primaryRole === 'STUDENT';
  const canManage = ['REGISTRAR','SUPER_ADMIN'].includes(user?.primaryRole ?? '');
  const [err, setErr] = useState('');
  const [academicYear] = useState('2025/2026');

  const { data: blocks = [] } = useQuery({
    queryKey: ['hostel','blocks'],
    queryFn: () => apiClient.get<HostelBlockV1[]>('/hostel/blocks'),
    staleTime: 5 * 60_000,
  });

  const { data: myAllocation } = useQuery({
    queryKey: ['hostel','allocation','my', academicYear],
    queryFn: () => apiClient.get<RoomAllocationV1|null>(`/hostel/my-allocation?academicYear=${academicYear}`),
    enabled: isStudent,
    staleTime: 10 * 60_000,
  });

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-foreground">Hostel & Accommodation</h2>
      {err && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-[--color-danger]">{err}</div>}

      {isStudent && (
        <Card className={cn('max-w-md', myAllocation ? 'border-green-300' : '')}>
          <CardHeader className="pb-2"><CardTitle className="text-sm">My Accommodation — {academicYear}</CardTitle></CardHeader>
          <CardContent className="text-sm">
            {myAllocation ? (
              <div className="space-y-1">
                <p><span className="text-muted-foreground">Block:</span> <strong>{(myAllocation as RoomAllocationV1 & { room?: { hostelBlock?: { name: string }; roomNumber?: string } }).room?.hostelBlock?.name}</strong></p>
                <p><span className="text-muted-foreground">Room:</span> <strong>{(myAllocation as RoomAllocationV1 & { room?: { roomNumber?: string } }).room?.roomNumber}</strong></p>
                <p><span className="text-muted-foreground">Status:</span> <span className="badge-success px-2 py-0.5 rounded-full text-xs">{myAllocation.status}</span></p>
                <p><span className="text-muted-foreground">From:</span> {new Date(myAllocation.startDate).toLocaleDateString('en-NG')}</p>
              </div>
            ) : (
              <p className="text-muted-foreground">No room allocated for {academicYear}. Contact the student affairs office.</p>
            )}
          </CardContent>
        </Card>
      )}

      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Hostel Blocks</h3>
        {blocks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hostel blocks configured yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {blocks.map((block) => (
              <Card key={block.id}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{block.name}</p>
                      <p className="text-xs text-muted-foreground">{block.gender} · {block._count?.rooms ?? block.totalRooms} rooms</p>
                    </div>
                    <span className={cn('rounded-full px-2 py-0.5 text-xs', block.isActive ? 'badge-success' : 'badge-neutral')}>
                      {block.isActive ? 'Open' : 'Closed'}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
