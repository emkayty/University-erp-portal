'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TransportRouteV1, TripBookingV1, TripV1, VehicleV1 } from '@uniportal/types';
import { apiClient } from '@/lib/api-client';

export const transportKeys = {
  vehicles: ['transport', 'vehicles'] as const,
  routes:   ['transport', 'routes'] as const,
  trips:    (f?: Record<string,string>) => ['transport', 'trips', f ?? {}] as const,
  myBookings: ['transport', 'bookings', 'me'] as const,
};

export function useVehicles(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: transportKeys.vehicles,
    queryFn:  () => apiClient.get<VehicleV1[]>('/transport/vehicles'),
    staleTime: 60_000,
    enabled: options?.enabled ?? true,
  });
}

export function useCreateVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiClient.post<VehicleV1>('/transport/vehicles', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: transportKeys.vehicles }),
  });
}

export function useUpdateVehicleStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; status: string; notes?: string }) =>
      apiClient.patch<VehicleV1>(`/transport/vehicles/${id}/status`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: transportKeys.vehicles }),
  });
}

export function useRoutes(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: transportKeys.routes,
    queryFn:  () => apiClient.get<TransportRouteV1[]>('/transport/routes'),
    staleTime: 5 * 60_000,
    enabled: options?.enabled ?? true,
  });
}

export function useCreateRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiClient.post<TransportRouteV1>('/transport/routes', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: transportKeys.routes }),
  });
}

export function useTrips(filters?: Record<string, string>, options?: { enabled?: boolean }) {
  const p = new URLSearchParams({ pageSize: '30', ...filters });
  return useQuery({
    queryKey: transportKeys.trips(filters),
    queryFn:  () => apiClient.get<{ trips: TripV1[]; total: number }>(
      `/transport/trips?${p.toString()}`,
    ),
    staleTime: 30_000,
    enabled: options?.enabled ?? true,
  });
}

export function useCreateTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiClient.post<TripV1>('/transport/trips', data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['transport', 'trips'] });
      void qc.invalidateQueries({ queryKey: transportKeys.vehicles });
    },
  });
}

export function useUpdateTripStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; status: string; arrivalTime?: string }) =>
      apiClient.patch<TripV1>(`/transport/trips/${id}/status`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['transport', 'trips'] });
      void qc.invalidateQueries({ queryKey: transportKeys.vehicles });
    },
  });
}

export function useMyBookings(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: transportKeys.myBookings,
    queryFn:  () => apiClient.get<TripBookingV1[]>('/transport/bookings/me'),
    staleTime: 60_000,
    enabled: options?.enabled ?? true,
  });
}

export function useBookTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { tripId: string; seatNumber?: number }) =>
      apiClient.post<TripBookingV1>('/transport/bookings', data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: transportKeys.myBookings });
      void qc.invalidateQueries({ queryKey: ['transport', 'trips'] });
    },
  });
}

export function useCancelBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bookingId: string) =>
      apiClient.delete<{ message: string }>(`/transport/bookings/${bookingId}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: transportKeys.myBookings });
      void qc.invalidateQueries({ queryKey: ['transport', 'trips'] });
    },
  });
}
