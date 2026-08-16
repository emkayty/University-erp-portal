'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Card } from '@/components/ui/card';

export default function AcademicJourneyPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['academic', 'me', 'journey'],
    queryFn: () => apiClient.get<any>('/academic/me/journey'),
  });

  if (isLoading) return <main className="p-6">Loading your academic journey…</main>;
  if (error) return <main className="p-6"><Card className="p-6">Unable to load your academic journey. Please try again.</Card></main>;
  if (!data) return null;

  const p = data.progress;
  return (
    <main className="space-y-6 p-4 md:p-6">
      <section>
        <p className="text-sm text-muted-foreground">Academic command center</p>
        <h1 className="text-2xl font-semibold tracking-tight">My Academic Journey</h1>
        <p className="mt-1 text-sm text-muted-foreground">{data.programme.code} · {data.programme.name} · {data.curriculum.academicYear} curriculum v{data.curriculum.version}</p>
      </section>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="CGPA" value={p.cgpa.toFixed(2)} />
        <Metric label="Credits" value={`${p.creditsEarned}/${p.creditsRequired}`} />
        <Metric label="Completion" value={`${p.percent}%`} />
        <Metric label="Outstanding" value={String(p.outstandingCourses)} />
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-semibold">Next actions</h2>
          <div className="mt-4 space-y-3 text-sm">
            {data.outstanding.length ? data.outstanding.map((c: any) => <div key={c.code} className="rounded-xl border p-3"><strong>{c.code}</strong><div>{c.title}</div><span className="text-muted-foreground">{c.credits} credits · carryover</span></div>) : <p className="text-muted-foreground">No outstanding failed courses detected from published results.</p>}
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold">Degree audit</h2>
          <div className="mt-4 text-sm">
            {data.degreeAudit ? <><div className="font-medium">Status: {data.degreeAudit.status}</div><p className="mt-2 text-muted-foreground">Audit generated from the assigned curriculum and published academic record.</p></> : <p className="text-muted-foreground">No official degree audit has been generated yet.</p>}
          </div>
        </Card>
      </section>
      <Card className="p-5">
        <h2 className="font-semibold">Current courses</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {data.currentCourses.map((c: any) => <div key={c.id} className="rounded-xl border p-4"><div className="font-medium">{c.code}</div><div className="text-sm">{c.title}</div><div className="mt-2 text-xs text-muted-foreground">{c.credits} credits · {c.semester}</div></div>)}
        </div>
      </Card>
      <Card className="p-5">
        <h2 className="font-semibold">Academic history</h2>
        <div className="mt-4 divide-y">
          {data.history.map((h: any) => <div key={h.id} className="flex items-center justify-between py-3 text-sm"><div><div className="font-medium">{h.academicYear} · Level {h.level}</div><div className="text-muted-foreground">{h.status}</div></div><div className="text-right"><div>GPA {h.gpa == null ? '—' : Number(h.gpa).toFixed(2)}</div><div className="text-muted-foreground">CGPA {h.cgpa == null ? '—' : Number(h.cgpa).toFixed(2)}</div></div></div>)}
        </div>
      </Card>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <Card className="p-5"><div className="text-sm text-muted-foreground">{label}</div><div className="mt-2 text-2xl font-semibold">{value}</div></Card>;
}
