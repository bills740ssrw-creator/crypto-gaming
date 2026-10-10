'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useUserStore } from '@/store';
import type { RegionType } from '@crypto-gaming/shared';

/**
 * Mirrors the authenticated next-auth session into the zustand user store.
 * Login only populates the JWT/session; the store (which the wallet UI,
 * sidebar, and history pages read) would otherwise stay empty until the
 * user happened to visit the register flow.
 */
export function SessionHydrator() {
  const { data: session, status } = useSession();
  const setUser = useUserStore((state) => state.setUser);

  useEffect(() => {
    if (status !== 'authenticated' || !session?.user) return;
    const user = session.user as unknown as {
      id?: string;
      email?: string | null;
      name?: string | null;
      region?: RegionType;
      isAdmin?: boolean;
    };
    setUser({
      id: user.id ?? null,
      email: user.email ?? null,
      username: user.name ?? null,
      region: user.region ?? null,
      isAdmin: user.isAdmin ?? false,
    });
  }, [session, status, setUser]);

  return null;
}
