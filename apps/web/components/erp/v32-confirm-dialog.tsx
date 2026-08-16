import React from "react";
export function ConfirmDialog({open,title,description,confirmLabel="Confirm",cancelLabel="Cancel",danger=false,onConfirm,onCancel}:{
 open:boolean;title:string;description:string;confirmLabel?:string;cancelLabel?:string;danger?:boolean;onConfirm:()=>void;onCancel:()=>void
}){
 React.useEffect(()=>{if(!open)return;const onKey=(e:KeyboardEvent)=>{if(e.key==="Escape")onCancel()};window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey)},[open,onCancel]);
 if(!open)return null;
 return <div className="u-v32-dialog-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onCancel()}}>
  <section className="u-v32-dialog" role="dialog" aria-modal="true" aria-labelledby="u-v32-dialog-title">
   <h2 id="u-v32-dialog-title">{title}</h2><p>{description}</p>
   <div className="u-v32-dialog-actions"><button className="u-button u-button--secondary" onClick={onCancel}>{cancelLabel}</button>
   <button className={`u-button ${danger?"u-button--danger":"u-button--primary"}`} onClick={onConfirm}>{confirmLabel}</button></div>
  </section>
 </div>;
}
export function allowNavigation(dirty:boolean, confirm:()=>Promise<boolean>):Promise<boolean>{return dirty?confirm():Promise.resolve(true)}
