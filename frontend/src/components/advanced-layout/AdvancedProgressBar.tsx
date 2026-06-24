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
  sm: 'h-1.5',
  md: 'h-2.5',
  lg: 'h-4',
};

const variantStyles: Record<string, string> = {
  default: 'bg-blue-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
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
    <div className={cn('space-y-1', className)}>
      {label && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">{label}</span>
          {showPercentage && (
            <span className="text-sm font-medium text-gray-900">{pct}%</span>
          )}
        </div>
      )}
      <div className={cn('w-full bg-gray-100 rounded-full overflow-hidden', sizeStyles[size])}>
        <div
          className={cn(
            'rounded-full transition-all duration-500 ease-out',
            sizeStyles[size],
            variantStyles[variant],
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
