'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { reportError } from '@/lib/error-reporting';

interface PageErrorProps {
    error: Error & { digest?: string };
    reset: () => void;
}

export function PageError({ error, reset }: PageErrorProps) {
    const pathname = usePathname();

    useEffect(() => {
        reportError(error, {
            pathname,
            digest: error.digest,
            // User/tenant info is unavailable inside error boundaries
            // (auth context has been torn down). Logged as 'unknown'
            // to ensure the field exists for log ingestion schemas.
            userId: 'unknown',
            tenantId: 'unknown',
        });
    }, [error, pathname]);

    return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-6">
            <div className="bg-white rounded-lg shadow border p-8 max-w-md w-full text-center space-y-4">
                <div className="mx-auto h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
                    <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                    </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900">
                    문제가 발생했습니다
                </h3>
                <p className="text-sm text-gray-500">
                    페이지를 불러오는 중 오류가 발생했습니다. 다시 시도해주세요.
                </p>
                {process.env.NODE_ENV === 'development' && (
                    <p className="text-xs text-red-400 bg-red-50 rounded p-2 break-all">
                        {error.message}
                    </p>
                )}
                <button
                    onClick={reset}
                    className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                >
                    다시 시도
                </button>
            </div>
        </div>
    );
}
