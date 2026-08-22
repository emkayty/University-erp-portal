'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmAction } from '@/components/erp/confirm-action';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  useResearchProjects, useResearchProject, useCreateProject,
  useUpdateProjectStatus, useAddGrant, useRecordExpenditure,
  useAddResearchOutput, useResearchSummary, useResearchPeople,
  useAddResearchMember, useRemoveResearchMember,
} from '@/hooks/use-research';
import { useAuthStore } from '@/stores/auth.store';
import { cn, formatDate } from '@/lib/utils';
import { hasEffectiveRole, hasEffectiveScope } from '@/lib/authz';
import type { MemberRole, ResearchStatus } from '@uniportal/types';

const STATUS_COLORS: Record<ResearchStatus, string> = {
  PENDING:      'badge-warning',
  ETHICS_REVIEW:'bg-purple-100 text-purple-700',
  ACTIVE:       'badge-success',
  COMPLETED:    'badge-info',
  SUSPENDED:    'badge-danger',
  CANCELLED:    'badge-neutral',
};

const STATUS_FLOW: { from: ResearchStatus; to: ResearchStatus; label: string }[] = [
  { from: 'PENDING',       to: 'ETHICS_REVIEW', label: 'Submit for Ethics' },
  { from: 'ETHICS_REVIEW', to: 'ACTIVE',        label: 'Approve & Activate' },
  { from: 'ACTIVE',        to: 'COMPLETED',     label: 'Mark Completed' },
  { from: 'ACTIVE',        to: 'SUSPENDED',     label: 'Suspend' },
  { from: 'SUSPENDED',     to: 'ACTIVE',        label: 'Resume' },
];

type Tab = 'projects' | 'summary';

