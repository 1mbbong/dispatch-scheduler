'use client';

import { createContext, useContext, useCallback, useState, useEffect, useRef } from 'react';

// ---------- Types ----------

type ToastVariant = 'success' | 'error' | 'info';

interface ToastItem {
    id: number;
    message: string;
    variant: ToastVariant;
}

interface ToastAPI {
    success: (msg: string) => void;
    error: (msg: string) => void;
    info: (msg: string) => void;
}

// ---------- Context ----------

const ToastContext = createContext<ToastAPI | null>(null);

export function useToast(): ToastAPI {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
    return ctx;
}

// ---------- Provider + Renderer ----------

const AUTO_DISMISS_MS = 3000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const idRef = useRef(0);

    const addToast = useCallback((message: string, variant: ToastVariant) => {
        const id = ++idRef.current;
        setToasts((prev) => [...prev, { id, message, variant }]);
    }, []);

    const removeToast = useCallback((id: number) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const api: ToastAPI = {
        success: useCallback((msg: string) => addToast(msg, 'success'), [addToast]),
        error: useCallback((msg: string) => addToast(msg, 'error'), [addToast]),
        info: useCallback((msg: string) => addToast(msg, 'info'), [addToast]),
    };

    return (
        <ToastContext.Provider value={api}>
            {children}
            {/* Toast container — top-right, fixed */}
            <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
                {toasts.map((t) => (
                    <Toast key={t.id} item={t} onDismiss={removeToast} />
                ))}
            </div>
        </ToastContext.Provider>
    );
}

// ---------- Individual Toast ----------

const variantStyles: Record<ToastVariant, string> = {
    success: 'bg-green-600',
    error: 'bg-red-600',
    info: 'bg-indigo-600',
};

const variantIcons: Record<ToastVariant, string> = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
};

function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
    useEffect(() => {
        const timer = setTimeout(() => onDismiss(item.id), AUTO_DISMISS_MS);
        return () => clearTimeout(timer);
    }, [item.id, onDismiss]);

    return (
        <div
            className={`pointer-events-auto flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg animate-slide-in ${variantStyles[item.variant]}`}
            role="status"
        >
            <span className="flex-shrink-0 text-base">{variantIcons[item.variant]}</span>
            <span className="flex-1">{item.message}</span>
            <button
                onClick={() => onDismiss(item.id)}
                className="ml-2 flex-shrink-0 opacity-70 hover:opacity-100 transition-opacity"
                aria-label="Dismiss"
            >
                ✕
            </button>
        </div>
    );
}
