import { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export interface SidebarTabItem {
  id: string;
  label: string;
  icon?: string;
  badge?: number | string;
}

interface AdvancedTabsSidebarProps {
  items: readonly SidebarTabItem[] | SidebarTabItem[];
  activeId: string;
  onSelect: (id: string) => void;
  className?: string;
  children?: ReactNode;
}

export function AdvancedTabsSidebar({
  items,
  activeId,
  onSelect,
  className,
  children,
}: AdvancedTabsSidebarProps) {
  return (
    <nav
      className={cn(
        'w-full lg:w-56 shrink-0',
        className,
      )}
    >
      <div className="flex lg:flex-col gap-0.5 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 -mx-2 px-2 lg:mx-0 lg:px-0">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelect(item.id)}
            className={cn(
              'inline-flex lg:w-full items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium',
              'transition-all duration-150 whitespace-nowrap',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
              activeId === item.id
                ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50 border border-transparent',
            )}
          >
            {item.icon && <span className="shrink-0 text-base">{item.icon}</span>}
            <span className="truncate">{item.label}</span>
            {item.badge !== undefined && (
              <span className={cn(
                'ml-auto shrink-0 inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-xs font-medium',
                activeId === item.id
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600'
              )}>
                {item.badge}
              </span>
            )}
          </button>
        ))}
      </div>
      {children && (
        <div className="mt-4 hidden lg:block">
          {children}
        </div>
      )}
    </nav>
  );
}

export function AdvancedTabsContent({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex-1 min-w-0 space-y-5', className)}>
      {children}
    </div>
  );
}
