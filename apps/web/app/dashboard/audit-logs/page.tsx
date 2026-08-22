'use client';
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuditLogs } from '@/hooks/use-reports';
import { hasEffectiveRole } from '@/lib/authz';
import { cn, formatDate } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth.store';

const ACTION_COLORS: Record<string, string> = {
  CREATE:       'bg-green-100 text-green-700',
  UPDATE:       'bg-blue-100 text-blue-700',
  DELETE:       'bg-red-100 text-red-700',
  SOFT_DELETE:  'bg-orange-100 text-orange-700',
  LOGIN:        'bg-purple-100 text-purple-700',
  LOGOUT:       'bg-gray-100 text-gray-600',
  EXPORT:       'bg-indigo-100 text-indigo-700',
  APPROVE:      'bg-teal-100 text-teal-700',
  REJECT:       'bg-pink-100 text-pink-700',
  PUBLISH:      'bg-amber-100 text-amber-700',
  ERASURE:      'badge-danger',
};

const AUDIT_ACTIONS = [
  'CREATE','UPDATE','DELETE','SOFT_DELETE','LOGIN','LOGOUT',
  'EXPORT','ERASURE','APPROVE','REJECT','PUBLISH',
];

const SENSITIVE_TABLES = new Set(['medical_records', 'prescriptions', 'payslips', 'payments']);

