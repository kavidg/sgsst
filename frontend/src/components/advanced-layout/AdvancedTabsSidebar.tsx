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
    <nav className={cn('al-tabs', className)}>
      <div className="al-tabs__list">
        {items.map((item) => {
          const isActive = activeId === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={cn(
                'al-tabs__btn',
                isActive ? 'al-tabs__btn--active' : 'al-tabs__btn--inactive',
              )}
            >
              {item.icon && <span className="al-tabs__icon">{item.icon}</span>}
              <span className="al-tabs__label">{item.label}</span>
              {item.badge !== undefined && (
                <span className={cn(
                  'al-tabs__badge',
                  isActive ? 'al-tabs__badge--active' : 'al-tabs__badge--inactive',
                )}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {children && (
        <div className="al-tabs__footer">
          {children}
        </div>
      )}
    </nav>
  );
}

export function AdvancedTabsContent({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('al-tabs__content', className)}>
      {children}
    </div>
  );
}
