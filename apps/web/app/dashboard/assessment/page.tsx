'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAssessmentExport, useAssessmentGradebook, useGenerateDraftResults } from '@/hooks/use-assessment';

export default function AssessmentPage() {
  const [offeringId, setOfferingId] = useState('');
  const [activeOffering, setActiveOffering] = useState('');
  const gradebook = useAssessmentGradebook(activeOffering);
  const generate = useGenerateDraftResults();
  const exportGradebook = useAssessmentExport();
  const load = (event: React.FormEvent) => { event.preventDefault(); setActiveOffering(offeringId.trim()); };
  const exportCsv = async () => {
    if (!activeOffering) return;
    const result = await exportGradebook.mutateAsync(activeOffering);
    const url = URL.createObjectURL(result.blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = result.filename ?? 'gradebook.csv'; anchor.click(); URL.revokeObjectURL(url);
  };
  const data = gradebook.data;

  return <div className="space-y-6">
    <header><p className="text-sm text-muted-foreground">Assessment and gradebook control</p><h1 className="text-2xl font-semibold">Assessment Workspace</h1><p className="mt-1 text-sm text-muted-foreground">Inspect mark completeness before generating draft results. Enter the course-offering UUID supplied by curriculum administration.</p></header>
    <Card><CardContent className="pt-5"><form onSubmit={load} className="flex flex-col gap-3 sm:flex-row"><Input aria-label="Course offering UUID" value={offeringId} onChange={(e) => setOfferingId(e.target.value)} placeholder="Course offering UUID" required /><Button type="submit">Load gradebook</Button></form></CardContent></Card>
    {gradebook.isError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">Unable to load this gradebook. Confirm the offering UUID and that an active assessment scheme exists.</div>}
    {data && <>
      <div className="grid gap-4 sm:grid-cols-3"><Metric label="Students" value={data.summary.total} /><Metric label="Complete" value={data.summary.complete} /><Metric label="Incomplete" value={data.summary.incomplete} /></div>
      <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>{data.scheme.name}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{data.scheme.components.length} components · {data.scheme.status}</p></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={exportCsv} loading={exportGradebook.isPending}>Export CSV</Button><Button size="sm" onClick={() => generate.mutate(activeOffering)} loading={generate.isPending} disabled={data.summary.incomplete > 0}>Generate draft results</Button></div></div></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">Student</th><th className="p-2">Matric No</th><th className="p-2">Final score</th><th className="p-2">Completeness</th></tr></thead><tbody>{data.rows.map((row) => <tr key={row.student.id} className="border-b last:border-0"><td className="p-2">{row.student.firstName} {row.student.lastName}</td><td className="p-2 font-mono text-xs">{row.student.matricNo}</td><td className="p-2">{row.finalScore.toFixed(2)}</td><td className="p-2">{row.complete ? <span className="text-green-700">Complete</span> : <span className="text-amber-700">Missing marks</span>}</td></tr>)}</tbody></table></div></CardContent></Card>
    </>}
  </div>;
}
function Metric({ label, value }: { label: string; value: number }) { return <Card><CardContent className="pt-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></CardContent></Card>; }
