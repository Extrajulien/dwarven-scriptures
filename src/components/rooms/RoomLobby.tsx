'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  closeRoom,
  kickMember,
  leaveRoom,
  transferHost,
} from '../../app/rooms/actions';
import type { InvitationLinkForPage } from '../../db/queries/invitations';
import type { Messages } from '../../i18n/messages';
import type { MemberInfo } from '../../realtime/protocol';
import { useRoomSocket } from '../../realtime/useRoomSocket';
import ButtonPrimary from '../ButtonPrimary';
import ButtonSecondary from '../ButtonSecondary';
import SectionHeader from '../SectionHeader';
import UserAvatar from '../UserAvatar';
import GuestAvatar from './GuestAvatar';
import InvitationsPanel from './InvitationsPanel';
import RaceScreen from '../race/RaceScreen';

export type LobbyViewer =
  | { kind: 'user'; publicId: string; username: string }
  | { kind: 'guest'; nickname: string; guestToken: string };

type RoomLobbyProps = {
  roomPublicId: string;
  /** The join credential: an invitation token when present, else the code. */
  roomCode: string;
  invitationToken: string | null;
  viewer: LobbyViewer;
  initialInvitations: InvitationLinkForPage[] | null;
  messages: Messages;
};

const STATUS_KEYS = {
  en_attente: 'lobby.status.en_attente',
  decompte: 'lobby.status.decompte',
  en_course: 'lobby.status.en_course',
  resultats: 'lobby.status.resultats',
  fermee: 'lobby.status.fermee',
} as const;

const VISIBILITY_KEYS = {
  public: 'lobby.visibility.public',
  code: 'lobby.visibility.code',
  private: 'lobby.visibility.private',
} as const;

const ROLE_KEYS = {
  host: 'lobby.role.host',
  participant: 'lobby.role.participant',
  spectator: 'lobby.role.spectator',
} as const;

function memberIdentity(member: MemberInfo): string {
  return member.kind === 'user' ? `user:${member.publicId}` : `guest:${member.guestToken}`;
}

function memberDisplayName(member: MemberInfo, messages: Messages): string {
  if (member.kind === 'user') {
    return member.username;
  }
  return member.nickname ?? messages['lobby.guestPlaceholder'];
}

function optionChip(value: boolean, messages: Messages): string {
  return value ? messages['lobby.option.on'] : messages['lobby.option.off'];
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-space-xs border-b border-dwarf-border/40 py-space-xs last:border-b-0">
      <span className="font-label-sm text-label-sm uppercase text-dwarf-parchmentMuted">{label}</span>
      <span className="font-body-sm text-body-sm text-dwarf-parchment">{value}</span>
    </div>
  );
}

function configLabel(key: keyof Messages, messages: Messages): string {
  return messages[key];
}

/**
 * Live room lobby (SALLE-01/03/05/07, CONF-12): the authoritative snapshot
 * from `useRoomSocket` drives the room header, the config summary, the live
 * member list and the host controls. A kicked member is redirected home with
 * a notice (SALLE-07); a closed room shows the closed screen; config and
 * host changes re-render from the snapshot (CONF-12).
 */
