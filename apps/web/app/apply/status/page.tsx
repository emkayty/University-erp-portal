'use client';

import { useState } from 'react';
import { apiClient, ApiClientError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ApplicationStatusPage() {
  const [applicationNo,setApplicationNo]=useState('');
  const [trackingToken,setTrackingToken]=useState('');
  const [result,setResult]=useState<{applicationNo:string;status:string;completionPercent:number;offerDeadline:string|null;rejectionReason:string|null}|null>(null);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  async function lookup(e:React.FormEvent){e.preventDefault();setLoading(true);setError('');setResult(null);try{setResult(await apiClient.post('/admissions/public/track',{applicationNo,trackingToken}));}catch(err){setError(err instanceof ApiClientError?err.message:err instanceof Error?err.message:'Unable to retrieve application status.');}finally{setLoading(false);}}
  return <main className="erp-public-page min-h-screen bg-muted/30 px-4 py-8 sm:py-10"><Card className="erp-workspace-header mx-auto w-full max-w-xl"><CardHeader><CardTitle>Check application status</CardTitle></CardHeader><CardContent className="space-y-5"><form onSubmit={lookup} className="space-y-4"><div><Label>Application number</Label><Input required value={applicationNo} onChange={e=>setApplicationNo(e.target.value)} placeholder="e.g. 202620UT00001" /></div><div><Label>Tracking credential</Label><Input required minLength={64} maxLength={64} value={trackingToken} onChange={e=>setTrackingToken(e.target.value)} placeholder="Paste the 64-character credential from submission" className="font-mono text-xs" /></div>{error&&<div role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}<Button type="submit" loading={loading}>Check status</Button></form>{result&&<div className="erp-control-rail space-y-3 rounded-lg border p-4"><div><span className="text-muted-foreground">Application:</span> <strong>{result.applicationNo}</strong></div><div><span className="text-muted-foreground">Status:</span> <strong>{result.status}</strong></div><div><span className="text-muted-foreground">Completion:</span> {result.completionPercent}%</div>{result.offerDeadline&&<div><span className="text-muted-foreground">Offer deadline:</span> {new Date(result.offerDeadline).toLocaleDateString()}</div>}<p className="text-sm text-muted-foreground">Keep your tracking credential private. It is the proof required to view this application status.</p><p className="text-sm text-muted-foreground">Official decisions are subject to the university's verification and approval process.</p></div>}</CardContent></Card></main>;
}
