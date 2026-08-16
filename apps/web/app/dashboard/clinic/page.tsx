'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  useAppointments, useUpdateAppointmentStatus, useCreateMedicalRecord,
  useDrugs, useLowStockDrugs, useAdjustStock, useCreateDrug,
} from '@/hooks/use-clinic';
import { useAuthStore } from '@/stores/auth.store';
import { cn, formatDate } from '@/lib/utils';

const APPT_STATUS_COLORS: Record<string, string> = {
  SCHEDULED: 'badge-warning', COMPLETED: 'badge-success',
  CANCELLED: 'badge-neutral', NO_SHOW: 'badge-danger',
};
const DRUG_FORM_LABELS: Record<string, string> = {
  TABLET: '💊', CAPSULE: '💊', SYRUP: '🍶', INJECTION: '💉',
  CREAM: '🧴', INHALER: '🫁', DROPS: '💧', OTHER: '📦',
};

type Tab = 'appointments' | 'drugs' | 'low-stock';

export default function ClinicPage() {
  const user = useAuthStore((s) => s.user);
  const [tab, setTab]              = useState<Tab>('appointments');
  const [statusFilter, setStatus]  = useState('');
  const [recordApptId, setRecord]  = useState<string | null>(null);
  const [diagnosis, setDiagnosis]  = useState('');
  const [treatment, setTreatment]  = useState('');
  const [rxNotes, setRxNotes]      = useState('');
  const [stockDrugId, setStockId]  = useState<string | null>(null);
  const [stockQty, setStockQty]    = useState('');
  const [stockOp, setStockOp]      = useState<'ADD' | 'SUBTRACT'>('ADD');
  const [err, setErr]              = useState('');
  const [msg, setMsg]              = useState('');

  const filters = statusFilter ? { status: statusFilter } : undefined;
  const { data: apptData, isLoading: apptLoading }  = useAppointments(filters);
  const { data: drugsData, isLoading: drugsLoading } = useDrugs();
  const { data: lowStock = [] }                       = useLowStockDrugs();

  const { mutate: updateStatus, isPending: updatingStatus } = useUpdateAppointmentStatus();
  const { mutate: createRecord, isPending: recording }      = useCreateMedicalRecord();
  const { mutate: adjustStock,  isPending: adjusting }      = useAdjustStock();

  const appointments = apptData?.appointments ?? [];
  const drugs        = drugsData?.drugs        ?? [];

  const handleStatusChange = (id: string, status: string) => {
    setErr(''); setMsg('');
    updateStatus({ id, status }, {
      onSuccess: () => setMsg(`✓ Appointment marked ${status}`),
      onError:   (e) => setErr(e.message),
    });
  };

  const handleCreateRecord = () => {
    if (!recordApptId) return;
    setErr(''); setMsg('');
    createRecord(
      { appointmentId: recordApptId, patientId: '', diagnosis, treatmentNotes: treatment, prescriptionNotes: rxNotes },
      {
        onSuccess: () => { setMsg('✓ Medical record created and encrypted'); setRecord(null); setDiagnosis(''); setTreatment(''); setRxNotes(''); },
        onError:   (e) => setErr(e.message),
      },
    );
  };

  const handleAdjustStock = () => {
    if (!stockDrugId || !stockQty) return;
    setErr(''); setMsg('');
    adjustStock(
      { id: stockDrugId, quantity: parseInt(stockQty, 10), operation: stockOp },
      {
        onSuccess: () => { setMsg(`✓ Stock ${stockOp === 'ADD' ? 'added' : 'reduced'}`); setStockId(null); setStockQty(''); },
        onError:   (e) => setErr(e.message),
      },
    );
  };

  const tabs: { k: Tab; l: string }[] = [
    { k: 'appointments', l: `Appointments (${appointments.length})` },
    { k: 'drugs',        l: `Drug Inventory (${drugs.length})` },
    { k: 'low-stock',    l: `Low Stock ${lowStock.length > 0 ? `⚠ ${lowStock.length}` : ''}` },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Health Clinic</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Medical records are AES-256 encrypted end-to-end.
          </p>
        </div>
        <div className="flex gap-2">
          {tabs.map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                tab === t.k
                  ? 'bg-[--color-primary] text-white'
                  : 'bg-muted text-muted-foreground hover:text-foreground',
              )}>
              {t.l}
            </button>
          ))}
        </div>
      </div>

      {err && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-[--color-danger]">{err}</div>}
      {msg && <div role="status" className="rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">{msg}</div>}

      {/* ── Appointments ───────────────────────────────────────────────── */}
      {tab === 'appointments' && (
        <div className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            {['', 'SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'].map((s) => (
              <button key={s || 'all'}
                onClick={() => { setStatus(s); setErr(''); setMsg(''); }}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  statusFilter === s
                    ? 'bg-[--color-primary] text-white'
                    : 'bg-muted text-muted-foreground hover:text-foreground',
                )}>
                {s || 'All'}
              </button>
            ))}
          </div>

          {apptLoading ? (
            <div className="animate-pulse space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-20 rounded bg-muted" />)}
            </div>
          ) : appointments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No appointments found.</p>
          ) : (
            appointments.map((appt) => (
              <Card key={appt.id} className={cn(appt.status === 'CANCELLED' && 'opacity-60')}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between flex-wrap gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', APPT_STATUS_COLORS[appt.status] ?? '')}>
                          {appt.status}
                        </span>
                        <span className="text-sm font-medium text-foreground">
                          {formatDate(appt.appointmentDate)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">Patient ID: {appt.patientId}</p>
                      {appt.reason && <p className="text-xs text-muted-foreground">Reason: {appt.reason}</p>}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {appt.status === 'SCHEDULED' && (
                        <>
                          <Button size="sm" loading={updatingStatus}
                            onClick={() => handleStatusChange(appt.id, 'COMPLETED')}>
                            Mark Complete
                          </Button>
                          <Button size="sm" variant="outline"
                            onClick={() => { setRecord(appt.id); setErr(''); setMsg(''); }}>
                            Add Record
                          </Button>
                          <Button size="sm" variant="ghost" loading={updatingStatus}
                            onClick={() => handleStatusChange(appt.id, 'CANCELLED')}>
                            Cancel
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Inline medical record form */}
                  {recordApptId === appt.id && (
                    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 space-y-2">
                      <p className="text-xs font-semibold text-amber-800">
                        🔒 Medical Record — will be AES-256 encrypted before storage
                      </p>
                      <div>
                        <label className="text-xs text-muted-foreground">Diagnosis</label>
                        <textarea value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)}
                          rows={2} placeholder="Clinical diagnosis…"
                          className="mt-1 w-full rounded border border-input bg-white px-2 py-1.5 text-sm" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Treatment Notes</label>
                        <textarea value={treatment} onChange={(e) => setTreatment(e.target.value)}
                          rows={2} placeholder="Treatment plan and notes…"
                          className="mt-1 w-full rounded border border-input bg-white px-2 py-1.5 text-sm" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Prescription Notes</label>
                        <textarea value={rxNotes} onChange={(e) => setRxNotes(e.target.value)}
                          rows={2} placeholder="Prescription details…"
                          className="mt-1 w-full rounded border border-input bg-white px-2 py-1.5 text-sm" />
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" loading={recording} onClick={handleCreateRecord}>
                          Save Encrypted Record
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setRecord(null); setDiagnosis(''); setTreatment(''); setRxNotes(''); }}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* ── Drug Inventory ─────────────────────────────────────────────── */}
      {tab === 'drugs' && (
        <div className="space-y-3">
          {drugsLoading ? (
            <div className="animate-pulse h-48 rounded bg-muted" />
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    {['Drug', 'Form', 'Stock', 'Reorder Level', 'Unit Cost', 'Status', 'Adjust'].map((h) => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {drugs.map((drug) => {
                    const low = drug.stockQuantity <= drug.reorderLevel;
                    return (
                      <tr key={drug.id} className={cn(low && 'bg-red-50')}>
                        <td className="px-3 py-2">
                          <p className="font-medium text-foreground">{drug.name}</p>
                          {drug.genericName && <p className="text-xs text-muted-foreground">{drug.genericName}</p>}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {DRUG_FORM_LABELS[drug.form] ?? '📦'} <span className="text-xs">{drug.form}</span>
                        </td>
                        <td className="px-3 py-2 text-center font-mono font-semibold">{drug.stockQuantity} {drug.unit}</td>
                        <td className="px-3 py-2 text-center text-muted-foreground">{drug.reorderLevel}</td>
                        <td className="px-3 py-2 text-muted-foreground">₦{parseFloat(drug.unitCost).toLocaleString()}</td>
                        <td className="px-3 py-2">
                          <span className={cn('rounded-full px-2 py-0.5 text-xs', low ? 'badge-danger' : 'badge-success')}>
                            {low ? 'Low Stock' : 'OK'}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => { setStockId(drug.id); setStockQty(''); setErr(''); setMsg(''); }}
                            className="text-xs text-[--color-primary] hover:underline">
                            Adjust
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Inline stock adjustment */}
          {stockDrugId && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Adjust Stock — {drugs.find((d) => d.id === stockDrugId)?.name}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-3 flex-wrap">
                  <div>
                    <label className="text-xs text-muted-foreground">Operation</label>
                    <select value={stockOp} onChange={(e) => setStockOp(e.target.value as 'ADD' | 'SUBTRACT')}
                      className="mt-1 block h-9 rounded border border-input bg-background px-3 text-sm">
                      <option value="ADD">Add (Restock)</option>
                      <option value="SUBTRACT">Subtract (Write-off)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Quantity</label>
                    <Input type="number" min={1} value={stockQty}
                      onChange={(e) => setStockQty(e.target.value)}
                      className="mt-1 w-28" placeholder="0" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" loading={adjusting} onClick={handleAdjustStock} disabled={!stockQty}>
                    Confirm
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setStockId(null)}>Cancel</Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Low-Stock Alerts ───────────────────────────────────────────── */}
      {tab === 'low-stock' && (
        <div className="space-y-3">
          {lowStock.length === 0 ? (
            <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              ✓ All drugs are above their reorder levels.
            </div>
          ) : (
            <>
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-[--color-danger]">
                ⚠ {lowStock.length} drug(s) need restocking. Contact the pharmacy supplier.
              </div>
              <div className="overflow-hidden rounded-lg border border-red-200">
                <table className="w-full text-sm">
                  <thead className="bg-red-50">
                    <tr>
                      {['Drug', 'Form', 'Current Stock', 'Reorder Level', 'Deficit'].map((h) => (
                        <th key={h} className="px-3 py-2 text-left text-xs font-medium text-red-700 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-red-100">
                    {lowStock.map((drug) => (
                      <tr key={drug.id}>
                        <td className="px-3 py-2 font-medium text-foreground">{drug.name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{drug.form}</td>
                        <td className="px-3 py-2 font-mono font-bold text-[--color-danger]">
                          {drug.stockQuantity} {drug.unit}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{drug.reorderLevel}</td>
                        <td className="px-3 py-2 font-mono text-amber-700">
                          {Math.max(0, drug.reorderLevel - drug.stockQuantity + 10)} {drug.unit}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
