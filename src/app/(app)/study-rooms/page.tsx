'use client';
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Video, Search, Plus, MoreHorizontal, Link2, Trash2,
  Users, BookOpen, Headphones, UserCheck, X, Lock, Upload, FileText,
} from 'lucide-react';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import {
  getActiveRooms, closeRoom, getFriends, getProfile,
  uploadRoomPdf, createRoom,
} from '@/lib/supabase/db';
import type { ActiveRoom, ActiveRoomMember } from '@/lib/supabase/db';
import { createClient } from '@/lib/supabase/client';
import { effectivePlanLimits, type PlanLimits } from '@/lib/planLimits';
import { validatePdfOrPptx } from '@/lib/fileValidation';

/**
 * Study Rooms listing/lobby page — Figma-matched.
 *
 *   Header card:  "Study Rooms" + subtitle · Search · + New Room
 *   Tabs:         My Rooms · My Subjects · Silent Study · Friends Active
 *   Grid:         Responsive room cards with gradient banners.
 *
 * Lives at /study-rooms — the LeftRail link used to 404 because this
 * route didn't exist. Per-room functionality (drawing, voice chat) is
 * still under /room/[roomId]; this page is purely the lobby.
 *
 * Rooms are private and invite-only. Supabase RLS exposes a room only to
 * its host, existing members, and users with a valid room invitation.
 */

// ── Permission ───────────────────────────────────────────────────────────────

/**
 * Single source of truth for "is this room joinable right now".
 *
 * Today: existing members only. Hosts are members by virtue of the
 * createRoom flow inserting them into room_members.
 *
 * PUBLIC-JOIN HOOK ↓ ↓ ↓
 * When rooms become publicly joinable, return `true` here (or add
 * `if (room.isPublic) return true;` once a study_rooms.is_public
 * column exists). One edit, the whole UI flips.
 */
function canJoinRoom(room: ActiveRoom): boolean {
  if (room.myMembership) return true;
  // PUBLIC-JOIN HOOK — flip to enable public joining.
  return false;
}

// ── Derivations ──────────────────────────────────────────────────────────────

// Extract a course-code prefix like "CS101" or "MATH200" from the doc
// filename. Returns null when the name doesn't start with one — in
// that case the # subject line is hidden entirely on the card.
const COURSE_CODE_RE = /^([A-Z]{2,5}\d{2,4})/;
function deriveSubject(documentName: string): string | null {
  const cleaned = documentName.replace(/\.(pdf|pptx)$/i, '').trim();
  const match = cleaned.match(COURSE_CODE_RE);
  return match ? match[1] : null;
}

// Silent Study tab heuristic — no is_silent column yet, so we match
// the doc name against common silent-study keywords. Likely empty
// today; friendly empty state explains this.
function isSilentRoom(r: ActiveRoom): boolean {
  return /silent|focus|quiet|pomodoro/i.test(r.documentName);
}

// LIVE = active and not yet expired.
function isLive(r: ActiveRoom): boolean {
  if (r.status !== 'active') return false;
  if (!r.expiresAt) return true;
  return new Date(r.expiresAt).getTime() > Date.now();
}

// Display name for the host on a card.
function hostLabel(room: ActiveRoom, myUserId: string | null): string {
  if (myUserId && room.hostUserId === myUserId) return 'Hosted by you';
  return `Hosted by ${room.host?.username ?? 'Unknown'}`;
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = 'all' | 'subjects' | 'silent' | 'friends';
const TABS: ReadonlyArray<{ id: Tab; label: string; icon: React.ElementType }> = [
  { id: 'all',      label: 'My Rooms',       icon: Users      },
  { id: 'subjects', label: 'My Subjects',    icon: BookOpen   },
  { id: 'silent',   label: 'Silent Study',   icon: Headphones },
  { id: 'friends',  label: 'Friends Active', icon: UserCheck  },
];

// ── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ member, size = 28 }: { member: ActiveRoomMember; size?: number }) {
  const initial = (member.username ?? '?')[0]?.toUpperCase() ?? '?';
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: member.avatarUrl ? 'transparent' : 'var(--accent)',
      color: '#fff', fontSize: size * 0.4, fontWeight: 700,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden', flexShrink: 0,
      border: '2px solid var(--bg-panel)',
    }}>
      {member.avatarUrl
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={member.avatarUrl} alt={member.username ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : initial}
    </div>
  );
}

// ── Room card ────────────────────────────────────────────────────────────────

