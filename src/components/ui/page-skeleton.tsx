export function PageSkeleton({ lines = 5 }: { lines?: number }) {
    return (
        <div className="animate-pulse space-y-4 p-6">
            {/* Header skeleton */}
            <div className="flex items-center justify-between">
                <div className="h-7 w-48 bg-gray-200 rounded" />
                <div className="h-9 w-28 bg-gray-200 rounded" />
            </div>

            {/* Content skeleton */}
            <div className="bg-white rounded-lg shadow border p-6 space-y-3">
                {Array.from({ length: lines }).map((_, i) => (
                    <div key={i} className="flex items-center space-x-4">
                        <div className="h-4 bg-gray-200 rounded" style={{ width: `${60 + Math.random() * 30}%` }} />
                    </div>
                ))}
            </div>
        </div>
    );
}
