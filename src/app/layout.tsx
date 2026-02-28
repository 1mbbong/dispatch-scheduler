import type { Metadata } from "next";
import { Inter } from "next/font/google"; // Using Google Fonts via Next.js
import "./globals.css";
import { MainNav } from "@/components/main-nav";
import { ToastProvider } from "@/components/ui/toast";
import { requireAuthServer } from "@/lib/auth";
import type { Role } from "@/lib/db";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Dispatch Scheduler",
  description: "Multi-tenant dispatch scheduling application",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let userRole: Role | undefined;
  try {
    const auth = await requireAuthServer();
    userRole = auth.user.role;
  } catch {
    // Not authenticated (login/register pages) — no role available
  }

  return (
    <html lang="en">
      <body className={`${inter.className} min-h-screen bg-gray-50`}>
        <ToastProvider>
          <MainNav userRole={userRole} />
          <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </main>
        </ToastProvider>
      </body>
    </html>
  );
}
