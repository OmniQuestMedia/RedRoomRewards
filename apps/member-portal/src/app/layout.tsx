import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RedRoom Rewards™',
  description: 'Your loyalty rewards portal',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-950 text-gray-100">
        <nav className="border-b border-red-900 bg-gray-900 px-6 py-3">
          <div className="mx-auto flex max-w-4xl items-center justify-between">
            <a href="/" className="text-xl font-bold text-red-500">
              RedRoom Rewards™
            </a>
            <div className="flex gap-6 text-sm">
              <a href="/earn" className="hover:text-red-400">
                Earn
              </a>
              <a href="/burn" className="hover:text-red-400">
                Redeem
              </a>
              <a href="/history" className="hover:text-red-400">
                History
              </a>
              <a href="/redemptions" className="hover:text-red-400">
                My Codes
              </a>
            </div>
          </div>
        </nav>
        <main className="mx-auto max-w-4xl px-6 py-8">{children}</main>
        <footer className="mt-16 border-t border-gray-800 px-6 py-6 text-center text-xs text-gray-600">
          RedRoom Rewards™ — OmniQuest Media Inc. | 18+ only | Canada data residency (ca-central-1)
        </footer>
      </body>
    </html>
  );
}
