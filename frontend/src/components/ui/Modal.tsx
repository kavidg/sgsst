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
    <div className="sidebar-backdrop" style={{ display: 'block', zIndex: 60 }} onClick={onClose}>
      <div
        className="card"
        style={{ maxWidth: 640, margin: '10vh auto', zIndex: 70 }}
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
