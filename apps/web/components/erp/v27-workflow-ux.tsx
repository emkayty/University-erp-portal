import React from "react";

export function PageHeader({eyebrow,title,description,actions}:{
  eyebrow?:string; title:string; description?:string; actions?:React.ReactNode
}){
 return <header className="erp-page-header">
   <div><div className="erp-eyebrow">{eyebrow}</div><h1>{title}</h1>{description?<p>{description}</p>:null}</div>
   {actions?<div className="erp-page-actions">{actions}</div>:null}
 </header>;
}

export function ActionButton({children,variant="secondary",disabled=false,onClick,type="button"}:{
 children:React.ReactNode; variant?:"primary"|"secondary"|"danger"|"quiet"; disabled?:boolean; onClick?:()=>void; type?:"button"|"submit"
}){
 return <button type={type} disabled={disabled} onClick={onClick} className={`erp-action-button is-${variant}`}>{children}</button>;
}

export function Notice({tone="info",title,children}:{
 tone?:"info"|"success"|"warning"|"danger"; title:string; children?:React.ReactNode
}){
 return <div className={`erp-notice is-${tone}`} role={tone==="danger"?"alert":"status"}>
   <strong>{title}</strong>{children?<span>{children}</span>:null}
 </div>;
}

export function CommandSearch({placeholder="Search the ERP",onSubmit}:{
 placeholder?:string; onSubmit?:(value:string)=>void
}){
 const [value,setValue]=React.useState("");
 return <form className="erp-command-search" onSubmit={e=>{e.preventDefault();onSubmit?.(value.trim())}}>
   <span aria-hidden="true">⌕</span><input aria-label={placeholder} value={value} onChange={e=>setValue(e.target.value)} placeholder={placeholder}/>
   <kbd>⌘ K</kbd>
 </form>;
}

export function MobileBottomActions({children}:{children:React.ReactNode}){
 return <div className="erp-mobile-bottom-actions">{children}</div>;
}
