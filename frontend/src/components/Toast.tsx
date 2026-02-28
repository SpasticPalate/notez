import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { X, CheckCircle, AlertTriangle, XCircle, Info } from 'lucide-react';

// --- Types ---

type ToastVariant = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
  duration: number;
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant, duration?: number) => void;
}

// --- Context ---

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}

// --- Provider ---

const MAX_TOASTS = 5;
let idCounter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback(
    (message: string, variant: ToastVariant = 'error', duration = 5000) => {
      const id = String(++idCounter);
      setToasts((prev) => {
        const next = [...prev, { id, message, variant, duration }];
        return next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next;
      });
    },
    [],
  );

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast container — fixed bottom-right, offset above mobile bottom nav */}
      <div
        aria-live="polite"
        aria-relevant="additions"
        className="fixed bottom-20 right-4 xl:bottom-4 z-[9999] flex flex-col gap-2 pointer-events-none"
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// --- Single toast ---

const VARIANT_STYLES: Record<ToastVariant, { bg: string; icon: typeof Info }> = {
  success: {
    bg: 'bg-green-600 dark:bg-green-700',
    icon: CheckCircle,
  },
  error: {
    bg: 'bg-red-600 dark:bg-red-700',
    icon: XCircle,
  },
  warning: {
    bg: 'bg-yellow-500 dark:bg-yellow-600',
    icon: AlertTriangle,
  },
  info: {
    bg: 'bg-blue-600 dark:bg-blue-700',
    icon: Info,
  },
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    timerRef.current = setTimeout(() => onDismiss(toast.id), toast.duration);
    return () => clearTimeout(timerRef.current);
  }, [toast.id, toast.duration, onDismiss]);

  const { bg, icon: Icon } = VARIANT_STYLES[toast.variant];

  return (
    <div
      className={`pointer-events-auto flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-white text-sm max-w-sm animate-toast-in ${bg}`}
    >
      <Icon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
      <span className="flex-1">{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        className="p-0.5 hover:bg-white/20 rounded transition-colors focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1"
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
