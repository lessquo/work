import { Tooltip as Base } from '@base-ui/react/tooltip';
import type { ReactElement, ReactNode } from 'react';

type Side = 'top' | 'right' | 'bottom' | 'left';

export function Tooltip({
  content,
  children,
  side = 'top',
  sideOffset = 6,
}: {
  content: ReactNode;
  children: ReactElement<Record<string, unknown>>;
  side?: Side;
  sideOffset?: number;
}) {
  if (content === null || content === undefined || content === '' || content === false) return children;
  return (
    <Base.Root>
      <Base.Trigger render={<span className='inline-flex'>{children}</span>} />
      <Base.Portal>
        <Base.Positioner side={side} sideOffset={sideOffset}>
          <Base.Popup className='max-w-xs rounded-md bg-gray-900 px-2 py-1 text-xs leading-snug text-white shadow-lg'>
            {content}
          </Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  );
}