function RoomCard({
  room, myUserId, joinDenied, copyMsg,
  onJoin, onCopyLink, onClose,
}: {
  room: ActiveRoom;
  myUserId: string | null;
  joinDenied: boolean;
  copyMsg: boolean;
  onJoin: (room: ActiveRoom) => void;
  onCopyLink: (roomId: string) => void;
  onClose: (roomId: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isHost   = !!myUserId && myUserId === room.hostUserId;
  const subject  = deriveSubject(room.documentName);
  const live     = isLive(room);
  const joinable = canJoinRoom(room);
  const sampleMembers = room.members.slice(0, 4);
  const overflow      = Math.max(0, room.memberCount - sampleMembers.length);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  return (
    <article style={{
      background: 'var(--bg-panel)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 14, overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      transition: 'transform 0.13s, border-color 0.13s, box-shadow 0.13s',
    }}
      onMouseOver={(e) => Object.assign(e.currentTarget.style, {
        transform: 'translateY(-2px)', borderColor: 'var(--accent)', boxShadow: 'var(--shadow-float)',
      })}
      onMouseOut={(e) => Object.assign(e.currentTarget.style, {
        transform: 'translateY(0)', borderColor: 'var(--border-subtle)', boxShadow: 'none',
      })}
    >
      {/* Gradient banner */}
      <div style={{
        position: 'relative',
        height: 64,
        background: 'linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 55%, #4f46e5))',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 12px',
      }}>
        {/* LIVE indicator */}
        {live && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '3px 10px', borderRadius: 9999,
            background: 'rgba(255, 255, 255, 0.18)',
            backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
            color: '#fff', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em',
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: '#ef4444',
              boxShadow: '0 0 0 0 rgba(239,68,68, 0.6)',
              animation: 'live-pulse 1.6s ease-in-out infinite',
            }} />
            LIVE
          </div>
        )}
        {!live && <div />}

        {/* … menu — host only */}
        {isHost && (
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              title="More"
              aria-label="More actions"
              style={{
                width: 28, height: 28, borderRadius: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: menuOpen ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.15)',
                border: 'none', color: '#fff', cursor: 'pointer',
                backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
                transition: 'background 0.12s',
              }}
              onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.25)'; }}
              onMouseOut={(e)  => { if (!menuOpen) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.15)'; }}
            >
              <MoreHorizontal size={14} />
            </button>
            {menuOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 40,
                minWidth: 190,
                background: 'var(--bg-float)',
                backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
                border: '1px solid var(--bg-float-border)',
                boxShadow: 'var(--shadow-float)',
                borderRadius: 8, padding: 4,
              }}>
                <button
                  onClick={() => { setMenuOpen(false); onCopyLink(room.id); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    height: 32, padding: '0 10px', borderRadius: 6,
                    background: 'transparent', border: 'none',
                    color: 'var(--text-1)', cursor: 'pointer',
                    fontSize: 12.5, fontWeight: 500, textAlign: 'left', fontFamily: 'inherit',
                    transition: 'background 0.12s',
                  }}
                  onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                  onMouseOut={(e)  => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <Link2 size={13} />
                  Copy invite link
                </button>
                <button
                  onClick={() => { setMenuOpen(false); onClose(room.id); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    height: 32, padding: '0 10px', borderRadius: 6,
                    background: 'transparent', border: 'none',
                    color: 'var(--red)', cursor: 'pointer',
                    fontSize: 12.5, fontWeight: 500, textAlign: 'left', fontFamily: 'inherit',
                    transition: 'background 0.12s',
                  }}
                  onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--red-muted)'; }}
                  onMouseOut={(e)  => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <Trash2 size={13} />
                  Close room
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{
        padding: '14px 16px 16px',
        display: 'flex', flexDirection: 'column', gap: 6, flex: 1,
      }}>
        {subject && (
          <p style={{
            margin: 0, fontSize: 11, fontWeight: 600,
            color: 'var(--text-3)', letterSpacing: '0.02em',
          }}>
            # {subject}
          </p>
        )}
        <h3 style={{
          margin: 0, fontSize: 14.5, fontWeight: 700, color: 'var(--text-1)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          lineHeight: 1.35,
        }}>
          {room.documentName.replace(/\.(pdf|pptx)$/i, '')}
        </h3>
        <p style={{
          margin: '1px 0 0', fontSize: 11.5, color: 'var(--text-3)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {hostLabel(room, myUserId)}
        </p>

        {/* Spacer to push footer down */}
        <div style={{ flex: 1, minHeight: 6 }} />

        {/* Footer row: avatar stack · count · Join */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 10, marginTop: 4,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            {sampleMembers.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center' }}>
                {sampleMembers.map((m, i) => (
                  <div key={m.userId} style={{ marginLeft: i === 0 ? 0 : -8, zIndex: sampleMembers.length - i }}>
                    <Avatar member={m} size={26} />
                  </div>
                ))}
                {overflow > 0 && (
                  <div style={{
                    marginLeft: -8, zIndex: 0,
                    width: 26, height: 26, borderRadius: '50%',
                    border: '2px solid var(--bg-panel)',
                    background: 'var(--bg-active)',
                    color: 'var(--text-2)',
                    fontSize: 10, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    +{overflow}
                  </div>
                )}
              </div>
            )}
            <span style={{
              fontSize: 12, fontWeight: 600, color: 'var(--text-2)',
              fontVariantNumeric: 'tabular-nums',
              marginLeft: sampleMembers.length > 0 ? 4 : 0,
            }}>
              {room.memberCount}/{room.maxMembers}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {(joinDenied || copyMsg) && (
              <span style={{
                fontSize: 11.5, fontWeight: 500,
                color: joinDenied ? 'var(--red)' : 'var(--text-3)',
              }}>
                {joinDenied ? 'Invite required' : 'Link copied'}
              </span>
            )}
            <button
              onClick={() => onJoin(room)}
              title={joinable ? 'Join room' : 'Invite required to join'}
              style={{
                height: 32, padding: '0 16px', borderRadius: 8,
                background: joinable ? 'var(--accent)' : 'var(--bg-active)',
                color: joinable ? '#fff' : 'var(--text-3)',
                border: joinable ? 'none' : '1px solid var(--border)',
                fontSize: 12.5, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
                transition: 'background 0.13s, color 0.13s',
              }}
              onMouseOver={(e) => { if (joinable) e.currentTarget.style.background = 'var(--accent-hover)'; }}
              onMouseOut={(e)  => { if (joinable) e.currentTarget.style.background = 'var(--accent)'; }}
            >
              Join
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function StudyRoomsPage() {
  useAuthGuard();
  const router = useRouter();

  const [rooms, setRooms]       = useState<ActiveRoom[]>([]);
  const [loading, setLoading]   = useState(true);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());

  const [tab, setTab]       = useState<Tab>('all');
  const [search, setSearch] = useState('');

  const [joinDeniedId, setJoinDeniedId] = useState<string | null>(null);
  const [copyId, setCopyId]             = useState<string | null>(null);

  const [createOpen, setCreateOpen]       = useState(false);
  const [createFile, setCreateFile]       = useState<File | null>(null);
  const [createError, setCreateError]     = useState<string | null>(null);
  const [createBusy, setCreateBusy]       = useState(false);
  const [createDragging, setCreateDragging] = useState(false);
  const [roomLimits, setRoomLimits]       = useState<PlanLimits | null>(null);
  const createFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    createClient().auth.getUser().then(async ({ data: { user } }) => {
      setMyUserId(user?.id ?? null);
      const profile = user ? await getProfile() : null;
      setRoomLimits(effectivePlanLimits(profile?.plan ?? 'free', profile?.isVip ?? false));
    });
    getActiveRooms().then((rs) => { setRooms(rs); setLoading(false); });
    getFriends().then((friends) => {
      setFriendIds(new Set(friends.map((f) => f.userId)));
    });
  }, []);

  const handleJoin = useCallback((room: ActiveRoom) => {
    if (canJoinRoom(room)) {
      router.push(`/room/${room.id}`);
      return;
    }
    setJoinDeniedId(room.id);
    setTimeout(() => setJoinDeniedId((id) => id === room.id ? null : id), 2200);
  }, [router]);

  const handleCopyLink = useCallback(async (roomId: string) => {
    const url = `${window.location.origin}/room/${roomId}`;
    try { await navigator.clipboard.writeText(url); } catch { /* */ }
    setCopyId(roomId);
    setTimeout(() => setCopyId((id) => id === roomId ? null : id), 2000);
  }, []);

  const handleCloseRoom = useCallback(async (roomId: string) => {
    await closeRoom(roomId);
    setRooms((prev) => prev.filter((r) => r.id !== roomId));
  }, []);

  const handleOpenCreate = useCallback(() => {
    setCreateFile(null);
    setCreateError(null);
    setCreateDragging(false);
    setCreateOpen(true);
  }, []);

  const handleCloseCreate = useCallback(() => {
    if (createBusy) return;
    setCreateOpen(false);
    setCreateFile(null);
    setCreateError(null);
    setCreateDragging(false);
  }, [createBusy]);

  const handleCreateFile = useCallback(async (file?: File) => {
    if (!file || createBusy) return;
    setCreateError(null);
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setCreateFile(null);
      setCreateError('Study Rooms currently support PDF files only.');
      return;
    }
    const validation = await validatePdfOrPptx(file);
    if (!validation.valid) {
      setCreateFile(null);
      setCreateError(validation.error ?? 'Please select a valid PDF.');
      return;
    }
    setCreateFile(file);
  }, [createBusy]);

  const handleCreateRoom = useCallback(async () => {
    if (!createFile || !roomLimits?.canCreateRooms || createBusy) return;
    setCreateBusy(true);
    setCreateError(null);

    const roomId = crypto.randomUUID();
    const documentName = createFile.name.replace(/\.pdf$/i, '').trim() || 'Study document';
    let pdfPath: string | null = null;
    try {
      pdfPath = await uploadRoomPdf(roomId, createFile, documentName);
      if (!pdfPath) throw new Error('The PDF could not be uploaded. Please try again.');

      const created = await createRoom(roomId, documentName, pdfPath, roomLimits.maxRoomMembers);
      if (!created) {
        await createClient().storage.from('pdfs').remove([pdfPath]);
        throw new Error('The room could not be created. Please try again.');
      }

      router.push(`/room/${roomId}`);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'The room could not be created.');
      setCreateBusy(false);
    }
  }, [createBusy, createFile, roomLimits, router]);

  // Filter pipeline: tab → search
  const filtered = useMemo(() => {
    let list = rooms;
    if (tab === 'subjects') {
      list = list.filter((r) => r.myMembership);
    } else if (tab === 'silent') {
      list = list.filter(isSilentRoom);
    } else if (tab === 'friends') {
      list = list.filter((r) => {
        if (r.hostUserId !== myUserId && friendIds.has(r.hostUserId)) return true;
        return r.members.some((m) => m.userId !== myUserId && friendIds.has(m.userId));
      });
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((r) =>
        r.documentName.toLowerCase().includes(q) ||
        (r.host?.username ?? '').toLowerCase().includes(q) ||
        (deriveSubject(r.documentName) ?? '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [rooms, tab, search, myUserId, friendIds]);

  const emptyCopy = useMemo(() => {
    if (search.trim()) return {
      title: `No rooms match "${search.trim()}"`,
      body: 'Try a different search.',
    };
    if (tab === 'subjects') return {
      title: 'You haven’t joined a room',
      body: 'Rooms you create or get invited to will show here.',
    };
    if (tab === 'silent') return {
      title: 'No silent-study rooms yet',
      body: 'Rooms whose name mentions silent, focus, quiet, or pomodoro show here.',
    };
    if (tab === 'friends') return {
      title: 'No friends are in a room',
      body: 'When friends host or join a room, you’ll see it here.',
    };
    return {
      title: 'No active rooms',
      body: 'Be the first to start one — click + New Room.',
    };
  }, [tab, search]);

  return (
    <div style={{
      flex: 1, minHeight: '100vh',
      background: 'var(--bg-app)', color: 'var(--text-1)', fontFamily: 'inherit',
    }}>
      <style jsx global>{`
        @keyframes live-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68, 0.6); }
          50%      { box-shadow: 0 0 0 5px rgba(239,68,68, 0); }
        }
      `}</style>

      <main style={{
        maxWidth: 1200, margin: '0 auto',
        padding: '28px 24px 60px',
        display: 'flex', flexDirection: 'column', gap: 22,
      }}>

        {/* ── Header card ── */}
        <div style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 14,
          padding: 22,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 16, flexWrap: 'wrap',
        }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h1 style={{
              margin: 0, display: 'flex', alignItems: 'center', gap: 10,
              fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em',
              color: 'var(--text-1)',
            }}>
              <span style={{
                width: 36, height: 36, borderRadius: 9,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--accent-muted)', color: 'var(--accent)', flexShrink: 0,
              }}>
                <Video size={18} strokeWidth={2} />
              </span>
              Study Rooms
            </h1>
            <p style={{
              margin: '6px 0 0', fontSize: 13.5, color: 'var(--text-2)',
              lineHeight: 1.5, maxWidth: 560,
            }}>
              Join live virtual study sessions or create your own room to collaborate.
            </p>
            <p style={{
              margin: '5px 0 0', fontSize: 11.5, color: 'var(--text-3)',
              lineHeight: 1.4, display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <Lock size={11} strokeWidth={2} aria-hidden />
              Only rooms you host, have joined, or were invited to are visible here.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{
                position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
                color: 'var(--text-3)', pointerEvents: 'none',
              }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search rooms..."
                aria-label="Search rooms"
                style={{
                  width: 220, height: 38, paddingLeft: 32, paddingRight: search ? 32 : 12,
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 8, fontSize: 13, color: 'var(--text-1)',
                  outline: 'none', fontFamily: 'inherit',
                }}
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                  style={{
                    position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-3)', padding: 4, display: 'flex',
                  }}
                >
                  <X size={12} />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={handleOpenCreate}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                height: 38, padding: '0 16px', borderRadius: 8,
                background: 'var(--accent)', color: '#fff',
                fontSize: 13, fontWeight: 600,
                border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                transition: 'background 0.13s',
              }}
              onMouseOver={(e) => { e.currentTarget.style.background = 'var(--accent-hover)'; }}
              onMouseOut={(e)  => { e.currentTarget.style.background = 'var(--accent)'; }}
            >
              <Plus size={14} /> New Room
            </button>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div style={{
          display: 'flex', alignItems: 'stretch',
          gap: 4, borderBottom: '1px solid var(--border-subtle)',
          flexWrap: 'wrap',
        }}>
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                style={{
                  position: 'relative',
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '10px 14px',
                  background: 'transparent', border: 'none',
                  color: active ? 'var(--accent)' : 'var(--text-2)',
                  fontSize: 13, fontWeight: active ? 600 : 500,
                  cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'color 0.12s',
                }}
                onMouseOver={(e) => { if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; }}
                onMouseOut={(e)  => { if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; }}
              >
                <Icon size={13} />
                {label}
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    left: 6, right: 6, bottom: -1,
                    height: 2, borderRadius: 1,
                    background: active ? 'var(--accent)' : 'transparent',
                    transition: 'background 0.12s',
                  }}
                />
              </button>
            );
          })}
        </div>

        {/* ── Grid ── */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-3)', fontSize: 13 }}>
            Loading rooms…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '60px 24px',
            background: 'var(--bg-panel)',
            border: '1px dashed var(--border-subtle)',
            borderRadius: 14,
          }}>
            <Video size={28} style={{ color: 'var(--text-3)', opacity: 0.5, marginBottom: 10 }} />
            <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>
              {emptyCopy.title}
            </p>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5 }}>
              {emptyCopy.body}
            </p>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 16,
          }}>
            {filtered.map((room) => (
              <RoomCard
                key={room.id}
                room={room}
                myUserId={myUserId}
                joinDenied={joinDeniedId === room.id}
                copyMsg={copyId === room.id}
                onJoin={handleJoin}
                onCopyLink={handleCopyLink}
                onClose={handleCloseRoom}
              />
            ))}
          </div>
        )}
      </main>

      {createOpen && (
        <div
          role="presentation"
          onClick={handleCloseCreate}
          style={{
            position: 'fixed', inset: 0, zIndex: 1300,
            background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-room-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 480,
              background: 'var(--bg-float)',
              border: '1px solid var(--bg-float-border)',
              boxShadow: 'var(--shadow-float)', borderRadius: 12,
              padding: 22, display: 'flex', flexDirection: 'column', gap: 18,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <h2 id="create-room-title" style={{ margin: 0, fontSize: 17, color: 'var(--text-1)' }}>
                  Create Study Room
                </h2>
                <p style={{ margin: '5px 0 0', fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-3)' }}>
                  Upload a PDF and you will enter the new private room immediately.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseCreate}
                disabled={createBusy}
                aria-label="Close create room dialog"
                style={{
                  width: 30, height: 30, borderRadius: 6, border: '1px solid var(--border)',
                  background: 'transparent', color: 'var(--text-2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: createBusy ? 'not-allowed' : 'pointer', opacity: createBusy ? 0.5 : 1,
                }}
              >
                <X size={14} />
              </button>
            </div>

            {!roomLimits ? (
              <div style={{ padding: '26px 0', display: 'flex', justifyContent: 'center' }}>
                <span className="spinner" style={{
                  width: 28, height: 28, borderRadius: '50%',
                  border: '3px solid var(--border)', borderTopColor: 'var(--accent)',
                }} />
              </div>
            ) : !roomLimits.canCreateRooms ? (
              <div style={{
                padding: 18, borderRadius: 9, background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
              }}>
                <p style={{ margin: '0 0 6px', fontSize: 13.5, fontWeight: 650, color: 'var(--text-1)' }}>
                  Study Rooms require Premium or Pro
                </p>
                <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-3)' }}>
                  Upgrade your plan to create private rooms and collaborate in real time.
                </p>
              </div>
            ) : (
              <>
                <div
                  onDragEnter={(e) => { e.preventDefault(); setCreateDragging(true); }}
                  onDragOver={(e) => { e.preventDefault(); setCreateDragging(true); }}
                  onDragLeave={(e) => { e.preventDefault(); setCreateDragging(false); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setCreateDragging(false);
                    void handleCreateFile(e.dataTransfer.files?.[0]);
                  }}
                  style={{
                    border: `1.5px dashed ${createDragging ? 'var(--accent)' : 'var(--border-strong)'}`,
                    background: createDragging ? 'var(--accent-muted)' : 'var(--bg-elevated)',
                    borderRadius: 10, padding: '26px 20px', textAlign: 'center',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                >
                  <div style={{
                    width: 42, height: 42, margin: '0 auto 10px', borderRadius: 9,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: createFile ? 'var(--accent-muted)' : 'var(--bg-active)',
                    color: createFile ? 'var(--accent)' : 'var(--text-2)',
                  }}>
                    {createFile ? <FileText size={20} /> : <Upload size={19} />}
                  </div>
                  {createFile ? (
                    <>
                      <p style={{ margin: '0 0 3px', fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', overflowWrap: 'anywhere' }}>
                        {createFile.name}
                      </p>
                      <p style={{ margin: '0 0 12px', fontSize: 11.5, color: 'var(--text-3)' }}>
                        {(createFile.size / (1024 * 1024)).toFixed(1)} MB
                      </p>
                    </>
                  ) : (
                    <>
                      <p style={{ margin: '0 0 4px', fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)' }}>
                        Drop your PDF here
                      </p>
                      <p style={{ margin: '0 0 12px', fontSize: 11.5, color: 'var(--text-3)' }}>
                        PDF only · maximum 50 MB
                      </p>
                    </>
                  )}
                  <button
                    type="button"
                    disabled={createBusy}
                    onClick={() => createFileInputRef.current?.click()}
                    style={{
                      height: 32, padding: '0 13px', borderRadius: 7,
                      border: '1px solid var(--border)', background: 'var(--bg-panel)',
                      color: 'var(--text-2)', fontSize: 12, fontWeight: 600,
                      cursor: createBusy ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    {createFile ? 'Choose a different PDF' : 'Browse files'}
                  </button>
                  <input
                    ref={createFileInputRef}
                    type="file"
                    accept="application/pdf,.pdf"
                    hidden
                    disabled={createBusy}
                    onChange={(e) => {
                      void handleCreateFile(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </div>

                {createError && (
                  <p role="alert" style={{ margin: 0, fontSize: 12.5, color: 'var(--red)', lineHeight: 1.45 }}>
                    {createError}
                  </p>
                )}
              </>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={handleCloseCreate}
                disabled={createBusy}
                style={{
                  height: 36, padding: '0 15px', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'transparent',
                  color: 'var(--text-2)', fontSize: 12.5, fontWeight: 600,
                  cursor: createBusy ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                }}
              >
                Cancel
              </button>
              {roomLimits && !roomLimits.canCreateRooms ? (
                <button
                  type="button"
                  onClick={() => router.push('/pricing')}
                  style={{
                    height: 36, padding: '0 16px', borderRadius: 8, border: 'none',
                    background: 'var(--accent)', color: '#fff', fontSize: 12.5,
                    fontWeight: 650, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  View plans
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => { void handleCreateRoom(); }}
                  disabled={!createFile || createBusy || !roomLimits}
                  style={{
                    height: 36, minWidth: 126, padding: '0 16px', borderRadius: 8, border: 'none',
                    background: 'var(--accent)', color: '#fff', fontSize: 12.5,
                    fontWeight: 650, cursor: !createFile || createBusy || !roomLimits ? 'not-allowed' : 'pointer',
                    opacity: !createFile || createBusy || !roomLimits ? 0.55 : 1, fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  }}
                >
                  {createBusy && <span className="spinner" style={{
                    width: 14, height: 14, borderRadius: '50%',
                    border: '2px solid rgba(255,255,255,0.45)', borderTopColor: '#fff',
                  }} />}
                  {createBusy ? 'Creating…' : 'Create Room'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
