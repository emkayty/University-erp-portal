import React from "react";

export type ERPQuickAction = { label: string; href: string; description?: string };

export function QuickActions({ actions }: { actions: ERPQuickAction[] }) {
  return (
    <section className="erp-quick-actions" aria-labelledby="erp-quick-actions-title">
      <div className="erp-section-heading">
        <div>
          <h2 id="erp-quick-actions-title">Quick actions</h2>
          <p>Start the tasks you are most likely to need.</p>
        </div>
      </div>
      <div className="erp-quick-action-grid">
        {actions.map((action) => (
          <a className="erp-quick-action" href={action.href} key={action.href}>
            <strong>{action.label}</strong>
            {action.description ? <span>{action.description}</span> : null}
            <span aria-hidden="true">→</span>
          </a>
        ))}
      </div>
    </section>
  );
}

export function AttentionList({
  items,
}: {
  items: { id: string; title: string; detail?: string; status?: string; href?: string }[];
}) {
  return (
    <section className="erp-attention" aria-labelledby="erp-attention-title">
      <div className="erp-section-heading">
        <div>
          <h2 id="erp-attention-title">Needs attention</h2>
          <p>Items that may require action or review.</p>
        </div>
      </div>
      <div className="erp-attention-list">
        {items.map((item) => {
          const body = (
            <>
              <div className="erp-attention-main">
                <strong>{item.title}</strong>
                {item.detail ? <span>{item.detail}</span> : null}
              </div>
              {item.status ? <span className="erp-status">{item.status}</span> : null}
              <span aria-hidden="true">›</span>
            </>
          );
          return item.href ? <a className="erp-attention-item" href={item.href} key={item.id}>{body}</a> :
            <div className="erp-attention-item" key={item.id}>{body}</div>;
        })}
      </div>
    </section>
  );
}
