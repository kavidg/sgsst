import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '../../lib/utils';

export const TabsList = ({ className, ...props }: TabsPrimitive.TabsListProps) => (
  <TabsPrimitive.List
    className={cn('tabs-list', className)}
    {...props}
  />
);

export const TabsTrigger = ({ className, ...props }: TabsPrimitive.TabsTriggerProps) => (
  <TabsPrimitive.Trigger
    className={cn('tabs-trigger', className)}
    {...props}
  />
);

export const TabsContent = ({ className, ...props }: TabsPrimitive.TabsContentProps) => (
  <TabsPrimitive.Content
    className={cn('tabs-content', className)}
    {...props}
  />
);

export const Tabs = TabsPrimitive.Root;