export default function RoomLobby({
  roomPublicId,
  roomCode,
  invitationToken,
  viewer,
  initialInvitations,
  messages,
}: RoomLobbyProps) {
  const router = useRouter();
  const { status, snapshot, error, race, join, leave, startRace, quitRace, sendRaceProgress } =
    useRoomSocket();

  const joinedRef = useRef(false);
  const [leftByUser, setLeftByUser] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmKickTarget, setConfirmKickTarget] = useState<string | null>(null);
  const [transferTarget, setTransferTarget] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (joinedRef.current) {
      return;
    }
    joinedRef.current = true;
    join(invitationToken ? { invitationToken } : { code: roomCode });
  }, [join, invitationToken, roomCode]);

  // SALLE-07: the kicked member is told on the way out and sent home.
  useEffect(() => {
    if (error?.code === 'kicked') {
      router.replace('/?notice=kicked');
    }
  }, [error, router]);

  const isHost = viewer.kind === 'user' && snapshot !== null && snapshot.room.host.publicId === viewer.publicId;

  const handleCloseRoom = async () => {
    setConfirmClose(false);
    setBusy(true);
    try {
      await closeRoom({ roomPublicId: snapshot?.room.publicId ?? roomPublicId });
    } finally {
      setBusy(false);
    }
    // The hub broadcasts roomClosed; leaving the socket shows the closed
    // screen (leftByUser stays false) without a reconnect loop.
    leave();
  };

  const handleKick = async (member: MemberInfo) => {
    setConfirmKickTarget(null);
    setBusy(true);
    try {
      await kickMember(
        member.kind === 'user'
          ? { roomPublicId: snapshot?.room.publicId ?? roomPublicId, targetUserId: member.publicId }
          : { roomPublicId: snapshot?.room.publicId ?? roomPublicId, targetGuestToken: member.guestToken },
      );
    } finally {
      setBusy(false);
    }
  };

  const handleTransfer = async () => {
    if (!transferTarget) {
      return;
    }
    setBusy(true);
    try {
      await transferHost({
        roomPublicId: snapshot?.room.publicId ?? roomPublicId,
        targetUserId: transferTarget,
      });
      setTransferTarget('');
    } finally {
      setBusy(false);
    }
  };

  const handleLeave = async () => {
    setConfirmLeave(false);
    setBusy(true);
    try {
      await leaveRoom({ roomPublicId: snapshot?.room.publicId ?? roomPublicId });
    } finally {
      setBusy(false);
    }
    setLeftByUser(true);
    leave();
    router.replace('/');
  };

  const copyCode = async () => {
    if (!snapshot) {
      return;
    }
    try {
      await navigator.clipboard.writeText(snapshot.room.code);
      setCopied(true);
    } catch {
      // Clipboard unavailable: the code remains selectable text.
    }
  };

  // ---------------------------------------------------------- pre-lobby states
  if (status === 'idle' || status === 'connecting') {
    return (
      <div className="flex flex-col items-center gap-space-md py-space-xl" role="status">
        <GuestAvatar seed={roomPublicId} className="h-16 w-16 text-headline-lg animate-pulse" />
        <p className="font-label-md text-label-md uppercase text-dwarf-parchmentMuted">
          {messages['lobby.connecting']}
        </p>
      </div>
    );
  }

  if (error && error.code !== 'kicked') {
    const errorKey =
      error.code === 'room_full'
        ? 'lobby.error.roomFull'
        : error.code === 'room_not_found'
          ? 'lobby.error.roomNotFound'
          : error.code === 'rate_limited'
            ? 'lobby.error.rateLimited'
            : error.code === 'already_in_room'
              ? 'lobby.error.alreadyInRoom'
              : 'lobby.error.unexpected';
    return (
      <section className="mx-auto flex w-full max-w-md flex-col items-center gap-space-md rounded bg-surface-container-lowest p-space-lg shadow-xl">
        <h1 className="font-headline-sm text-headline-sm uppercase tracking-wide text-error">
          {messages['lobby.error.title']}
        </h1>
        <p role="alert" className="font-body-sm text-body-sm text-dwarf-parchmentMuted">
          {messages[errorKey]}
        </p>
        <ButtonSecondary href="/" className="w-full">
          {messages['lobby.backHome']}
        </ButtonSecondary>
      </section>
    );
  }

  if (!snapshot) {
    if (status === 'closed' && !leftByUser) {
      return (
        <section className="mx-auto flex w-full max-w-md flex-col items-center gap-space-md rounded bg-surface-container-lowest p-space-lg shadow-xl">
          <h1 className="font-headline-sm text-headline-sm uppercase tracking-wide text-error">
            {messages['lobby.closed.title']}
          </h1>
          <p className="font-body-sm text-body-sm text-dwarf-parchmentMuted">
            {messages['lobby.closed.body']}
          </p>
          <ButtonSecondary href="/" className="w-full">
            {messages['lobby.backHome']}
          </ButtonSecondary>
        </section>
      );
    }
    return (
      <div className="flex flex-col items-center gap-space-md py-space-xl" role="status">
        <p className="font-label-md text-label-md uppercase text-dwarf-parchmentMuted">
          {status === 'reconnecting'
            ? messages['lobby.reconnecting']
            : messages['lobby.connecting']}
        </p>
      </div>
    );
  }

  const room = snapshot.room;
  const participants = snapshot.members.filter((member) => member.role === 'participant').length;
  const statusKey = STATUS_KEYS[room.status] ?? STATUS_KEYS.en_attente;
  const visibilityKey = VISIBILITY_KEYS[room.visibility] ?? VISIBILITY_KEYS.public;
  const hostMember = snapshot.members.find(
    (member) => member.kind === 'user' && member.publicId === room.host.publicId,
  );
  const hostDisplayName = hostMember ? memberDisplayName(hostMember, messages) : room.host.username;
  const transferCandidates = snapshot.members.filter(
    (member): member is Extract<MemberInfo, { kind: 'user' }> =>
      member.kind === 'user' && member.publicId !== room.host.publicId,
  );
  const config = room.config;

  // Race screen wiring (COURSE-02/03, GAME-1): the race UI renders for every
  // room status (launch panel while waiting, countdown/race/results view
  // otherwise) and the lobby content stays below it. One socket, one hook —
  // the screen receives the state as props.
  const viewerIdentityValue = viewer.kind === 'user' ? `user:${viewer.publicId}` : `guest:${viewer.guestToken}`;
  const ownMember = snapshot.members.find((member) => memberIdentity(member) === viewerIdentityValue);
  const viewerRole = ownMember?.role ?? 'spectator';
  const participantCount = snapshot.members.filter((member) => member.role === 'participant').length;
  const viewerParticipantId = viewer.kind === 'user' ? viewer.publicId : viewer.guestToken;

  const configRows: Array<{ label: string; value: string }> = [
    {
      label: messages['lobby.config.language'],
      value: configLabel(config.textLanguage === 'fr' ? 'lobby.lang.fr' : 'lobby.lang.en', messages),
    },
    {
      label: messages['lobby.config.complexity'],
      value: configLabel(
        config.textComplexity === 'facile'
          ? 'lobby.complexity.facile'
          : config.textComplexity === 'moyen'
            ? 'lobby.complexity.moyen'
            : 'lobby.complexity.difficile',
        messages,
      ),
    },
    {
      label: messages['lobby.config.textType'],
      value: configLabel(
        config.textType === 'coherent' ? 'lobby.textType.coherent' : 'lobby.textType.random',
        messages,
      ),
    },
    { label: messages['lobby.config.wordCount'], value: String(config.wordCount) },
    {
      label: messages['lobby.config.timeLimit'],
      value:
        config.timeLimitSeconds === null
          ? messages['lobby.config.noTimeLimit']
          : `${String(config.timeLimitSeconds)} s`,
    },
    {
      label: messages['lobby.config.errorMode'],
      value: configLabel(
        config.errorMode === 'accumulate' ? 'lobby.errorMode.accumulate' : 'lobby.errorMode.stop',
        messages,
      ),
    },
    {
      label: messages['lobby.config.options'],
      value: [
        `${messages['lobby.option.punctuation']}: ${optionChip(config.options.punctuation, messages)}`,
        `${messages['lobby.option.numbers']}: ${optionChip(config.options.numbers, messages)}`,
        `${messages['lobby.option.capitals']}: ${optionChip(config.options.capitals, messages)}`,
        `${messages['lobby.option.accents']}: ${optionChip(config.options.accents, messages)}`,
      ].join(' · '),
    },
    {
      label: messages['lobby.config.bonuses'],
      value: config.bonusesEnabled ? messages['lobby.bonuses.on'] : messages['lobby.bonuses.off'],
    },
    {
      label: messages['lobby.config.bots'],
      value:
        config.bots.length === 0
          ? '—'
          : config.bots.map((entry) => `${String(entry.count)}× ${entry.level}`).join(' · '),
    },
  ];

  return (
    <div className="flex flex-col gap-space-lg">
      <RaceScreen
        roomStatus={room.status}
        race={race}
        config={config}
        viewerRole={viewerRole}
        isHost={isHost}
        participantCount={participantCount}
        viewerParticipantId={viewerParticipantId}
        messages={messages}
        onStartRace={startRace}
        onQuitRace={quitRace}
        onSendProgress={sendRaceProgress}
      />

      {/* Room header: code, visibility, status, capacity. */}
      <section className="flex flex-col gap-space-md rounded bg-surface-container-lowest p-space-lg shadow-xl">
        <SectionHeader
          title={messages['raceSection.title']}
          subtitle={messages['raceSection.subtitle']}
        />

        <div className="flex flex-col gap-space-md md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-space-md">
            <span className="rounded bg-dwarf-basalt px-space-md py-space-sm font-mono text-headline-md tracking-[0.3em] text-dwarf-gold shadow-stone-inner">
              {room.code}
            </span>
            <ButtonSecondary type="button" onClick={() => void copyCode()} className="shrink-0">
              {copied ? messages['lobby.copied'] : messages['lobby.copyCode']}
            </ButtonSecondary>
          </div>

          <dl className="flex flex-wrap items-center gap-space-sm font-label-sm text-label-sm uppercase">
            <div className="rounded bg-dwarf-slate px-space-sm py-space-xs text-dwarf-parchmentMuted">
              {messages['lobby.visibilityLabel']}: {messages[visibilityKey]}
            </div>
            <div className="rounded bg-dwarf-slate px-space-sm py-space-xs text-dwarf-parchmentMuted">
              {messages['lobby.statusLabel']}: {messages[statusKey]}
            </div>
            <div
              data-testid="lobby-capacity"
              className="rounded bg-dwarf-slate px-space-sm py-space-xs text-dwarf-gold"
            >
              {messages['lobby.capacityLabel']}: {participants} / {room.capacity}
            </div>
          </dl>
        </div>

        {status === 'reconnecting' && (
          <p role="status" className="font-label-sm text-label-sm text-dwarf-magma">
            {messages['lobby.reconnecting']}
          </p>
        )}
      </section>

      {/* Config summary (CONF-12): rendered from the snapshot, so configUpdated re-renders it. */}
      <section className="rounded bg-surface-container-lowest p-space-lg shadow-xl">
        <SectionHeader title={messages['lobby.configTitle']} />
        <div className="flex flex-col">
          {configRows.map((row) => (
            <ConfigRow key={row.label} label={row.label} value={row.value} />
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-space-lg lg:grid-cols-3">
        {/* Live member list (SALLE-01 presence). */}
        <section className="rounded bg-surface-container-lowest p-space-lg shadow-xl lg:col-span-2">
          <SectionHeader
            title={messages['lobby.membersTitle']}
            right={
              <span className="font-label-sm text-label-sm text-dwarf-parchmentMuted">
                {snapshot.members.length}
              </span>
            }
          />
          <ul className="flex flex-col gap-space-sm">
            {snapshot.members.map((member) => {
              const identity = memberIdentity(member);
              const isSelf =
                (viewer.kind === 'user' && member.kind === 'user' && member.publicId === viewer.publicId) ||
                (viewer.kind === 'guest' && member.kind === 'guest' && member.guestToken === viewer.guestToken);
              const isRoomHost = member.kind === 'user' && member.publicId === room.host.publicId;
              const confirmingKick = confirmKickTarget === identity;
              return (
                <li
                  key={identity}
                  className="flex flex-col gap-space-sm rounded border border-dwarf-border bg-dwarf-slate p-space-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-space-md">
                    {member.kind === 'user' ? (
                      <UserAvatar
                        pfpUrl={member.pfpUrl}
                        username={member.username}
                        className="h-10 w-10 shrink-0"
                        iconClassName="text-headline-sm"
                      />
                    ) : (
                      <GuestAvatar seed={member.guestToken} className="h-10 w-10 shrink-0 text-headline-sm" />
                    )}
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-body-sm text-body-sm text-dwarf-parchment">
                        {memberDisplayName(member, messages)}
                        {isSelf && (
                          <span className="ml-space-xs font-label-sm text-label-sm text-dwarf-gold">
                            ({messages['lobby.you']})
                          </span>
                        )}
                      </span>
                      <span className="font-label-sm text-label-sm uppercase text-dwarf-parchmentMuted">
                        {[ROLE_KEYS[member.role], ...(isRoomHost ? [ROLE_KEYS.host] : [])].join(' · ')}
                        {' · '}
                        {member.connected ? messages['lobby.connected'] : messages['lobby.disconnected']}
                      </span>
                    </div>
                  </div>

                  {isHost && !isRoomHost && !isSelf && (
                    <div className="flex items-center gap-space-sm">
                      {confirmingKick ? (
                        <>
                          <span className="font-label-sm text-label-sm text-dwarf-magma">
                            {messages['lobby.confirmKick']}
                          </span>
                          <ButtonPrimary
                            type="button"
                            disabled={busy}
                            onClick={() => void handleKick(member)}
                            className="px-space-sm py-space-xs"
                          >
                            {messages['lobby.confirm']}
                          </ButtonPrimary>
                          <ButtonSecondary
                            type="button"
                            onClick={() => setConfirmKickTarget(null)}
                            className="px-space-sm py-space-xs"
                          >
                            {messages['lobby.cancel']}
                          </ButtonSecondary>
                        </>
                      ) : (
                        <ButtonSecondary
                          type="button"
                          disabled={busy}
                          onClick={() => setConfirmKickTarget(identity)}
                          className="px-space-sm py-space-xs"
                        >
                          {messages['lobby.kick']}
                        </ButtonSecondary>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {/* Host controls + leave. */}
        <aside className="flex flex-col gap-space-lg">
          {isHost && (
            <section className="flex flex-col gap-space-md rounded bg-surface-container-lowest p-space-lg shadow-xl">
              <SectionHeader title={messages['lobby.hostControlsTitle']} />

              {!confirmClose ? (
                <ButtonSecondary type="button" disabled={busy} onClick={() => setConfirmClose(true)}>
                  {messages['lobby.closeRoom']}
                </ButtonSecondary>
              ) : (
                <div className="flex flex-col gap-space-sm">
                  <p role="alert" className="font-label-sm text-label-sm text-dwarf-magma">
                    {messages['lobby.confirmClose']}
                  </p>
                  <div className="flex gap-space-sm">
                    <ButtonPrimary
                      type="button"
                      disabled={busy}
                      onClick={() => void handleCloseRoom()}
                      className="px-space-sm py-space-xs"
                    >
                      {messages['lobby.confirm']}
                    </ButtonPrimary>
                    <ButtonSecondary
                      type="button"
                      onClick={() => setConfirmClose(false)}
                      className="px-space-sm py-space-xs"
                    >
                      {messages['lobby.cancel']}
                    </ButtonSecondary>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-space-xs">
                <label
                  htmlFor="transfer-host-picker"
                  className="font-label-sm text-label-sm uppercase text-dwarf-parchmentMuted"
                >
                  {messages['lobby.transferHostPicker']}
                </label>
                <select
                  id="transfer-host-picker"
                  value={transferTarget}
                  onChange={(event) => setTransferTarget(event.target.value)}
                  disabled={busy || transferCandidates.length === 0}
                  className="w-full rounded border border-dwarf-border bg-dwarf-bg px-2 py-1.5 font-mono text-sm text-dwarf-parchment shadow-stone-inner focus:border-dwarf-gold focus:outline-none"
                >
                  <option value="">{messages['lobby.transferHost']}…</option>
                  {transferCandidates.map((member) => (
                    <option key={member.publicId} value={member.publicId}>
                      {member.username}
                    </option>
                  ))}
                </select>
                <ButtonSecondary
                  type="button"
                  disabled={busy || transferTarget === ''}
                  onClick={() => void handleTransfer()}
                >
                  {messages['lobby.transferHostButton']}
                </ButtonSecondary>
              </div>

              <InvitationsPanel
                roomPublicId={room.publicId}
                initialLinks={initialInvitations}
                messages={messages}
              />
            </section>
          )}

          <section className="flex flex-col gap-space-md rounded bg-surface-container-lowest p-space-lg shadow-xl">
            <div className="flex flex-col gap-space-xs">
              <span className="font-label-sm text-label-sm uppercase text-dwarf-parchmentMuted">
                {messages['lobby.role.host']}
              </span>
              <span className="font-body-sm text-body-sm text-dwarf-gold">{hostDisplayName}</span>
            </div>

            {!confirmLeave ? (
              <ButtonSecondary type="button" disabled={busy} onClick={() => setConfirmLeave(true)}>
                {messages['lobby.leave']}
              </ButtonSecondary>
            ) : (
              <div className="flex flex-col gap-space-sm">
                <p role="alert" className="font-label-sm text-label-sm text-dwarf-magma">
                  {messages['lobby.confirmLeave']}
                </p>
                <div className="flex gap-space-sm">
                  <ButtonPrimary
                    type="button"
                    disabled={busy}
                    onClick={() => void handleLeave()}
                    className="px-space-sm py-space-xs"
                  >
                    {messages['lobby.confirm']}
                  </ButtonPrimary>
                  <ButtonSecondary
                    type="button"
                    onClick={() => setConfirmLeave(false)}
                    className="px-space-sm py-space-xs"
                  >
                    {messages['lobby.cancel']}
                  </ButtonSecondary>
                </div>
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
