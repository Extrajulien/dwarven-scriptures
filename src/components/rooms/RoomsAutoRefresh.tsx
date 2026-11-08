'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import type { Messages } from '../../i18n/messages';

/**
 * JOIN-02: refreshes the explorer route every few seconds so the room list
 * updates without a manual reload. `router.refresh()` re-renders the server
 * components with fresh data while keeping the client state — a plain
 * interval, no polling endpoint, no re-mount flicker.
 */
export default function RoomsAutoRefresh({
  intervalMs = 5000,
  messages,
}: {
  intervalMs?: number;
  messages: Messages;
}) {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => {
      router.refresh();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [router, intervalMs]);

  return (
    <span className="inline-flex items-center gap-space-xs font-label-sm text-label-sm uppercase text-dwarf-parchmentMuted">
      <span aria-hidden="true" className="h-2 w-2 rounded-full bg-tertiary animate-pulse" />
      {messages['explorer.autoRefresh']}
    </span>
  );
}
