'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Gamepad2, TrendingUp, Zap, Target, Crown, Coins } from 'lucide-react';
import { formatCurrency, getGameTypeLabel, getVolatilityColor } from '@/utils/helpers';
import { useGameStore, useWalletStore, useUserStore } from '@/store';
import { gameApi } from '@/lib/api';

const gameTypeFilters = [
  { value: '', label: 'All Games', icon: Gamepad2 },
  { value: 'SLOTS', label: 'Slots', icon: Crown },
  { value: 'BLACKJACK', label: 'Blackjack', icon: Target },
  { value: 'ROULETTE', label: 'Roulette', icon: Zap },
  { value: 'POKER', label: 'Poker', icon: Crown },
  { value: 'DICE', label: 'Dice', icon: Zap },
  { value: 'CRASH', label: 'Crash', icon: TrendingUp },
  { value: 'PLINKO', label: 'Plinko', icon: Target },
  { value: 'MINES', label: 'Mines', icon: Zap },
  { value: 'KENO', label: 'Keno', icon: Coins },
];

export default function GamesPage() {
  const { games, setGames } = useGameStore();
  const { balance } = useWalletStore();
  const { region } = useUserStore();
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchGames() {
      setLoading(true);
      try {
        const res = await gameApi.getGames({ isActive: true });
        if (res.data.success) {
          setGames(res.data.data.games);
        }
      } catch (error) {
        console.error('Failed to fetch games:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchGames();
  }, [setGames]);

  const filteredGames = games.filter((game) => {
    if (!filter) return true;
    return game.type === filter;
  });

  const availableBalance = balance?.region === 'US'
    ? balance.goldCoins
    : balance?.cryptoBalances.CRYPTO_USDT || '0';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Casino Games</h1>
          <p className="text-muted-foreground mt-1">
            {games.length} games available · Balance: {formatCurrency(availableBalance, region === 'US' ? 'GOLD_COINS' : 'CRYPTO_USDT')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-input bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none bg-no-repeat bg-right pr-10"
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")` }}
          >
            {gameTypeFilters.map((type) => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <Card key={i} className="animate-pulse h-64" />
          ))}
        </div>
      ) : filteredGames.length === 0 ? (
        <Card className="py-12 text-center">
          <Gamepad2 className="w-16 h-16 text-muted-foreground/40 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">No games found</h3>
          <p className="text-muted-foreground">Try adjusting your filters</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredGames.map((game) => (
            <GameCard key={game.id} game={game} balance={availableBalance} region={region} onPlay={() => handlePlay(game)} />
          ))}
        </div>
      )}
    </div>
  );
}

interface GameCardProps {
  game: any;
  balance: string;
  region: string | null;
  onPlay: () => void;
}

function GameCard({ game, balance, region, onPlay }: GameCardProps) {
  const currency = region === 'US' ? 'GOLD_COINS' : 'CRYPTO_USDT';
  const minBet = parseFloat(game.minBet);
  const canAfford = parseFloat(balance) >= minBet;

  return (
    <Card className="group h-full flex flex-col">
      <div className="aspect-video relative bg-gradient-to-br from-primary/10 via-secondary to-secondary/60 rounded-t-xl overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center">
          <Gamepad2 className="w-16 h-16 text-primary/30" />
        </div>
        <div className="absolute top-3 right-3">
          <Badge variant="outline" size="sm" className={getVolatilityColor(game.volatility)}>
            {game.volatility}
          </Badge>
        </div>
        <div className="absolute bottom-3 left-3 right-3 flex justify-between">
          <Badge variant="default" size="sm">{getGameTypeLabel(game.type)}</Badge>
          <Badge variant="gold" size="sm">RTP: {game.rtp}%</Badge>
        </div>
      </div>
      <CardContent className="flex-1 flex flex-col p-4">
        <h3 className="font-semibold text-foreground truncate mb-1">{game.name}</h3>
        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{game.provider}</p>
        
        <div className="flex items-center justify-between mb-4 pt-3 border-t border-border">
          <span className="text-sm text-muted-foreground">Min Bet</span>
          <span className="font-bold text-foreground">
            {formatCurrency(game.minBet, currency)}
          </span>
        </div>
        
        <Button 
          onClick={onPlay} 
          disabled={!canAfford}
          className="w-full mt-auto"
          variant={canAfford ? 'primary' : 'outline'}
        >
          {canAfford ? 'Play Now' : 'Insufficient Balance'}
        </Button>
      </CardContent>
    </Card>
  );
}

async function handlePlay(game: any) {
  try {
    const res = await gameApi.startSession({
      gameId: game.id,
      currency: 'CRYPTO_USDT',
      initialBet: game.minBet,
    });
    if (res.data.success) {
      window.location.href = `/dashboard/games/${game.id}/play?session=${res.data.data.id}`;
    }
  } catch (error) {
    console.error('Failed to start game:', error);
  }
}