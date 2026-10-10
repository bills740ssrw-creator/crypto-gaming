import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import WalletPage from '@/app/dashboard/wallet/page';
import { walletApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { useUserStore, useWalletStore } from '@/store';
import type { Balance, RegionType } from '@crypto-gaming/shared';

jest.mock('@/lib/api', () => ({
  walletApi: {
    getBalance: jest.fn(),
    getHistory: jest.fn(),
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
  getHistory: jest.Mock;
  requestDeposit: jest.Mock;
  requestWithdrawal: jest.Mock;
};

// A global-region user is crypto-only: the gold/sweeps columns are zero unless
// someone actually funded a sweeps wallet for them.
const GLOBAL_BALANCE: Balance = {
  goldCoins: '0',
  sweepsCoins: '0',
  cryptoBalances: { CRYPTO_USDT: '100', CRYPTO_BTC: '0.5' },
  region: 'GLOBAL',
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const GLOBAL_BALANCE_WITH_SWEEPS: Balance = {
  goldCoins: '0',
  sweepsCoins: '200',
  cryptoBalances: { CRYPTO_USDT: '100' },
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

function seedStore(region: RegionType, balance: Balance) {
  useUserStore.setState({ region, id: 'u1', isAdmin: false });
  useWalletStore.setState({ balance, wallets: {}, transactions: [], isLoading: false });
}

function stubApi(balance: Balance) {
  mockedApi.getBalance.mockResolvedValue({ data: { success: true, data: balance } });
  mockedApi.getHistory.mockResolvedValue({ data: { success: true, data: { items: [] } } });
}

function openTab(name: 'Deposit' | 'Withdraw' | 'History') {
  fireEvent.click(screen.getByRole('tab', { name }));
}

beforeEach(() => {
  jest.clearAllMocks();
  useUserStore.setState({ region: 'GLOBAL', id: null, isAdmin: false });
  useWalletStore.setState({ balance: null, wallets: {}, transactions: [], isLoading: false });
  stubApi(GLOBAL_BALANCE);
});

describe('Wallet page - currency selection by region', () => {
  it('offers the seven crypto currencies to a global user', async () => {
    seedStore('GLOBAL', GLOBAL_BALANCE);
    render(<WalletPage />);

    openTab('Deposit');
    const select = await screen.findByRole('combobox');
    const options = within(select).getAllByRole('option').map((o) => o.textContent);

    expect(options).toEqual([
      'Bitcoin (BTC)',
      'Ethereum (ETH)',
      'Tether (USDT)',
      'USD Coin (USDC)',
      'Litecoin (LTC)',
      'Dogecoin (DOGE)',
      'Solana (SOL)',
    ]);
  });

  it('offers only Gold Coins and Sweeps Coins to a US user', async () => {
    seedStore('US', US_BALANCE);
    stubApi(US_BALANCE);
    render(<WalletPage />);

    openTab('Deposit');
    const select = await screen.findByRole('combobox');
    const options = within(select).getAllByRole('option').map((o) => o.textContent);

    expect(options).toEqual(['Gold Coins', 'Sweeps Coins']);
  });

  it('switches the selected currency when the user picks another one', async () => {
    seedStore('GLOBAL', GLOBAL_BALANCE);
    render(<WalletPage />);

    openTab('Deposit');
    const select = await screen.findByRole('combobox');
    expect(select).toHaveValue('CRYPTO_USDT');

    fireEvent.change(select, { target: { value: 'CRYPTO_LTC' } });
    expect(screen.getByRole('combobox')).toHaveValue('CRYPTO_LTC');
  });

  it('sends the picked currency through to the deposit request', async () => {
    seedStore('GLOBAL', GLOBAL_BALANCE);
    mockedApi.requestDeposit.mockResolvedValue({ data: { success: true, data: {} } });
    render(<WalletPage />);

    openTab('Deposit');
    const select = await screen.findByRole('combobox');
    fireEvent.change(select, { target: { value: 'CRYPTO_BTC' } });
    fireEvent.change(screen.getByPlaceholderText('Enter amount'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate Deposit Address' }));

    await waitFor(() =>
      expect(mockedApi.requestDeposit).toHaveBeenCalledWith({
        currency: 'CRYPTO_BTC',
        amount: '25',
      })
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Deposit address generated')
    );
  });

  it('shows the region badge in the page header', async () => {
    seedStore('GLOBAL', GLOBAL_BALANCE);
    render(<WalletPage />);

    expect(await screen.findByText('GLOBAL')).toBeInTheDocument();
  });
});

describe('Wallet page - deposit validation', () => {
  it('rejects an empty amount without calling the API', async () => {
    seedStore('GLOBAL', GLOBAL_BALANCE);
    render(<WalletPage />);

    openTab('Deposit');
    await screen.findByRole('combobox');
    fireEvent.click(screen.getByRole('button', { name: 'Generate Deposit Address' }));

    expect(toast.error).toHaveBeenCalledWith('Enter a valid amount');
    expect(mockedApi.requestDeposit).not.toHaveBeenCalled();
  });

  it('never submits a below-minimum amount', async () => {
    seedStore('GLOBAL', GLOBAL_BALANCE);
    render(<WalletPage />);

    openTab('Deposit');
    await screen.findByRole('combobox');
    fireEvent.change(screen.getByPlaceholderText('Enter amount'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate Deposit Address' }));

    // The input carries min="0.01", so the browser rejects the value and the
    // submit handler never runs. Either way nothing reaches the API.
    expect(mockedApi.requestDeposit).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe('Wallet page - withdrawal validation', () => {
  it('requires a destination address', async () => {
    seedStore('GLOBAL', GLOBAL_BALANCE);
    render(<WalletPage />);

    openTab('Withdraw');
    await screen.findByRole('combobox');
    fireEvent.change(screen.getByPlaceholderText('Enter amount'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Request Withdrawal' }));

    expect(toast.error).toHaveBeenCalledWith('Enter a destination address');
    expect(mockedApi.requestWithdrawal).not.toHaveBeenCalled();
  });

  it('rejects an empty amount', async () => {
    seedStore('GLOBAL', GLOBAL_BALANCE);
    render(<WalletPage />);

    openTab('Withdraw');
    await screen.findByRole('combobox');
    fireEvent.change(screen.getByPlaceholderText('Enter wallet address'), {
      target: { value: '0xabc' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Request Withdrawal' }));

    expect(toast.error).toHaveBeenCalledWith('Enter a valid amount');
    expect(mockedApi.requestWithdrawal).not.toHaveBeenCalled();
  });

  it('submits a valid withdrawal request', async () => {
    seedStore('GLOBAL', GLOBAL_BALANCE);
    mockedApi.requestWithdrawal.mockResolvedValue({ data: { success: true, data: {} } });
    render(<WalletPage />);

    openTab('Withdraw');
    await screen.findByRole('combobox');
    fireEvent.change(screen.getByPlaceholderText('Enter amount'), { target: { value: '10' } });
    fireEvent.change(screen.getByPlaceholderText('Enter wallet address'), {
      target: { value: '0xabc' },
    });
    fireEvent.change(screen.getByPlaceholderText('e.g., ERC20, BEP20, TRC20'), {
      target: { value: 'TRC20' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Request Withdrawal' }));

    await waitFor(() =>
      expect(mockedApi.requestWithdrawal).toHaveBeenCalledWith({
        currency: 'CRYPTO_USDT',
        amount: '10',
        address: '0xabc',
        network: 'TRC20',
      })
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Withdrawal requested'));
  });
});

describe('Wallet page - overview balances', () => {
  it('shows only non-zero crypto balances for a global user', async () => {
    seedStore('GLOBAL', GLOBAL_BALANCE);
    render(<WalletPage />);

    // The card label is split across text nodes by the leading currency icon.
    expect(await screen.findByText(/Bitcoin \(BTC\)/)).toBeInTheDocument();
    expect(screen.getByText(/Tether \(USDT\)/)).toBeInTheDocument();

    expect(screen.queryByText(/Ethereum \(ETH\)/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Litecoin \(LTC\)/)).not.toBeInTheDocument();

    expect(screen.getAllByText('Available')).toHaveLength(2);
  });

  it('renders both coin cards for a US user even at zero balance', async () => {
    seedStore('US', US_BALANCE);
    stubApi(US_BALANCE);
    render(<WalletPage />);

    expect(await screen.findByText(/Gold Coins/)).toBeInTheDocument();
    expect(screen.getByText(/Sweeps Coins/)).toBeInTheDocument();
    expect(screen.getAllByText('Available')).toHaveLength(2);
  });
});

describe('Wallet page - history', () => {
  it('shows an empty state when there are no transactions', async () => {
    seedStore('GLOBAL', GLOBAL_BALANCE);
    render(<WalletPage />);

    openTab('History');
    expect(await screen.findByText('No transactions yet')).toBeInTheDocument();
  });
});

describe('Wallet page - overview shows funded sweeps wallets', () => {
  it('renders a sweeps card for a global user who actually holds sweeps', async () => {
    seedStore('GLOBAL', GLOBAL_BALANCE_WITH_SWEEPS);
    stubApi(GLOBAL_BALANCE_WITH_SWEEPS);
    render(<WalletPage />);

    expect(await screen.findByText(/Sweeps Coins/)).toBeInTheDocument();
    expect(screen.getByText(/Tether \(USDT\)/)).toBeInTheDocument();
    // Gold is still empty, so it stays hidden.
    expect(screen.queryByText(/Gold Coins/)).not.toBeInTheDocument();
  });
});

describe('Wallet page - deposit address modal', () => {
  const ADDRESS = 'wallet_u1_CRYPTO_BTC_1791633794792';
  let writeText: jest.Mock;

  beforeEach(() => {
    writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    });
  });

  it('opens with a QR code and the address once a deposit is generated', async () => {
    seedStore('GLOBAL', GLOBAL_BALANCE);
    mockedApi.requestDeposit.mockResolvedValue({
      data: { success: true, data: { address: ADDRESS, amount: '25', currency: 'CRYPTO_BTC' } },
    });
    render(<WalletPage />);

    openTab('Deposit');
    await screen.findByRole('combobox');
    fireEvent.change(screen.getByPlaceholderText('Enter amount'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate Deposit Address' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByTestId('deposit-address')).toHaveTextContent(ADDRESS);
    const qr = within(dialog).getByTestId('deposit-qr');
    const svg = qr.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('viewBox')).toMatch(/^0 0 \d+ \d+$/);
  });

  it('copies the address and flips the button to a Copied! state', async () => {
    seedStore('GLOBAL', GLOBAL_BALANCE);
    mockedApi.requestDeposit.mockResolvedValue({
      data: { success: true, data: { address: ADDRESS, amount: '25', currency: 'CRYPTO_BTC' } },
    });
    render(<WalletPage />);

    openTab('Deposit');
    await screen.findByRole('combobox');
    fireEvent.change(screen.getByPlaceholderText('Enter amount'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate Deposit Address' }));

    const copyButton = await screen.findByRole('button', { name: /Copy Address/ });
    fireEvent.click(copyButton);

    expect(writeText).toHaveBeenCalledWith(ADDRESS);
    expect(await screen.findByRole('button', { name: /Copied!/ })).toBeInTheDocument();
  });

  it('stays closed when the deposit response carries no address', async () => {
    seedStore('GLOBAL', GLOBAL_BALANCE);
    mockedApi.requestDeposit.mockResolvedValue({ data: { success: true, data: {} } });
    render(<WalletPage />);

    openTab('Deposit');
    await screen.findByRole('combobox');
    fireEvent.change(screen.getByPlaceholderText('Enter amount'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate Deposit Address' }));

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
