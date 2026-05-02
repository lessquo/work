import { useDebouncer } from '@tanstack/react-pacer';
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

export type DraftEditorStatus = 'idle' | 'saving' | 'unsaved' | 'saved' | 'error';

export function useDraftEditor(opts: {
  queryKey: QueryKey;
  loaded: string | undefined;
  save: (content: string) => Promise<unknown>;
  disabled?: boolean;
  debounceMs?: number;
}) {
  const { queryKey, loaded, save, disabled = false, debounceMs = 200 } = opts;
  const qc = useQueryClient();
  const [userDraft, setUserDraft] = useState<string | null>(null);
  const draft = userDraft ?? loaded ?? '';
  const dirty = userDraft !== null && userDraft !== (loaded ?? '');

  const saveMutation = useMutation({
    mutationFn: save,
    onSuccess: (_, content) => {
      qc.setQueryData(queryKey, content);
      setUserDraft(prev => (prev === content ? null : prev));
    },
  });

  const saveDebouncer = useDebouncer(saveMutation.mutate, { wait: debounceMs });
  useEffect(() => {
    if (!dirty || disabled) {
      saveDebouncer.cancel();
      return;
    }
    saveDebouncer.maybeExecute(draft);
  }, [draft, dirty, disabled, saveDebouncer]);

  function setDraft(v: string) {
    setUserDraft(v);
  }

  let status: DraftEditorStatus = 'idle';
  if (saveMutation.error) status = 'error';
  else if (saveMutation.isPending) status = 'saving';
  else if (dirty && !disabled) status = 'unsaved';
  else if (saveMutation.isSuccess && !dirty) status = 'saved';

  return {
    draft,
    setDraft,
    dirty,
    status,
    error: saveMutation.error instanceof Error ? saveMutation.error : null,
  };
}
