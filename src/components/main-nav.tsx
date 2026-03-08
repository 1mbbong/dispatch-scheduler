'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Role } from '@/lib/db';
import { useToast } from '@/components/ui/toast';
import { reportError } from '@/lib/error-reporting';

interface MainNavProps {
    userRole?: Role;
}

export function MainNav({ userRole }: MainNavProps) {
    const pathname = usePathname();
    const toast = useToast();
    const [isLoggingOut, setIsLoggingOut] = useState(false);

    const handleSignOut = async () => {
        // In-flight guard: ignore duplicate clicks
        if (isLoggingOut) return;
        setIsLoggingOut(true);

        try {
            await fetch('/api/auth/logout', {
                method: 'POST',
                credentials: 'include',
            });
        } catch (err) {
            reportError(err, { extra: { component: 'MainNav', action: 'logout' } });
            toast.error('Logout request failed — redirecting anyway.');
        } finally {
            // Reset guard in case redirect is blocked; normally page unloads first
            setIsLoggingOut(false);
        }
        // Always redirect regardless of success/failure (best-effort logout)
        window.location.href = '/login';
    };

    const links = [
        { href: '/calendar/week', label: 'Week Calendar' },
        { href: '/calendar/month', label: 'Month Calendar' },
        { href: '/employees', label: 'Employees' },
        { href: '/vacations', label: 'Vacations' },
    ];

    if (userRole === 'ADMIN') {
        links.push({ href: '/admin/audit', label: 'Audit Logs' });
    }

    const isLoginPage = pathname === '/login';

    return (
        <nav className="border-b bg-white shadow-sm" aria-hidden={isLoginPage || undefined}>
            {!isLoginPage && (
                <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center">
                        <div className="flex-shrink-0">
                            <span className="text-xl font-bold text-indigo-600">ORDI</span>
                        </div>
                        <div className="hidden md:ml-6 md:flex md:space-x-8">
                            {links.map((link) => (
                                <Link
                                    key={link.href}
                                    href={link.href}
                                    className={`inline-flex items-center border-b-2 px-1 pt-1 text-sm font-medium ${pathname === link.href
                                        ? 'border-indigo-500 text-gray-900'
                                        : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                                        }`}
                                >
                                    {link.label}
                                </Link>
                            ))}
                        </div>
                    </div>
                    <div className="flex items-center">
                        <button
                            onClick={handleSignOut}
                            disabled={isLoggingOut}
                            className="text-sm font-medium text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoggingOut ? 'Signing out…' : 'Sign out'}
                        </button>
                    </div>
                </div>
            )}
        </nav>
    );
}
