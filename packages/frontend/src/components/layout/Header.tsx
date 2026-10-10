'use client';

import { useState } from 'react';
import { useUIStore } from '@/store';
import { Menu, Sun, Moon, Monitor, Bell, ChevronDown, LogOut, User, Settings, Wallet } from 'lucide-react';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { BalanceSwitcher } from '@/components/wallet/BalanceSwitcher';
import { WalletModal } from '@/components/wallet/WalletModal';

export function Header() {
  const { sidebarOpen, setSidebarOpen, theme, setTheme } = useUIStore();
  const { data: session } = useSession();
  const [cashierOpen, setCashierOpen] = useState(false);

  const toggleTheme = () => {
    const themes: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system'];
    const currentIndex = themes.indexOf(theme);
    setTheme(themes[(currentIndex + 1) % themes.length]);
  };

  const themeIcons = {
    light: <Sun className="w-5 h-5" />,
    dark: <Moon className="w-5 h-5" />,
    system: <Monitor className="w-5 h-5" />,
  };

  return (
    <header className="sticky top-0 z-30 lg:z-20 w-full border-b border-border bg-background/80 backdrop-blur-sm">
      <div className="flex h-16 items-center justify-between px-4 lg:px-6">
        <div className="flex items-center gap-4">
          <button
            className="lg:hidden p-2 rounded-lg hover:bg-secondary"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 lg:flex-none" />

        <div className="flex items-center gap-3">
          <BalanceSwitcher onOpenCashier={() => setCashierOpen(true)} />

          <button
            type="button"
            onClick={() => setCashierOpen(true)}
            aria-label="Open cashier"
            className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:brightness-110 transition-all shadow-glow-primary"
          >
            <Wallet className="h-4 w-4" />
            <span className="hidden sm:inline">Cashier</span>
          </button>

          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg hover:bg-secondary transition-colors"
            aria-label={`Current theme: ${theme}. Click to change.`}
          >
            {themeIcons[theme]}
          </button>

          <button className="relative p-2 rounded-lg hover:bg-secondary transition-colors" aria-label="Notifications">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full" />
          </button>

          <div className="relative">
            <button className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary transition-colors" aria-label="Account menu">
              <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center">
                <span className="text-sm font-semibold text-primary">
                  {session?.user?.name?.charAt(0).toUpperCase() || 'U'}
                </span>
              </div>
              <ChevronDown className="w-4 h-4 text-muted-foreground hidden sm:block" />
            </button>
            
            <div className="absolute right-0 mt-2 w-48 bg-card rounded-xl shadow-elevated border border-border py-1 z-50">
              <Link
                href="/dashboard/profile"
                className="flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-secondary"
              >
                <User className="w-4 h-4" />
                Profile
              </Link>
              <Link
                href="/dashboard/profile"
                className="flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-secondary"
              >
                <Settings className="w-4 h-4" />
                Settings
              </Link>
              <hr className="my-1 border-border" />
              <button
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="flex items-center gap-2 w-full px-4 py-2 text-sm text-destructive hover:bg-secondary"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>

      <WalletModal open={cashierOpen} onClose={() => setCashierOpen(false)} />
    </header>
  );
}