import React from "react";

export function DataSurface({
  title, description, toolbar, children,
}: {
  title?: string; description?: string; toolbar?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="erp-data-surface" aria-label={title}>
      {(title || toolbar) && (
        <header className="erp-data-surface-header">
          <div>
            {title ? <h2>{title}</h2> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {toolbar ? <div className="erp-data-surface-toolbar">{toolbar}</div> : null}
        </header>
      )}
      <div className="erp-data-surface-body">{children}</div>
    </section>
  );
}

export function ResponsiveTable({ children }: { children: React.ReactNode }) {
  return <div className="erp-table-wrap" role="region" tabIndex={0} aria-label="Data table">{children}</div>;
}
