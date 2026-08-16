import React from "react";

export type NavDomain = {
  id:string;
  label:string;
  items:{id:string;label:string;href:string}[];
};

export function ERPTopBar({brand="UniPortal",userLabel,roleLabel,children}:{
  brand?:string; userLabel?:string; roleLabel?:string; children?:React.ReactNode
}){
 return <header className="u-topbar">
   <div className="u-topbar-brand">{brand}</div>
   <div className="u-topbar-center">{children}</div>
   <div className="u-topbar-user">
     {roleLabel?<span className="u-topbar-role">{roleLabel}</span>:null}
     {userLabel?<span>{userLabel}</span>:null}
   </div>
 </header>;
}

export function ERPDomainNav({domains,activeId}:{domains:NavDomain[];activeId?:string}){
 return <nav className="u-domain-nav" aria-label="Primary navigation">
   {domains.map(d=><section key={d.id} className="u-domain">
     <h2>{d.label}</h2>
     <div>{d.items.map(i=><a key={i.id} href={i.href} aria-current={activeId===i.id?"page":undefined}>{i.label}</a>)}</div>
   </section>)}
 </nav>;
}

export function MobileNav({items}:{items:{label:string;href:string;active?:boolean}[]}){
 return <nav className="u-mobile-nav" aria-label="Mobile primary navigation">
   {items.map(i=><a key={i.href} href={i.href} aria-current={i.active?"page":undefined}>{i.label}</a>)}
 </nav>;
}
