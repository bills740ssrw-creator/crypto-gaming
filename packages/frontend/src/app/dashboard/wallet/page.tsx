'use client';

import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { Wallet, Copy, Check, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { formatCurrency, getCurrencyIcon, getCurrencyDisplayName } from '@/utils/helpers';
import { useWalletStore, useUserStore } from '@/store';
import { walletApi } from '@/lib/api';
import { useEffect } from 'react';
import { CurrencyType } from '@crypto-gaming/shared';
import toast from 'react-hot-toast';

const US_CURRENCIES: CurrencyType[] = ['GOLD_COINS', 'SWEEPS_COINS'];
const GLOBAL_CURRENCIES: CurrencyType[] = [
  'CRYPTO_BTC',
  'CRYPTO_ETH',
  'CRYPTO_USDT',
  'CRYPTO_USDC',
  'CRYPTO_LTC',
  'CRYPTO_DOGE',
  'CRYPTO_SOL',
];

export default function WalletPage() {
  const { balance, transactions, isLoading, setBalance, setTransactions, setLoading } = useWalletStore();
  const { region } = useUserStore();
  const [activeTab, setActiveTab] = useState<'overview' | 'deposit' | 'withdraw' | 'history'>('overview');
  const [depositAmount, setDepositAmount] = useState('');
  const [depositCurrency, setDepositCurrency] = useState<CurrencyType>('CRYPTO_USDT');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawCurrency, setWithdrawCurrency] = useState<CurrencyType>('CRYPTO_USDT');
  const [withdrawAddress, setWithdrawAddress] = useState('');
  const [withdrawNetwork, setWithdrawNetwork] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [depositAddress, setDepositAddress] = useState<string | null>(null);
  const [addressCopied, setAddressCopied] = useState(false);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const [balanceRes, historyRes] = await Promise.all([
          walletApi.getBalance(),
          walletApi.getHistory({ limit: 20 }),
        ]);
        if (balanceRes.data.success) setBalance(balanceRes.data.data);
        if (historyRes.data.success) setTransactions(historyRes.data.data.items);
      } catch (error) {
        console.error('Failed to fetch wallet data:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [setBalance, setTransactions, setLoading]);

  const currencies: CurrencyType[] = region === 'US' ? US_CURRENCIES : GLOBAL_CURRENCIES;

  // A stored selection from another region would submit an invalid currency,
  // so fall back to the first option the current region actually allows.
  const activeDepositCurrency = currencies.includes(depositCurrency) ? depositCurrency : currencies[0];
  const activeWithdrawCurrency = currencies.includes(withdrawCurrency) ? withdrawCurrency : currencies[0];

  const amountFor = (currency: string): string => {
    if (currency === 'GOLD_COINS') return balance?.goldCoins ?? '0';
    if (currency === 'SWEEPS_COINS') return balance?.sweepsCoins ?? '0';
    return balance?.cryptoBalances?.[currency] ?? '0';
  };

  // US users always see both coin cards; other regions only see balances they
  // actually hold, so a funded sweeps wallet never renders as an empty row.
  const isCoin = (currency: CurrencyType) => currency === 'GOLD_COINS' || currency === 'SWEEPS_COINS';
  const coinCurrencies: CurrencyType[] =
    region === 'US'
      ? US_CURRENCIES
      : (['GOLD_COINS', 'SWEEPS_COINS'] as CurrencyType[]).filter(
          (currency) => parseFloat(amountFor(currency)) > 0
        );
  const cryptoCurrencies = currencies.filter(
    (currency) => !isCoin(currency) && parseFloat(amountFor(currency)) > 0
  );
  const overviewCurrencies: CurrencyType[] = [...coinCurrencies, ...cryptoCurrencies];

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!depositAmount || parseFloat(depositAmount) <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    setSubmitting(true);
    try {
      const res = await walletApi.requestDeposit({
        currency: activeDepositCurrency,
        amount: depositAmount,
      });
      if (res.data.success) {
        const address = res.data.data?.address as string | undefined;
        setAddressCopied(false);
        setDepositAddress(address && address.length > 0 ? address : null);
        toast.success('Deposit address generated');
        setDepositAmount('');
      }
    } catch (error) {
      toast.error('Failed to request deposit');
    } finally {
      setSubmitting(false);
    }
  };

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!withdrawAmount || parseFloat(withdrawAmount) <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (!withdrawAddress) {
      toast.error('Enter a destination address');
      return;
    }
    setSubmitting(true);
    try {
      const res = await walletApi.requestWithdrawal({
        currency: activeWithdrawCurrency,
        amount: withdrawAmount,
        address: withdrawAddress,
        network: withdrawNetwork || undefined,
      });
      if (res.data.success) {
        toast.success('Withdrawal requested');
        setWithdrawAmount('');
        setWithdrawAddress('');
      }
    } catch (error) {
      toast.error('Failed to request withdrawal');
    } finally {
      setSubmitting(false);
    }
  };

  const copyAddress = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
    } catch {
      // Clipboard access can be denied (insecure context, older browsers);
      // fall back so the user can still copy manually from the visible field.
      toast.error('Copy failed — select the address and copy manually');
      return;
    }
    setAddressCopied(true);
    toast.success('Address copied to clipboard');
    window.setTimeout(() => setAddressCopied(false), 2000);
  };

  const closeDepositModal = () => setDepositAddress(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Wallet</h1>
          <p className="text-muted-foreground mt-1">Manage your balances and transactions</p>
        </div>
        <Badge variant="gold">{region || 'GLOBAL'}</Badge>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="deposit">Deposit</TabsTrigger>
          <TabsTrigger value="withdraw">Withdraw</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-6 h-32" />
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {overviewCurrencies.map((currency) => {
                const amount = amountFor(currency);

                return (
                  <Card key={currency}>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                            {getCurrencyIcon(currency)} {getCurrencyDisplayName(currency)}
                          </p>
                          <p className="text-2xl font-bold text-foreground mt-1">
                            {formatCurrency(amount, currency)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Available</p>
                          <p className="text-sm font-medium text-foreground">{formatCurrency(amount, currency)}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="deposit" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Deposit Funds</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={handleDeposit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Currency</label>
                    <select
                      value={activeDepositCurrency}
                      onChange={(e) => setDepositCurrency(e.target.value as CurrencyType)}
                      className="w-full px-3 py-2 rounded-lg border border-input bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      {currencies.map((c) => (
                        <option key={c} value={c}>{getCurrencyDisplayName(c)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Amount</label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      placeholder="Enter amount"
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full" loading={submitting}>
                  Generate Deposit Address
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="withdraw" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Withdraw Funds</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={handleWithdraw} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Currency</label>
                    <select
                      value={activeWithdrawCurrency}
                      onChange={(e) => setWithdrawCurrency(e.target.value as CurrencyType)}
                      className="w-full px-3 py-2 rounded-lg border border-input bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      {currencies.map((c) => (
                        <option key={c} value={c}>{getCurrencyDisplayName(c)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Amount</label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      placeholder="Enter amount"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Destination Address</label>
                  <Input
                    type="text"
                    value={withdrawAddress}
                    onChange={(e) => setWithdrawAddress(e.target.value)}
                    placeholder="Enter wallet address"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Network (Optional)</label>
                  <Input
                    type="text"
                    value={withdrawNetwork}
                    onChange={(e) => setWithdrawNetwork(e.target.value)}
                    placeholder="e.g., ERC20, BEP20, TRC20"
                  />
                </div>
                <Button type="submit" variant="destructive" className="w-full" loading={submitting}>
                  Request Withdrawal
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Transaction History</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="h-16 animate-pulse bg-secondary rounded" />
                  ))}
                </div>
              ) : transactions.length === 0 ? (
                <div className="text-center py-8">
                  <Wallet className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-muted-foreground">No transactions yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {transactions.map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          'w-10 h-10 rounded-lg flex items-center justify-center',
                          tx.type === 'DEPOSIT' || tx.type === 'WIN' || tx.type === 'BONUS' 
                            ? 'bg-primary/15' 
                            : 'bg-destructive/15'
                        )}>
                          {tx.type === 'DEPOSIT' || tx.type === 'WIN' || tx.type === 'BONUS' ? (
                            <ArrowDownLeft className="w-5 h-5 text-primary" />
                          ) : (
                            <ArrowUpRight className="w-5 h-5 text-destructive" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{tx.type}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatCurrency(tx.amount, tx.currency)} {getCurrencyDisplayName(tx.currency)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-right">
                        <span className={cn(
                          'font-medium',
                          tx.type === 'DEPOSIT' || tx.type === 'WIN' || tx.type === 'BONUS' 
                            ? 'text-primary' 
                            : 'text-destructive'
                        )}>
                          {tx.type === 'DEPOSIT' || tx.type === 'WIN' || tx.type === 'BONUS' ? '+' : '-'}
                          {formatCurrency(tx.netAmount, tx.currency)}
                        </span>
                        <Badge variant="outline" size="sm" className={cn(
                          tx.status === 'COMPLETED' && 'bg-primary/15 text-primary',
                          tx.status === 'PENDING' && 'bg-gold-500/15 text-gold-400',
                          tx.status === 'FAILED' && 'bg-destructive/15 text-destructive',
                        )}>
                          {tx.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Modal
        open={depositAddress !== null}
        onClose={closeDepositModal}
        title={`Deposit ${getCurrencyDisplayName(activeDepositCurrency)}`}
      >
        {depositAddress && (
          <div className="space-y-4">
            <div className="flex justify-center">
              <div
                data-testid="deposit-qr"
                className="rounded-xl border border-border bg-white p-3"
              >
                <QRCodeSVG value={depositAddress} size={184} level="M" />
              </div>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
                Deposit address
              </p>
              <p
                data-testid="deposit-address"
                className="break-all rounded-lg border border-border bg-secondary px-3 py-2 font-mono text-sm text-foreground"
              >
                {depositAddress}
              </p>
            </div>
            <Button
              type="button"
              variant={addressCopied ? 'secondary' : 'primary'}
              className="w-full"
              onClick={() => void copyAddress(depositAddress)}
            >
              {addressCopied ? (
                <>
                  <Check className="mr-2 h-4 w-4" /> Copied!
                </>
              ) : (
                <>
                  <Copy className="mr-2 h-4 w-4" /> Copy Address
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Only send {getCurrencyDisplayName(activeDepositCurrency)} to this address.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}
