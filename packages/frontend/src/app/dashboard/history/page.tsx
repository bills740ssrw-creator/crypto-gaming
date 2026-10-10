'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Button';
import { ArrowUpRight, ArrowDownLeft, Wallet, Gamepad2 } from 'lucide-react';
import { formatCurrency, getCurrencyDisplayName, getTransactionTypeLabel, getTransactionStatusColor, formatDateTime } from '@/utils/helpers';
import { useWalletStore, useGameStore, useUserStore } from '@/store';
import { walletApi, gameApi } from '@/lib/api';

export default function HistoryPage() {
  const { transactions } = useWalletStore();
  const { history, isLoading: gameLoading } = useGameStore();
  const { region } = useUserStore();
  const [activeTab, setActiveTab] = useState<'transactions' | 'games'>('transactions');
  const [txFilters, setTxFilters] = useState({ type: '', status: '', currency: '' });
  const [gameFilters, setGameFilters] = useState({ status: '', gameId: '' });
  const [txLoading, setTxLoading] = useState(false);
  const [gameLoadingMore, setGameLoadingMore] = useState(false);
  const [txPage, setTxPage] = useState(1);
  const [gamePage, setGamePage] = useState(1);
  const [hasMoreTx, setHasMoreTx] = useState(true);
  const [hasMoreGames, setHasMoreGames] = useState(true);

  useEffect(() => {
    fetchTransactions();
  }, [txPage, txFilters]);

  useEffect(() => {
    fetchGameHistory();
  }, [gamePage, gameFilters]);

  async function fetchTransactions() {
    setTxLoading(true);
    try {
      const res = await walletApi.getHistory({
        limit: 20,
        offset: (txPage - 1) * 20,
        ...(txFilters.type && { type: txFilters.type }),
        ...(txFilters.status && { status: txFilters.status }),
        ...(txFilters.currency && { currency: txFilters.currency }),
      });
      if (res.data.success) {
        if (txPage === 1) {
          useWalletStore.getState().setTransactions(res.data.data.items);
        } else {
          useWalletStore.getState().setTransactions([
            ...useWalletStore.getState().transactions,
            ...res.data.data.items,
          ]);
        }
        setHasMoreTx(res.data.data.items.length === 20);
      }
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
    } finally {
      setTxLoading(false);
    }
  }

  async function fetchGameHistory() {
    setGameLoadingMore(true);
    try {
      const res = await gameApi.getHistory({
        limit: 20,
        offset: (gamePage - 1) * 20,
        ...(gameFilters.status && { status: gameFilters.status }),
        ...(gameFilters.gameId && { gameId: gameFilters.gameId }),
      });
      if (res.data.success) {
        if (gamePage === 1) {
          useGameStore.getState().setHistory(res.data.data.items);
        } else {
          useGameStore.getState().setHistory([
            ...useGameStore.getState().history,
            ...res.data.data.items,
          ]);
        }
        setHasMoreGames(res.data.data.items.length === 20);
      }
    } catch (error) {
      console.error('Failed to fetch game history:', error);
    } finally {
      setGameLoadingMore(false);
    }
  }

  const loadMoreTx = () => setTxPage(p => p + 1);
  const loadMoreGames = () => setGamePage(p => p + 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">History</h1>
          <p className="text-muted-foreground mt-1">View your transaction and game history</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="transactions">
            <Wallet className="w-4 h-4 mr-2" />
            Transactions
          </TabsTrigger>
          <TabsTrigger value="games">
            <Gamepad2 className="w-4 h-4 mr-2" />
            Game History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="transactions" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Filters</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <select
                  value={txFilters.type}
                  onChange={(e) => setTxFilters(prev => ({ ...prev, type: e.target.value, page: 1 }))}
                  className="px-3 py-2 rounded-lg border border-input bg-card"
                >
                  <option value="">All Types</option>
                  <option value="DEPOSIT">Deposit</option>
                  <option value="WITHDRAWAL">Withdrawal</option>
                  <option value="WAGER">Wager</option>
                  <option value="WIN">Win</option>
                  <option value="BONUS">Bonus</option>
                  <option value="TRANSFER_IN">Transfer In</option>
                  <option value="TRANSFER_OUT">Transfer Out</option>
                </select>
                <select
                  value={txFilters.status}
                  onChange={(e) => setTxFilters(prev => ({ ...prev, status: e.target.value, page: 1 }))}
                  className="px-3 py-2 rounded-lg border border-input bg-card"
                >
                  <option value="">All Status</option>
                  <option value="PENDING">Pending</option>
                  <option value="CONFIRMED">Confirmed</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="FAILED">Failed</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
                <select
                  value={txFilters.currency}
                  onChange={(e) => setTxFilters(prev => ({ ...prev, currency: e.target.value, page: 1 }))}
                  className="px-3 py-2 rounded-lg border border-input bg-card"
                >
                  <option value="">All Currencies</option>
                  <option value="GOLD_COINS">Gold Coins</option>
                  <option value="SWEEPS_COINS">Sweeps Coins</option>
                  <option value="CRYPTO_BTC">Bitcoin</option>
                  <option value="CRYPTO_ETH">Ethereum</option>
                  <option value="CRYPTO_USDT">USDT</option>
                  <option value="CRYPTO_USDC">USDC</option>
                </select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-0">
              {txLoading && transactions.length === 0 ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="h-16 animate-pulse bg-secondary rounded" />
                  ))}
                </div>
              ) : transactions.length === 0 ? (
                <div className="text-center py-12">
                  <Wallet className="w-16 h-16 text-muted-foreground/40 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">No transactions</h3>
                  <p className="text-muted-foreground mb-4">Your transaction history will appear here</p>
                  <Button variant="primary" asChild>
                    <a href="/dashboard/wallet?tab=deposit">Make Your First Deposit</a>
                  </Button>
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    {transactions.map((tx) => (
                      <TransactionRow key={tx.id} tx={tx} region={region} />
                    ))}
                  </div>
                  {hasMoreTx && (
                    <div className="text-center pt-4">
                      <Button variant="outline" onClick={loadMoreTx} disabled={txLoading}>
                        Load More
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="games" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Filters</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <select
                  value={gameFilters.status}
                  onChange={(e) => setGameFilters(prev => ({ ...prev, status: e.target.value, page: 1 }))}
                  className="px-3 py-2 rounded-lg border border-input bg-card"
                >
                  <option value="">All Status</option>
                  <option value="WAITING">Waiting</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-0">
              {gameLoading && history.length === 0 ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="h-16 animate-pulse bg-secondary rounded" />
                  ))}
                </div>
              ) : history.length === 0 ? (
                <div className="text-center py-12">
                  <Gamepad2 className="w-16 h-16 text-muted-foreground/40 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">No game history</h3>
                  <p className="text-muted-foreground mb-4">Your game history will appear here</p>
                  <Button variant="primary" asChild>
                    <a href="/dashboard/games">Play Games</a>
                  </Button>
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    {history.map((item) => (
                      <GameHistoryRow key={item.id} item={item} region={region} />
                    ))}
                  </div>
                  {hasMoreGames && (
                    <div className="text-center pt-4">
                      <Button variant="outline" onClick={loadMoreGames} disabled={gameLoadingMore}>
                        Load More
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TransactionRow({ tx, region }: { tx: any; region: string | null }) {
  const isPositive = ['DEPOSIT', 'WIN', 'BONUS', 'TRANSFER_IN'].includes(tx.type);
  const currency = region === 'US' && (tx.currency === 'GOLD_COINS' || tx.currency === 'SWEEPS_COINS') 
    ? tx.currency 
    : tx.currency;

  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <div className="flex items-center gap-3">
        <div className={cn(
          'w-10 h-10 rounded-lg flex items-center justify-center',
          isPositive ? 'bg-primary/15' : 'bg-destructive/15'
        )}>
          {isPositive ? (
            <ArrowDownLeft className="w-5 h-5 text-primary" />
          ) : (
            <ArrowUpRight className="w-5 h-5 text-destructive" />
          )}
        </div>
        <div>
          <p className="font-medium text-foreground">{getTransactionTypeLabel(tx.type)}</p>
          <p className="text-sm text-muted-foreground">
            {formatCurrency(tx.amount, currency)} {getCurrencyDisplayName(currency)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-4 text-right">
        <span className={cn('font-medium', isPositive ? 'text-primary' : 'text-destructive')}>
          {isPositive ? '+' : '-'}{formatCurrency(tx.netAmount, currency)}
        </span>
        <Badge variant="outline" size="sm" className={getTransactionStatusColor(tx.status)}>
          {tx.status}
        </Badge>
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {formatDateTime(tx.createdAt)}
        </span>
      </div>
    </div>
  );
}

function GameHistoryRow({ item, region }: { item: any; region: string | null }) {
  const currency = region === 'US' && (item.currency === 'GOLD_COINS' || item.currency === 'SWEEPS_COINS')
    ? item.currency
    : item.currency;
  const isWin = parseFloat(item.winAmount) > 0;

  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Gamepad2 className="w-5 h-5 text-primary" />
        </div>
        <div>
          <p className="font-medium text-foreground">{item.game?.name || 'Unknown Game'}</p>
          <p className="text-sm text-muted-foreground">
            Bet: {formatCurrency(item.betAmount, currency)} {getCurrencyDisplayName(currency)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-4 text-right">
        <span className={cn('font-medium', isWin ? 'text-primary' : 'text-destructive')}>
          {isWin ? '+' : ''}{formatCurrency(item.winAmount, currency)}
        </span>
        <Badge variant="outline" size="sm" className={cn(
          item.status === 'COMPLETED' && 'bg-primary/15 text-primary',
          item.status === 'IN_PROGRESS' && 'bg-sky-500/15 text-sky-400',
          item.status === 'CANCELLED' && 'bg-secondary text-muted-foreground',
        )}>
          {item.status}
        </Badge>
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {formatDateTime(item.startedAt)}
        </span>
      </div>
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}