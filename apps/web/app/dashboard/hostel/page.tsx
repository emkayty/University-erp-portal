'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ConfirmAction } from '@/components/erp/confirm-action';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/lib/utils';
import { hasEffectiveRole } from '@/lib/authz';
import type { HostelBlockV1, RoomAllocationV1 } from '@uniportal/types';
import { StudentPicker } from '@/components/erp/student-picker';

type HostelRoom = {
  id: string;
  roomNumber: string;
  capacity: number;
  currentOccupancy: number;
  roomType: string;
  allocations?: Array<{ id: string; student?: { matricNo?: string; firstName?: string; lastName?: string } }>;
};

type ActiveAllocation = RoomAllocationV1 & {
  id: string;
  studentId: string;
  academicYear: string;
  status: string;
  startDate: string;
  room?: { roomNumber?: string; hostelBlock?: { name?: string } };
  student?: { id: string; matricNo?: string; firstName?: string; lastName?: string };
};

export default function HostelPage() {
  const user = useAuthStore((state) => state.user);
  const isStudent = hasEffectiveRole(user, 'STUDENT');
  const canManage = hasEffectiveRole(user, 'REGISTRAR', 'SUPER_ADMIN');
  const [error, setError] = useState('');
  const [academicYear, setAcademicYear] = useState('2025/2026');
  const [selectedBlockId, setSelectedBlockId] = useState('');
  const [blockName, setBlockName] = useState('');
  const [blockGender, setBlockGender] = useState('MIXED');
  const [blockTotalRooms, setBlockTotalRooms] = useState('10');
  const [roomNumber, setRoomNumber] = useState('');
  const [roomCapacity, setRoomCapacity] = useState('4');
  const [roomType, setRoomType] = useState('STANDARD');
  const [allocationRoomId, setAllocationRoomId] = useState('');
  const [allocationStudentId, setAllocationStudentId] = useState('');
  const [allocationStartDate, setAllocationStartDate] = useState('');
  const [pendingVacate, setPendingVacate] = useState<ActiveAllocation | null>(null);

  const queryClient = useQueryClient();
  const { data: blocks = [], isLoading: blocksLoading } = useQuery({
    queryKey: ['hostel', 'blocks'],
    queryFn: () => apiClient.get<HostelBlockV1[]>('/hostel/blocks'),
    staleTime: 5 * 60_000,
  });
  const { data: rooms = [], isLoading: roomsLoading } = useQuery({
    queryKey: ['hostel', 'rooms', selectedBlockId],
    queryFn: () => apiClient.get<HostelRoom[]>(`/hostel/blocks/${selectedBlockId}/rooms`),
    enabled: canManage && Boolean(selectedBlockId),
  });
  const { data: allocations = [], isLoading: allocationsLoading } = useQuery({
    queryKey: ['hostel', 'allocations', academicYear],
    queryFn: () => apiClient.get<ActiveAllocation[]>(`/hostel/allocations?academicYear=${encodeURIComponent(academicYear)}`),
    enabled: canManage,
  });
  const { data: myAllocation } = useQuery({
    queryKey: ['hostel', 'allocation', 'my', academicYear],
    queryFn: () => apiClient.get<RoomAllocationV1 | null>(`/hostel/my-allocation?academicYear=${encodeURIComponent(academicYear)}`),
    enabled: isStudent,
    staleTime: 10 * 60_000,
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['hostel'] });
  }
  const createBlock = useMutation({
    mutationFn: () => apiClient.post('/hostel/blocks', { name: blockName.trim(), gender: blockGender, totalRooms: Number(blockTotalRooms) }),
    onSuccess: () => { setBlockName(''); setBlockTotalRooms('10'); setError(''); refresh(); },
    onError: (err) => setError(err.message),
  });
  const createRoom = useMutation({
    mutationFn: () => apiClient.post('/hostel/rooms', { hostelBlockId: selectedBlockId, roomNumber: roomNumber.trim(), capacity: Number(roomCapacity), roomType }),
    onSuccess: () => { setRoomNumber(''); setError(''); refresh(); },
    onError: (err) => setError(err.message),
  });
  const allocate = useMutation({
    mutationFn: () => apiClient.post('/hostel/allocations', { roomId: allocationRoomId, studentId: allocationStudentId.trim(), academicYear, startDate: allocationStartDate }),
    onSuccess: () => { setAllocationRoomId(''); setAllocationStudentId(''); setAllocationStartDate(''); setError(''); refresh(); },
    onError: (err) => setError(err.message),
  });
  const vacate = useMutation({
    mutationFn: (allocationId: string) => apiClient.patch(`/hostel/allocations/${allocationId}/vacate`),
    onSuccess: () => { setError(''); refresh(); },
    onError: (err) => setError(err.message),
  });

  const availableRooms = useMemo(() => rooms.filter((room) => room.currentOccupancy < room.capacity), [rooms]);

  return (
    <div className="erp-workspace-page">
      <header className="erp-workspace-header"><p className="text-sm text-muted-foreground">Student accommodation capacity, allocation, and vacancy control</p><h1 className="text-2xl font-semibold">Hostel & Accommodation</h1></header>
      {error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</div>}

      <Card className="max-w-xl"><CardHeader className="pb-2"><CardTitle className="text-sm">Academic year</CardTitle></CardHeader><CardContent><input className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={academicYear} onChange={(event) => setAcademicYear(event.target.value)} pattern="\\d{4}/\\d{4}" aria-label="Academic year" /></CardContent></Card>

      {isStudent && <Card className={cn('max-w-xl', myAllocation ? 'border-green-300' : '')}><CardHeader className="pb-2"><CardTitle className="text-sm">My accommodation</CardTitle></CardHeader><CardContent className="text-sm">{myAllocation ? <div className="space-y-1"><p><span className="text-muted-foreground">Block:</span> <strong>{(myAllocation as RoomAllocationV1 & { room?: { hostelBlock?: { name: string } } }).room?.hostelBlock?.name ?? '—'}</strong></p><p><span className="text-muted-foreground">Room:</span> <strong>{(myAllocation as RoomAllocationV1 & { room?: { roomNumber?: string } }).room?.roomNumber ?? '—'}</strong></p><p><span className="text-muted-foreground">Status:</span> <span className="badge-success rounded-full px-2 py-0.5 text-xs">{myAllocation.status}</span></p><p><span className="text-muted-foreground">From:</span> {new Date(myAllocation.startDate).toLocaleDateString('en-NG')}</p></div> : <p className="text-muted-foreground">No room allocated for {academicYear}. Contact the student affairs office.</p>}</CardContent></Card>}

      <section><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Hostel blocks</h2>{blocksLoading && <span className="text-xs text-muted-foreground">Loading…</span>}</div>{blocks.length === 0 ? <p className="text-sm text-muted-foreground">No hostel blocks configured yet.</p> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{blocks.map((block) => <Card key={block.id} className={cn(selectedBlockId === block.id && 'border-[--color-primary]')}><CardContent className="pt-4"><button type="button" className="w-full text-left" onClick={() => setSelectedBlockId(block.id)}><div className="flex items-start justify-between"><div><p className="text-sm font-semibold text-foreground">{block.name}</p><p className="text-xs text-muted-foreground">{block.gender} · {block._count?.rooms ?? block.totalRooms} rooms</p></div><span className={cn('rounded-full px-2 py-0.5 text-xs', block.isActive ? 'badge-success' : 'badge-neutral')}>{block.isActive ? 'Open' : 'Closed'}</span></div></button></CardContent></Card>)}</div>}</section>

      {canManage && <>
        <div className="grid gap-6 xl:grid-cols-3">
          <Card><CardHeader><CardTitle className="text-sm">Create hostel block</CardTitle></CardHeader><CardContent><form className="space-y-3" onSubmit={(event) => { event.preventDefault(); createBlock.mutate(); }}><input className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={blockName} onChange={(event) => setBlockName(event.target.value)} placeholder="Block name" minLength={2} required /><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={blockGender} onChange={(event) => setBlockGender(event.target.value)}><option>MALE</option><option>FEMALE</option><option>MIXED</option></select><input className="h-10 w-full rounded-md border bg-background px-3 text-sm" type="number" min={1} value={blockTotalRooms} onChange={(event) => setBlockTotalRooms(event.target.value)} placeholder="Total rooms" required /><Button type="submit" loading={createBlock.isPending}>Create block</Button></form></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm">Create room</CardTitle></CardHeader><CardContent><form className="space-y-3" onSubmit={(event) => { event.preventDefault(); createRoom.mutate(); }}><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={selectedBlockId} onChange={(event) => setSelectedBlockId(event.target.value)} required><option value="">Choose block</option>{blocks.map((block) => <option key={block.id} value={block.id}>{block.name}</option>)}</select><input className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={roomNumber} onChange={(event) => setRoomNumber(event.target.value)} placeholder="Room number" maxLength={10} required /><div className="grid grid-cols-2 gap-2"><input className="h-10 rounded-md border bg-background px-3 text-sm" type="number" min={1} max={8} value={roomCapacity} onChange={(event) => setRoomCapacity(event.target.value)} placeholder="Capacity" required /><select className="h-10 rounded-md border bg-background px-3 text-sm" value={roomType} onChange={(event) => setRoomType(event.target.value)}><option>STANDARD</option><option>ENSUITE</option><option>STUDIO</option><option>ACCESSIBLE</option></select></div><Button type="submit" disabled={!selectedBlockId} loading={createRoom.isPending}>Create room</Button></form></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm">Allocate room</CardTitle></CardHeader><CardContent><form className="space-y-3" onSubmit={(event) => { event.preventDefault(); allocate.mutate(); }}><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={allocationRoomId} onChange={(event) => setAllocationRoomId(event.target.value)} required><option value="">Choose available room</option>{availableRooms.map((room) => <option key={room.id} value={room.id}>{room.roomNumber} · {room.currentOccupancy}/{room.capacity}</option>)}</select><StudentPicker value={allocationStudentId} onChange={(id) => setAllocationStudentId(id)} filters={{ status: 'ACTIVE' }} required /><input className="h-10 w-full rounded-md border bg-background px-3 text-sm" type="date" value={allocationStartDate} onChange={(event) => setAllocationStartDate(event.target.value)} required /><Button type="submit" loading={allocate.isPending}>Allocate room</Button><p className="text-[11px] text-muted-foreground">The API rechecks student gender, capacity, duplicate academic-year allocation, and concurrency inside a transaction.</p></form></CardContent></Card>
        </div>

        <Card><CardHeader><CardTitle className="text-sm">Active allocations — {academicYear}</CardTitle></CardHeader><CardContent>{allocationsLoading ? <p className="text-sm">Loading allocations…</p> : allocations.length === 0 ? <p className="text-sm text-muted-foreground">No active allocations for this academic year.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">Student</th><th className="p-2">Block / room</th><th className="p-2">Start</th><th className="p-2">Action</th></tr></thead><tbody>{allocations.map((allocation) => <tr key={allocation.id} className="border-b last:border-0"><td className="p-2"><div>{allocation.student?.firstName} {allocation.student?.lastName}</div><div className="text-xs text-muted-foreground">{allocation.student?.matricNo ?? allocation.studentId}</div></td><td className="p-2">{allocation.room?.hostelBlock?.name ?? '—'} / {allocation.room?.roomNumber ?? '—'}</td><td className="p-2">{new Date(allocation.startDate).toLocaleDateString('en-NG')}</td><td className="p-2"><Button size="sm" variant="destructive" loading={vacate.isPending} onClick={() => setPendingVacate(allocation)}>Vacate</Button></td></tr>)}</tbody></table></div>}</CardContent></Card>

        {selectedBlockId && <Card><CardHeader><CardTitle className="text-sm">Rooms in selected block</CardTitle></CardHeader><CardContent>{roomsLoading ? <p className="text-sm">Loading rooms…</p> : rooms.length === 0 ? <p className="text-sm text-muted-foreground">No rooms found in this block.</p> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{rooms.map((room) => <div key={room.id} className="rounded-lg border p-3"><div className="flex items-center justify-between"><strong>{room.roomNumber}</strong><span className="text-xs text-muted-foreground">{room.roomType}</span></div><p className="mt-1 text-xs text-muted-foreground">Occupancy {room.currentOccupancy}/{room.capacity}</p>{room.allocations?.length ? <ul className="mt-2 space-y-1 text-xs">{room.allocations.map((allocation) => <li key={allocation.id}>{allocation.student?.firstName} {allocation.student?.lastName}</li>)}</ul> : <p className="mt-2 text-xs text-muted-foreground">Available</p>}</div>)}</div>}</CardContent></Card>}
      </>}
      <ConfirmAction open={Boolean(pendingVacate)} title="Vacate this room allocation?" description="The occupancy count will be decremented and the action will be recorded in the audit log." confirmLabel="Vacate allocation" destructive onCancel={() => setPendingVacate(null)} onConfirm={() => { if (pendingVacate) vacate.mutate(pendingVacate.id); setPendingVacate(null); }} />
    </div>
  );
}
