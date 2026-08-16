import React from "react";

export function Section({
  title, description, action, children,
}: {title:string; description?:string; action?:React.ReactNode; children:React.ReactNode}) {
  return <section className="erp-section">
    <header className="erp-section-header">
      <div><h2>{title}</h2>{description?<p>{description}</p>:null}</div>
      {action?<div className="erp-section-action">{action}</div>:null}
    </header>
    {children}
  </section>;
}

export function StatusPill({
  label, tone="neutral",
}: {label:string; tone?:"neutral"|"success"|"warning"|"danger"|"info"}) {
  return <span className={`erp-status-pill is-${tone}`}><span className="erp-status-dot" aria-hidden="true"/>{label}</span>;
}

export function EmptyState({
  title, description, action,
}: {title:string; description:string; action?:React.ReactNode}) {
  return <div className="erp-empty-state" role="status">
    <div className="erp-empty-icon" aria-hidden="true">○</div>
    <h3>{title}</h3><p>{description}</p>{action?<div>{action}</div>:null}
  </div>;
}

export function LoadingState({label="Loading…"}:{label?:string}) {
  return <div className="erp-loading-state" role="status" aria-live="polite">
    <span className="erp-spinner" aria-hidden="true"/><span>{label}</span>
  </div>;
}

export function ErrorState({
  title="Something went wrong", description="We could not complete this request.", action,
}: {title?:string; description?:string; action?:React.ReactNode}) {
  return <div className="erp-error-state" role="alert">
    <h3>{title}</h3><p>{description}</p>{action?<div>{action}</div>:null}
  </div>;
}

export function ConfirmAction({
  children, onConfirm, label="Confirm action",
}: {children:React.ReactNode; onConfirm?:()=>void; label?:string}) {
  const [open,setOpen]=React.useState(false);
  if (!onConfirm) return <>{children}</>;
  return <span className="erp-confirm-wrap">
    <button type="button" onClick={()=>setOpen(true)}>{children}</button>
    {open?<span className="erp-confirm-popover" role="dialog" aria-label={label}>
      <strong>{label}</strong>
      <span>Review the action before continuing.</span>
      <span className="erp-confirm-actions">
        <button type="button" onClick={()=>setOpen(false)}>Cancel</button>
        <button type="button" className="is-primary" onClick={()=>{onConfirm();setOpen(false)}}>Continue</button>
      </span>
    </span>:null}
  </span>;
}
