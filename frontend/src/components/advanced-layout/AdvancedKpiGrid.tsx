import { CSSProperties, ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { KpiCard, type KpiCardVariant } from '../KpiCard';

interface KpiCardData {
  label: string;
  value: ReactNode;
  variant?: KpiCardVariant;
  icon?: string;
}

interface AdvancedKpiGridProps {
  /** Modo datos: renderiza una KpiCard por item (API existente). */
  items?: KpiCardData[];
  /** Modo layout: renderiza los children tal cual dentro del grid responsive. */
  children?: ReactNode;
  columns?: 3 | 4 | 6;
  className?: string;
  style?: CSSProperties;
}

/**
 * Grid responsive unificado para KPIs de los módulos Advanced Management.
 *
 * Layout (via clases CSS .kpi-grid / .grid-3):
 * - Desktop (>=1024px): 4 columnas
 * - Tablet (768–1024px): 2 columnas
 * - Mobile (<768px): 1 columna
 *
 * Dos modos de uso:
 * 1. `<AdvancedKpiGrid items={[...]} />` — renderiza KpiCards desde datos.
 * 2. `<AdvancedKpiGrid>{cards}</AdvancedKpiGrid>` — layout únicamente;
 *    los children se renderizan tal cual dentro del grid.
 */
export function AdvancedKpiGrid({ items, children, columns = 4, className, style }: AdvancedKpiGridProps) {
  const gridCols = {
    3: 'grid-3',
    4: 'kpi-grid',
    5: 'kpi-grid',
    6: 'kpi-grid',
  };

  return (
    <div className={cn('grid', gridCols[columns], className)} style={style}>
      {items
        ? items.map((item, i) => (
            <KpiCard
              key={i}
              title={item.label}
              value={item.value}
              icon={item.icon}
              variant={item.variant}
            />
          ))
        : children}
    </div>
  );
}
