import React from "react";

export function AppFrame({children}:{children:React.ReactNode}){
  return <div className="u-app"><a className="u-skip" href="#main-content">Skip to main content</a>{children}</div>;
}

export function PageContainer({children}:{children:React.ReactNode}){
  return <main id="main-content" className="u-container">{children}</main>;
}

export function Button({children,variant="secondary",type="button",disabled=false,onClick}:{
  children:React.ReactNode; variant?:"primary"|"secondary"|"danger"|"quiet"; type?:"button"|"submit"; disabled?:boolean; onClick?:()=>void
}){
  return <button type={type} disabled={disabled} onClick={onClick} className={`u-button u-button--${variant}`}>{children}</button>;
}

export function Field({label,help,error,children,required=false}:{
  label:string; help?:string; error?:string; children:React.ReactNode; required?:boolean
}){
  return <div className="u-field">
    <label>{label}{required?" *":""}</label>
    {children}
    {error?<div className="u-field-error" role="alert">{error}</div>:help?<div className="u-field-help">{help}</div>:null}
  </div>;
}

export function Status({children,tone="info"}:{
  children:React.ReactNode; tone?:"success"|"warning"|"danger"|"info"
}){
  return <span className={`u-status u-status--${tone}`}>{children}</span>;
}

export function DataTable({children,label}:{children:React.ReactNode;label:string}){
  return <div className="u-table-wrap" role="region" aria-label={label} tabIndex={0}>
    <table className="u-table">{children}</table>
  </div>;
}
