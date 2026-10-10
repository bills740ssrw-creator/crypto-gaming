import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WalletModal } from '@/components/wallet/WalletModal';
import { BalanceSwitcher, buildBalanceOptions } from '@/components/wallet/BalanceSwitcher';
import { walletApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { useUserStore, useWalletStore } from '@/store';
import type { Balance, RegionType } from '@crypto-gaming/shared';

jest.mock('@/lib/api', () => ({
  walletApi: {
    getBalance: jest.fn(),
    requestDeposit: jest.fn(),
    requestWithdrawal: jest.fn(),
  },
}));

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { success: jest.fn(), error: jest.fn(), loading: jest.fn(), dismiss: jest.fn() },
}));

const mockedApi = walletApi as unknown as {
  getBalance: jest.Mock;
  requestDeposit: jest.Mock;
  requestWithdrawal: jest.Mock;
};

const GLOBAL_BALANCE: Balance = {
  goldCoins: '0',
  sweepsCoins: '0',
  cryptoBalances: { CRYPTO_USDT: '100', CRYPTO_BTC: '0.5', CRYPTO_SOL: '25', CRYPTO_ETH: '3' },
  region: 'GLOBAL',
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const US_BALANCE: Balance = {
  goldCoins: '1000',
  sweepsCoins: '500',
  cryptoBalances: {},
  region: 'US',
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

function seedStore(region: RegionType, balance: Balance | null) {
  useUserStore.setState({ region, id: 'u1', isAdmin: false });
  useWalletStore.setState({
    balance: balance ? { ...balance, region } : null,
    wallets: {},
    transactions: [],
    isLoading: false,
    activeCurrency: null,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedApi.getBalance.mockResolvedValue({ data: { success: true, data: GLOBAL_BALANCE } });
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: jest.fn().mockResolvedValue(undefined) },
    writable: true,
    configurable: true,
  });
  seedStore('GLOBAL', GLOBAL_BALANCE);
});

// ---------------------------------------------------------------------------
// WalletModal — Deposit tab
// ---------------------------------------------------------------------------

