'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  useVehicles, useRoutes, useTrips, useMyBookings,
  useBookTrip, useCancelBooking, useUpdateTripStatus,
  useCreateVehicle, useUpdateVehicleStatus, useCreateRoute, useUpdateRoute, useCreateTrip,
} from '@/hooks/use-transport';
import { useAuthStore } from '@/stores/auth.store';
import { useModuleCapabilities } from '@/hooks/use-settings';
import { effectiveRolesOf, hasEffectiveScope } from '@/lib/authz';
import { cn, formatDate } from '@/lib/utils';

const TRIP_COLORS: Record<string, string> = {
  SCHEDULED: 'badge-warning', DEPARTED: 'badge-info',
  ARRIVED: 'badge-success',  CANCELLED: 'badge-neutral',
};
const VEHICLE_STATUS_COLORS: Record<string, string> = {
  AVAILABLE: 'badge-success', IN_USE: 'badge-warning',
  MAINTENANCE: 'badge-danger', DECOMMISSIONED: 'badge-neutral',
};
const VEHICLE_TYPES = ['BUS', 'SHUTTLE', 'CAR', 'VAN', 'MOTORCYCLE', 'OTHER'];
const VEHICLE_STATUSES = ['AVAILABLE', 'IN_USE', 'MAINTENANCE', 'DECOMMISSIONED'];

type Tab = 'trips' | 'fleet' | 'routes' | 'my-bookings';

export default function TransportPage() {
  const user = useAuthStore((s) => s.user);
  const effectiveRoles = effectiveRolesOf(user);
  const isTransportStaff = effectiveRoles.includes('SUPER_ADMIN')
    || (effectiveRoles.includes('STAFF') && hasEffectiveScope(user, 'transport'));
  const { data: moduleCapabilities, isLoading: capabilitiesLoading, isError: capabilitiesError, refetch: refetchCapabilities } = useModuleCapabilities();
  const moduleEnabled = moduleCapabilities?.module_transport === true;

  const [tab, setTab]          = useState<Tab>('trips');
  const [routeFilter, setRoute] = useState('');
  const [dateFilter, setDate]   = useState('');
  const [err, setErr]           = useState('');
  const [msg, setMsg]           = useState('');
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [showRouteForm, setShowRouteForm] = useState(false);
  const [showTripForm, setShowTripForm] = useState(false);
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
  const [vehicleForm, setVehicleForm] = useState({ registrationNo: '', make: '', model: '', year: String(new Date().getFullYear()), capacity: '40', vehicleType: 'BUS', lastServiceDate: '', nextServiceDate: '' });
  const [routeForm, setRouteForm] = useState({ name: '', origin: '', destination: '', distanceKm: '', estimatedMinutes: '', fareAmount: '', stops: '' });
  const [tripForm, setTripForm] = useState({ vehicleId: '', routeId: '', driverUserId: '', departureTime: '', notes: '' });

  const filters = {
    ...(routeFilter ? { routeId: routeFilter } : {}),
    ...(dateFilter  ? { date: dateFilter }     : {}),
  };

  const { data: tripData,    isLoading: tripsLoading }  = useTrips(Object.keys(filters).length ? filters : undefined, { enabled: moduleEnabled });
  const { data: vehicles = [], isLoading: vehicleLoading } = useVehicles({ enabled: moduleEnabled && isTransportStaff });
  const { data: routes   = [] }                           = useRoutes({ enabled: moduleEnabled });
  const { data: myBookings = [] }                         = useMyBookings({ enabled: moduleEnabled });

  const { mutate: bookTrip,   isPending: booking }    = useBookTrip();
  const { mutate: cancelBk,   isPending: cancelling } = useCancelBooking();
  const { mutate: updateTrip, isPending: updatingTrip } = useUpdateTripStatus();
  const { mutate: createVehicle, isPending: creatingVehicle } = useCreateVehicle();
  const { mutate: updateVehicleStatus, isPending: updatingVehicle } = useUpdateVehicleStatus();
  const { mutate: createRoute, isPending: creatingRoute } = useCreateRoute();
  const { mutate: updateRoute, isPending: updatingRoute } = useUpdateRoute();
  const { mutate: createTrip, isPending: creatingTrip } = useCreateTrip();

  const trips = tripData?.trips ?? [];

  if (capabilitiesLoading) {
    return <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground" role="status">Checking Transport access…</div>;
  }
  if (capabilitiesError || !moduleEnabled) {
    return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900" role="alert"><p className="font-semibold">Transport is not available</p><p className="mt-1">This module is disabled for the institution or its capability state could not be loaded.</p><Button className="mt-4" variant="outline" onClick={() => void refetchCapabilities()}>Retry</Button></div>;
  }

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
      onSuccess: () => setMsg(`Trip marked as ${status}.`),
      onError:   (e) => setErr(e.message),
    });
  };

  const handleCreateVehicle = () => {
    setErr(''); setMsg('');
    if (!vehicleForm.registrationNo || !vehicleForm.make || !vehicleForm.model) { setErr('Registration number, make, and model are required.'); return; }
    createVehicle({ ...vehicleForm, year: Number(vehicleForm.year), capacity: Number(vehicleForm.capacity), lastServiceDate: vehicleForm.lastServiceDate || undefined, nextServiceDate: vehicleForm.nextServiceDate || undefined }, {
      onSuccess: () => { setMsg('Vehicle created successfully.'); setShowVehicleForm(false); setVehicleForm({ registrationNo: '', make: '', model: '', year: String(new Date().getFullYear()), capacity: '40', vehicleType: 'BUS', lastServiceDate: '', nextServiceDate: '' }); },
      onError: (e) => setErr(e.message),
    });
  };

  const handleCreateOrUpdateRoute = () => {
    setErr(''); setMsg('');
    if (!routeForm.name || !routeForm.origin || !routeForm.destination || !routeForm.fareAmount) { setErr('Route name, origin, destination, and fare are required.'); return; }
    const data = { name: routeForm.name, origin: routeForm.origin, destination: routeForm.destination, fareAmount: routeForm.fareAmount, distanceKm: routeForm.distanceKm || undefined, estimatedMinutes: routeForm.estimatedMinutes ? Number(routeForm.estimatedMinutes) : undefined, stops: routeForm.stops.split(',').map((stop) => stop.trim()).filter(Boolean) };
    if (editingRouteId) {
      updateRoute({ id: editingRouteId, name: data.name, fareAmount: data.fareAmount, distanceKm: data.distanceKm, estimatedMinutes: data.estimatedMinutes, stops: data.stops }, { onSuccess: () => { setMsg('Route updated successfully.'); setEditingRouteId(null); setShowRouteForm(false); }, onError: (e) => setErr(e.message) });
    } else {
      createRoute(data, { onSuccess: () => { setMsg('Route created successfully.'); setShowRouteForm(false); setRouteForm({ name: '', origin: '', destination: '', distanceKm: '', estimatedMinutes: '', fareAmount: '', stops: '' }); }, onError: (e) => setErr(e.message) });
    }
  };

  const handleCreateTrip = () => {
    setErr(''); setMsg('');
    if (!tripForm.vehicleId || !tripForm.routeId || !tripForm.driverUserId || !tripForm.departureTime) { setErr('Vehicle, route, driver user ID, and departure time are required.'); return; }
    createTrip({ ...tripForm, departureTime: new Date(tripForm.departureTime).toISOString() }, { onSuccess: () => { setMsg('Trip created successfully.'); setShowTripForm(false); setTripForm({ vehicleId: '', routeId: '', driverUserId: '', departureTime: '', notes: '' }); }, onError: (e) => setErr(e.message) });
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
            <button type="button" key={t.k} onClick={() => setTab(t.k)}
              className={cn('rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                tab === t.k ? 'bg-[--color-primary] text-white' : 'bg-muted text-muted-foreground hover:text-foreground')}>
              {t.l}
            </button>
          ))}
        </div>
      </div>

      {err && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-[--color-danger]">{err}</div>}
      {msg && <div role="status" className="rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">{msg}</div>}

      {isTransportStaff && (
        <div className="flex flex-wrap gap-2 rounded-xl border border-[--color-primary]/20 bg-[--color-primary]/5 p-3">
          <p className="mr-auto self-center text-sm text-muted-foreground">Operations management</p>
          <Button size="sm" variant={showVehicleForm ? 'default' : 'outline'} onClick={() => { setShowVehicleForm((value) => !value); setShowRouteForm(false); setShowTripForm(false); setEditingRouteId(null); }}>Add vehicle</Button>
          <Button size="sm" variant={showRouteForm ? 'default' : 'outline'} onClick={() => { setShowRouteForm((value) => !value); setShowVehicleForm(false); setShowTripForm(false); }}>Add or edit route</Button>
          <Button size="sm" variant={showTripForm ? 'default' : 'outline'} onClick={() => { setShowTripForm((value) => !value); setShowVehicleForm(false); setShowRouteForm(false); }}>Schedule trip</Button>
        </div>
      )}

      {isTransportStaff && showVehicleForm && (
        <Card><CardHeader><CardTitle className="text-base">Register vehicle</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {([['registrationNo','Registration number'],['make','Make'],['model','Model'],['year','Year'],['capacity','Capacity']] as const).map(([key, label]) => <div key={key} className="space-y-1"><Label htmlFor={`vehicle-${key}`}>{label}</Label><Input id={`vehicle-${key}`} type={key === 'year' || key === 'capacity' ? 'number' : 'text'} value={vehicleForm[key]} onChange={(event) => setVehicleForm((current) => ({ ...current, [key]: event.target.value }))} /></div>)}
          <div className="space-y-1"><Label htmlFor="vehicle-type">Vehicle type</Label><select id="vehicle-type" value={vehicleForm.vehicleType} onChange={(event) => setVehicleForm((current) => ({ ...current, vehicleType: event.target.value }))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">{VEHICLE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></div>
          <div className="space-y-1"><Label htmlFor="vehicle-last-service">Last service</Label><Input id="vehicle-last-service" type="date" value={vehicleForm.lastServiceDate} onChange={(event) => setVehicleForm((current) => ({ ...current, lastServiceDate: event.target.value }))} /></div>
          <div className="space-y-1"><Label htmlFor="vehicle-next-service">Next service</Label><Input id="vehicle-next-service" type="date" value={vehicleForm.nextServiceDate} onChange={(event) => setVehicleForm((current) => ({ ...current, nextServiceDate: event.target.value }))} /></div>
          <div className="flex items-end"><Button loading={creatingVehicle} onClick={handleCreateVehicle}>Register vehicle</Button></div>
        </CardContent></Card>
      )}

      {isTransportStaff && showRouteForm && (
        <Card><CardHeader><CardTitle className="text-base">{editingRouteId ? 'Edit route' : 'Create route'}</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {([['name','Route name'],['origin','Origin'],['destination','Destination'],['fareAmount','Fare (NGN)'],['distanceKm','Distance (km)'],['estimatedMinutes','Estimated minutes']] as const).map(([key, label]) => <div key={key} className="space-y-1"><Label htmlFor={`route-${key}`}>{label}</Label><Input id={`route-${key}`} type={['fareAmount','distanceKm','estimatedMinutes'].includes(key) ? 'number' : 'text'} value={routeForm[key]} onChange={(event) => setRouteForm((current) => ({ ...current, [key]: event.target.value }))} /></div>)}
          <div className="space-y-1 sm:col-span-2 lg:col-span-3"><Label htmlFor="route-stops">Stops</Label><Input id="route-stops" placeholder="Comma-separated stop names" value={routeForm.stops} onChange={(event) => setRouteForm((current) => ({ ...current, stops: event.target.value }))} /></div>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-3"><Button loading={creatingRoute || updatingRoute} onClick={handleCreateOrUpdateRoute}>{editingRouteId ? 'Save route' : 'Create route'}</Button><Button type="button" variant="outline" onClick={() => { setShowRouteForm(false); setEditingRouteId(null); }}>Cancel</Button></div>
        </CardContent></Card>
      )}

      {isTransportStaff && showTripForm && (
        <Card><CardHeader><CardTitle className="text-base">Schedule trip</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label htmlFor="trip-vehicle">Vehicle</Label><select id="trip-vehicle" value={tripForm.vehicleId} onChange={(event) => setTripForm((current) => ({ ...current, vehicleId: event.target.value }))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Select vehicle</option>{vehicles.filter((vehicle) => vehicle.status === 'AVAILABLE').map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.registrationNo} — {vehicle.make} {vehicle.model}</option>)}</select></div>
          <div className="space-y-1"><Label htmlFor="trip-route">Route</Label><select id="trip-route" value={tripForm.routeId} onChange={(event) => setTripForm((current) => ({ ...current, routeId: event.target.value }))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Select route</option>{routes.map((route) => <option key={route.id} value={route.id}>{route.name}</option>)}</select></div>
          <div className="space-y-1"><Label htmlFor="trip-driver">Driver user ID</Label><Input id="trip-driver" placeholder="UUID of assigned driver" value={tripForm.driverUserId} onChange={(event) => setTripForm((current) => ({ ...current, driverUserId: event.target.value }))} /></div>
          <div className="space-y-1"><Label htmlFor="trip-departure">Departure</Label><Input id="trip-departure" type="datetime-local" value={tripForm.departureTime} onChange={(event) => setTripForm((current) => ({ ...current, departureTime: event.target.value }))} /></div>
          <div className="space-y-1 sm:col-span-2"><Label htmlFor="trip-notes">Notes</Label><Input id="trip-notes" value={tripForm.notes} onChange={(event) => setTripForm((current) => ({ ...current, notes: event.target.value }))} /></div>
          <div className="sm:col-span-2"><Button loading={creatingTrip} onClick={handleCreateTrip}>Schedule trip</Button></div>
        </CardContent></Card>
      )}

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
                    {['Reg No', 'Vehicle', 'Year', 'Capacity', 'Type', 'Status', 'Actions'].map((h) => (
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
                    <td className="px-3 py-2"><select aria-label={`Update status for ${v.registrationNo}`} value={v.status} disabled={updatingVehicle} onChange={(event) => { setErr(''); setMsg(''); updateVehicleStatus({ id: v.id, status: event.target.value }, { onSuccess: () => setMsg(`Vehicle ${v.registrationNo} status updated.`), onError: (e) => setErr(e.message) }); }} className="h-8 rounded border border-input bg-background px-2 text-xs">{VEHICLE_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></td>
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
                  <td className="px-3 py-2"><Button size="sm" variant="outline" onClick={() => { setEditingRouteId(r.id); setRouteForm({ name: r.name, origin: r.origin, destination: r.destination, distanceKm: r.distanceKm ?? '', estimatedMinutes: r.estimatedMinutes ? String(r.estimatedMinutes) : '', fareAmount: r.fareAmount, stops: (r.stops ?? []).join(', ') }); setShowRouteForm(true); setErr(''); setMsg(''); }}>Edit</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
