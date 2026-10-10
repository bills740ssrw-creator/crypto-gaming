import { PrismaClient, CurrencyType, RegionType, GameType, WalletType } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { generateReferralCode } from '@crypto-gaming/shared';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  const adminPassword = await bcrypt.hash('Admin123!', 12);
  const userPassword = await bcrypt.hash('User123!', 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@cryptogaming.com' },
    update: {},
    create: {
      email: 'admin@cryptogaming.com',
      username: 'admin',
      passwordHash: adminPassword,
      region: RegionType.GLOBAL,
      isAdmin: true,
      isActive: true,
      kycVerified: true,
      kycLevel: 3,
      referralCode: generateReferralCode('admin'),
    },
  });

  console.log('✅ Admin user created:', admin.email);

  const testUser = await prisma.user.upsert({
    where: { email: 'user@cryptogaming.com' },
    update: {},
    create: {
      email: 'user@cryptogaming.com',
      username: 'testuser',
      passwordHash: userPassword,
      region: RegionType.US,
      isAdmin: false,
      isActive: true,
      kycVerified: true,
      kycLevel: 1,
      referralCode: generateReferralCode('testuser'),
      referredBy: admin.id,
    },
  });

  console.log('✅ Test user created:', testUser.email);

  const globalUser = await prisma.user.upsert({
    where: { email: 'global@cryptogaming.com' },
    update: {},
    create: {
      email: 'global@cryptogaming.com',
      username: 'globaluser',
      passwordHash: userPassword,
      region: RegionType.GLOBAL,
      isAdmin: false,
      isActive: true,
      kycVerified: true,
      kycLevel: 2,
      referralCode: generateReferralCode('globaluser'),
    },
  });

  console.log('✅ Global user created:', globalUser.email);

  const usWallets = [
    { userId: testUser.id, currency: CurrencyType.GOLD_COINS, walletType: WalletType.DEPOSIT, balance: '10000.00' },
    { userId: testUser.id, currency: CurrencyType.SWEEPS_COINS, walletType: WalletType.DEPOSIT, balance: '500.00' },
  ];

  const globalWallets = [
    { userId: globalUser.id, currency: CurrencyType.CRYPTO_BTC, walletType: WalletType.HOT, balance: '0.5' },
    { userId: globalUser.id, currency: CurrencyType.CRYPTO_ETH, walletType: WalletType.HOT, balance: '10.0' },
    { userId: globalUser.id, currency: CurrencyType.CRYPTO_USDT, walletType: WalletType.HOT, balance: '5000.00' },
    { userId: globalUser.id, currency: CurrencyType.CRYPTO_USDC, walletType: WalletType.HOT, balance: '3000.00' },
    { userId: admin.id, currency: CurrencyType.CRYPTO_BTC, walletType: WalletType.HOT, balance: '0.5' },
    { userId: admin.id, currency: CurrencyType.CRYPTO_ETH, walletType: WalletType.HOT, balance: '10.0' },
    { userId: admin.id, currency: CurrencyType.CRYPTO_USDT, walletType: WalletType.HOT, balance: '5000.00' },
    { userId: admin.id, currency: CurrencyType.CRYPTO_USDC, walletType: WalletType.HOT, balance: '3000.00' },
  ];

  for (const wallet of usWallets) {
    await prisma.cryptoWallet.upsert({
      where: { userId_currency: { userId: wallet.userId, currency: wallet.currency } },
      update: { balance: wallet.balance, isActive: true },
      create: {
        ...wallet,
        address: `wallet_${wallet.userId}_${wallet.currency}`,
      },
    });
  }

  for (const wallet of globalWallets) {
    await prisma.cryptoWallet.upsert({
      where: { userId_currency: { userId: wallet.userId, currency: wallet.currency } },
      update: { balance: wallet.balance, isActive: true },
      create: {
        ...wallet,
        address: `wallet_${wallet.userId}_${wallet.currency}`,
      },
    });
  }

  console.log('✅ Wallets created');

  const defaultGames = [
    {
      name: 'Classic Slots',
      type: GameType.SLOTS,
      provider: 'Internal',
      minBet: '0.10',
      maxBet: '100.00',
      rtp: 96.5,
      volatility: 'MEDIUM',
      isProvablyFair: true,
      config: { reels: 5, rows: 3, paylines: 20 },
    },
    {
      name: 'Blackjack Classic',
      type: GameType.BLACKJACK,
      provider: 'Internal',
      minBet: '1.00',
      maxBet: '500.00',
      rtp: 99.5,
      volatility: 'LOW',
      isProvablyFair: true,
      config: { decks: 6, blackjackPays: '3:2' },
    },
    {
      name: 'European Roulette',
      type: GameType.ROULETTE,
      provider: 'Internal',
      minBet: '0.50',
      maxBet: '200.00',
      rtp: 97.3,
      volatility: 'LOW',
      isProvablyFair: true,
      config: { variant: 'european', zeroCount: 1 },
    },
    {
      name: 'Texas Hold\'em Poker',
      type: GameType.POKER,
      provider: 'Internal',
      minBet: '5.00',
      maxBet: '1000.00',
      rtp: 98.0,
      volatility: 'HIGH',
      isProvablyFair: true,
      config: { variant: 'texas_holdem', maxPlayers: 6 },
    },
    {
      name: 'Baccarat',
      type: GameType.BACCARAT,
      provider: 'Internal',
      minBet: '1.00',
      maxBet: '500.00',
      rtp: 98.9,
      volatility: 'LOW',
      isProvablyFair: true,
      config: { variant: 'punto_banco', commission: 0.05 },
    },
    {
      name: 'Dice',
      type: GameType.DICE,
      provider: 'Internal',
      minBet: '0.01',
      maxBet: '100.00',
      rtp: 99.0,
      volatility: 'VERY_HIGH',
      isProvablyFair: true,
      config: { sides: 100 },
    },
    {
      name: 'Crash',
      type: GameType.CRASH,
      provider: 'Internal',
      minBet: '0.10',
      maxBet: '100.00',
      rtp: 97.0,
      volatility: 'VERY_HIGH',
      isProvablyFair: true,
      config: { maxMultiplier: 1000 },
    },
    {
      name: 'Plinko',
      type: GameType.PLINKO,
      provider: 'Internal',
      minBet: '0.10',
      maxBet: '100.00',
      rtp: 96.0,
      volatility: 'HIGH',
      isProvablyFair: true,
      config: { rows: 16, risk: 'medium' },
    },
    {
      name: 'Mines',
      type: GameType.MINES,
      provider: 'Internal',
      minBet: '0.10',
      maxBet: '100.00',
      rtp: 95.0,
      volatility: 'HIGH',
      isProvablyFair: true,
      config: { gridSize: 5, mines: 3 },
    },
    {
      name: 'Keno',
      type: GameType.KENO,
      provider: 'Internal',
      minBet: '0.10',
      maxBet: '50.00',
      rtp: 94.0,
      volatility: 'MEDIUM',
      isProvablyFair: true,
      config: { numbers: 80, picks: 10 },
    },
    {
      name: 'Tic-Tac-Toe PvP',
      type: GameType.TIC_TAC_TOE,
      provider: 'Internal',
      minBet: '1.00',
      maxBet: '500.00',
      rtp: 96.0,
      volatility: 'LOW',
      isProvablyFair: false,
      config: { moveTimeoutMs: 3000, maxTokensPerPlayer: 3, rakePercent: 4 },
    },
    {
      name: 'Rock Paper Scissors',
      type: GameType.ROCK_PAPER_SCISSORS,
      provider: 'Internal',
      minBet: '0.50',
      maxBet: '250.00',
      rtp: 97.5,
      volatility: 'MEDIUM',
      isProvablyFair: true,
      config: { baseWinMultiplier: 1.95, streakBonusStep: 0.1, maxStreakMultiplier: 1.5 },
    },
    {
      name: 'Path Elimination',
      type: GameType.PATH_ELIMINATION,
      provider: 'Internal',
      minBet: '0.50',
      maxBet: '250.00',
      rtp: 96.0,
      volatility: 'HIGH',
      isProvablyFair: true,
      config: {
        rows: [
          { winProbability: 0.95, multiplier: 1.0105 },
          { winProbability: 0.85, multiplier: 1.1294 },
          { winProbability: 0.7, multiplier: 1.3714 },
          { winProbability: 0.55, multiplier: 1.7455 },
          { winProbability: 0.4, multiplier: 2.4 },
        ],
      },
    },
  ];

  for (const game of defaultGames) {
    await prisma.game.upsert({
      where: { id: game.name },
      update: {},
      create: game,
    });
  }

  console.log('✅ Default games created');

  await prisma.systemConfig.upsert({
    where: { key: 'maintenance_mode' },
    update: {},
    create: { key: 'maintenance_mode', value: false },
  });

  await prisma.systemConfig.upsert({
    where: { key: 'sweeps_conversion_rate' },
    update: {},
    create: { key: 'sweeps_conversion_rate', value: 1.00 },
  });

  await prisma.systemConfig.upsert({
    where: { key: 'min_redemption' },
    update: {},
    create: { key: 'min_redemption', value: 50.00 },
  });

  await prisma.systemConfig.upsert({
    where: { key: 'max_daily_redemption' },
    update: {},
    create: { key: 'max_daily_redemption', value: 5000.00 },
  });

  console.log('✅ System config created');

  console.log('🎉 Database seed completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });