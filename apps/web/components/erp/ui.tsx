import React from "react";

export function PageShell({
  title, description, actions, children,
}: {
  title: string; description?: string; actions?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <main className="erp-page-shell">
      <header className="erp-page-header">
        <div>
          <h1 className="erp-page-title">{title}</h1>
          {description ? <p className="erp-page-description">{description}</p> : null}
        </div>
        {actions ? <div className="erp-page-actions">{actions}</div> : null}
      </header>
      {children}
    </main>
  );
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const key = status.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return <span className={`erp-status erp-status-${key}`}><span aria-hidden="true" className="erp-status-dot" />{label ?? status}</span>;
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <section className="erp-empty" aria-live="polite">
      <div className="erp-empty-icon" aria-hidden="true">—</div>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {action ? <div>{action}</div> : null}
    </section>
  );
}

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return <div className="erp-loading" role="status" aria-live="polite"><span className="erp-spinner" aria-hidden="true" />{label}…</div>;
}

export function ErrorState({ title = "Something went wrong", description, retry }: { title?: string; description?: string; retry?: () => void }) {
  return (
    <section className="erp-error" role="alert">
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
      {retry ? <button type="button" className="erp-button erp-button-secondary" onClick={retry}>Try again</button> : null}
    </section>
  );
}
