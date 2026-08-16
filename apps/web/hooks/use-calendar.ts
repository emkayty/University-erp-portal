'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CalendarV1, CalendarEventV1 } from '@uniportal/types';
import { apiClient } from '@/lib/api-client';

export const calendarKeys = {
  all:    ['calendar']              as const,
  active: ['calendar', 'active']   as const,
  one:    (id: string) => ['calendar', id] as const,
};

export function useCalendars() {
  return useQuery({
    queryKey: calendarKeys.all,
    queryFn:  () => apiClient.get<CalendarV1[]>('/calendar'),
    staleTime: 60_000,
  });
}

export function useActiveCalendar() {
  return useQuery({
    queryKey: calendarKeys.active,
    queryFn:  () => apiClient.get<CalendarV1 | null>('/calendar/active'),
    staleTime: 2 * 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useCalendar(id: string) {
  return useQuery({
    queryKey: calendarKeys.one(id),
    queryFn:  () => apiClient.get<CalendarV1>(`/calendar/${id}`),
    enabled:  !!id,
  });
}

export function useCreateCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { academicYear: string; startDate: string; endDate: string }) =>
      apiClient.post<CalendarV1>('/calendar', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: calendarKeys.all }),
  });
}

export function useActivateCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.patch<CalendarV1>(`/calendar/${id}/activate`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: calendarKeys.all });
      void qc.invalidateQueries({ queryKey: calendarKeys.active });
    },
  });
}

export function useSuspendCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiClient.patch<CalendarV1>(`/calendar/${id}/suspend`, { reason }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: calendarKeys.all });
      void qc.invalidateQueries({ queryKey: calendarKeys.active });
    },
  });
}

export function useResumeCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.patch<CalendarV1>(`/calendar/${id}/resume`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: calendarKeys.all });
      void qc.invalidateQueries({ queryKey: calendarKeys.active });
    },
  });
}

export function useCompleteCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.patch<CalendarV1>(`/calendar/${id}/complete`),
    onSuccess: () => qc.invalidateQueries({ queryKey: calendarKeys.all }),
  });
}

export function useAddCalendarEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ calendarId, data }: {
      calendarId: string;
      data: { name: string; eventType: string; startDate: string; endDate?: string; description?: string; isPublic?: boolean };
    }) => apiClient.post<CalendarEventV1>(`/calendar/${calendarId}/events`, data),
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: calendarKeys.one(vars.calendarId) }),
  });
}

export function useRemoveCalendarEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ calendarId, eventId }: { calendarId: string; eventId: string }) =>
      apiClient.delete(`/calendar/${calendarId}/events/${eventId}`),
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: calendarKeys.one(vars.calendarId) }),
  });
}
