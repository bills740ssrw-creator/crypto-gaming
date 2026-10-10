import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';
import { Github, Twitter, MessageCircle } from 'lucide-react';

const productLinks = [
  { label: 'Casino', href: '/dashboard/games' },
  { label: 'Sportsbook', href: '/dashboard/games' },
  { label: 'Promotions', href: '/#promotions' },
  { label: 'Provably Fair', href: '/#fairness' },
];

const companyLinks = [
  { label: 'About', href: '/#about' },
  { label: 'Blog', href: '/#blog' },
  { label: 'Careers', href: '/#careers' },
  { label: 'Affiliates', href: '/#affiliates' },
];

const supportLinks = [
  { label: 'Help Center', href: '/#support' },
  { label: 'Contact Us', href: '/#contact' },
  { label: 'Responsible Gaming', href: '/#responsible-gaming' },
  { label: 'Terms of Service', href: '/terms' },
  { label: 'Privacy Policy', href: '/privacy' },
];

const socials = [
  { label: 'Twitter', href: 'https://twitter.com', icon: Twitter },
  { label: 'Discord', href: 'https://discord.com', icon: MessageCircle },
  { label: 'GitHub', href: 'https://github.com', icon: Github },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-5">
          <div className="col-span-2">
            <Logo />
            <p className="mt-4 max-w-xs text-sm text-muted-foreground">
              Play provably fair casino games with crypto and sweepstakes coins. Instant
              deposits, lightning-fast withdrawals.
            </p>
            <div className="mt-6 flex items-center gap-3">
              {socials.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={s.label}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                >
                  <s.icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          <FooterColumn title="Product" links={productLinks} />
          <FooterColumn title="Company" links={companyLinks} />
          <FooterColumn title="Support" links={supportLinks} />
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-border pt-8 md:flex-row md:items-center md:justify-between">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} CryptoGaming. All rights reserved. 18+ only. Play
            responsibly.
          </p>
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
              All systems operational
            </span>
            <span>Support: support@cryptogaming.com</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: Array<{ label: string; href: string }>;
}) {
  return (
    <nav aria-label={title}>
      <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">{title}</h3>
      <ul className="mt-4 space-y-3">
        {links.map((link) => (
          <li key={link.label}>
            <Link
              href={link.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
