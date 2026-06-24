import { ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface KpiCardData {
  label: string;
  value: ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  icon?: string;
}

interface AdvancedKpiGridProps {
  items: KpiCardData[];
  columns?: 3 | 4 | 6;
  className?: string;
}

const variantStyles: Record<string, string> = {
  default: 'bg-white border-gray-200',
  success: 'bg-emerald-50 border-emerald-200',
  warning: 'bg-amber-50 border-amber-200',
  danger: 'bg-red-50 border-red-200',
  info: 'bg-blue-50 border-blue-200',
};

const valueStyles: Record<string, string> = {
  default: 'text-gray-900',
  success: 'text-emerald-700',
  warning: 'text-amber-700',
  danger: 'text-red-700',
  info: 'text-blue-700',
};

export function AdvancedKpiGrid({ items, columns = 4, className }: AdvancedKpiGridProps) {
  const gridCols = {
    3: 'grid-cols-1 sm:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
    6: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6',
  };

  return (
    <div className={cn('grid gap-4', gridCols[columns], className)}>
      {items.map((item, i) => (
        <article
          key={i}
          className={cn(
            'rounded-xl border p-4 flex flex-col gap-1',
            'transition-shadow duration-150 hover:shadow-sm',
            variantStyles[item.variant || 'default'],
          )}
        >
          <div className="flex items-center gap-2">
            {item.icon && <span className="text-base">{item.icon}</span>}
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              {item.label}
            </span>
          </div>
          <span className={cn('text-2xl font-semibold', valueStyles[item.variant || 'default'])}>
            {item.value}
          </span>
        </article>
      ))}
    </div>
  );
}
