'use client';

import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  variant = 'modal',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  variant?: 'modal' | 'drawer';
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const descriptionId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`rr-dialog rr-dialog-${variant}`}
      aria-labelledby={heading}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          onClose();
      }}
    >
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-5 sm:px-6">
        <div>
          <h2 id={heading} className="text-lg font-semibold tracking-tight text-slate-900">
            {title}
          </h2>
          {description && (
            <p id={descriptionId} className="mt-1 text-sm text-slate-600">
              {description}
            </p>
          )}
        </div>
        <button
          type="button"
          className="btn btn-ghost shrink-0 !p-2"
          aria-label={`Close ${title}`}
          onClick={onClose}
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      {open && <div className="dialog-content">{children}</div>}
    </dialog>
  );
}
