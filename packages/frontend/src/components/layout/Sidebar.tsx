'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/utils/helpers';
import { Badge } from '@/components/ui/Badge';
import { useUserStore, useWalletStore, useUIStore } from '@/store';
import { 
  LayoutDashboard, 
  Wallet, 
  Gamepad2, 
  History, 
  User, 
  Menu,
  X,
  Coins
} from 'lucide-react';
import { formatCurrency } from '@/utils/helpers';
import { useSession } from 'next-auth/react';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Wallet', href: '/dashboard/wallet', icon: Wallet },
  { name: 'Games', href: '/dashboard/games', icon: Gamepad2 },
  { name: 'History', href: '/dashboard/history', icon: History },
  { name: 'Profile', href: '/dashboard/profile', icon: User },
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarOpen, setSidebarOpen } = useUIStore();
  const { username, region } = useUserStore();
  const { balance } = useWalletStore();
  const { data: session } = useSession();

  const totalBalance = balance ? (
    balance.region === 'US' 
      ? `${formatCurrency(balance.goldCoins, 'GOLD_COINS')} + ${formatCurrency(balance.sweepsCoins, 'SWEEPS_COINS')}`
      : Object.entries(balance.cryptoBalances).map(([currency, amount]) => formatCurrency(amount, currency)).join(' + ')
  ) : 'Loading...';

  return (
    <>
      <button
        className="fixed top-4 left-4 z-50 lg:hidden p-2 rounded-lg bg-card shadow-elevated border border-border"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
      >
        {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-64 bg-surface border-r border-border transform transition-transform duration-300 ease-in-out lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        aria-label="Sidebar"
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between h-16 px-6 border-b border-border">
            <Link href="/dashboard" className="flex items-center gap-2">
              <span className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary-400 via-primary to-primary-700 shadow-glow-primary">
                <Coins className="w-5 h-5 text-primary-foreground" />
              </span>
              <span className="font-extrabold tracking-tight text-foreground">Crypto<span className="text-primary">Gaming</span></span>
            </Link>
            <button
              className="lg:hidden p-1 rounded hover:bg-secondary"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close sidebar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto" role="navigation" aria-label="Main navigation">
            {navigation.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                  )}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-border">
            <div className="rounded-xl bg-secondary p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Balance</span>
                <Badge variant="gold" size="sm">{region || 'GLOBAL'}</Badge>
              </div>
              <div className="mt-2 text-right">
                <p className="text-lg font-bold text-foreground">{totalBalance}</p>
                <p className="text-xs text-muted-foreground">Total Balance</p>
              </div>
            </div>
          </div>

          <div className="p-4 border-t border-border">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center">
                <span className="text-sm font-semibold text-primary">
                  {username?.charAt(0).toUpperCase() || 'U'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{username || 'User'}</p>
                <p className="text-xs text-muted-foreground truncate">{session?.user?.email}</p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
    </>
  );
}