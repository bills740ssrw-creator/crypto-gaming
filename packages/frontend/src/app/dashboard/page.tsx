'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Wallet, Gamepad2, History, TrendingUp, Coins, DollarSign } from 'lucide-react';
import { formatCurrency, getGameTypeLabel, getVolatilityColor } from '@/utils/helpers';
import { useWalletStore, useGameStore, useUserStore } from '@/store';
import { gameApi, walletApi } from '@/lib/api';
import { useEffect, useState } from 'react';
import Link from 'next/link';

const statCards = [
  { name: 'Total Balance', icon: Coins, color: 'text-gold-500', bgColor: 'bg-gold-500/15' },
  { name: 'Games Played', icon: Gamepad2, color: 'text-primary', bgColor: 'bg-primary/10' },
  { name: 'Total Wagered', icon: TrendingUp, color: 'text-primary', bgColor: 'bg-primary/15' },
  { name: 'Total Won', icon: DollarSign, color: 'text-sky-400', bgColor: 'bg-sky-500/15' },
];

const quickActions = [
  { name: 'Deposit', href: '/dashboard/wallet', icon: Wallet, description: 'Add funds to your account' },
  { name: 'Play Games', href: '/dashboard/games', icon: Gamepad2, description: 'Browse and play casino games' },
  { name: 'History', href: '/dashboard/history', icon: History, description: 'View transaction history' },
];

export default function DashboardPage() {
  const { balance, setBalance } = useWalletStore();
  const { games, isLoading: gamesLoading, setGames } = useGameStore();
  const { username, region } = useUserStore();
  const [stats, setStats] = useState({ gamesPlayed: 0, totalWagered: '0', totalWon: '0' });
  const [recentGames, setRecentGames] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [walletRes, gamesRes, historyRes] = await Promise.all([
          walletApi.getBalance(),
          gameApi.getGames({ limit: 6 }),
          gameApi.getHistory({ limit: 5 }),
        ]);

        if (walletRes.data.success) {
          setBalance(walletRes.data.data);
        }
        if (gamesRes.data.success) {
          setGames(gamesRes.data.data.games);
        }
        if (historyRes.data.success) {
          setRecentGames(historyRes.data.data.items);
          const gameStats = historyRes.data.data.items.reduce((acc: any, item: any) => {
            acc.gamesPlayed += 1;
            acc.totalWagered = (parseFloat(acc.totalWagered) + parseFloat(item.betAmount)).toFixed(2);
            acc.totalWon = (parseFloat(acc.totalWon) + parseFloat(item.winAmount)).toFixed(2);
            return acc;
          }, { gamesPlayed: 0, totalWagered: '0', totalWon: '0' });
          setStats(gameStats);
        }
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [setBalance, setGames]);

  const totalBalance = balance ? (
    balance.region === 'US'
      ? `${formatCurrency(balance.goldCoins, 'GOLD_COINS')} GC + ${formatCurrency(balance.sweepsCoins, 'SWEEPS_COINS')} SC`
      : Object.entries(balance.cryptoBalances)
          .filter(([, amount]) => parseFloat(amount) > 0)
          .map(([currency, amount]) => formatCurrency(amount, currency))
          .join(' + ') || '0.00'
  ) : 'Loading...';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Welcome back, {username || 'Player'}!
          </h1>
          <p className="text-muted-foreground mt-1">
            {region === 'US' ? 'US Sweepstakes Mode' : 'Global Crypto Mode'}
          </p>
        </div>
        <Badge variant="gold" size="md">{region || 'GLOBAL'}</Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Balance</p>
                <p className="text-2xl font-bold text-foreground mt-1">{totalBalance}</p>
              </div>
              <div className={cn('p-3 rounded-xl', statCards[0].bgColor)}>
                <Coins className={cn('w-6 h-6', statCards[0].color)} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Games Played</p>
                <p className="text-2xl font-bold text-foreground mt-1">{stats.gamesPlayed}</p>
              </div>
              <div className={cn('p-3 rounded-xl', statCards[1].bgColor)}>
                <Gamepad2 className={cn('w-6 h-6', statCards[1].color)} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Wagered</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {balance?.region === 'US' ? formatCurrency(stats.totalWagered, 'GOLD_COINS') : formatCurrency(stats.totalWagered, 'CRYPTO_USDT')}
                </p>
              </div>
              <div className={cn('p-3 rounded-xl', statCards[2].bgColor)}>
                <TrendingUp className={cn('w-6 h-6', statCards[2].color)} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Won</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {balance?.region === 'US' ? formatCurrency(stats.totalWon, 'GOLD_COINS') : formatCurrency(stats.totalWon, 'CRYPTO_USDT')}
                </p>
              </div>
              <div className={cn('p-3 rounded-xl', statCards[3].bgColor)}>
                <DollarSign className={cn('w-6 h-6', statCards[3].color)} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-3 gap-3">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <Link key={action.name} href={action.href} className="group">
                    <Button variant="outline" className="h-24 w-full flex-col gap-2 text-left group-hover:border-primary group-hover:bg-primary/10">
                      <Icon className="w-6 h-6 text-muted-foreground group-hover:text-primary" />
                      <span className="font-medium">{action.name}</span>
                      <span className="text-xs text-muted-foreground">{action.description}</span>
                    </Button>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Featured Games</CardTitle>
            <Link href="/dashboard/games" className="text-sm text-primary hover:underline">View All</Link>
          </CardHeader>
          <CardContent className="pt-0">
            {loading || gamesLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3 animate-pulse">
                    <div className="w-12 h-12 rounded-lg bg-secondary" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-3/4 bg-secondary rounded" />
                      <div className="h-3 w-1/2 bg-secondary rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : games.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No games available</p>
            ) : (
              <div className="space-y-3">
                {games.slice(0, 4).map((game) => (
                  <Link key={game.id} href={`/dashboard/games/${game.id}`} className="group flex items-center gap-3 p-2 rounded-lg hover:bg-secondary transition-colors">
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center flex-shrink-0">
                      <Gamepad2 className="w-6 h-6 text-primary-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate group-hover:text-primary">{game.name}</p>
                      <p className="text-sm text-muted-foreground">{getGameTypeLabel(game.type)}</p>
                    </div>
                    <Badge variant="outline" className={getVolatilityColor(game.volatility)}>{game.volatility}</Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent Activity</CardTitle>
          <Link href="/dashboard/history" className="text-sm text-primary hover:underline">View All</Link>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 animate-pulse bg-secondary rounded" />
              ))}
            </div>
          ) : recentGames.length === 0 ? (
            <div className="text-center py-8">
              <History className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground">No recent activity</p>
              <Link href="/dashboard/games" className="mt-3 inline-block">
                <Button variant="primary" size="sm">Play Your First Game</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {recentGames.map((item) => (
                <div key={item.id} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Gamepad2 className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{item.game?.name || 'Unknown Game'}</p>
                      <p className="text-sm text-muted-foreground">{formatDateTime(item.startedAt)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    <span className={cn(
                      'font-medium',
                      parseFloat(item.winAmount) > 0 ? 'text-primary' : 'text-foreground'
                    )}>
                      {parseFloat(item.winAmount) > 0 ? '+' : ''}
                      {item.region === 'US' ? formatCurrency(item.winAmount, 'GOLD_COINS') : formatCurrency(item.winAmount, item.currency)}
                    </span>
                    <Badge variant="outline" size="sm">{item.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function cn(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}

function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}