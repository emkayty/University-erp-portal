import React from "react";

/**
 * V29 Unified ERP UI facade.
 * Domain screens should import these primitives instead of creating bespoke buttons,
 * fields, status pills, notices, tables or page headers.
 */
export const UI = {
  Button: ({children, variant="secondary", ...props}: any) =>
    <button className={`u-button u-button--${variant}`} {...props}>{children}</button>,
  Status: ({children, tone="info"}: any) =>
    <span className={`u-status u-status--${tone}`}>{children}</span>,
};

export function Page({title,description,actions,children}:{
  title:string; description?:string; actions?:React.ReactNode; children:React.ReactNode
}){
 return <><header className="erp-page-header">
   <div><h1>{title}</h1>{description?<p>{description}</p>:null}</div>
   {actions?<div className="erp-page-actions">{actions}</div>:null}
 </header><div className="erp-page-body">{children}</div></>;
}

export function Card({title,description,children,action}:{
 title?:string; description?:string; children:React.ReactNode; action?:React.ReactNode
}){
 return <section className="u-surface erp-v29-card">
   {(title||action)?<header className="erp-v29-card-header">
      <div>{title?<h2>{title}</h2>:null}{description?<p>{description}</p>:null}</div>
      {action?<div>{action}</div>:null}
   </header>:null}
   {children}
 </section>;
}

export function StateMessage({kind,title,description,action}:{
 kind:"loading"|"empty"|"error"|"success"|"unauthorized";
 title:string; description?:string; action?:React.ReactNode
}){
 return <div className={`erp-v29-state is-${kind}`} role={kind==="error"?"alert":"status"}>
   <strong>{title}</strong>{description?<span>{description}</span>:null}{action?<div>{action}</div>:null}
 </div>;
}
