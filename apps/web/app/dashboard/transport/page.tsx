'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  useVehicles, useRoutes, useTrips, useMyBookings,
  useBookTrip, useCancelBooking, useUpdateTripStatus,
} from '@/hooks/use-transport';
import { useAuthStore } from '@/stores/auth.store';
import { cn, formatDate } from '@/lib/utils';

const TRIP_COLORS: Record<string, string> = {
  SCHEDULED: 'badge-warning', DEPARTED: 'badge-info',
  ARRIVED: 'badge-success',  CANCELLED: 'badge-neutral',
};
const VEHICLE_STATUS_COLORS: Record<string, string> = {
  AVAILABLE: 'badge-success', IN_USE: 'badge-warning',
  MAINTENANCE: 'badge-danger', DECOMMISSIONED: 'badge-neutral',
};

type Tab = 'trips' | 'fleet' | 'routes' | 'my-bookings';

export default function TransportPage() {
  const user = useAuthStore((s) => s.user);
  const isTransportStaff = user?.staffScope?.scopes?.includes('transport');

  const [tab, setTab]          = useState<Tab>('trips');
  const [routeFilter, setRoute] = useState('');
  const [dateFilter, setDate]   = useState('');
  const [err, setErr]           = useState('');
  const [msg, setMsg]           = useState('');

  const filters = {
    ...(routeFilter ? { routeId: routeFilter } : {}),
    ...(dateFilter  ? { date: dateFilter }     : {}),
  };

  const { data: tripData,    isLoading: tripsLoading }  = useTrips(Object.keys(filters).length ? filters : undefined);
  const { data: vehicles = [], isLoading: vehicleLoading } = useVehicles();
  const { data: routes   = [] }                           = useRoutes();
  const { data: myBookings = [] }                         = useMyBookings();

  const { mutate: bookTrip,   isPending: booking }    = useBookTrip();
  const { mutate: cancelBk,   isPending: cancelling } = useCancelBooking();
  const { mutate: updateTrip, isPending: updatingTrip } = useUpdateTripStatus();

  const trips = tripData?.trips ?? [];

  const handleBook = (tripId: string) => {
    setErr(''); setMsg('');
    bookTrip({ tripId }, {
      onSuccess: (r) => setMsg(`✓ Seat booked on trip. Fare: ₦${parseFloat(r.fare ?? '0').toLocaleString()}`),
      onError:   (e) => setErr(e.message),
    });
  };

  const handleCancel = (bookingId: string) => {
    setErr(''); setMsg('');
    cancelBk(bookingId, {
      onSuccess: () => setMsg('✓ Booking cancelled'),
      onError:   (e) => setErr(e.message),
    });
  };

  const handleTripStatus = (tripId: string, status: string) => {
    setErr(''); setMsg('');
    updateTrip({ id: tripId, status }, {
      onSuccess: () => setMsg(`✓ Trip marked as ${status}`),
      onError:   (e) => setErr(e.message),
    });
  };

  const tabs: { k: Tab; l: string }[] = [
    { k: 'trips',       l: `Scheduled Trips (${trips.length})` },
    { k: 'my-bookings', l: `My Bookings (${myBookings.length})` },
    ...(isTransportStaff
      ? [{ k: 'fleet' as Tab, l: `Fleet (${vehicles.length})` }, { k: 'routes' as Tab, l: `Routes (${routes.length})` }]
      : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-semibold text-foreground">Transport & Logistics</h2>
        <div className="flex gap-2 flex-wrap">
          {tabs.map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)}
              className={cn('rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                tab === t.k ? 'bg-[--color-primary] text-white' : 'bg-muted text-muted-foreground hover:text-foreground')}>
              {t.l}
            </button>
          ))}
        </div>
      </div>

      {err && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-[--color-danger]">{err}</div>}
      {msg && <div role="status" className="rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">{msg}</div>}

      {/* ── Scheduled Trips ─────────────────────────────────────────────── */}
      {tab === 'trips' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <select value={routeFilter} onChange={(e) => setRoute(e.target.value)}
              className="h-9 rounded border border-input bg-background px-3 text-sm">
              <option value="">All Routes</option>
              {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <input type="date" value={dateFilter} onChange={(e) => setDate(e.target.value)}
              className="h-9 rounded border border-input bg-background px-3 text-sm" />
            {(routeFilter || dateFilter) && (
              <Button size="sm" variant="ghost" onClick={() => { setRoute(''); setDate(''); }}>Clear</Button>
            )}
          </div>

          {tripsLoading ? (
            <div className="animate-pulse space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-24 rounded bg-muted" />)}
            </div>
          ) : trips.length === 0 ? (
            <p className="text-sm text-muted-foreground">No trips match your filters.</p>
          ) : (
            trips.map((trip) => {
              const booked = myBookings.some((b) => b.tripId === trip.id && b.status === 'CONFIRMED');
              const full   = trip.availableSeats === 0;
              return (
                <Card key={trip.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between flex-wrap gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', TRIP_COLORS[trip.status] ?? '')}>
                            {trip.status}
                          </span>
                          <span className="text-sm font-semibold text-foreground">
                            {trip.route?.name ?? 'Route unknown'}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {trip.route?.origin} → {trip.route?.destination}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Departure: {formatDate(trip.departureTime)} ·
                          Vehicle: {trip.vehicle?.make} {trip.vehicle?.model} ({trip.vehicle?.registrationNo})
                        </p>
                        <div className="flex items-center gap-3 text-xs">
                          <span className={cn(full ? 'text-[--color-danger]' : 'text-green-700')}>
                            {full ? '🚫 Full' : `${trip.availableSeats} seats left`}
                          </span>
                          <span className="text-muted-foreground">
                            Fare: ₦{parseFloat(trip.route?.fareAmount ?? '0').toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        {trip.status === 'SCHEDULED' && !booked && !full && (
                          <Button size="sm" loading={booking} onClick={() => handleBook(trip.id)}>
                            Book Seat
                          </Button>
                        )}
                        {booked && <span className="rounded-full px-2 py-0.5 text-xs badge-success">✓ Booked</span>}
                        {isTransportStaff && trip.status === 'SCHEDULED' && (
                          <Button size="sm" variant="outline" loading={updatingTrip}
                            onClick={() => handleTripStatus(trip.id, 'DEPARTED')}>
                            Depart
                          </Button>
                        )}
                        {isTransportStaff && trip.status === 'DEPARTED' && (
                          <Button size="sm" variant="outline" loading={updatingTrip}
                            onClick={() => handleTripStatus(trip.id, 'ARRIVED')}>
                            Arrive
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* ── My Bookings ─────────────────────────────────────────────────── */}
      {tab === 'my-bookings' && (
        <div className="space-y-3">
          {myBookings.length === 0 ? (
            <p className="text-sm text-muted-foreground">You have no bookings.</p>
          ) : (
            myBookings.map((bk) => (
              <Card key={bk.id} className={cn(bk.status === 'CANCELLED' && 'opacity-60')}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between flex-wrap gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">
                        {bk.trip?.route?.origin} → {bk.trip?.route?.destination}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Departure: {bk.trip ? formatDate(bk.trip.departureTime) : '—'} ·
                        Fare: ₦{parseFloat(bk.trip?.route?.fareAmount ?? '0').toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Vehicle: {bk.trip?.vehicle?.make} {bk.trip?.vehicle?.model} ({bk.trip?.vehicle?.registrationNo})
                      </p>
                      <span className={cn('rounded-full px-2 py-0.5 text-xs',
                        bk.status === 'CONFIRMED' ? 'badge-success' : bk.status === 'CANCELLED' ? 'badge-neutral' : 'badge-danger')}>
                        {bk.status}
                      </span>
                    </div>
                    {bk.status === 'CONFIRMED' && bk.trip?.status === 'SCHEDULED' && (
                      <Button size="sm" variant="outline" loading={cancelling} onClick={() => handleCancel(bk.id)}>
                        Cancel Booking
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* ── Fleet (Staff Only) ───────────────────────────────────────────── */}
      {tab === 'fleet' && isTransportStaff && (
        <div className="overflow-hidden rounded-lg border border-border">
          {vehicleLoading ? <div className="animate-pulse h-48 rounded bg-muted" /> : (
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  {['Reg No', 'Vehicle', 'Year', 'Capacity', 'Type', 'Status'].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {vehicles.map((v) => (
                  <tr key={v.id}>
                    <td className="px-3 py-2 font-mono text-xs text-[--color-primary]">{v.registrationNo}</td>
                    <td className="px-3 py-2 font-medium">{v.make} {v.model}</td>
                    <td className="px-3 py-2 text-muted-foreground">{v.year}</td>
                    <td className="px-3 py-2 text-center">{v.capacity}</td>
                    <td className="px-3 py-2 text-muted-foreground text-xs">{v.vehicleType}</td>
                    <td className="px-3 py-2">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs', VEHICLE_STATUS_COLORS[v.status] ?? '')}>
                        {v.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Routes (Staff Only) ─────────────────────────────────────────── */}
      {tab === 'routes' && isTransportStaff && (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                {['Route Name', 'Origin', 'Destination', 'Distance', 'Est. Time', 'Fare'].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {routes.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 font-medium text-foreground">{r.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.origin}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.destination}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.distanceKm ? `${r.distanceKm} km` : '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.estimatedMinutes ? `${r.estimatedMinutes} min` : '—'}</td>
                  <td className="px-3 py-2 font-semibold">₦{parseFloat(r.fareAmount).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
