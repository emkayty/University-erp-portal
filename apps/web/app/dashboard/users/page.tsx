'use client';

import { FormEvent, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ALL_ROLE_NAMES,
  ALL_STAFF_SCOPES,
  useAccessReview,
  useAdminUsers,
  useCreateAdminUser,
  useCreateDelegation,
  useGrantUserRole,
  useRevokeDelegation,
  useRevokeUserRole,
  useRevokeUserSessions,
  useSetUserActive,
  type AdminUser,
} from '@/hooks/use-users-admin';
import type { RoleName, StaffScope } from '@uniportal/types';

const scopedRoles: RoleName[] = ['STAFF', 'SUPPORT_STAFF'];
const staffScopeLabels: Record<StaffScope, string> = {
  admissions: 'Admissions',
  finance_clerk: 'Finance clerk',
  hr_clerk: 'HR clerk',
  lecturer: 'Lecturer / teaching',
  library: 'Library',
  hostel: 'Hostel',
  health: 'Health clinic',
  transport: 'Transport',
  research: 'Research',
  alumni: 'Alumni',
  timetable: 'Timetable',
  records: 'Academic records',
  dpo: 'Data protection officer',
};

function toIsoOrUndefined(value: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function roleNeedsScope(role: RoleName) {
  return scopedRoles.includes(role);
}

function roleLabel(role: string) {
  return role.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());
}

function ErrorText({ message }: { message?: string }) {
  return message ? <p role="alert" className="text-sm text-red-700">{message}</p> : null;
}

