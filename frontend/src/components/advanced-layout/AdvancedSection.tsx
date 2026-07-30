import { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { Card } from '../ui/Card';

interface AdvancedSectionProps {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  headerRight?: ReactNode;
  accent?: 'default' | 'success' | 'warning' | 'danger' | 'info';
}

const accentBorder: Record<string, string> = {
  default: '',
  success: 'kpi-card--success',
  warning: 'kpi-card--warning',
  danger: 'kpi-card--danger',
  info: 'kpi-card--info',
};

export function AdvancedSection({
  title,
  description,
  children,
  className,
  headerRight,
  accent = 'default',
}: AdvancedSectionProps) {
  return (
    <Card
      className={cn(
        'al-section',
        accentBorder[accent],
        className,
      )}
    >
      {(title || headerRight) && (
        <div className="al-section__header">
          <div className="al-section__left">
            {title && (
              <h3 className="al-section__title">{title}</h3>
            )}
            {description && (
              <p className="al-section__desc">{description}</p>
            )}
          </div>
          {headerRight && (
            <div className="al-section__right">{headerRight}</div>
          )}
        </div>
      )}
      {children}
    </Card>
  );
}
