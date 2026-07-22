import { createContext, useContext } from 'react';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
}

export type ConfirmContextValue = (options: ConfirmOptions) => Promise<boolean>;

export const ConfirmContext = createContext<ConfirmContextValue | undefined>(undefined);

// Imperative replacement for window.confirm(): `const ok = await confirm({...})`.
// Backed by ConfirmProvider (mounted once at the app root), which renders an
// actual in-app modal instead of the browser's native "this site says" dialog.
export function useConfirm(): ConfirmContextValue {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within a ConfirmProvider');
  return ctx;
}
