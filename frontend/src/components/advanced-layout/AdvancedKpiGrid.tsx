import { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { KpiCard, type KpiCardVariant } from '../KpiCard';

interface KpiCardData {
  label: string;
  value: ReactNode;
  variant?: KpiCardVariant;
  icon?: string;
}

interface AdvancedKpiGridProps {
  items: KpiCardData[];
  columns?: 3 | 4 | 6;
  className?: string;
}

export function AdvancedKpiGrid({ items, columns = 4, className }: AdvancedKpiGridProps) {
  const gridCols = {
    3: 'grid-3',
    4: 'kpi-grid',
    6: '',
  };

  return (
    <div className={cn('grid', gridCols[columns], className)}>
      {items.map((item, i) => (
        <KpiCard
          key={i}
          title={item.label}
          value={item.value}
          icon={item.icon}
          variant={item.variant}
        />
      ))}
    </div>
  );
}
