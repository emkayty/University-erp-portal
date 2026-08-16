'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppointmentV1, DrugV1, MedicalRecordV1, PatientV1, PrescriptionV1 } from '@uniportal/types';
import { apiClient } from '@/lib/api-client';

export const clinicKeys = {
  patients:     ['clinic', 'patients'] as const,
  myPatient:    ['clinic', 'patients', 'me'] as const,
  appointments: (f?: Record<string,string>) => ['clinic', 'appointments', f ?? {}] as const,
  record:       (id: string) => ['clinic', 'records', id] as const,
  history:      (patientId: string) => ['clinic', 'history', patientId] as const,
  drugs:        ['clinic', 'drugs'] as const,
  lowStock:     ['clinic', 'drugs', 'low-stock'] as const,
  prescriptions:(patientId: string) => ['clinic', 'prescriptions', patientId] as const,
};

export function useMyPatientProfile() {
  return useQuery({
    queryKey: clinicKeys.myPatient,
    queryFn:  () => apiClient.get<PatientV1>('/clinic/patients/me'),
    retry: false,
  });
}

export function usePatients(page = 1) {
  return useQuery({
    queryKey: [...clinicKeys.patients, page],
    queryFn:  () => apiClient.get<{ patients: PatientV1[]; total: number; totalPages: number }>(
      `/clinic/patients?page=${page}&pageSize=20`,
    ),
    staleTime: 60_000,
  });
}

export function useRegisterPatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiClient.post<PatientV1>('/clinic/patients', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: clinicKeys.patients }),
  });
}

export function useAppointments(filters?: Record<string, string>) {
  const p = new URLSearchParams({ pageSize: '20', ...filters });
  return useQuery({
    queryKey: clinicKeys.appointments(filters),
    queryFn:  () => apiClient.get<{ appointments: AppointmentV1[]; total: number }>(
      `/clinic/appointments?${p.toString()}`,
    ),
    staleTime: 30_000,
  });
}

export function useBookAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { patientId: string; doctorUserId: string; appointmentDate: string; reason?: string }) =>
      apiClient.post<AppointmentV1>('/clinic/appointments', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinic', 'appointments'] }),
  });
}

export function useUpdateAppointmentStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; status: string; notes?: string }) =>
      apiClient.patch<AppointmentV1>(`/clinic/appointments/${id}/status`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinic', 'appointments'] }),
  });
}

export function useMedicalRecord(recordId: string | null) {
  return useQuery({
    queryKey: clinicKeys.record(recordId ?? ''),
    queryFn:  () => apiClient.get<MedicalRecordV1>(`/clinic/records/${recordId}`),
    enabled:  !!recordId,
  });
}

export function usePatientHistory(patientId: string | null) {
  return useQuery({
    queryKey: clinicKeys.history(patientId ?? ''),
    queryFn:  () => apiClient.get<Pick<MedicalRecordV1,'id'|'appointmentId'|'followUpDate'|'createdAt'>[]>(
      `/clinic/patients/${patientId}/history`,
    ),
    enabled: !!patientId,
  });
}

export function useCreateMedicalRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient.post<{ id: string; appointmentId: string; createdAt: string }>('/clinic/records', data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['clinic', 'appointments'] });
      void qc.invalidateQueries({ queryKey: ['clinic', 'history'] });
    },
  });
}

export function useDrugs(page = 1) {
  return useQuery({
    queryKey: [...clinicKeys.drugs, page],
    queryFn:  () => apiClient.get<{ drugs: DrugV1[]; total: number }>(
      `/clinic/drugs?page=${page}&pageSize=50`,
    ),
    staleTime: 60_000,
  });
}

export function useLowStockDrugs() {
  return useQuery({
    queryKey: clinicKeys.lowStock,
    queryFn:  () => apiClient.get<DrugV1[]>('/clinic/drugs/low-stock'),
    staleTime: 30_000,
  });
}

export function useCreateDrug() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiClient.post<DrugV1>('/clinic/drugs', data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clinicKeys.drugs });
      void qc.invalidateQueries({ queryKey: clinicKeys.lowStock });
    },
  });
}

export function useAdjustStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; quantity: number; operation: 'ADD'|'SUBTRACT'; reason?: string }) =>
      apiClient.patch<DrugV1>(`/clinic/drugs/${id}/stock`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clinicKeys.drugs });
      void qc.invalidateQueries({ queryKey: clinicKeys.lowStock });
    },
  });
}

export function usePatientPrescriptions(patientId: string | null) {
  return useQuery({
    queryKey: clinicKeys.prescriptions(patientId ?? ''),
    queryFn:  () => apiClient.get<PrescriptionV1[]>(`/clinic/patients/${patientId}/prescriptions`),
    enabled:  !!patientId,
  });
}

export function useCreatePrescription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient.post<{ id: string; dispensedAt: string }>('/clinic/prescriptions', data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clinicKeys.drugs });
      void qc.invalidateQueries({ queryKey: clinicKeys.lowStock });
    },
  });
}
