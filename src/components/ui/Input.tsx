import { cn } from '@/lib/cn';
import { Input as Base } from '@base-ui/react/input';
import type { ComponentPropsWithoutRef, Ref } from 'react';

type Variant = 'field' | 'unstyled';

type InputProps = ComponentPropsWithoutRef<'input'> & {
  variant?: Variant;
  ref?: Ref<HTMLInputElement>;
};

export function Input({ variant = 'field', className, ref, ...props }: InputProps) {
  return <Base ref={ref} className={cn(variant === 'field' && 'input', className)} {...props} />;
}
