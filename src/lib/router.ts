import { useParams } from 'react-router';

export function useNumberParam(name: string): number | null {
  const value = useParams()[name];
  return value ? Number(value) : null;
}
