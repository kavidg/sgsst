import type { ReactNode } from 'react';
import { useEffect } from 'react';

export type SheetProps = {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  onOpenChange: (open: boolean) => void;
};

export function Sheet({ open, title, description, children, onOpenChange }: SheetProps) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onOpenChange(false);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onOpenChange, open]);

  if (!open) return null;

  return (
    <div className="sheet" role="presentation">
      <button type="button" className="sheet__overlay" aria-label="Cerrar panel de gestión avanzada" onClick={() => onOpenChange(false)} />
      <aside className="sheet__content" role="dialog" aria-modal="true" aria-labelledby="advanced-management-title">
        <header className="sheet__header">
          <div>
            <h2 id="advanced-management-title" className="sheet__title">
              {title}
            </h2>
            {description ? <p className="sheet__description">{description}</p> : null}
          </div>
          <button type="button" className="sheet__close" aria-label="Cerrar" onClick={() => onOpenChange(false)}>
            ×
          </button>
        </header>
        <div className="sheet__body">{children}</div>
      </aside>
    </div>
  );
}
