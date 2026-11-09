'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { generateInvitationLinks } from '../../app/rooms/actions';
import type { InvitationLinkForPage } from '../../db/queries/invitations';
import type { Messages } from '../../i18n/messages';
import ButtonSecondary from '../ButtonSecondary';

/**
 * Host-only invitation links (SALLE-04): one link per guest, single use,
 * with the status visible (unused / used by whom / revoked). Generation runs
 * through the server action; the returned tokens are shown immediately as
 * `unused` and `router.refresh()` re-renders the server-fed list, so the
 * statuses stay in sync with the database.
 */
export default function InvitationsPanel({
  roomPublicId,
  initialLinks,
  messages,
}: {
  roomPublicId: string;
  initialLinks: InvitationLinkForPage[] | null;
  messages: Messages;
}) {
  const router = useRouter();
  const [links, setLinks] = useState<InvitationLinkForPage[]>(initialLinks ?? []);
  const [count, setCount] = useState(1);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const handleGenerate = async () => {
    setGenerating(true);
    setGenerateError(false);
    try {
      const result = await generateInvitationLinks({ roomPublicId, count });
      if (result.ok) {
        const now = new Date();
        setLinks((previous) => [
          ...result.tokens.map((token) => ({
            token,
            status: 'unused' as const,
            usedByUsername: null,
            usedByGuest: false,
            createdAt: now,
          })),
          ...previous,
        ]);
        router.refresh();
      } else {
        setGenerateError(true);
      }
    } catch {
      setGenerateError(true);
    } finally {
      setGenerating(false);
    }
  };

  const copyLink = async (token: string) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/i/${token}`);
      setCopiedToken(token);
    } catch {
      // Clipboard unavailable (e.g. insecure context): the link stays
      // selectable in the list, nothing to do.
    }
  };

  const statusLabel = (link: InvitationLinkForPage): string => {
    switch (link.status) {
      case 'unused':
        return messages['lobby.invitations.status.unused'];
      case 'used':
        return messages['lobby.invitations.status.used'];
      case 'revoked':
        return messages['lobby.invitations.status.revoked'];
    }
  };

  return (
    <section
      className="flex flex-col gap-space-md rounded bg-dwarf-slate p-space-md shadow-stone-inner"
      aria-labelledby="invitations-panel-title"
    >
      <div className="flex flex-col gap-space-xs">
        <h3
          id="invitations-panel-title"
          className="font-headline-sm text-headline-sm uppercase tracking-wide text-primary"
        >
          {messages['lobby.invitationsTitle']}
        </h3>
        <p className="font-label-sm text-label-sm text-dwarf-parchmentMuted">
          {messages['lobby.invitationsHint']}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-space-sm">
        <label
          htmlFor="invitation-count"
          className="flex flex-col gap-space-xs font-label-sm text-label-sm uppercase text-dwarf-parchmentMuted"
        >
          {messages['lobby.invitationsCount']}
          <input
            id="invitation-count"
            type="number"
            min={1}
            max={100}
            value={count}
            onChange={(event) => setCount(Number(event.target.value))}
            className="w-24 rounded border border-dwarf-border bg-dwarf-bg px-2 py-1.5 font-mono text-sm text-dwarf-parchment shadow-stone-inner focus:border-dwarf-gold focus:outline-none focus:ring-1 focus:ring-dwarf-gold"
          />
        </label>
        <ButtonSecondary type="button" onClick={handleGenerate} disabled={generating}>
          {messages['lobby.invitationsGenerate']}
        </ButtonSecondary>
      </div>

      {generateError && (
        <p role="alert" className="text-xs font-medium text-dwarf-magma">
          {messages['lobby.invitations.error']}
        </p>
      )}

      {links.length === 0 ? (
        <p className="font-body-sm text-body-sm text-dwarf-parchmentMuted">
          {messages['lobby.invitations.empty']}
        </p>
      ) : (
        <ul className="flex flex-col gap-space-sm">
          {links.map((link) => (
            <li
              key={link.token}
              className="flex flex-col gap-space-xs rounded border border-dwarf-border bg-dwarf-bg p-space-sm"
            >
              <div className="flex flex-wrap items-center gap-space-sm">
                <span className="font-label-sm text-label-sm uppercase text-dwarf-parchmentMuted">
                  {statusLabel(link)}
                </span>
                {link.status === 'used' && (
                  <span className="font-label-sm text-label-sm text-dwarf-parchment">
                    {messages['lobby.invitations.usedBy']}{' '}
                    {link.usedByGuest
                      ? messages['lobby.invitations.usedByGuest']
                      : link.usedByUsername ?? messages['lobby.invitations.usedByGuest']}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-space-sm">
                <code className="min-w-0 flex-1 truncate font-mono text-xs text-dwarf-runeBright">
                  /i/{link.token}
                </code>
                {link.status !== 'revoked' && (
                  <ButtonSecondary
                    type="button"
                    onClick={() => void copyLink(link.token)}
                    className="shrink-0 px-space-sm py-space-xs"
                  >
                    {copiedToken === link.token
                      ? messages['lobby.invitations.copied']
                      : messages['lobby.invitations.copy']}
                  </ButtonSecondary>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
