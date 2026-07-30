import { cn } from '../../lib/utils';

interface AdvancedProgressBarProps {
  value: number;
  max?: number;
  label?: string;
  showPercentage?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'success' | 'warning' | 'danger';
  className?: string;
}

const sizeStyles = {
  sm: 'al-progress__track--sm',
  md: 'al-progress__track--md',
  lg: 'al-progress__track--lg',
};

const variantStyles: Record<string, string> = {
  default: 'al-progress__fill--default',
  success: 'al-progress__fill--success',
  warning: 'al-progress__fill--warning',
  danger: 'al-progress__fill--danger',
};

export function AdvancedProgressBar({
  value,
  max = 100,
  label,
  showPercentage = true,
  size = 'md',
  variant = 'default',
  className,
}: AdvancedProgressBarProps) {
  const pct = Math.min(100, Math.round((value / max) * 100));

  return (
    <div className={cn('al-progress', className)}>
      {label && (
        <div className="al-progress__header">
          <span className="al-progress__label">{label}</span>
          {showPercentage && (
            <span className="al-progress__pct">{pct}%</span>
          )}
        </div>
      )}
      <div className={cn('al-progress__track', sizeStyles[size])}>
        <div
          className={cn(
            'al-progress__fill',
            variantStyles[variant],
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
