import { useDebouncer } from '@tanstack/react-pacer';
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

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
  const [draft, setDraftState] = useState('');
  const dirtyRef = useRef(false);

  const saveMutation = useMutation({
    mutationFn: save,
    onSuccess: (_, content) => {
      qc.setQueryData(queryKey, content);
      dirtyRef.current = false;
    },
  });

  // Sync draft from the server-loaded baseline — but only when the user hasn't
  // typed yet, otherwise we'd clobber their in-flight edits with stale data.
  useEffect(() => {
    if (dirtyRef.current) return;
    if (loaded !== undefined) setDraftState(loaded);
  }, [loaded]);

  const saveDebouncer = useDebouncer(saveMutation.mutate, { wait: debounceMs });
  useEffect(() => {
    if (!dirtyRef.current) return;
    if (disabled || draft === (loaded ?? '')) {
      saveDebouncer.cancel();
      return;
    }
    saveDebouncer.maybeExecute(draft);
  }, [draft, loaded, saveDebouncer, disabled]);

  function setDraft(v: string) {
    dirtyRef.current = true;
    setDraftState(v);
  }

  const dirty = draft !== (loaded ?? '');

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
