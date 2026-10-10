'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Coins } from 'lucide-react';
import { CurrencyType } from '@crypto-gaming/shared';
import { walletApi } from '@/lib/api';
import { useUserStore, useWalletStore } from '@/store';
import { formatCurrency, getCurrencyDisplayName } from '@/utils/helpers';

const CURRENCY_LABELS: Record<string, string> = {
  GOLD_COINS: 'GC',
  SWEEPS_COINS: 'SC',
  CRYPTO_BTC: 'BTC',
  CRYPTO_ETH: 'ETH',
  CRYPTO_USDT: 'USDT',
  CRYPTO_USDC: 'USDC',
  CRYPTO_LTC: 'LTC',
  CRYPTO_DOGE: 'DOGE',
  CRYPTO_SOL: 'SOL',
};

const BALANCE_POLL_MS = 30_000;

export interface BalanceOption {
  currency: CurrencyType;
  label: string;
  displayName: string;
  amount: string;
}

/** Builds the switcher options: US users always get GC/SC; GLOBAL users get
 *  every wallet they actually hold (plus a zero USDT fallback). */
export function buildBalanceOptions(
  balance: { goldCoins: string; sweepsCoins: string; cryptoBalances: Record<string, string> } | null,
  region: string | null
): BalanceOption[] {
  const toOption = (currency: string, amount: string): BalanceOption => ({
    currency: currency as CurrencyType,
    label: CURRENCY_LABELS[currency] ?? currency,
    displayName: getCurrencyDisplayName(currency),
    amount,
  });

  const options: BalanceOption[] = [];

  if (region === 'US') {
    options.push(toOption('GOLD_COINS', balance?.goldCoins ?? '0'));
    options.push(toOption('SWEEPS_COINS', balance?.sweepsCoins ?? '0'));
    return options;
  }

  if (parseFloat(balance?.goldCoins ?? '0') > 0) {
    options.push(toOption('GOLD_COINS', balance!.goldCoins));
  }
  if (parseFloat(balance?.sweepsCoins ?? '0') > 0) {
    options.push(toOption('SWEEPS_COINS', balance!.sweepsCoins));
  }
  for (const [currency, amount] of Object.entries(balance?.cryptoBalances ?? {})) {
    if (parseFloat(amount) > 0) {
      options.push(toOption(currency, amount));
    }
  }

  if (options.length === 0) {
    options.push(toOption('CRYPTO_USDT', '0'));
  }
  return options;
}

export function BalanceSwitcher({ onOpenCashier }: { onOpenCashier?: () => void }) {
  const { balance, setBalance, activeCurrency, setActiveCurrency } = useWalletStore();
  const userRegion = useUserStore((state) => state.region);
  const region = balance?.region ?? userRegion;
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Pull real-time balance from the wallet endpoint on mount and keep it
  // fresh with a light poll.
  useEffect(() => {
    let cancelled = false;

    async function fetchBalance() {
      try {
        const res = await walletApi.getBalance();
        if (!cancelled && res.data.success) {
          setBalance(res.data.data);
        }
      } catch {
        // Transient network failure — the next poll will retry.
      }
    }

    void fetchBalance();
    const timer = setInterval(() => void fetchBalance(), BALANCE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [setBalance]);

  // Close the dropdown when clicking anywhere outside it.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const options = useMemo(() => buildBalanceOptions(balance, region), [balance, region]);

  const active = useMemo(() => {
    const stored = options.find((option) => option.currency === activeCurrency);
    return stored ?? options[0];
  }, [options, activeCurrency]);

  if (!active) return null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Active balance: ${active.displayName}, ${formatCurrency(active.amount, active.currency)}. Switch balance.`}
        data-testid="balance-switcher-button"
        className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-secondary transition-colors"
      >
        <Coins className="h-4 w-4 text-gold-500" aria-hidden="true" />
        <span aria-hidden="true">{active.label}</span>
        <span className="tabular-nums" aria-hidden="true">
          {formatCurrency(active.amount, active.currency)}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Select balance to view"
          data-testid="balance-switcher-listbox"
          className="absolute right-0 mt-2 w-56 rounded-xl border border-border bg-card py-1 shadow-elevated z-50"
        >
          {options.map((option) => {
            const selected = option.currency === active.currency;
            return (
              <button
                key={option.currency}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  setActiveCurrency(option.currency);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between px-4 py-2 text-sm transition-colors ${
                  selected
                    ? 'bg-primary/10 text-primary'
                    : 'text-foreground hover:bg-secondary'
                }`}
              >
                <span className="font-medium">{option.label}</span>
                <span className="text-right">
                  <span className="block text-muted-foreground text-xs">{option.displayName}</span>
                  <span className="tabular-nums">{formatCurrency(option.amount, option.currency)}</span>
                </span>
              </button>
            );
          })}

          {onOpenCashier && (
            <>
              <hr className="my-1 border-border" />
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onOpenCashier();
                }}
                data-testid="balance-switcher-cashier"
                className="w-full px-4 py-2 text-left text-sm font-semibold text-primary hover:bg-secondary"
              >
                Deposit / Withdraw…
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
