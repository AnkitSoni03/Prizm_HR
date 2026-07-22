import { createContext, useContext } from 'react';

export type ToastType = 'success' | 'error' | 'info';

export type ShowToast = (message: string, type?: ToastType) => void;

export const ToastContext = createContext<ShowToast | undefined>(undefined);

// Imperative replacement for window.alert(): `showToast('Could not delete this shift.', 'error')`.
// Backed by ToastProvider (mounted once at the app root), which renders a
// dismissible, auto-expiring in-app toast instead of the browser's native
// "this site says" dialog.
export function useToast(): ShowToast {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
