import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../../lib/utils';
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
  backLabel = 'Volver a Implementación',
  moduleCode,
  moduleTitle,
  description,
  statusBadge,
  actions,
  lastSaved,
  className,
}: AdvancedHeaderProps) {
  const navigate = useNavigate();

  return (
    <header className={cn('w-full', className)}>
      {/* Back link */}
      {backPath && (
        <button
          onClick={() => navigate(backPath)}
          className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700 transition-colors mb-2"
        >
          {backLabel}
        </button>
      )}

      {/* Main row: content left, actions right */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        {/* Left: badge + title + description */}
        <div className="min-w-0 flex-1">
          {/* Module code badge */}
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 leading-none" style={{ height: 22 }}>
            Módulo {moduleCode}
          </span>

          {/* Title */}
          <h1 className="text-2xl font-bold text-gray-900 mt-1.5 leading-tight">
            {moduleTitle}
          </h1>

          {/* Description - 1 line */}
          {description && (
            <p className="text-sm text-gray-400 truncate mt-0.5">
              {description}
            </p>
          )}
        </div>

        {/* Right: status + actions */}
        <div className="flex items-center gap-3 shrink-0 mt-1 sm:mt-0">
          {/* Status badge */}
          <div className="flex items-center gap-1.5">
            {statusBadge}
          </div>

          {/* Action buttons */}
          {actions && actions.length > 0 && (
            <div className="flex items-center gap-1.5">
              {actions.map((action, i) => (
                <Button
                  key={i}
                  type="button"
                  variant={action.variant || 'primary'}
                  disabled={action.disabled}
                  onClick={action.onClick}
                  className={cn(
                    'text-xs leading-none',
                    action.variant !== 'primary' ? 'px-3' : 'px-4'
                  )}
                  style={{ height: 36 }}
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
        <p className="text-xs text-gray-300 mt-2">
          Último guardado: {lastSaved}
        </p>
      )}
    </header>
  );
}
