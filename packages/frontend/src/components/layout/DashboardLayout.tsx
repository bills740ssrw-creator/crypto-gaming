'use client';

import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { ReactNode, useEffect } from 'react';
import { useUIStore } from '@/store';

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { theme } = useUIStore();

  useEffect(() => {
    const root = document.documentElement;
    const prefersLight =
      theme === 'light' ||
      (theme === 'system' && window.matchMedia('(prefers-color-scheme: light)').matches);
    if (prefersLight) {
      root.classList.add('light');
    } else {
      root.classList.remove('light');
    }
  }, [theme]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar />
      <Header />
      <main className="lg:pl-64 min-h-[calc(100vh-4rem)] pt-16 lg:pt-0">
        <div className="p-4 lg:p-6 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}