function ScopePicker({ value, onChange }: { value: StaffScope[]; onChange: (value: StaffScope[]) => void }) {
  return (
    <fieldset className="space-y-2 rounded-lg border p-3">
      <legend className="px-1 text-sm font-medium">ABAC staff scopes</legend>
      <p className="text-xs text-muted-foreground">Select only the institutional functions this assignment actually requires.</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {ALL_STAFF_SCOPES.map((scope) => (
          <label key={scope} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={value.includes(scope)}
              onChange={(event) => onChange(event.target.checked ? [...value, scope] : value.filter((item) => item !== scope))}
            />
            {staffScopeLabels[scope]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function UserRoleSummary({ user }: { user: AdminUser }) {
  return (
    <div className="space-y-1">
      {(user.roles ?? []).map((role) => (
        <div key={role.roleName} className="rounded-md bg-muted px-2 py-1 text-xs">
          <div className="font-medium">{roleLabel(role.roleName)}</div>
          <div className="text-muted-foreground">
            {role.staffScope?.scopes?.length ? role.staffScope.scopes.join(', ') : 'Institutional role'}
            {role.effectiveUntil ? ` · ends ${new Date(role.effectiveUntil).toLocaleDateString()}` : ''}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function UsersAdminPage() {
  const [filter, setFilter] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [newRole, setNewRole] = useState<RoleName>('STAFF');
  const [assignmentRole, setAssignmentRole] = useState<RoleName>('STAFF');
  const [delegationRole, setDelegationRole] = useState<RoleName>('STAFF');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newScopes, setNewScopes] = useState<StaffScope[]>([]);
  const [assignmentScopes, setAssignmentScopes] = useState<StaffScope[]>([]);
  const [delegationScopes, setDelegationScopes] = useState<StaffScope[]>([]);
  const [newEffectiveUntil, setNewEffectiveUntil] = useState('');
  const [assignmentEffectiveUntil, setAssignmentEffectiveUntil] = useState('');
  const [newGrantReason, setNewGrantReason] = useState('');
  const [assignmentGrantReason, setAssignmentGrantReason] = useState('');
  const [delegateeId, setDelegateeId] = useState('');
  const [delegationStartsAt, setDelegationStartsAt] = useState('');
  const [delegationEndsAt, setDelegationEndsAt] = useState('');
  const [delegationReason, setDelegationReason] = useState('');
  const [reviewWindow, setReviewWindow] = useState(30);

  const { data: users = [], isLoading, isError } = useAdminUsers();
  const { data: accessReview, isLoading: reviewLoading, isError: reviewError } = useAccessReview(reviewWindow);
  const createUser = useCreateAdminUser();
  const setActive = useSetUserActive();
  const grant = useGrantUserRole();
  const revoke = useRevokeUserRole();
  const createDelegation = useCreateDelegation();
  const revokeDelegation = useRevokeDelegation();
  const revokeSessions = useRevokeUserSessions();

  const filtered = useMemo(
    () => users.filter((user) => user.email.toLowerCase().includes(filter.toLowerCase()) || user.id.includes(filter)),
    [filter, users],
  );
  const selectedUser = users.find((user) => user.id === selectedUserId);

  function resetCreateForm() {
    setNewEmail('');
    setNewPassword('');
    setNewPhone('');
    setNewScopes([]);
    setNewEffectiveUntil('');
    setNewGrantReason('');
  }

  function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createUser.mutate({
      email: newEmail,
      password: newPassword,
      roleName: newRole,
      phone: newPhone || undefined,
      staffScope: roleNeedsScope(newRole) ? { scopes: newScopes } : undefined,
      effectiveUntil: toIsoOrUndefined(newEffectiveUntil),
      grantReason: newGrantReason || undefined,
    }, { onSuccess: resetCreateForm });
  }

  function submitGrant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedUserId) return;
    grant.mutate({
      id: selectedUserId,
      roleName: assignmentRole,
      staffScope: roleNeedsScope(assignmentRole) ? { scopes: assignmentScopes } : undefined,
      effectiveUntil: toIsoOrUndefined(assignmentEffectiveUntil),
      grantReason: assignmentGrantReason || undefined,
    });
  }

  function submitDelegation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!delegateeId) return;
    createDelegation.mutate({
      delegateeId,
      roleName: delegationRole,
      startsAt: toIsoOrUndefined(delegationStartsAt) ?? new Date().toISOString(),
      endsAt: toIsoOrUndefined(delegationEndsAt) ?? '',
      reason: delegationReason,
      staffScope: roleNeedsScope(delegationRole) ? { scopes: delegationScopes } : undefined,
    }, { onSuccess: () => {
      setDelegationReason('');
      setDelegationStartsAt('');
      setDelegationEndsAt('');
      setDelegationScopes([]);
    } });
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">Identity, access lifecycle, segregation of duties, and delegated authority</p>
        <h1 className="text-2xl font-semibold">User Administration</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Every grant, expiry, scope, delegation, and session-remediation action is validated again by the API. Use the least privilege needed for the appointment and record the business reason.</p>
      </header>

      <Card>
        <CardHeader><CardTitle>Access review</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Monitor assignments and delegations that need review before authority expires.</p>
            <label className="flex items-center gap-2 text-sm">Window
              <select className="h-9 rounded-md border bg-background px-2" value={reviewWindow} onChange={(event) => setReviewWindow(Number(event.target.value))}>
                {[30, 60, 90].map((days) => <option key={days} value={days}>{days} days</option>)}
              </select>
            </label>
          </div>
          {reviewLoading ? <p className="text-sm">Loading access review…</p> : reviewError ? <ErrorText message="Access review could not be loaded." /> : accessReview ? <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border p-3"><p className="text-2xl font-semibold">{accessReview.summary.expiringRoleAssignments}</p><p className="text-xs text-muted-foreground">Expiring role assignments</p></div>
              <div className="rounded-lg border p-3"><p className="text-2xl font-semibold">{accessReview.summary.usersWithRevokedRolesAndActiveSessions}</p><p className="text-xs text-muted-foreground">Revoked roles with live sessions</p></div>
              <div className="rounded-lg border p-3"><p className="text-2xl font-semibold">{accessReview.summary.activeDelegationsExpiring}</p><p className="text-xs text-muted-foreground">Delegations nearing expiry</p></div>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              <section className="rounded-lg border p-3"><h2 className="mb-2 text-sm font-semibold">Expiring roles</h2>{accessReview.expiringRoles.length === 0 ? <p className="text-xs text-muted-foreground">No assignments expire in this window.</p> : <div className="space-y-2">{accessReview.expiringRoles.map((item) => <div key={item.id} className="rounded-md bg-muted p-2 text-xs"><div className="font-medium">{item.user.email} · {roleLabel(item.roleName)}</div><div className="text-muted-foreground">Ends {item.effectiveUntil ? new Date(item.effectiveUntil).toLocaleString() : '—'}</div></div>)}</div>}</section>
              <section className="rounded-lg border p-3"><h2 className="mb-2 text-sm font-semibold">Revoked roles with sessions</h2>{accessReview.revokedRolesWithSessions.length === 0 ? <p className="text-xs text-muted-foreground">No active sessions were found for revoked roles.</p> : <div className="space-y-2">{accessReview.revokedRolesWithSessions.map((item) => <div key={item.id} className="rounded-md bg-red-50 p-2 text-xs text-red-900"><div className="font-medium">{item.user.email} · {roleLabel(item.roleName)}</div><div>{item.user.sessions.length} active session(s) remain.</div><Button size="sm" variant="outline" className="mt-2" loading={revokeSessions.isPending} onClick={() => revokeSessions.mutate(item.user.id)}>Revoke sessions</Button></div>)}</div>}</section>
              <section className="rounded-lg border p-3"><h2 className="mb-2 text-sm font-semibold">Expiring delegations</h2>{accessReview.expiringDelegations.length === 0 ? <p className="text-xs text-muted-foreground">No active delegations expire in this window.</p> : <div className="space-y-2">{accessReview.expiringDelegations.map((item) => <div key={item.id} className="rounded-md bg-amber-50 p-2 text-xs text-amber-900"><div className="font-medium">{item.delegator.email} → {item.delegatee.email}</div><div>{roleLabel(item.roleName)} · ends {new Date(item.endsAt).toLocaleString()}</div><Button size="sm" variant="outline" className="mt-2" loading={revokeDelegation.isPending} onClick={() => revokeDelegation.mutate({ delegateeId: item.delegateeId, delegationId: item.id })}>Revoke delegation</Button></div>)}</div>}</section>
            </div>
            <p className="text-[11px] text-muted-foreground">Generated {new Date(accessReview.generatedAt).toLocaleString()} · Review the report regularly and document renewal or revocation decisions.</p>
          </> : null}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Create account</CardTitle></CardHeader>
          <CardContent><form className="space-y-3" onSubmit={submitCreate}>
            <div className="grid gap-3 md:grid-cols-2"><input className="h-10 rounded-md border bg-background px-3 text-sm" type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} placeholder="Institutional email" required /><input className="h-10 rounded-md border bg-background px-3 text-sm" type="password" minLength={12} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="Temporary password (12+ chars)" required /><input className="h-10 rounded-md border bg-background px-3 text-sm" value={newPhone} onChange={(event) => setNewPhone(event.target.value)} placeholder="Phone (optional)" /><select aria-label="Initial role" className="h-10 rounded-md border bg-background px-3 text-sm" value={newRole} onChange={(event) => setNewRole(event.target.value as RoleName)}>{ALL_ROLE_NAMES.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</select></div>
            {roleNeedsScope(newRole) && <ScopePicker value={newScopes} onChange={setNewScopes} />}
            <div className="grid gap-3 md:grid-cols-2"><label className="text-xs text-muted-foreground">Role expiry (optional)<input className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground" type="datetime-local" value={newEffectiveUntil} onChange={(event) => setNewEffectiveUntil(event.target.value)} /></label><input className="h-10 rounded-md border bg-background px-3 text-sm" minLength={8} value={newGrantReason} onChange={(event) => setNewGrantReason(event.target.value)} placeholder="Appointment / business reason (8+ chars)" /></div>
            <Button type="submit" loading={createUser.isPending}>Create governed account</Button>
            <ErrorText message={createUser.error?.message} />
          </form></CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Grant or renew role assignment</CardTitle></CardHeader>
          <CardContent><form className="space-y-3" onSubmit={submitGrant}>
            <select aria-label="Assignment target" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)}><option value="">Choose an account</option>{users.map((user) => <option key={user.id} value={user.id}>{user.email}</option>)}</select>
            <select aria-label="Role to grant" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={assignmentRole} onChange={(event) => setAssignmentRole(event.target.value as RoleName)}>{ALL_ROLE_NAMES.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</select>
            {roleNeedsScope(assignmentRole) && <ScopePicker value={assignmentScopes} onChange={setAssignmentScopes} />}
            <div className="grid gap-3 md:grid-cols-2"><label className="text-xs text-muted-foreground">Effective expiry (optional)<input className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground" type="datetime-local" value={assignmentEffectiveUntil} onChange={(event) => setAssignmentEffectiveUntil(event.target.value)} /></label><input className="h-10 rounded-md border bg-background px-3 text-sm" minLength={8} value={assignmentGrantReason} onChange={(event) => setAssignmentGrantReason(event.target.value)} placeholder="Reason / approval reference" /></div>
            <Button type="submit" disabled={!selectedUserId} loading={grant.isPending}>Grant or renew assignment</Button>
            <ErrorText message={grant.error?.message} />
          </form></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Create time-bounded delegation</CardTitle></CardHeader>
        <CardContent><form className="space-y-3" onSubmit={submitDelegation}>
          <p className="text-sm text-muted-foreground">Delegation is created by the current authority holder, cannot be self-delegated, is limited by the API to 31 days, and must be independently governed by the server.</p>
          <div className="grid gap-3 md:grid-cols-3"><select aria-label="Delegate to" className="h-10 rounded-md border bg-background px-3 text-sm" value={delegateeId} onChange={(event) => setDelegateeId(event.target.value)}><option value="">Choose delegatee</option>{users.map((user) => <option key={user.id} value={user.id}>{user.email}</option>)}</select><select aria-label="Delegated role" className="h-10 rounded-md border bg-background px-3 text-sm" value={delegationRole} onChange={(event) => setDelegationRole(event.target.value as RoleName)}>{ALL_ROLE_NAMES.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</select><input className="h-10 rounded-md border bg-background px-3 text-sm" minLength={8} value={delegationReason} onChange={(event) => setDelegationReason(event.target.value)} placeholder="Business reason (8+ chars)" required /></div>
          <div className="grid gap-3 md:grid-cols-2"><label className="text-xs text-muted-foreground">Starts<input className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground" type="datetime-local" value={delegationStartsAt} onChange={(event) => setDelegationStartsAt(event.target.value)} /></label><label className="text-xs text-muted-foreground">Ends<input className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground" type="datetime-local" value={delegationEndsAt} onChange={(event) => setDelegationEndsAt(event.target.value)} required /></label></div>
          {roleNeedsScope(delegationRole) && <ScopePicker value={delegationScopes} onChange={setDelegationScopes} />}
          <Button type="submit" disabled={!delegateeId} loading={createDelegation.isPending}>Create delegation</Button>
          <ErrorText message={createDelegation.error?.message} />
        </form></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Accounts ({filtered.length})</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <input className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search by email or UUID" />
          {isError && <ErrorText message="Unable to load user accounts." />}
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">Account</th><th className="p-2">Assignments</th><th className="p-2">Status</th><th className="p-2">Actions</th></tr></thead><tbody>{isLoading ? <tr><td className="p-4" colSpan={4}>Loading accounts…</td></tr> : filtered.length === 0 ? <tr><td className="p-4 text-muted-foreground" colSpan={4}>No matching accounts.</td></tr> : filtered.map((user) => <tr key={user.id} className="border-b align-top last:border-0"><td className="p-2"><div>{user.email}</div><div className="font-mono text-xs text-muted-foreground">{user.id}</div></td><td className="p-2"><UserRoleSummary user={user} /></td><td className="p-2">{user.isActive ? 'Active' : 'Inactive'}</td><td className="p-2"><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setActive.mutate({ id: user.id, isActive: !user.isActive })}>{user.isActive ? 'Deactivate' : 'Activate'}</Button><Button size="sm" variant={selectedUserId === user.id ? 'default' : 'outline'} onClick={() => setSelectedUserId(user.id)}>{selectedUserId === user.id ? 'Selected' : 'Manage'}</Button>{(user.roles ?? []).map((role) => <Button key={role.roleName} size="sm" variant="outline" onClick={() => revoke.mutate({ id: user.id, roleName: role.roleName })}>Revoke {roleLabel(role.roleName)}</Button>)}</div></td></tr>)}</tbody></table></div>
          <ErrorText message={setActive.error?.message || grant.error?.message || revoke.error?.message || revokeSessions.error?.message || revokeDelegation.error?.message} />
          {selectedUser && <p className="text-xs text-muted-foreground">Managing <strong>{selectedUser.email}</strong>. Server-side SoD, self-grant, scope, lifecycle, and delegation rules still apply.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
