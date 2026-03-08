import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function debugDnD(event: string, details?: any) {
    if (process.env.NODE_ENV === 'development') {
        console.log(`[DnD Debug] ${event}`, details || '');
    }
}
