'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useCreateSecurityIncident, useSecurityIncidentAction, useSecurityIncidents } from '@/hooks/use-security-incidents';

const incidentTypes = ['CREDENTIAL_BREACH', 'DATA_LEAK', 'UNAUTHORISED_ACCESS', 'MALWARE', 'PHYSICAL_BREACH', 'THIRD_PARTY_BREACH', 'OTHER'];

export default function SecurityIncidentsPage() {
  const [type, setType] = useState(incidentTypes[0]);
  const [description, setDescription] = useState('');
  const [affectedUserIds, setAffectedUserIds] = useState('');
  const [notes, setNotes] = useState('');
  const create = useCreateSecurityIncident();
  const action = useSecurityIncidentAction();
  const { data: incidents = [], isLoading, isError } = useSecurityIncidents();
  const submit = (event: React.FormEvent) => { event.preventDefault(); create.mutate({ type, description, affectedUserIds: affectedUserIds.split(',').map((id) => id.trim()).filter(Boolean) }, { onSuccess: () => { setDescription(''); setAffectedUserIds(''); } }); };

  return <div className="space-y-6">
    <header><p className="text-sm text-muted-foreground">Incident response and statutory workflow</p><h1 className="text-2xl font-semibold">Security Incidents</h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">Record incidents, contain affected sessions, confirm the out-of-band regulatory filing, and resolve only after an accountable DPO decision.</p></header>
    <Card><CardHeader><CardTitle>Report incident</CardTitle></CardHeader><CardContent><form onSubmit={submit} className="grid gap-4 md:grid-cols-2"><label className="text-sm">Type<select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={type} onChange={(e) => setType(e.target.value)}>{incidentTypes.map((item) => <option key={item}>{item}</option>)}</select></label><label className="text-sm">Affected user UUIDs<span className="mt-1 block text-xs text-muted-foreground">Comma-separated; can be empty while scope is assessed.</span><Input value={affectedUserIds} onChange={(e) => setAffectedUserIds(e.target.value)} placeholder="uuid, uuid" /></label><label className="text-sm md:col-span-2">Description<textarea required minLength={10} value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 min-h-24 w-full rounded-md border bg-background px-3 py-2" placeholder="Describe what happened, when it was detected, and the current containment posture." /></label><div className="md:col-span-2"><Button type="submit" loading={create.isPending}>Create incident record</Button></div></form></CardContent></Card>
    {isError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">Unable to load incidents. Confirm your DPO or administrator scope.</div>}
    <Card><CardHeader><CardTitle>Incident queue</CardTitle></CardHeader><CardContent className="space-y-3">{isLoading ? <p className="text-sm text-muted-foreground">Loading incidents…</p> : incidents.length === 0 ? <p className="py-6 text-sm text-muted-foreground">No incident records.</p> : incidents.map((incident) => <article key={incident.id} className="rounded-lg border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-medium">{incident.type}</h2><p className="mt-1 text-sm text-muted-foreground">{incident.description}</p><p className="mt-2 text-xs text-muted-foreground">Detected {new Date(incident.detectedAt).toLocaleString()} · {incident.affectedUserIds.length} affected users</p></div><span className="rounded-full bg-muted px-2 py-1 text-xs">{incident.status}</span></div>{incident.status !== 'RESOLVED' && <div className="mt-3 flex flex-wrap items-end gap-2"><Button size="sm" variant="outline" disabled={action.isPending || Boolean(incident.containedAt)} onClick={() => action.mutate({ id: incident.id, action: 'contain' })}>Contain</Button><Button size="sm" variant="outline" disabled={action.isPending || Boolean(incident.nitdaNotifiedAt)} onClick={() => action.mutate({ id: incident.id, action: 'nitda-notified' })}>Confirm filing</Button><div className="flex gap-2"><Input aria-label="DPO resolution notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Resolution notes" /><Button size="sm" disabled={notes.trim().length < 3 || action.isPending} onClick={() => action.mutate({ id: incident.id, action: 'resolve', dpoNotes: notes })}>Resolve</Button></div></div>}</article>)}</CardContent></Card>
  </div>;
}
