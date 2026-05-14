import { ReactNode } from 'react';
import { Button } from './Button';

type ModalProps = {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export function Modal({ isOpen, title, onClose, children }: ModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="sidebar-backdrop" style={{ display: 'block', position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 200 }} onClick={onClose}>
      <div
        className="card"
        style={{ maxWidth: 640, margin: '10vh auto', position: 'relative', zIndex: 210 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="actions" style={{ justifyContent: 'space-between', marginBottom: '.5rem' }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <Button type="button" variant="ghost" onClick={onClose}>Cerrar</Button>
        </div>
        {children}
      </div>
    </div>
  );
}