export default function AuditLogsPage() {
  const user = useAuthStore((state) => state.user);
  const canView = hasEffectiveRole(user, 'SUPER_ADMIN');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage]       = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Editable filter inputs
  const [actorId,     setActorId]     = useState('');
  const [action,      setAction]      = useState('');
  const [targetTable, setTargetTable] = useState('');
  const [dateFrom,    setDateFrom]    = useState('');
  const [dateTo,      setDateTo]      = useState('');

  const { data, isLoading } = useAuditLogs(
    { ...filters, page: String(page) },
    { enabled: canView },
  );

  const logs = data?.logs ?? [];

  if (!canView) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Audit Logs</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Immutable, append-only record of system actions.
          </p>
        </div>
        <Card>
          <CardContent className="py-10 text-center">
            <p className="font-medium text-foreground">Access restricted</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Audit logs are limited to Super Administrators because they can
              contain security-sensitive operational metadata.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const applyFilters = () => {
    const f: Record<string, string> = {};
    if (actorId)     f['actorId']     = actorId;
    if (action)      f['action']      = action;
    if (targetTable) f['targetTable'] = targetTable;
    if (dateFrom)    f['dateFrom']    = dateFrom;
    if (dateTo)      f['dateTo']      = dateTo;
    setFilters(f);
    setPage(1);
  };

  const clearFilters = () => {
    setActorId(''); setAction(''); setTargetTable('');
    setDateFrom(''); setDateTo('');
    setFilters({});
    setPage(1);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-foreground">Audit Logs</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Immutable, append-only record of all system actions. ISO 27001 · NDPR 2019 compliant.
          Retained 7 years. PII fields shown as [ENCRYPTED].
        </p>
      </div>

      {/* ── Filter bar ──────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3">
            <div className="min-w-[180px] flex-1">
              <label className="text-xs text-muted-foreground">Actor (User ID)</label>
              <Input value={actorId} onChange={(e) => setActorId(e.target.value)}
                placeholder="UUID…" className="mt-1 text-xs font-mono" />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Action</label>
              <select value={action} onChange={(e) => setAction(e.target.value)}
                className="mt-1 block h-9 rounded border border-input bg-background px-3 text-sm">
                <option value="">All Actions</option>
                {AUDIT_ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Table</label>
              <Input value={targetTable} onChange={(e) => setTargetTable(e.target.value)}
                placeholder="e.g. students" className="mt-1 w-36 text-xs font-mono" />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Date From</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                className="mt-1 block h-9 rounded border border-input bg-background px-3 text-sm" />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Date To</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                className="mt-1 block h-9 rounded border border-input bg-background px-3 text-sm" />
            </div>

            <div className="flex items-end gap-2">
              <Button size="sm" onClick={applyFilters}>Apply</Button>
              <Button size="sm" variant="ghost" onClick={clearFilters}>Clear</Button>
            </div>
          </div>

          {Object.keys(filters).length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Showing {data?.total.toLocaleString() ?? '…'} results
              {filters['action']      && ` · action: ${filters['action']}`}
              {filters['targetTable'] && ` · table: ${filters['targetTable']}`}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Log entries ─────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="animate-pulse space-y-2">
          {[1,2,3,4,5].map((i) => <div key={i} className="h-16 rounded-lg bg-muted" />)}
        </div>
      ) : logs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No audit entries found for the current filters.</p>
      ) : (
        <div className="space-y-1.5">
          {logs.map((log) => {
            const isSensitive = SENSITIVE_TABLES.has(log.targetTable);
            const isOpen      = expanded === log.id;
            return (
              <Card key={log.id}
                className={cn('overflow-hidden transition-all', isSensitive && 'border-amber-200')}>
                <CardContent className="pt-3 pb-3">
                  <button type="button"
                    className="w-full text-left"
                    onClick={() => setExpanded(isOpen ? null : log.id)}
                    aria-expanded={isOpen}>
                    <div className="flex items-start justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold',
                          ACTION_COLORS[log.action] ?? 'bg-muted text-muted-foreground')}>
                          {log.action}
                        </span>
                        <span className="font-mono text-xs text-foreground">
                          {log.targetTable}
                        </span>
                        {log.targetId && (
                          <span className="font-mono text-xs text-muted-foreground truncate max-w-[120px]">
                            #{log.targetId.slice(0, 8)}…
                          </span>
                        )}
                        {isSensitive && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700">
                            🔒 sensitive table
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>
                          {log.actor?.email ?? (log.actorId ? log.actorId.slice(0, 8) + '…' : 'System')}
                        </span>
                        <span>{formatDate(log.createdAt)}</span>
                        <span className="text-[--color-primary]">{isOpen ? '↑' : '↓'}</span>
                      </div>
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {isOpen && (
                    <div className="mt-3 pt-3 border-t border-border space-y-3">
                      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                        {[
                          { label: 'Log ID',      value: log.id },
                          { label: 'Actor ID',    value: log.actorId ?? 'System' },
                          { label: 'IP Address',  value: log.ipAddress ?? '—' },
                          { label: 'Session ID',  value: log.sessionId ?? '—' },
                        ].map(({ label, value }) => (
                          <div key={label}>
                            <p className="text-muted-foreground">{label}</p>
                            <p className="font-mono break-all">{value}</p>
                          </div>
                        ))}
                      </div>

                      {(log.oldValues || log.newValues) && (
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {log.oldValues && (
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Before</p>
                              <pre className="rounded bg-muted p-2 text-[10px] overflow-x-auto text-foreground">
                                {JSON.stringify(log.oldValues, null, 2)}
                              </pre>
                            </div>
                          )}
                          {log.newValues && (
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">After</p>
                              <pre className="rounded bg-muted p-2 text-[10px] overflow-x-auto text-foreground">
                                {JSON.stringify(log.newValues, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}

                      {log.metadata && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Metadata</p>
                          <pre className="rounded bg-muted p-2 text-[10px] overflow-x-auto text-foreground">
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Pagination ───────────────────────────────────────────────────────── */}
      {(data?.totalPages ?? 0) > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {data?.total.toLocaleString()} total entries · Page {page} of {data?.totalPages}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}>
              ← Previous
            </Button>
            <Button size="sm" variant="outline" disabled={page >= (data?.totalPages ?? 1)}
              onClick={() => setPage((p) => p + 1)}>
              Next →
            </Button>
          </div>
        </div>
      )}

      {/* NDPR notice */}
      <p className="text-[10px] text-muted-foreground text-center pt-2 border-t border-border">
        Audit logs are immutable under ISO 27001 § A.12.4 and NDPR 2019 Article 2.5.
        PII fields (NIN, BVN, diagnosis, etc.) are displayed as [ENCRYPTED] and cannot be retrieved from this view.
        Retention: 7 years minimum.
      </p>
    </div>
  );
}
