import { ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface AdvancedPageLayoutProps {
  children: ReactNode;
  className?: string;
}

export function AdvancedPageLayout({ children, className }: AdvancedPageLayoutProps) {
  return (
    <div className={cn('mx-auto w-full max-w-[1400px] px-6 py-6 space-y-6', className)}>
      {children}
    </div>
  );
}