describe('WalletModal - deposit tab', () => {
  it('renders the deposit form with the currency and amount inputs', async () => {
    render(<WalletModal open onClose={jest.fn()} />);

    expect(screen.getByRole('tab', { name: 'Deposit' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByLabelText('Currency')).toHaveValue('CRYPTO_USDT');
    expect(screen.getByLabelText('Amount')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate Deposit Address' })).toBeInTheDocument();
  });

  it('generates a deposit address and shows the QR code and address', async () => {
    mockedApi.requestDeposit.mockResolvedValue({
      data: {
        success: true,
        data: {
          address: 'DELNTUtrLta7eZvL6oCB7QdSDYS863PkRG2GyqtTyNvc',
          depositAddresses: [
            { chain: 'SOLANA', address: 'DELNTUtrLta7eZvL6oCB7QdSDYS863PkRG2GyqtTyNvc' },
          ],
        },
      },
    });
    render(<WalletModal open onClose={jest.fn()} />);

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate Deposit Address' }));

    await waitFor(() =>
      expect(mockedApi.requestDeposit).toHaveBeenCalledWith({
        currency: 'CRYPTO_USDT',
        amount: '25',
      })
    );

    expect(await screen.findByTestId('cashier-deposit-qr')).toBeInTheDocument();
    expect(screen.getByTestId('cashier-deposit-address')).toHaveTextContent(
      'DELNTUtrLta7eZvL6oCB7QdSDYS863PkRG2GyqtTyNvc'
    );
    expect(toast.success).toHaveBeenCalledWith('Deposit address generated');
  });

  it('renders network pills for a multi-chain currency and switches the shown address', async () => {
    mockedApi.requestDeposit.mockResolvedValue({
      data: {
        success: true,
        data: {
          address: 'DELNTUtrLta7eZvL6oCB7QdSDYS863PkRG2GyqtTyNvc',
          depositAddresses: [
            { chain: 'SOLANA', address: 'DELNTUtrLta7eZvL6oCB7QdSDYS863PkRG2GyqtTyNvc' },
            { chain: 'EVM', address: '0xF08FbCdD5DD619cD6529C164aFd997E6E5f64386' },
          ],
        },
      },
    });
    render(<WalletModal open onClose={jest.fn()} />);

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate Deposit Address' }));

    expect(await screen.findByTestId('cashier-deposit-address')).toHaveTextContent(
      'DELNTUtrLta7eZvL6oCB7QdSDYS863PkRG2GyqtTyNvc'
    );

    fireEvent.click(screen.getByRole('button', { name: 'EVM' }));
    expect(screen.getByTestId('cashier-deposit-address')).toHaveTextContent(
      '0xF08FbCdD5DD619cD6529C164aFd997E6E5f64386'
    );
  });

  it('copies the deposit address to the clipboard with visual feedback', async () => {
    mockedApi.requestDeposit.mockResolvedValue({
      data: {
        success: true,
        data: {
          address: 'DELNTUtrLta7eZvL6oCB7QdSDYS863PkRG2GyqtTyNvc',
          depositAddresses: [
            { chain: 'SOLANA', address: 'DELNTUtrLta7eZvL6oCB7QdSDYS863PkRG2GyqtTyNvc' },
          ],
        },
      },
    });
    render(<WalletModal open onClose={jest.fn()} />);

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate Deposit Address' }));
    const copyButton = await screen.findByTestId('cashier-copy-button');
    expect(copyButton).toHaveTextContent('Copy Address');

    fireEvent.click(copyButton);

    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'DELNTUtrLta7eZvL6oCB7QdSDYS863PkRG2GyqtTyNvc'
      )
    );
    expect(await screen.findByTestId('cashier-copy-button')).toHaveTextContent('Copied!');
    expect(toast.success).toHaveBeenCalledWith('Address copied to clipboard');
  });

  it('rejects an empty amount without calling the API', async () => {
    render(<WalletModal open onClose={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Generate Deposit Address' }));

    expect(toast.error).toHaveBeenCalledWith('Enter a valid amount');
    expect(mockedApi.requestDeposit).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// WalletModal — Withdraw tab
// ---------------------------------------------------------------------------

describe('WalletModal - withdraw tab', () => {
  it('shows the available balance for the selected currency', async () => {
    render(<WalletModal open onClose={jest.fn()} initialTab="withdraw" />);

    expect(await screen.findByTestId('withdraw-available')).toHaveTextContent('100.00 USDT');
  });

  it('blocks a withdrawal that exceeds the available balance', async () => {
    render(<WalletModal open onClose={jest.fn()} initialTab="withdraw" />);

    fireEvent.change(screen.getByLabelText('Destination Address'), {
      target: { value: '0xabc123' },
    });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: /Request Withdrawal/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Insufficient balance');
    expect(mockedApi.requestWithdrawal).not.toHaveBeenCalled();
  });

  it('requires a destination address', async () => {
    render(<WalletModal open onClose={jest.fn()} initialTab="withdraw" />);

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: /Request Withdrawal/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a destination address');
    expect(mockedApi.requestWithdrawal).not.toHaveBeenCalled();
  });

  it('submits a valid withdrawal, refreshes balance, and closes', async () => {
    const onClose = jest.fn();
    mockedApi.requestWithdrawal.mockResolvedValue({ data: { success: true, data: {} } });
    render(<WalletModal open onClose={onClose} initialTab="withdraw" />);

    fireEvent.change(screen.getByLabelText('Destination Address'), {
      target: { value: '0xabc123' },
    });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: /Request Withdrawal/ }));

    await waitFor(() =>
      expect(mockedApi.requestWithdrawal).toHaveBeenCalledWith({
        currency: 'CRYPTO_USDT',
        amount: '10',
        address: '0xabc123',
      })
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Withdrawal requested'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    await waitFor(() => expect(mockedApi.getBalance).toHaveBeenCalled());
  });

  it('validates against the balance of the picked currency, not another one', async () => {
    render(<WalletModal open onClose={jest.fn()} initialTab="withdraw" />);

    // Switch to SOL, which has a much smaller balance (25).
    fireEvent.change(screen.getByLabelText('Currency'), { target: { value: 'CRYPTO_SOL' } });
    expect(await screen.findByTestId('withdraw-available')).toHaveTextContent('25.00 SOL');

    fireEvent.change(screen.getByLabelText('Destination Address'), {
      target: { value: 'SomeSolAddress111' },
    });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: /Request Withdrawal/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Insufficient balance');
    expect(mockedApi.requestWithdrawal).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// BalanceSwitcher
// ---------------------------------------------------------------------------

describe('BalanceSwitcher', () => {
  it('fetches the balance from the endpoint on mount and displays it', async () => {
    render(<BalanceSwitcher />);

    await waitFor(() => expect(mockedApi.getBalance).toHaveBeenCalled());
    const button = await screen.findByTestId('balance-switcher-button');
    // GLOBAL default active currency is the first option (USDT 100).
    expect(button).toHaveTextContent('USDT');
    expect(button).toHaveTextContent('100.00');
  });

  it('opens the dropdown and switches the active balance view', async () => {
    render(<BalanceSwitcher />);

    const button = await screen.findByTestId('balance-switcher-button');
    expect(button).toHaveTextContent('USDT');

    fireEvent.click(button);
    const listbox = await screen.findByTestId('balance-switcher-listbox');
    expect(listbox).toBeInTheDocument();

    const solOption = screen.getByRole('option', { name: /SOL/ });
    fireEvent.click(solOption);

    await waitFor(() => {
      expect(screen.getByTestId('balance-switcher-button')).toHaveTextContent('SOL');
    });
    expect(screen.getByTestId('balance-switcher-button')).toHaveTextContent('25.00');
    expect(screen.queryByTestId('balance-switcher-listbox')).not.toBeInTheDocument();
  });

  it('offers GC and SC to a US user', async () => {
    seedStore('US', US_BALANCE);
    mockedApi.getBalance.mockResolvedValue({ data: { success: true, data: US_BALANCE } });
    render(<BalanceSwitcher />);

    const button = await screen.findByTestId('balance-switcher-button');
    expect(button).toHaveTextContent('GC');
    expect(button).toHaveTextContent('1,000.00');

    fireEvent.click(button);
    expect(screen.getByRole('option', { name: /Gold Coins/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Sweeps Coins/ })).toBeInTheDocument();
  });

  it('offers an entry point to the cashier', async () => {
    const onOpenCashier = jest.fn();
    render(<BalanceSwitcher onOpenCashier={onOpenCashier} />);

    fireEvent.click(await screen.findByTestId('balance-switcher-button'));
    fireEvent.click(await screen.findByTestId('balance-switcher-cashier'));

    expect(onOpenCashier).toHaveBeenCalled();
    expect(screen.queryByTestId('balance-switcher-listbox')).not.toBeInTheDocument();
  });
});

describe('buildBalanceOptions', () => {
  const balance = {
    goldCoins: '10',
    sweepsCoins: '20',
    cryptoBalances: { CRYPTO_SOL: '5', CRYPTO_ETH: '0' },
  };

  it('always offers GC and SC for a US user', () => {
    const options = buildBalanceOptions(balance, 'US');
    expect(options.map((o) => o.currency)).toEqual(['GOLD_COINS', 'SWEEPS_COINS']);
  });

  it('includes only non-zero holdings for a GLOBAL user', () => {
    const options = buildBalanceOptions(balance, 'GLOBAL');
    expect(options.map((o) => o.currency)).toEqual(['GOLD_COINS', 'SWEEPS_COINS', 'CRYPTO_SOL']);
  });

  it('falls back to zero USDT when a GLOBAL user holds nothing', () => {
    const options = buildBalanceOptions(
      { goldCoins: '0', sweepsCoins: '0', cryptoBalances: {} },
      'GLOBAL'
    );
    expect(options).toHaveLength(1);
    expect(options[0].currency).toBe('CRYPTO_USDT');
    expect(options[0].amount).toBe('0');
  });
});
