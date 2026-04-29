import { cn } from '@/lib/cn';
import { Tabs as Base } from '@base-ui-components/react/tabs';
import type { ComponentProps } from 'react';

type ListProps = Omit<ComponentProps<typeof Base.List>, 'className'> & { className?: string };
type TabProps = Omit<ComponentProps<typeof Base.Tab>, 'className'> & { className?: string };

function List({ className, ...props }: ListProps) {
  return <Base.List className={cn('flex h-12 items-center gap-1 border-b bg-white px-4', className)} {...props} />;
}

function Tab({ className, ...props }: TabProps) {
  return (
    <Base.Tab
      className={cn(
        'btn-md btn-ghost -mb-px text-gray-700',
        'relative after:absolute after:inset-x-0 after:-bottom-1.5 after:h-0.5 after:content-[""]',
        'data-active:font-medium data-active:text-gray-900 data-active:after:bg-rose-300',
        className,
      )}
      {...props}
    />
  );
}

function PillList({ className, ...props }: ListProps) {
  return <Base.List className={cn('inline-flex overflow-hidden rounded-md border bg-white', className)} {...props} />;
}

type PillTabProps = TabProps & { size?: 'sm' | 'md' };
function PillTab({ className, size = 'md', ...props }: PillTabProps) {
  return (
    <Base.Tab
      className={cn(
        size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1 text-sm',
        'text-gray-500 not-disabled:hover:bg-gray-50 not-disabled:hover:text-gray-700',
        'data-active:bg-gray-100 data-active:font-medium data-active:text-gray-900',
        className,
      )}
      {...props}
    />
  );
}

export const Tabs = {
  Root: Base.Root,
  List,
  Tab,
  Panel: Base.Panel,
};

export const PillTabs = {
  Root: Base.Root,
  List: PillList,
  Tab: PillTab,
  Panel: Base.Panel,
};
