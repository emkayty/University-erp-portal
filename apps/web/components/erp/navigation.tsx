import React from "react";

export function MobileNavToggle({ open, onClick, label = "Menu" }: { open: boolean; onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      className="erp-nav-toggle"
      aria-label={label}
      aria-expanded={open}
      onClick={onClick}
    >
      <span aria-hidden="true">{open ? "×" : "☰"}</span>
    </button>
  );
}