export default function ResearchPage() {
  const user       = useAuthStore((s) => s.user);
  const isResearch = hasEffectiveScope(user, 'research');
  const isAdmin = hasEffectiveRole(user, 'REGISTRAR', 'VC', 'SUPER_ADMIN');
  const [tab, setTab]           = useState<Tab>('projects');
  const [selectedId, setSelected] = useState<string | null>(null);
  const [statusFilter, setStatus] = useState<string>('');
  const [ethicsRef, setEthicsRef] = useState('');
  const [grantForm, setGrantForm] = useState({ funder: '', amount: '', startDate: '', endDate: '' });
  const [exForm, setExForm]       = useState({ grantId: '', description: '', amount: '', expendedAt: '' });
  const [outForm, setOutForm]     = useState({ outputType: 'JOURNAL_ARTICLE', title: '', authors: '' });
  const [memberForm, setMemberForm] = useState<{ userId: string; role: MemberRole }>({ userId: '', role: 'RESEARCH_ASSISTANT' });
  const [pendingMemberRemoval, setPendingMemberRemoval] = useState<string | null>(null);
  const [err, setErr]             = useState('');
  const [msg, setMsg]             = useState('');

  const filters = statusFilter ? { status: statusFilter } : undefined;
  const { data: projects = [], isLoading } = useResearchProjects(filters);
  const { data: project }                  = useResearchProject(selectedId);
  const canManageMembers = Boolean(isResearch && user?.id && project?.leadResearcherId === user.id);
  const { data: summary }                  = useResearchSummary();
  const { data: researchPeople = [] }       = useResearchPeople(Boolean(isResearch));

  const { mutate: updateStatus, isPending: updatingStatus } = useUpdateProjectStatus();
  const { mutate: addGrant,     isPending: addingGrant }    = useAddGrant();
  const { mutate: recordEx,     isPending: recordingEx }    = useRecordExpenditure();
  const { mutate: addOutput,    isPending: addingOutput }   = useAddResearchOutput();
  const { mutate: addMember,    isPending: addingMember }   = useAddResearchMember();
  const { mutate: removeMember, isPending: removingMember } = useRemoveResearchMember();

  const handleStatusChange = (id: string, toStatus: string, needsEthics = false) => {
    setErr(''); setMsg('');
    if (needsEthics && !ethicsRef.trim()) {
      setErr('Ethics approval reference is required to activate a project');
      return;
    }
    updateStatus(
      { id, status: toStatus, ...(ethicsRef ? { ethicsApprovalRef: ethicsRef, ethicsApprovedAt: new Date().toISOString() } : {}) },
      {
        onSuccess: () => { setMsg(`✓ Project status → ${toStatus}`); setEthicsRef(''); },
        onError:   (e) => setErr(e.message),
      },
    );
  };

  const handleAddGrant = (projectId: string) => {
    setErr(''); setMsg('');
    addGrant(
      { projectId, ...grantForm },
      {
        onSuccess: () => { setMsg('✓ Grant added'); setGrantForm({ funder: '', amount: '', startDate: '', endDate: '' }); },
        onError:   (e) => setErr(e.message),
      },
    );
  };

  const handleRecordEx = () => {
    setErr(''); setMsg('');
    recordEx(
      { grantId: exForm.grantId, description: exForm.description, amount: exForm.amount, expendedAt: exForm.expendedAt },
      {
        onSuccess: () => { setMsg('✓ Expenditure recorded'); setExForm({ grantId: '', description: '', amount: '', expendedAt: '' }); },
        onError:   (e) => setErr(e.message),
      },
    );
  };

  const handleAddOutput = (projectId: string) => {
    setErr(''); setMsg('');
    addOutput(
      { projectId, ...outForm, authors: outForm.authors.split(',').map((a) => a.trim()) },
      {
        onSuccess: () => { setMsg('✓ Output recorded'); setOutForm({ outputType: 'JOURNAL_ARTICLE', title: '', authors: '' }); },
        onError:   (e) => setErr(e.message),
      },
    );
  };

  const handleAddMember = (projectId: string) => {
    if (!memberForm.userId) { setErr('Select an active staff member before adding the project team member.'); return; }
    setErr(''); setMsg('');
    addMember({ projectId, ...memberForm }, {
      onSuccess: () => { setMsg('✓ Research member added'); setMemberForm({ userId: '', role: 'RESEARCH_ASSISTANT' }); },
      onError: (e) => setErr(e.message),
    });
  };

  const handleRemoveMember = (projectId: string, userId: string) => {
    setErr(''); setMsg('');
    removeMember({ projectId, userId }, {
      onSuccess: () => { setMsg('✓ Research member removed'); setPendingMemberRemoval(null); },
      onError: (e) => { setErr(e.message); setPendingMemberRemoval(null); },
    });
  };

  return (
    <>
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-semibold text-foreground">Research & Grants</h2>
        <div className="flex gap-2">
          {(['projects', 'summary'] as Tab[]).map((t) => (
            <button type="button" key={t} onClick={() => setTab(t)}
              className={cn('rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                tab === t ? 'bg-[--color-primary] text-white' : 'bg-muted text-muted-foreground hover:text-foreground')}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {err && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-[--color-danger]">{err}</div>}
      {msg && <div role="status" className="rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">{msg}</div>}

      {/* ── Summary ──────────────────────────────────────────────────────── */}
      {tab === 'summary' && summary && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Total Projects', value: summary.totalProjects },
              { label: 'Total Grants',   value: summary.totalGrants },
              { label: 'Grant Amount',   value: `₦${parseFloat(String(summary.totalGrantAmount)).toLocaleString()}` },
              { label: 'Publications',   value: summary.totalOutputs },
            ].map(({ label, value }) => (
              <Card key={label}>
                <CardContent className="pt-4 text-center">
                  <p className="text-2xl font-bold text-[--color-primary]">{value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader><CardTitle className="text-sm">Projects by Status</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {summary.byStatus.map(({ status, count }) => (
                  <div key={status} className={cn('rounded-full px-3 py-1 text-xs font-medium', STATUS_COLORS[status as ResearchStatus] ?? 'badge-neutral')}>
                    {status}: {count}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Projects list ─────────────────────────────────────────────── */}
      {tab === 'projects' && !selectedId && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {['', 'PENDING', 'ETHICS_REVIEW', 'ACTIVE', 'COMPLETED', 'SUSPENDED', 'CANCELLED'].map((s) => (
              <button type="button" key={s || 'all'} onClick={() => setStatus(s)}
                className={cn('rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  statusFilter === s ? 'bg-[--color-primary] text-white' : 'bg-muted text-muted-foreground hover:text-foreground')}>
                {s || 'All'}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="animate-pulse space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-28 rounded bg-muted" />)}
            </div>
          ) : projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">No projects found.</p>
          ) : (
            projects.map((p) => (
              <Card key={p.id}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between flex-wrap gap-3">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_COLORS[p.status])}>
                          {p.status.replace('_', ' ')}
                        </span>
                        <h3 className="text-sm font-semibold text-foreground">{p.title}</h3>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{p.abstract}</p>
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span>Dept: {p.department}</span>
                        <span>Budget: ₦{parseFloat(p.budget).toLocaleString()}</span>
                        <span>Spent: ₦{parseFloat(p.budgetSpent).toLocaleString()}</span>
                        <span>Members: {p.members?.length ?? 0}</span>
                        {p._count && <span>Grants: {p._count.grants} · Outputs: {p._count.outputs}</span>}
                      </div>
                      {p.keywords.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {p.keywords.map((k) => (
                            <span key={k} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{k}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setSelected(p.id)}>View Details</Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* ── Project Detail ────────────────────────────────────────────── */}
      {tab === 'projects' && selectedId && project && (
        <div className="space-y-4">
          <Button size="sm" variant="ghost" onClick={() => { setSelected(null); setErr(''); setMsg(''); }}>
            ← Back to Projects
          </Button>

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between flex-wrap gap-2">
                <div>
                  <CardTitle>{project.title}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">{project.department}</p>
                </div>
                <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_COLORS[project.status])}>
                  {project.status.replace('_', ' ')}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">{project.abstract}</p>

              {/* Budget bar */}
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Budget utilisation</span>
                  <span>₦{parseFloat(project.budgetSpent).toLocaleString()} / ₦{parseFloat(project.budget).toLocaleString()}</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-[--color-primary]"
                    style={{ width: `${Math.min(100, (parseFloat(project.budgetSpent) / parseFloat(project.budget)) * 100)}%` }} />
                </div>
              </div>

              {/* Status advancement (Admin / Registrar / VC) */}
              {isAdmin && (
                <div className="rounded-md border border-border p-3 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase">Status Controls</p>
                  <div className="flex flex-wrap gap-2">
                    {STATUS_FLOW.filter((f) => f.from === project.status).map(({ to, label }) => {
                      const needsEthics = to === 'ACTIVE';
                      return (
                        <div key={to} className="space-y-1">
                          {needsEthics && (
                            <Input placeholder="Ethics approval ref (required)"
                              value={ethicsRef} onChange={(e) => setEthicsRef(e.target.value)}
                              className="w-56 text-xs" />
                          )}
                          <Button size="sm" loading={updatingStatus}
                            onClick={() => handleStatusChange(selectedId, to, needsEthics)}>
                            {label}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Research team section */}
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Research team ({project.members?.length ?? 0})</p>
                  <p className="text-xs text-muted-foreground">Lead-controlled membership</p>
                </div>
                <div className="space-y-2">
                  {project.members?.map((member) => {
                    const person = researchPeople.find((candidate) => candidate.userId === member.userId);
                    return <div key={member.userId} className="flex flex-col gap-2 rounded-md border border-border p-2 text-xs sm:flex-row sm:items-center sm:justify-between">
                      <div><p className="font-medium">{person ? `${person.firstName} ${person.lastName}` : member.userId}</p><p className="text-muted-foreground">{person?.employeeNo ?? 'Institutional user'} · {member.role.replace('_', ' ')}</p></div>
                      {canManageMembers && member.userId !== project.leadResearcherId && <Button size="sm" variant="destructive" onClick={() => setPendingMemberRemoval(member.userId)}>Remove</Button>}
                    </div>;
                  })}
                </div>
                {canManageMembers && (
                  <div className="mt-2 space-y-2 rounded-md border border-dashed border-border p-3">
                    <p className="text-xs font-semibold">Add team member</p>
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_200px_auto]">
                      <select aria-label="Research team member" value={memberForm.userId} onChange={(event) => setMemberForm({ ...memberForm, userId: event.target.value })} className="h-9 rounded border border-input bg-background px-2 text-xs">
                        <option value="">Select active staff member</option>
                        {researchPeople.filter((person) => !project.members?.some((member) => member.userId === person.userId)).map((person) => <option key={person.userId} value={person.userId}>{person.employeeNo} · {person.firstName} {person.lastName}</option>)}
                      </select>
                      <select aria-label="Research member role" value={memberForm.role} onChange={(event) => setMemberForm({ ...memberForm, role: event.target.value as MemberRole })} className="h-9 rounded border border-input bg-background px-2 text-xs">
                        {(['CO_RESEARCHER', 'RESEARCH_ASSISTANT', 'CONSULTANT'] as MemberRole[]).map((role) => <option key={role} value={role}>{role.replace('_', ' ')}</option>)}
                      </select>
                      <Button size="sm" loading={addingMember} onClick={() => handleAddMember(selectedId)}>Add member</Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">Only active or approved-leave staff are available. The project lead cannot be removed.</p>
                  </div>
                )}
              </div>

              {/* Grants section */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Grants ({project.grants?.length ?? 0})</p>
                {project.grants?.map((g) => (
                  <div key={g.id} className="mb-2 rounded-md border border-border p-2 text-xs">
                    <div className="flex justify-between">
                      <span className="font-medium">{g.funder}</span>
                      <span className={cn('rounded-full px-2 py-0.5', g.status === 'ACTIVE' ? 'badge-success' : 'badge-neutral')}>{g.status}</span>
                    </div>
                    <p>Amount: ₦{parseFloat(g.amount).toLocaleString()} · {formatDate(g.startDate)} – {formatDate(g.endDate)}</p>
                    {g.expenditures && g.expenditures.length > 0 && (
                      <p className="text-muted-foreground mt-1">
                        Expenditures: {g.expenditures.length} · Total: ₦{g.expenditures.reduce((s, e) => s + parseFloat(e.amount.toString()), 0).toLocaleString()}
                      </p>
                    )}
                    {isResearch && g.status === 'ACTIVE' && (
                      <div className="mt-2 pt-2 border-t border-border space-y-1">
                        <p className="font-semibold">Record Expenditure</p>
                        <div className="flex flex-wrap gap-2">
                          <Input placeholder="Description" className="text-xs flex-1 min-w-[150px]"
                            value={exForm.grantId === g.id ? exForm.description : ''}
                            onChange={(e) => setExForm({ ...exForm, grantId: g.id, description: e.target.value })} />
                          <Input type="number" placeholder="Amount (₦)" className="text-xs w-28"
                            value={exForm.grantId === g.id ? exForm.amount : ''}
                            onChange={(e) => setExForm({ ...exForm, grantId: g.id, amount: e.target.value })} />
                          <input type="date" className="h-8 rounded border border-input bg-background px-2 text-xs"
                            value={exForm.grantId === g.id ? exForm.expendedAt : ''}
                            onChange={(e) => setExForm({ ...exForm, grantId: g.id, expendedAt: e.target.value })} />
                          <Button size="sm" loading={recordingEx} onClick={handleRecordEx}>Record</Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {isResearch && (
                  <div className="mt-2 rounded-md border border-dashed border-border p-2 space-y-2">
                    <p className="text-xs font-semibold">Add Grant</p>
                    <div className="flex flex-wrap gap-2">
                      <Input placeholder="Funder name" value={grantForm.funder}
                        onChange={(e) => setGrantForm({ ...grantForm, funder: e.target.value })}
                        className="text-xs flex-1 min-w-[150px]" />
                      <Input type="number" placeholder="Amount (₦)" value={grantForm.amount}
                        onChange={(e) => setGrantForm({ ...grantForm, amount: e.target.value })}
                        className="text-xs w-28" />
                      <input type="date" className="h-8 rounded border border-input bg-background px-2 text-xs"
                        value={grantForm.startDate} onChange={(e) => setGrantForm({ ...grantForm, startDate: e.target.value })} />
                      <input type="date" className="h-8 rounded border border-input bg-background px-2 text-xs"
                        value={grantForm.endDate} onChange={(e) => setGrantForm({ ...grantForm, endDate: e.target.value })} />
                      <Button size="sm" loading={addingGrant} onClick={() => handleAddGrant(selectedId)}>Add</Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Outputs section */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Research Outputs ({project.outputs?.length ?? 0})</p>
                {project.outputs?.map((o) => (
                  <div key={o.id} className="mb-2 rounded-md border border-border p-2 text-xs">
                    <div className="flex justify-between">
                      <span className="font-medium">{o.title}</span>
                      <span className="bg-muted rounded-full px-2 py-0.5">{o.outputType.replace('_', ' ')}</span>
                    </div>
                    <p className="text-muted-foreground">{o.authors.join(', ')}</p>
                    {o.publishedIn && <p className="text-muted-foreground">Published in: {o.publishedIn}</p>}
                    {o.doi && <p>DOI: <a href={`https://doi.org/${o.doi}`} target="_blank" className="text-[--color-primary] underline">{o.doi}</a></p>}
                  </div>
                ))}

                {isResearch && (
                  <div className="mt-2 rounded-md border border-dashed border-border p-2 space-y-2">
                    <p className="text-xs font-semibold">Add Output</p>
                    <div className="flex flex-wrap gap-2">
                      <select value={outForm.outputType}
                        onChange={(e) => setOutForm({ ...outForm, outputType: e.target.value })}
                        className="h-8 rounded border border-input bg-background px-2 text-xs">
                        {['JOURNAL_ARTICLE','CONFERENCE_PAPER','BOOK','BOOK_CHAPTER','PATENT','REPORT','THESIS','DATASET','OTHER']
                          .map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                      </select>
                      <Input placeholder="Title" value={outForm.title}
                        onChange={(e) => setOutForm({ ...outForm, title: e.target.value })}
                        className="text-xs flex-1 min-w-[180px]" />
                      <Input placeholder="Authors (comma-separated)" value={outForm.authors}
                        onChange={(e) => setOutForm({ ...outForm, authors: e.target.value })}
                        className="text-xs w-56" />
                      <Button size="sm" loading={addingOutput} onClick={() => handleAddOutput(selectedId)}>Add</Button>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
    <ConfirmAction open={Boolean(pendingMemberRemoval)} title="Remove research team member?" description="This removes the member from the project team and records the change. The project lead cannot be removed." confirmLabel="Remove member" destructive onCancel={() => setPendingMemberRemoval(null)} onConfirm={() => { if (pendingMemberRemoval && selectedId) handleRemoveMember(selectedId, pendingMemberRemoval); }} />
    </>
  );
}
