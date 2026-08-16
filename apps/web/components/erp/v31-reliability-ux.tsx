import React from "react";

export function LoadingBlock({label="Loading"}:{label?:string}){
 return <div className="u-v31-loading" role="status" aria-live="polite">
   <span className="u-v31-spinner" aria-hidden="true"/><span>{label}…</span>
 </div>;
}

export function EmptyState({title,description,action}:{
 title:string;description?:string;action?:React.ReactNode
}){
 return <div className="u-v31-state" data-state="empty">
   <strong>{title}</strong>{description?<span>{description}</span>:null}{action?<div>{action}</div>:null}
 </div>;
}

export function ErrorState({title="Something went wrong",description="Your work has not been discarded. Try again or contact support if the problem continues.",retry}:{
 title?:string;description?:string;retry?:()=>void
}){
 return <div className="u-v31-state is-error" role="alert">
   <strong>{title}</strong><span>{description}</span>{retry?<button className="u-button u-button--secondary" onClick={retry}>Try again</button>:null}
 </div>;
}

export function UnsavedChangesGuard({dirty,onLeave}:{dirty:boolean;onLeave:()=>void}){
 React.useEffect(()=>{
   const handler=(e:BeforeUnloadEvent)=>{
     if(!dirty)return;
     e.preventDefault(); e.returnValue="";
   };
   window.addEventListener("beforeunload",handler);
   return()=>window.removeEventListener("beforeunload",handler);
 },[dirty]);
 return null;
}

export function SaveStatus({status}:{status:"saved"|"saving"|"unsaved"|"error"}){
 const labels={saved:"Saved",saving:"Saving…",unsaved:"Unsaved changes",error:"Save failed"};
 const tone=status==="saved"?"success":status==="error"?"danger":status==="unsaved"?"warning":"info";
 return <span className={`u-status u-status--${tone}`} aria-live="polite">{labels[status]}</span>;
}
