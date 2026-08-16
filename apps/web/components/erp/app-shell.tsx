import React, { useState } from "react";
import { MobileNavToggle } from "./navigation";

export type ERPNavItem = { label: string; href: string; active?: boolean; badge?: string };

export function AppShell({
  children, navItems, title, userLabel, userRole, breadcrumbs = [],
}: {
  children: React.ReactNode;
  navItems: ERPNavItem[];
  title?: string;
  userLabel?: string;
  userRole?: string;
  breadcrumbs?: { label: string; href?: string }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="erp-app-shell">
      <aside className={`erp-sidebar ${open ? "is-open" : ""}`} aria-label="Primary navigation">
        <div className="erp-brand">
          <span className="erp-brand-mark" aria-hidden="true">U</span>
          <div><strong>University ERP</strong><small>Institutional operations</small></div>
        </div>
        <nav className="erp-nav">
          {navItems.map(item => (
            <a key={item.href} href={item.href} className={item.active ? "is-active" : ""} aria-current={item.active ? "page" : undefined}>
              <span>{item.label}</span>{item.badge ? <span className="erp-nav-badge">{item.badge}</span> : null}
            </a>
          ))}
        </nav>
      </aside>
      {open ? <button className="erp-nav-overlay" aria-label="Close navigation" onClick={() => setOpen(false)} /> : null}
      <div className="erp-app-main">
        <header className="erp-topbar">
          <MobileNavToggle open={open} onClick={() => setOpen(v => !v)} />
          <div className="erp-topbar-context">
            {breadcrumbs.length ? <nav className="erp-breadcrumbs" aria-label="Breadcrumb">
              {breadcrumbs.map((b,i) => <React.Fragment key={`${b.label}-${i}`}>
                {i ? <span aria-hidden="true">/</span> : null}
                {b.href ? <a href={b.href}>{b.label}</a> : <span aria-current="page">{b.label}</span>}
              </React.Fragment>)}
            </nav> : null}
            {title ? <span className="erp-topbar-title">{title}</span> : null}
          </div>
          <div className="erp-user-context" aria-label="Current user">
            <span className="erp-avatar" aria-hidden="true">{(userLabel || "U").trim().charAt(0).toUpperCase()}</span>
            <span className="erp-user-copy"><strong>{userLabel || "User"}</strong><small>{userRole || "Staff"}</small></span>
          </div>
        </header>
        <div className="erp-app-content">{children}</div>
      </div>
    </div>
  );
}
