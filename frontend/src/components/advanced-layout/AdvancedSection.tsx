import { ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface AdvancedSectionProps {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  headerRight?: ReactNode;
  accent?: 'default' | 'success' | 'warning' | 'danger' | 'info';
}

const accentBorder: Record<string, string> = {
  default: 'border-gray-200',
  success: 'border-emerald-200',
  warning: 'border-amber-200',
  danger: 'border-red-200',
  info: 'border-blue-200',
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
    <section
      className={cn(
        'bg-white rounded-xl border p-5 space-y-4',
        'shadow-[0_1px_3px_0_rgba(0,0,0,0.06)]',
        accentBorder[accent],
        className,
      )}
    >
      {(title || headerRight) && (
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {title && (
              <h3 className="text-base font-semibold text-gray-900">{title}</h3>
            )}
            {description && (
              <p className="text-sm text-gray-500 mt-0.5">{description}</p>
            )}
          </div>
          {headerRight && (
            <div className="shrink-0">{headerRight}</div>
          )}
        </div>
      )}
      {children}
    </section>
  );
}
