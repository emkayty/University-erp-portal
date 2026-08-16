import React, { ReactNode, useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function ConfirmAction({
  open, title, description, children, confirmLabel = 'Confirm', cancelLabel = 'Cancel', destructive = false, onConfirm, onCancel,
}: {
  open: boolean; title: string; description?: string; children?: ReactNode; confirmLabel?: string; cancelLabel?: string;
  destructive?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusInitialAction = window.requestAnimationFrame(() => confirmRef.current?.focus());

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
      ).filter((element) => !element.hasAttribute('disabled'));
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.cancelAnimationFrame(focusInitialAction);
      window.removeEventListener('keydown', onKey);
      if (previouslyFocusedRef.current?.isConnected) previouslyFocusedRef.current.focus();
    };
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div className="erp-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <div
        ref={dialogRef}
        className="erp-modal"
        role={destructive ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby="erp-confirm-title"
        aria-describedby={description ? 'erp-confirm-description' : undefined}
        tabIndex={-1}
      >
        <h2 id="erp-confirm-title">{title}</h2>
        {description ? <p id="erp-confirm-description">{description}</p> : null}
        {children ? <div className="mt-4">{children}</div> : null}
        <div className="erp-modal-actions">
          <button type="button" className="erp-button erp-button-secondary" onClick={onCancel}>{cancelLabel}</button>
          <button ref={confirmRef} type="button" className="erp-button erp-button-primary" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
