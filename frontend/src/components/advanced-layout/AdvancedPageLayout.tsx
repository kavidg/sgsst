import { ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface AdvancedPageLayoutProps {
  children: ReactNode;
  className?: string;
}

export function AdvancedPageLayout({ children, className }: AdvancedPageLayoutProps) {
  return (
    <div className={cn('al-page', className)}>
      {children}
    </div>
  );
}
