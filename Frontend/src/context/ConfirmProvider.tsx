import { useCallback, useRef, useState, type ReactNode } from 'react';
import { ConfirmContext, type ConfirmOptions } from './confirm-context';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((nextOptions: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setOptions(nextOptions);
    });
  }, []);

  function settle(value: boolean) {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setOptions(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && (
        <ConfirmDialog {...options} onConfirm={() => settle(true)} onCancel={() => settle(false)} />
      )}
    </ConfirmContext.Provider>
  );
}
