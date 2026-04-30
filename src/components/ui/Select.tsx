import { cn } from '@/lib/cn';
import { Select as Base } from '@base-ui/react/select';
import { Check, ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';

export type SelectOption<T extends string> = { value: T; label: ReactNode };

export function Select<T extends string>({
  value,
  onChange,
  options,
  className,
  ariaLabel,
}: {
  value: T;
  onChange: (next: T) => void;
  options: SelectOption<T>[];
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <Base.Root
      value={value}
      onValueChange={next => {
        if (next !== null) onChange(next);
      }}
      items={Object.fromEntries(options.map(o => [o.value, o.label]))}
    >
      <Base.Trigger
        aria-label={ariaLabel}
        className={cn(
          'inline-flex items-center justify-between gap-1.5 rounded-md border bg-white px-2 py-1 font-medium text-gray-700',
          'hover:bg-gray-50 focus:ring-1 focus:ring-indigo-300 focus:outline-none',
          'data-popup-open:bg-gray-50',
          className,
        )}
      >
        <Base.Value className='min-w-0 flex-1 truncate text-left' />
        <Base.Icon className='shrink-0 text-gray-400' render={<ChevronDown />} />
      </Base.Trigger>
      <Base.Portal>
        <Base.Positioner sideOffset={4}>
          <Base.Popup className='popup'>
            {options.map(o => (
              <Base.Item
                key={o.value}
                value={o.value}
                className={cn('menu-item', 'data-selected:font-medium data-selected:text-gray-900')}
              >
                <Base.ItemText>{o.label}</Base.ItemText>
                <Base.ItemIndicator>
                  <Check className='text-indigo-600' />
                </Base.ItemIndicator>
              </Base.Item>
            ))}
          </Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  );
}
