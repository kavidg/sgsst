import type { DashboardFinding } from '../../types/compliance-dashboard';
import { Button } from '../ui/Button';

/**
 * 5.1.2 — Ítem de "Acciones requeridas" para la brigada de emergencia.
 *
 * Espejo del patrón EppActionItem: presentacional, recibe un finding REAL del
 * backend y su configuración de acción (título amigable, explicación,
 * contador de metadata V1 y destino). NO calcula score, NO inventa contadores
 * (si counterValue no viene definido no se muestra ningún número) y NO altera
 * el contenido del finding.
 */

export interface EmergencyBrigadeActionConfig {
  /** Título amigable de la acción. */
  title: string;
  /** Explicación breve de por qué esta acción impacta el cumplimiento. */
  description: string;
  /**
   * Contador equivalente de metadata V1 (ya calculado por el backend).
   * Si no existe para este finding, dejar undefined: sin número inventado.
   */
  counterValue?: number;
  /** Texto del botón de acción. Si no se define, el ítem es solo informativo. */
  actionLabel?: string;
  /** Ejecuta la navegación segura (tab 'brigadas' de /emergencies). */
  onAction?: () => void;
  /** Nota informativa adicional. */
  note?: string;
}

export interface EmergencyBrigadeActionItemProps {
  finding: DashboardFinding;
  config: EmergencyBrigadeActionConfig;
}

const PRIORITY_BADGE: Record<string, string> = {
  CRITICAL: 'badge badge--danger',
  HIGH: 'badge badge--danger',
  MEDIUM: 'badge badge--warning',
  LOW: 'badge badge--info',
};

export function EmergencyBrigadeActionItem({ finding, config }: EmergencyBrigadeActionItemProps) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', alignItems: 'flex-start', flexWrap: 'wrap', borderTop: '1px solid #edf2f7', paddingTop: '.5rem' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span className={PRIORITY_BADGE[finding.priority] ?? 'badge'}>{finding.priority}</span>
          <strong style={{ fontSize: '.85rem' }}>{config.title}</strong>
          {typeof config.counterValue === 'number' && (
            <span className="badge badge--info">{config.counterValue}</span>
          )}
        </div>
        <p style={{ margin: '.25rem 0 0', fontSize: '.85rem' }}>{config.description}</p>
        {finding.description && (
          <p className="muted" style={{ margin: '.15rem 0 0', fontSize: '.78rem' }}>{finding.description}</p>
        )}
        {config.note && (
          <p className="muted" style={{ margin: '.15rem 0 0', fontSize: '.75rem' }}>ⓘ {config.note}</p>
        )}
      </div>
      {config.actionLabel && config.onAction && (
        <Button type="button" variant="ghost" onClick={config.onAction}>{config.actionLabel}</Button>
      )}
    </div>
  );
}
