import Link from 'next/link';
import { LandingHeader } from '@/components/marketing/LandingHeader';
import { SiteFooter } from '@/components/marketing/SiteFooter';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  ShieldCheck,
  Zap,
  Wallet,
  Headphones,
  Dice5,
  TrendingUp,
  Gem,
  Rocket,
  Target,
  Crown,
  Sparkles,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';

export const dynamic = 'force-static';

export default async function LandingPage() {
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[70vh] bg-hero-radial" />
        <div className="absolute -left-40 top-40 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -right-40 top-72 h-96 w-96 rounded-full bg-gold-500/10 blur-3xl" />
      </div>

      <LandingHeader />

      <main>
        <Hero />
        <TrustBar />
        <FeaturedGames />
        <WhyUs />
        <ProvablyFair />
        <Promotions />
        <FinalCta />
      </main>

      <SiteFooter />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function Hero() {
  return (
    <section className="relative overflow-hidden px-4 pb-20 pt-32 sm:px-6 lg:px-8 lg:pt-40">
      <div className="mx-auto max-w-4xl text-center">
        <Badge variant="success" className="mb-6 animate-slide-up">
          <Sparkles className="mr-1.5 h-3.5 w-3.5" />
          Provably fair · Instant crypto payouts
        </Badge>

        <h1 className="animate-slide-up text-4xl font-black leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
          The casino that
          <br />
          <span className="text-gradient">proves every roll.</span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl animate-slide-up text-base text-muted-foreground sm:text-lg">
          Play slots, blackjack, crash and more with crypto or sweepstakes coins. Deposits
          land in seconds, withdrawals pay out in minutes — and every outcome is verifiable
          on your end.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild size="xl" className="w-full sm:w-auto">
            <Link href="/register">
              Create Free Account
              <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </Button>
          <Button asChild size="xl" variant="secondary" className="w-full sm:w-auto">
            <Link href="/login">I Already Have an Account</Link>
          </Button>
        </div>

        <dl className="mx-auto mt-16 grid max-w-3xl grid-cols-2 gap-6 sm:grid-cols-4">
          {[
            { label: 'Games', value: '40+' },
            { label: 'Avg. payout', value: '< 5 min' },
            { label: 'House edge', value: 'From 1%' },
            { label: 'Currencies', value: '10+' },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-border bg-card/60 p-4">
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                {stat.label}
              </dt>
              <dd className="mt-1 text-2xl font-extrabold text-foreground">{stat.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <LiveTicker />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Live win ticker (decorative, deterministic content — no backend needed)
// ---------------------------------------------------------------------------

const liveWins = [
  { user: 'Degen**42', game: 'Crash', amount: '2,481.90', cur: 'USDT', mult: '12.4x' },
  { user: 'Lucky**07', game: 'Slots', amount: '840.00', cur: 'GC', mult: '5.2x' },
  { user: 'Anon**99', game: 'Blackjack', amount: '1,204.55', cur: 'USDT', mult: '2.0x' },
  { user: 'Whale**11', game: 'Mines', amount: '5,610.00', cur: 'BTC', mult: '8.1x' },
  { user: 'Fast**88', game: 'Dice', amount: '318.75', cur: 'SOL', mult: '3.4x' },
  { user: 'Nova**23', game: 'Roulette', amount: '972.10', cur: 'ETH', mult: '6.0x' },
  { user: 'Ace**05', game: 'Plinko', amount: '1,845.30', cur: 'USDC', mult: '9.7x' },
  { user: 'Moon**64', game: 'Crash', amount: '4,120.00', cur: 'USDT', mult: '15.2x' },
];

function LiveTicker() {
  const doubled = [...liveWins, ...liveWins];
  return (
    <div className="mt-16 overflow-hidden rounded-2xl border border-border bg-card/60 py-3">
      <div className="flex w-max animate-ticker gap-8 whitespace-nowrap">
        {doubled.map((win, i) => (
          <span key={i} className="inline-flex items-center gap-2 text-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
            <span className="text-muted-foreground">{win.user}</span>
            <span className="text-foreground">won</span>
            <span className="font-bold text-primary">
              {win.amount} {win.cur}
            </span>
            <span className="text-muted-foreground">on {win.game}</span>
            <Badge variant="gold" size="sm">
              {win.mult}
            </Badge>
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trust bar
// ---------------------------------------------------------------------------

function TrustBar() {
  const items = [
    { icon: Zap, label: 'Instant deposits' },
    { icon: Wallet, label: 'Fast withdrawals' },
    { icon: ShieldCheck, label: 'Provably fair' },
    { icon: Headphones, label: '24/7 support' },
  ];
  return (
    <section className="border-y border-border bg-surface/60">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-4 px-4 py-8 sm:px-6 lg:grid-cols-4 lg:px-8">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-center gap-2.5">
            <item.icon className="h-5 w-5 text-primary" aria-hidden />
            <span className="text-sm font-medium text-foreground">{item.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Featured games
// ---------------------------------------------------------------------------

const featuredGames = [
  {
    name: 'Crash',
    description: 'Cash out before the multiplier crashes. Pure nerve.',
    icon: TrendingUp,
    gradient: 'from-rose-500/20 via-orange-500/10 to-transparent',
    rtp: '99%',
    tag: 'Popular',
  },
  {
    name: 'Slots',
    description: 'Hundreds of reels, massive jackpots, daily drops.',
    icon: Gem,
    gradient: 'from-violet-500/20 via-fuchsia-500/10 to-transparent',
    rtp: '96.5%',
    tag: 'Jackpots',
  },
  {
    name: 'Blackjack',
    description: 'Beat the dealer to 21. Classic tables, live stakes.',
    icon: Target,
    gradient: 'from-emerald-500/20 via-teal-500/10 to-transparent',
    rtp: '99.5%',
    tag: 'Low edge',
  },
  {
    name: 'Dice',
    description: 'Roll under or over. The fastest game on the site.',
    icon: Dice5,
    gradient: 'from-sky-500/20 via-cyan-500/10 to-transparent',
    rtp: '99%',
    tag: 'Instant',
  },
  {
    name: 'Mines',
    description: 'Pick your squares, dodge the mines, cash out big.',
    icon: Rocket,
    gradient: 'from-amber-500/20 via-yellow-500/10 to-transparent',
    rtp: '97%',
    tag: 'Trending',
  },
  {
    name: 'Roulette',
    description: 'European single-zero wheel. Red, black, or bold.',
    icon: Crown,
    gradient: 'from-red-500/20 via-rose-500/10 to-transparent',
    rtp: '97.3%',
    tag: 'Classic',
  },
];

function FeaturedGames() {
  return (
    <section id="games" className="px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          eyebrow="The games"
          title="Something for every kind of player"
          description="From instant-win classics to high-variance thrillers — all provably fair, all playable with crypto or coins."
        />

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {featuredGames.map((game) => (
            <article
              key={game.name}
              className="group relative overflow-hidden rounded-2xl border border-border bg-card p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-glow-primary"
            >
              <div
                className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${game.gradient} opacity-60 transition-opacity group-hover:opacity-100`}
                aria-hidden
              />
              <div className="relative">
                <div className="flex items-start justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-surface-raised">
                    <game.icon className="h-6 w-6 text-primary" aria-hidden />
                  </div>
                  <Badge variant="gold" size="sm">
                    {game.tag}
                  </Badge>
                </div>
                <h3 className="mt-5 text-lg font-bold">{game.name}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{game.description}</p>
                <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground">
                    RTP
                  </span>
                  <span className="font-mono text-sm font-bold text-primary">{game.rtp}</span>
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-10 text-center">
          <Button asChild size="lg" variant="secondary">
            <Link href="/register">
              Browse all games
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Why us
// ---------------------------------------------------------------------------

const reasons = [
  {
    icon: Zap,
    title: 'Lightning-fast payouts',
    description:
      'Withdrawals are processed automatically on-chain. Most requests settle in under five minutes, any hour of the day.',
  },
  {
    icon: ShieldCheck,
    title: 'Provably fair, always',
    description:
      'Every round uses a server seed + client seed scheme you can verify yourself. No trust required — check the math.',
  },
  {
    icon: Wallet,
    title: 'Crypto & sweepstakes',
    description:
      'Deposit with BTC, ETH, USDT, USDC, SOL and more — or play with Gold and Sweeps coins where sweepstakes rules apply.',
  },
  {
    icon: Headphones,
    title: 'Real humans, 24/7',
    description:
      'Support that actually answers. Live chat and email staffed around the clock by people who know the product.',
  },
];

function WhyUs() {
  return (
    <section id="about" className="border-y border-border bg-surface/40 px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          eyebrow="Why CryptoGaming"
          title="Built for players who read the fine print"
          description="Fast money in, fast money out, and provable fairness on every single bet."
        />
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {reasons.map((reason) => (
            <div
              key={reason.title}
              className="rounded-2xl border border-border bg-card p-6 transition-colors hover:border-primary/40"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                <reason.icon className="h-5 w-5 text-primary" aria-hidden />
              </div>
              <h3 className="mt-4 font-bold">{reason.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {reason.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Provably fair
// ---------------------------------------------------------------------------

const fairnessSteps = [
  {
    step: '01',
    title: 'We commit to a seed',
    description:
      'Before a round starts we publish a hash of the server seed. It cannot change after the fact.',
  },
  {
    step: '02',
    title: 'You add a client seed',
    description:
      'Mix in your own client seed (or use ours). The outcome depends on both — so neither side controls it alone.',
  },
  {
    step: '03',
    title: 'Verify any round',
    description:
      'After the round, reveal the server seed and recompute the result yourself. It will match, every time.',
  },
];

function ProvablyFair() {
  return (
    <section id="fairness" className="px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <Badge variant="outline" className="mb-4">
              Transparency
            </Badge>
            <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
              Don&apos;t trust. <span className="text-gradient">Verify.</span>
            </h2>
            <p className="mt-4 text-muted-foreground">
              Every game on CryptoGaming uses a committed-seed scheme. We can&apos;t change an
              outcome after the fact, and you don&apos;t have to take our word for it — the
              numbers check out in your browser.
            </p>
            <ul className="mt-8 space-y-4">
              {fairnessSteps.map((item) => (
                <li key={item.step} className="flex gap-4">
                  <span className="font-mono text-sm font-bold text-primary">{item.step}</span>
                  <div>
                    <h3 className="font-semibold">{item.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6 shadow-elevated">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <span className="text-sm font-semibold">Round verification</span>
              <Badge variant="success" dot>
                Verified
              </Badge>
            </div>
            <dl className="mt-4 space-y-3 font-mono text-xs">
              {[
                ['Server seed hash', 'a3f9c2…e81b'],
                ['Client seed', 'player-2f81c'],
                ['Nonce', '14,208'],
                ['Result', '12.44x'],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="truncate text-foreground">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-5 rounded-xl border border-primary/30 bg-primary/5 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" aria-hidden />
                <p className="text-sm text-foreground">
                  Recomputed result matches the published outcome. This round is provably fair.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Promotions
// ---------------------------------------------------------------------------

const promos = [
  {
    title: 'Welcome package',
    value: '100%',
    suffix: 'up to 1 BTC',
    description: 'First deposit matched, credited instantly. Wagering applies.',
    highlight: true,
  },
  {
    title: 'Daily reload',
    value: '50%',
    suffix: 'every day',
    description: 'Top up daily and get a match on every reload, all week.',
    highlight: false,
  },
  {
    title: 'Cashback',
    value: '10%',
    suffix: 'weekly',
    description: 'A slice of net losses returned to your balance every Monday.',
    highlight: false,
  },
];

function Promotions() {
  return (
    <section id="promotions" className="border-y border-border bg-surface/40 px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          eyebrow="Promotions"
          title="Bonuses that don&apos;t hide the terms"
          description="Clear wagering requirements, instant crediting, and rewards for coming back."
        />
        <div className="mt-14 grid gap-5 lg:grid-cols-3">
          {promos.map((promo) => (
            <div
              key={promo.title}
              className={`relative overflow-hidden rounded-2xl border p-6 ${
                promo.highlight
                  ? 'border-primary/50 bg-gradient-to-b from-primary/10 to-card shadow-glow-primary'
                  : 'border-border bg-card'
              }`}
            >
              {promo.highlight && (
                <Badge variant="success" className="absolute right-5 top-5">
                  Best value
                </Badge>
              )}
              <p className="text-sm uppercase tracking-wider text-muted-foreground">
                {promo.title}
              </p>
              <p className="mt-3 text-4xl font-black text-gradient">{promo.value}</p>
              <p className="mt-1 font-semibold">{promo.suffix}</p>
              <p className="mt-3 text-sm text-muted-foreground">{promo.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Final CTA
// ---------------------------------------------------------------------------

function FinalCta() {
  return (
    <section id="support" className="px-4 py-24 sm:px-6 lg:px-8">
      <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl border border-border bg-card px-6 py-16 text-center sm:px-16">
        <div className="pointer-events-none absolute inset-0 bg-hero-radial" aria-hidden />
        <div className="relative">
          <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
            Ready to play <span className="text-gradient">provably fair?</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Create an account in under a minute. Deposit crypto, grab your welcome bonus, and
            verify your first round yourself.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="xl">
              <Link href="/register">
                Get Started Free
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button asChild size="xl" variant="ghost">
              <Link href="/login">Log In</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Shared section heading
// ---------------------------------------------------------------------------

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-primary">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">{title}</h2>
      <p className="mt-4 text-muted-foreground">{description}</p>
    </div>
  );
}
