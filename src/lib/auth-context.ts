'use client';

import { createContext } from 'react';

import type { UseAuthResult } from '@/hooks/use-auth';

/**
 * React context for the shared auth session.
 * Populated by <AuthProvider> (mounted in AppShell).
 * Remains null for routes outside AppShell (e.g. /login).
 *
 * Lives in its own module so that vi.mock('@/hooks/use-auth', …) in tests
 * does not accidentally shadow the context object — tests mock the hook,
 * not the underlying context primitive.
 */
export const AuthContext = createContext<UseAuthResult | null>(null);
