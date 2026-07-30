import { ReactNode } from 'react';
import { cn } from '../lib/utils';

export type KpiCardVariant = 'default' | 'success' | 'warning' | 'danger' | 'info';

type KpiCardProps = {
  title: string;
  value: ReactNode;
  icon?: ReactNode;
  emphasizeValue?: boolean;
  variant?: KpiCardVariant;
  className?: string;
};

const variantCardStyles: Record<KpiCardVariant, string> = {
  default: 'kpi-card--default',
  success: 'kpi-card--success',
  warning: 'kpi-card--warning',
  danger: 'kpi-card--danger',
  info: 'kpi-card--info',
};

const variantValueStyles: Record<KpiCardVariant, string> = {
  default: 'kpi-value--default',
  success: 'kpi-value--success',
  warning: 'kpi-value--warning',
  danger: 'kpi-value--danger',
  info: 'kpi-value--info',
};

export function KpiCard({ title, value, icon, emphasizeValue = false, variant = 'default', className }: KpiCardProps) {
  return (
    <article className={cn('card', 'kpi-card', variantCardStyles[variant], className)}>
      <div className="actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 className="kpi-title">{title}</h3>
        {icon}
      </div>
      <p
        className={cn('kpi-value', variantValueStyles[variant])}
        style={{ fontSize: emphasizeValue ? '2.3rem' : '2rem' }}
      >
        {value}
      </p>
    </article>
  );
}
