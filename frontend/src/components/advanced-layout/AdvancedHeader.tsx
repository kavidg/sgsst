import { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { phvaBackTarget } from '../../lib/phvaReturn';
import { Button } from '../ui/Button';

export interface HeaderAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  icon?: string;
}

interface AdvancedHeaderProps {
  backPath?: string;
  backLabel?: string;
  moduleCode: string;
  moduleTitle: string;
  description?: string;
  statusBadge: ReactNode;
  actions?: HeaderAction[];
  lastSaved?: string | null;
  className?: string;
}

export function AdvancedHeader({
  backPath,
  backLabel = '← Volver a Implementación',
  moduleCode,
  moduleTitle,
  description,
  statusBadge,
  actions,
  lastSaved,
  className,
}: AdvancedHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();

  // Retorno contextual al PHVA: cuando el backPath es una fase PHVA y la
  // navegación entrante trajo un origen (location.state.phvaReturn), regresar
  // a la fase de origen. Otros backPath (p. ej. "Volver a Implementación") y
  // la entrada directa conservan el comportamiento actual.

  return (
    <header className={cn('al-header', className)}>
      {/* Back link */}
      {backPath && (
        <button
          onClick={() =>
            // FIX CAUSA RAÍZ: al volver a una fase PHVA reenviar location.state
            // COMPLETO (con phvaReturn) — antes se perdía aquí y la página
            // destino no podía restaurar el estándar de origen.
            navigate(
              backPath.startsWith('/documents/')
                ? phvaBackTarget(backPath, location.state)
                : backPath,
              backPath.startsWith('/documents/') ? { state: location.state } : undefined,
            )
          }
          className="al-header__back"
        >
          {backLabel}
        </button>
      )}

      {/* Main row: content left, actions right */}
      <div className="al-header__row">
        {/* Left: badge + title + description */}
        <div className="al-header__left">
          {/* Module code badge */}
          <span className="al-header__badge">
            Módulo {moduleCode}
          </span>

          {/* Title */}
          <h1 className="al-header__title">
            {moduleTitle}
          </h1>

          {/* Description - 1 line */}
          {description && (
            <p className="al-header__desc">
              {description}
            </p>
          )}
        </div>

        {/* Right: status + actions */}
        <div className="al-header__right">
          {/* Status badge */}
          <div className="al-header__actions">
            {statusBadge}
          </div>

          {/* Action buttons */}
          {actions && actions.length > 0 && (
            <div className="al-header__actions">
              {actions.map((action, i) => (
                <Button
                  key={i}
                  type="button"
                  variant={action.variant || 'primary'}
                  disabled={action.disabled}
                  onClick={action.onClick}
                  style={{ height: 36, fontSize: '.8rem' }}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Last saved */}
      {lastSaved && (
        <p className="al-header__saved">
          Último guardado: {lastSaved}
        </p>
      )}
    </header>
  );
}
