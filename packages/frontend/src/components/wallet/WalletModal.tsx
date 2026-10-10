'use client';

import { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Copy, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import { CurrencyType } from '@crypto-gaming/shared';
import { Modal } from '@/components/ui/Modal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { walletApi } from '@/lib/api';
import { useUserStore, useWalletStore } from '@/store';
import { formatCurrency, getCurrencyDisplayName } from '@/utils/helpers';

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

export interface WalletModalProps {
  open: boolean;
  onClose: () => void;
  initialTab?: 'deposit' | 'withdraw';
}

interface DepositAddressEntry {
  chain: string;
  address: string;
}

export function WalletModal({ open, onClose, initialTab = 'deposit' }: WalletModalProps) {
  const [tab, setTab] = useState<'deposit' | 'withdraw'>(initialTab);
  const { balance, setBalance } = useWalletStore();
  const userRegion = useUserStore((state) => state.region);
  const region = balance?.region ?? userRegion;

  const currencies: CurrencyType[] = region === 'US' ? US_CURRENCIES : GLOBAL_CURRENCIES;

  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  const amountFor = (currency: string): string => {
    if (currency === 'GOLD_COINS') return balance?.goldCoins ?? '0';
    if (currency === 'SWEEPS_COINS') return balance?.sweepsCoins ?? '0';
    return balance?.cryptoBalances?.[currency] ?? '0';
  };

  const refreshBalance = async () => {
    try {
      const res = await walletApi.getBalance();
      if (res.data.success) setBalance(res.data.data);
    } catch {
      // Balance refresh is best-effort; the next poll will catch up.
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Cashier" className="max-w-lg">
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'deposit' | 'withdraw')}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="deposit">Deposit</TabsTrigger>
          <TabsTrigger value="withdraw">Withdraw</TabsTrigger>
        </TabsList>

        <TabsContent value="deposit">
          <DepositTab
            currencies={currencies}
            amountFor={amountFor}
            onBalanceChanged={refreshBalance}
          />
        </TabsContent>

        <TabsContent value="withdraw">
          <WithdrawTab
            currencies={currencies}
            amountFor={amountFor}
            onWithdrawn={refreshBalance}
            onClose={onClose}
          />
        </TabsContent>
      </Tabs>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Deposit tab — generates the user's on-chain address and shows a QR code
// ---------------------------------------------------------------------------

function DepositTab({
  currencies,
}: {
  currencies: CurrencyType[];
  amountFor: (currency: string) => string;
  onBalanceChanged: () => Promise<void>;
}) {
  const [currency, setCurrency] = useState<CurrencyType>(
    currencies.includes('CRYPTO_USDT') ? 'CRYPTO_USDT' : currencies[0]
  );
  const [amount, setAmount] = useState('');
  const [addresses, setAddresses] = useState<DepositAddressEntry[]>([]);
  const [activeChain, setActiveChain] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCurrency(currencies.includes('CRYPTO_USDT') ? 'CRYPTO_USDT' : currencies[0]);
    setAddresses([]);
    setActiveChain(null);
    setCopied(false);
  }, [currencies]);

  const selectedAddress = useMemo(() => {
    if (addresses.length === 0) return null;
    return addresses.find((entry) => entry.chain === activeChain) ?? addresses[0];
  }, [addresses, activeChain]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    setGenerating(true);
    try {
      const res = await walletApi.requestDeposit({ currency, amount });
      if (res.data.success) {
        const primary = res.data.data?.address as string | undefined;
        const list = (res.data.data?.depositAddresses as DepositAddressEntry[] | undefined) ?? [];
        const entries: DepositAddressEntry[] =
          list.length > 0
            ? list
            : primary
              ? [{ chain: 'ONCHAIN', address: primary }]
              : [];
        setAddresses(entries);
        setActiveChain(entries[0]?.chain ?? null);
        setCopied(false);
        toast.success('Deposit address generated');
      }
    } catch {
      toast.error('Failed to request deposit');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!selectedAddress) return;
    try {
      await navigator.clipboard.writeText(selectedAddress.address);
    } catch {
      toast.error('Copy failed — select the address and copy manually');
      return;
    }
    setCopied(true);
    toast.success('Address copied to clipboard');
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleGenerate} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="deposit-currency"
              className="block text-sm font-medium text-foreground mb-1.5"
            >
              Currency
            </label>
            <select
              id="deposit-currency"
              value={currency}
              onChange={(e) => {
                setCurrency(e.target.value as CurrencyType);
                setAddresses([]);
                setActiveChain(null);
              }}
              className="w-full rounded-lg border border-input bg-card px-3 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {currencies.map((c) => (
                <option key={c} value={c}>
                  {getCurrencyDisplayName(c)}
                </option>
              ))}
            </select>
          </div>
          <Input
            label="Amount"
            type="number"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Enter amount"
          />
        </div>
        <Button type="submit" className="w-full" loading={generating}>
          Generate Deposit Address
        </Button>
      </form>

      {selectedAddress && (
        <div className="space-y-4 border-t border-border pt-4">
          {addresses.length > 1 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Deposit network">
              {addresses.map((entry) => (
                <button
                  key={entry.chain}
                  type="button"
                  onClick={() => {
                    setActiveChain(entry.chain);
                    setCopied(false);
                  }}
                  aria-pressed={entry.chain === selectedAddress.chain}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    entry.chain === selectedAddress.chain
                      ? 'bg-primary-600 text-primary-foreground'
                      : 'bg-secondary text-muted-foreground hover:bg-primary/20'
                  }`}
                >
                  {entry.chain}
                </button>
              ))}
            </div>
          )}

          <div className="flex justify-center">
            <div
              data-testid="cashier-deposit-qr"
              className="rounded-xl border border-border bg-white p-3"
            >
              <QRCodeSVG value={selectedAddress.address} size={168} level="M" />
            </div>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
              Deposit address
            </p>
            <p
              data-testid="cashier-deposit-address"
              className="break-all rounded-lg border border-border bg-secondary px-3 py-2 font-mono text-sm text-foreground"
            >
              {selectedAddress.address}
            </p>
          </div>

          <Button
            type="button"
            variant={copied ? 'secondary' : 'primary'}
            className="w-full"
            onClick={() => void handleCopy()}
            data-testid="cashier-copy-button"
          >
            {copied ? (
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
            Only send {getCurrencyDisplayName(currency)} to this address.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Withdraw tab — destination + amount, validated against available balance
// ---------------------------------------------------------------------------

function WithdrawTab({
  currencies,
  amountFor,
  onWithdrawn,
  onClose,
}: {
  currencies: CurrencyType[];
  amountFor: (currency: string) => string;
  onWithdrawn: () => Promise<void>;
  onClose: () => void;
}) {
  const [currency, setCurrency] = useState<CurrencyType>(
    currencies.includes('CRYPTO_USDT') ? 'CRYPTO_USDT' : currencies[0]
  );
  const [amount, setAmount] = useState('');
  const [address, setAddress] = useState('');
  const [amountError, setAmountError] = useState<string | null>(null);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setCurrency(currencies.includes('CRYPTO_USDT') ? 'CRYPTO_USDT' : currencies[0]);
    setAmountError(null);
    setAddressError(null);
  }, [currencies]);

  const available = amountFor(currency);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAmountError(null);
    setAddressError(null);

    let valid = true;
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      setAmountError('Enter a valid amount');
      valid = false;
    } else if (parseFloat(amount) > parseFloat(available)) {
      setAmountError(`Insufficient balance: you have ${formatCurrency(available, currency)}`);
      valid = false;
    }
    if (!address.trim()) {
      setAddressError('Enter a destination address');
      valid = false;
    }
    if (!valid) return;

    setSubmitting(true);
    try {
      const res = await walletApi.requestWithdrawal({
        currency,
        amount,
        address: address.trim(),
      });
      if (res.data.success) {
        toast.success('Withdrawal requested');
        setAmount('');
        setAddress('');
        await onWithdrawn();
        onClose();
      }
    } catch {
      toast.error('Failed to request withdrawal');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="withdraw-currency"
          className="block text-sm font-medium text-foreground mb-1.5"
        >
          Currency
        </label>
        <select
          id="withdraw-currency"
          value={currency}
          onChange={(e) => {
            setCurrency(e.target.value as CurrencyType);
            setAmountError(null);
          }}
          className="w-full rounded-lg border border-input bg-card px-3 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {currencies.map((c) => (
            <option key={c} value={c}>
              {getCurrencyDisplayName(c)}
            </option>
          ))}
        </select>
      </div>

      <p className="text-sm text-muted-foreground" data-testid="withdraw-available">
        Available: {formatCurrency(available, currency)}
      </p>

      <Input
        label="Destination Address"
        type="text"
        value={address}
        onChange={(e) => {
          setAddress(e.target.value);
          setAddressError(null);
        }}
        placeholder="Enter destination address"
        error={addressError ?? undefined}
      />

      <Input
        label="Amount"
        type="number"
        step="0.01"
        min="0.01"
        value={amount}
        onChange={(e) => {
          setAmount(e.target.value);
          setAmountError(null);
        }}
        placeholder="Enter amount"
        error={amountError ?? undefined}
        helperText={
          amountError
            ? undefined
            : `Network fees are deducted from the requested amount.`
        }
      />

      <Button type="submit" variant="destructive" className="w-full" loading={submitting}>
        <Wallet className="mr-2 h-4 w-4" />
        Request Withdrawal
      </Button>
    </form>
  );
}
