'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  useAppointments, useUpdateAppointmentStatus, useCreateMedicalRecord,
  useDrugs, useLowStockDrugs, useAdjustStock,
  useRegisterPatient, useBookAppointment, useCreateDrug, useCreatePrescription,
} from '@/hooks/use-clinic';
import { useAuthStore } from '@/stores/auth.store';
import { hasEffectiveRole } from '@/lib/authz';
import { cn, formatDate } from '@/lib/utils';

const APPT_STATUS_COLORS: Record<string, string> = {
  SCHEDULED: 'badge-warning', COMPLETED: 'badge-success',
  CANCELLED: 'badge-neutral', NO_SHOW: 'badge-danger',
};
const DRUG_FORM_LABELS: Record<string, string> = {
  TABLET: '💊', CAPSULE: '💊', SYRUP: '🍶', INJECTION: '💉',
  CREAM: '🧴', INHALER: '🫁', DROPS: '💧', OTHER: '📦',
};
const DRUG_FORMS = ['TABLET','CAPSULE','SYRUP','INJECTION','CREAM','INHALER','DROPS','OTHER'];

type Tab = 'appointments' | 'drugs' | 'low-stock';

export default function ClinicPage() {
  const user = useAuthStore((s) => s.user);
  const isStudent = hasEffectiveRole(user, 'STUDENT');
  const canManageClinic = hasEffectiveRole(user, 'STAFF', 'SUPPORT_STAFF', 'SUPER_ADMIN');
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
  const [showPatientForm, setShowPatientForm] = useState(false);
  const [showAppointmentForm, setShowAppointmentForm] = useState(false);
  const [showDrugForm, setShowDrugForm] = useState(false);
  const [showPrescriptionForm, setShowPrescriptionForm] = useState(false);
  const [patientForm, setPatientForm] = useState({ userId: '', bloodGroup: '', genotype: '', allergies: '', chronicConditions: '', emergencyContactName: '', emergencyContactPhone: '' });
  const [appointmentForm, setAppointmentForm] = useState({ patientId: '', doctorUserId: '', appointmentDate: '', reason: '' });
  const [drugForm, setDrugForm] = useState({ name: '', genericName: '', form: 'TABLET', unit: 'packs', stockQuantity: '0', reorderLevel: '10', unitCost: '' });
  const [prescriptionForm, setPrescriptionForm] = useState({ medicalRecordId: '', patientId: '', drugId: '', dosageInstructions: '', quantity: '1' });

  const filters = statusFilter ? { status: statusFilter } : undefined;
  const { data: apptData, isLoading: apptLoading }  = useAppointments(filters, Boolean(isStudent || canManageClinic));
  const { data: drugsData, isLoading: drugsLoading } = useDrugs(1, canManageClinic);
  const { data: lowStock = [] }                       = useLowStockDrugs(canManageClinic);

  const { mutate: updateStatus, isPending: updatingStatus } = useUpdateAppointmentStatus();
  const { mutate: createRecord, isPending: recording }      = useCreateMedicalRecord();
  const { mutate: adjustStock,  isPending: adjusting }      = useAdjustStock();
  const { mutate: registerPatient, isPending: registeringPatient } = useRegisterPatient();
  const { mutate: bookAppointment, isPending: bookingAppointment } = useBookAppointment();
  const { mutate: createDrug, isPending: creatingDrug } = useCreateDrug();
  const { mutate: createPrescription, isPending: creatingPrescription } = useCreatePrescription();

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
        onSuccess: () => { setMsg(`Stock ${stockOp === 'ADD' ? 'added' : 'reduced'}.`); setStockId(null); setStockQty(''); },
        onError:   (e) => setErr(e.message),
      },
    );
  };

  const handleRegisterPatient = () => {
    setErr(''); setMsg('');
    if (!patientForm.userId) { setErr('The patient account UUID is required.'); return; }
    registerPatient({ ...patientForm, bloodGroup: patientForm.bloodGroup || undefined, genotype: patientForm.genotype || undefined, allergies: patientForm.allergies || undefined, chronicConditions: patientForm.chronicConditions || undefined, emergencyContactName: patientForm.emergencyContactName || undefined, emergencyContactPhone: patientForm.emergencyContactPhone || undefined }, { onSuccess: () => { setMsg('Patient profile registered.'); setShowPatientForm(false); }, onError: (e) => setErr(e.message) });
  };

  const handleBookAppointment = () => {
    setErr(''); setMsg('');
    if (!appointmentForm.patientId || !appointmentForm.doctorUserId || !appointmentForm.appointmentDate) { setErr('Patient, doctor, and appointment date are required.'); return; }
    bookAppointment({ ...appointmentForm, appointmentDate: new Date(appointmentForm.appointmentDate).toISOString(), reason: appointmentForm.reason || undefined }, { onSuccess: () => { setMsg('Appointment booked.'); setShowAppointmentForm(false); }, onError: (e) => setErr(e.message) });
  };

  const handleCreateDrug = () => {
    setErr(''); setMsg('');
    if (!drugForm.name || !drugForm.unit || !drugForm.unitCost) { setErr('Drug name, unit, and unit cost are required.'); return; }
    createDrug({ ...drugForm, stockQuantity: Number(drugForm.stockQuantity), reorderLevel: Number(drugForm.reorderLevel), unitCost: drugForm.unitCost }, { onSuccess: () => { setMsg('Drug added to inventory.'); setShowDrugForm(false); }, onError: (e) => setErr(e.message) });
  };

  const handleCreatePrescription = () => {
    setErr(''); setMsg('');
    if (!prescriptionForm.medicalRecordId || !prescriptionForm.patientId || !prescriptionForm.drugId || !prescriptionForm.dosageInstructions) { setErr('Medical record, patient, drug, and dosage instructions are required.'); return; }
    createPrescription({ ...prescriptionForm, quantity: Number(prescriptionForm.quantity) }, { onSuccess: () => { setMsg('Prescription dispensed and stock updated.'); setShowPrescriptionForm(false); }, onError: (e) => setErr(e.message) });
  };

  const tabs: { k: Tab; l: string }[] = canManageClinic
    ? [
        { k: 'appointments', l: `Appointments (${appointments.length})` },
        { k: 'drugs',        l: `Drug Inventory (${drugs.length})` },
        { k: 'low-stock',    l: `Low Stock ${lowStock.length > 0 ? `⚠ ${lowStock.length}` : ''}` },
      ]
    : [{ k: 'appointments', l: `My Appointments (${appointments.length})` }];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">{isStudent ? 'My Health Clinic' : 'Health Clinic'}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isStudent
              ? 'View your clinic appointments and permitted health information.'
              : 'Medical records are AES-256-GCM encrypted before storage.'}
          </p>
        </div>
        <div className="flex gap-2">
          {tabs.map((t) => (
            <button type="button" key={t.k} onClick={() => setTab(t.k)}
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

      {canManageClinic && <div className="flex flex-wrap gap-2 rounded-xl border border-[--color-primary]/20 bg-[--color-primary]/5 p-3">
        <p className="mr-auto self-center text-sm text-muted-foreground">Clinic operations</p>
        <Button size="sm" variant={showPatientForm ? 'default' : 'outline'} onClick={() => { setShowPatientForm((value) => !value); setShowAppointmentForm(false); setShowDrugForm(false); setShowPrescriptionForm(false); }}>Register patient</Button>
        <Button size="sm" variant={showAppointmentForm ? 'default' : 'outline'} onClick={() => { setShowAppointmentForm((value) => !value); setShowPatientForm(false); setShowDrugForm(false); setShowPrescriptionForm(false); }}>Book appointment</Button>
        <Button size="sm" variant={showDrugForm ? 'default' : 'outline'} onClick={() => { setShowDrugForm((value) => !value); setShowPatientForm(false); setShowAppointmentForm(false); setShowPrescriptionForm(false); }}>Add drug</Button>
        <Button size="sm" variant={showPrescriptionForm ? 'default' : 'outline'} onClick={() => { setShowPrescriptionForm((value) => !value); setShowPatientForm(false); setShowAppointmentForm(false); setShowDrugForm(false); }}>Dispense prescription</Button>
      </div>}

      {canManageClinic && showPatientForm && <Card><CardHeader><CardTitle className="text-base">Register patient profile</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2"><label className="text-sm font-medium" htmlFor="patient-user-id">Patient account UUID</label><Input id="patient-user-id" value={patientForm.userId} onChange={(event) => setPatientForm((current) => ({ ...current, userId: event.target.value }))} placeholder="UUID of the institutional user account" /></div>
        {([['bloodGroup','Blood group'],['genotype','Genotype'],['emergencyContactName','Emergency contact name'],['emergencyContactPhone','Emergency contact phone']] as const).map(([key, label]) => <div key={key} className="space-y-1"><label className="text-sm font-medium" htmlFor={`patient-${key}`}>{label}</label><Input id={`patient-${key}`} value={patientForm[key]} onChange={(event) => setPatientForm((current) => ({ ...current, [key]: event.target.value }))} /></div>)}
        <div className="space-y-1"><label className="text-sm font-medium" htmlFor="patient-allergies">Allergies</label><textarea id="patient-allergies" rows={2} value={patientForm.allergies} onChange={(event) => setPatientForm((current) => ({ ...current, allergies: event.target.value }))} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></div>
        <div className="space-y-1"><label className="text-sm font-medium" htmlFor="patient-chronic">Chronic conditions</label><textarea id="patient-chronic" rows={2} value={patientForm.chronicConditions} onChange={(event) => setPatientForm((current) => ({ ...current, chronicConditions: event.target.value }))} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></div>
        <div className="sm:col-span-2"><Button loading={registeringPatient} onClick={handleRegisterPatient}>Save patient profile</Button></div>
      </CardContent></Card>}

      {canManageClinic && showAppointmentForm && <Card><CardHeader><CardTitle className="text-base">Book clinic appointment</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">
        {([['patientId','Patient UUID'],['doctorUserId','Doctor user UUID']] as const).map(([key, label]) => <div key={key} className="space-y-1"><label className="text-sm font-medium" htmlFor={`appointment-${key}`}>{label}</label><Input id={`appointment-${key}`} value={appointmentForm[key]} onChange={(event) => setAppointmentForm((current) => ({ ...current, [key]: event.target.value }))} /></div>)}
        <div className="space-y-1"><label className="text-sm font-medium" htmlFor="appointment-date">Appointment date</label><Input id="appointment-date" type="datetime-local" value={appointmentForm.appointmentDate} onChange={(event) => setAppointmentForm((current) => ({ ...current, appointmentDate: event.target.value }))} /></div>
        <div className="space-y-1"><label className="text-sm font-medium" htmlFor="appointment-reason">Reason</label><Input id="appointment-reason" value={appointmentForm.reason} onChange={(event) => setAppointmentForm((current) => ({ ...current, reason: event.target.value }))} /></div>
        <div className="sm:col-span-2"><Button loading={bookingAppointment} onClick={handleBookAppointment}>Book appointment</Button></div>
      </CardContent></Card>}

      {canManageClinic && showDrugForm && <Card><CardHeader><CardTitle className="text-base">Add drug to inventory</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {([['name','Drug name'],['genericName','Generic name'],['unit','Unit'],['stockQuantity','Opening stock'],['reorderLevel','Reorder level'],['unitCost','Unit cost (NGN)']] as const).map(([key, label]) => <div key={key} className="space-y-1"><label className="text-sm font-medium" htmlFor={`drug-${key}`}>{label}</label><Input id={`drug-${key}`} type={['stockQuantity','reorderLevel'].includes(key) ? 'number' : 'text'} value={drugForm[key]} onChange={(event) => setDrugForm((current) => ({ ...current, [key]: event.target.value }))} /></div>)}
        <div className="space-y-1"><label className="text-sm font-medium" htmlFor="drug-form">Form</label><select id="drug-form" value={drugForm.form} onChange={(event) => setDrugForm((current) => ({ ...current, form: event.target.value }))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">{DRUG_FORMS.map((form) => <option key={form} value={form}>{form}</option>)}</select></div>
        <div className="flex items-end"><Button loading={creatingDrug} onClick={handleCreateDrug}>Add drug</Button></div>
      </CardContent></Card>}

      {canManageClinic && showPrescriptionForm && <Card><CardHeader><CardTitle className="text-base">Dispense prescription</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">
        {([['medicalRecordId','Medical record UUID'],['patientId','Patient UUID'],['drugId','Drug UUID']] as const).map(([key, label]) => <div key={key} className="space-y-1"><label className="text-sm font-medium" htmlFor={`prescription-${key}`}>{label}</label><Input id={`prescription-${key}`} value={prescriptionForm[key]} onChange={(event) => setPrescriptionForm((current) => ({ ...current, [key]: event.target.value }))} /></div>)}
        <div className="space-y-1"><label className="text-sm font-medium" htmlFor="prescription-quantity">Quantity</label><Input id="prescription-quantity" type="number" min={1} value={prescriptionForm.quantity} onChange={(event) => setPrescriptionForm((current) => ({ ...current, quantity: event.target.value }))} /></div>
        <div className="space-y-1 sm:col-span-2"><label className="text-sm font-medium" htmlFor="prescription-dosage">Dosage instructions</label><textarea id="prescription-dosage" rows={3} value={prescriptionForm.dosageInstructions} onChange={(event) => setPrescriptionForm((current) => ({ ...current, dosageInstructions: event.target.value }))} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></div>
        <div className="sm:col-span-2"><Button loading={creatingPrescription} onClick={handleCreatePrescription}>Dispense prescription</Button></div>
      </CardContent></Card>}

      {/* ── Appointments ───────────────────────────────────────────────── */}
      {tab === 'appointments' && (
        <div className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            {['', 'SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'].map((s) => (
              <button type="button" key={s || 'all'}
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
                      {!isStudent && <p className="text-xs text-muted-foreground">Patient ID: {appt.patientId}</p>}
                      {appt.reason && <p className="text-xs text-muted-foreground">Reason: {appt.reason}</p>}
                    </div>

                    {canManageClinic && <div className="flex flex-wrap gap-2">
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
                    </div>}
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
      {canManageClinic && tab === 'drugs' && (
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
                          <button type="button"
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
      {canManageClinic && tab === 'low-stock' && (
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
