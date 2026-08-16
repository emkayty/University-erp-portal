import React from "react";

export function MetricCard({
  label, value, detail, href, status,
}: {
  label: string; value: React.ReactNode; detail?: string; href?: string; status?: "neutral"|"success"|"warning"|"danger";
}) {
  const content = <>
    <span className="erp-metric-label">{label}</span>
    <strong className="erp-metric-value">{value}</strong>
    {detail ? <span className={`erp-metric-detail ${status ? `is-${status}` : ""}`}>{detail}</span> : null}
  </>;
  return href ? <a className="erp-metric-card" href={href}>{content}</a> : <div className="erp-metric-card">{content}</div>;
}

export function SearchBar({
  value, onChange, placeholder="Search", label="Search",
}: {
  value: string; onChange: (value:string)=>void; placeholder?:string; label?:string;
}) {
  return <label className="erp-search"><span className="erp-sr-only">{label}</span><span aria-hidden="true">⌕</span>
    <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} type="search" />
  </label>;
}

export function FilterBar({ children }: { children: React.ReactNode }) {
  return <div className="erp-filter-bar">{children}</div>;
}

export function WorkflowSteps({
  steps, current,
}: { steps: {label:string; description?:string}[]; current:number }) {
  return <ol className="erp-workflow" aria-label="Workflow progress">
    {steps.map((s,i)=><li key={s.label} className={i<current?"is-complete":i===current?"is-current":""}>
      <span className="erp-workflow-number" aria-hidden="true">{i<current?"✓":i+1}</span>
      <div><strong>{s.label}</strong>{s.description?<small>{s.description}</small>:null}</div>
    </li>)}
  </ol>;
}

export function FormSection({
  title, description, children,
}: { title:string; description?:string; children:React.ReactNode }) {
  return <fieldset className="erp-form-section"><legend>{title}</legend>{description?<p>{description}</p>:null}<div className="erp-form-grid">{children}</div></fieldset>;
}
