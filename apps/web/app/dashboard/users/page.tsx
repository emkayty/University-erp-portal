'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAdminUsers, useCreateAdminUser, useGrantUserRole, useRevokeUserRole, useSetUserActive } from '@/hooks/use-users-admin';

const roles = ['SUPER_ADMIN', 'VC', 'REGISTRAR', 'DEAN', 'HOD', 'STAFF', 'BURSAR', 'HR_MANAGER', 'STUDENT'];

export default function UsersAdminPage() {
  const [filter, setFilter] = useState('');
  const [role, setRole] = useState('STAFF');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const { data: users = [], isLoading, isError } = useAdminUsers();
  const createUser = useCreateAdminUser();
  const setActive = useSetUserActive();
  const grant = useGrantUserRole();
  const revoke = useRevokeUserRole();
  const filtered = users.filter((user) => user.email.toLowerCase().includes(filter.toLowerCase()) || user.id.includes(filter));

  return <div className="space-y-6">
    <header><p className="text-sm text-muted-foreground">Identity, access, and account lifecycle</p><h1 className="text-2xl font-semibold">User Administration</h1><p className="mt-1 text-sm text-muted-foreground">Manage active accounts and roles with an auditable, explicit action surface. Sensitive role grants remain server-authorized for super administrators.</p></header>
    <Card><CardHeader><CardTitle>Create account</CardTitle></CardHeader><CardContent><form className="grid gap-3 md:grid-cols-4" onSubmit={(event) => { event.preventDefault(); createUser.mutate({ email: newEmail, password: newPassword, roleName: role, phone: newPhone || undefined }, { onSuccess: () => { setNewEmail(''); setNewPassword(''); setNewPhone(''); } }); }}><Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="Email" required /><Input type="password" minLength={12} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Temporary password (12+ chars)" required /><Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="Phone (optional)" /><div className="flex gap-2"><select aria-label="Initial role" className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3" value={role} onChange={(e) => setRole(e.target.value)}>{roles.map((item) => <option key={item}>{item}</option>)}</select><Button type="submit" loading={createUser.isPending}>Create</Button></div></form></CardContent></Card><Card><CardContent className="flex flex-col gap-3 pt-5 md:flex-row"><Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search by email or UUID" /><select aria-label="Role to grant" className="h-10 rounded-md border bg-background px-3" value={role} onChange={(e) => setRole(e.target.value)}>{roles.map((item) => <option key={item}>{item}</option>)}</select></CardContent></Card>
    {isError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">Unable to load user accounts.</div>}
    <Card><CardHeader><CardTitle>Accounts ({filtered.length})</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">Account</th><th className="p-2">Roles</th><th className="p-2">Status</th><th className="p-2">Actions</th></tr></thead><tbody>{isLoading ? <tr><td className="p-4" colSpan={4}>Loading accounts…</td></tr> : filtered.length === 0 ? <tr><td className="p-4 text-muted-foreground" colSpan={4}>No matching accounts.</td></tr> : filtered.map((user) => <tr key={user.id} className="border-b last:border-0"><td className="p-2"><div>{user.email}</div><div className="font-mono text-xs text-muted-foreground">{user.id}</div></td><td className="p-2"><div className="flex flex-wrap gap-1">{(user.roles ?? []).map((item) => <span key={item.roleName} className="rounded-full bg-muted px-2 py-1 text-xs">{item.roleName}</span>)}</div></td><td className="p-2">{user.isActive ? 'Active' : 'Inactive'}</td><td className="p-2"><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setActive.mutate({ id: user.id, isActive: !user.isActive })}>{user.isActive ? 'Deactivate' : 'Activate'}</Button><Button size="sm" onClick={() => grant.mutate({ id: user.id, roleName: role })}>Grant {role}</Button>{(user.roles ?? []).some((item) => item.roleName === role) && <Button size="sm" variant="outline" onClick={() => revoke.mutate({ id: user.id, roleName: role })}>Revoke {role}</Button>}</div></td></tr>)}</tbody></table></div></CardContent></Card>
  </div>;
}
