'use client';
import { useEffect, useState, useCallback } from 'react';
import { Check, Gift, Copy, Users } from 'lucide-react';
import { getReferralStats, ensureReferralCode } from '@/lib/supabase/db';
import { Divider, FieldLabel, SectionTitle, SubLabel } from './controls';

export function ReferralSection() {
  const [stats, setStats] = useState<{
    referralCode: string | null;
    referralLink: string | null;
    referralCount: number;
    rewardActive: boolean;
    rewardExpiresAt: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const load = async () => {
      await ensureReferralCode();
      const s = await getReferralStats();
      setStats(s);
      setLoading(false);
    };
    load();
  }, []);

  const copyLink = useCallback(() => {
    if (!stats?.referralLink) return;
    navigator.clipboard.writeText(stats.referralLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [stats]);

  const formatExpiry = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div>
      <SectionTitle>Referrals</SectionTitle>

      {/* Headline card */}
      <div style={{
        padding: '20px 20px', borderRadius: 8, marginBottom: 24,
        background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.25)',
        display: 'flex', alignItems: 'flex-start', gap: 14,
      }}>
        <div style={{
          width: 38, height: 38, borderRadius: 8, flexShrink: 0,
          background: 'rgba(124,58,237,0.18)', border: '1px solid rgba(124,58,237,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Gift size={18} style={{ color: '#a78bfa' }} />
        </div>
        <div>
          <p style={{ margin: '0 0 4px', fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)' }}>
            Invite friends, get 1 week Premium free
          </p>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.55 }}>
            For each friend who signs up with your link, you both get 7 days of Premium — automatically.
          </p>
        </div>
      </div>

      {/* Your referral link */}
      <div style={{ marginBottom: 24 }}>
        <FieldLabel>Your referral link</FieldLabel>
        {loading ? (
          <div style={{
            height: 38, borderRadius: 4,
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', paddingLeft: 12,
          }}>
            <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Loading…</span>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{
              flex: 1, height: 38, borderRadius: 4,
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', padding: '0 12px',
              overflow: 'hidden',
            }}>
              <span style={{
                fontSize: 12.5, color: 'var(--text-2)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                fontFamily: 'monospace',
              }}>
                {stats?.referralLink ?? '—'}
              </span>
            </div>
            <button
              onClick={copyLink}
              disabled={!stats?.referralLink}
              style={{
                height: 38, padding: '0 14px',
                borderRadius: 4, border: '1px solid var(--border)',
                background: copied ? 'rgba(34,197,94,0.12)' : 'var(--bg-elevated)',
                color: copied ? '#4ade80' : 'var(--text-2)',
                cursor: stats?.referralLink ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 12.5, fontWeight: 500, fontFamily: 'inherit',
                transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                flexShrink: 0,
                borderColor: copied ? 'rgba(34,197,94,0.35)' : undefined,
              }}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        )}
        <SubLabel>Share this link — anyone who registers gets you both 7 days Premium free.</SubLabel>
      </div>

      <Divider />

      {/* Stats row */}
      <div style={{ marginBottom: 24 }}>
        <FieldLabel>Your referrals</FieldLabel>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{
            flex: 1, padding: '16px 18px', borderRadius: 6,
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 6,
              background: 'rgba(255,255,255,0.06)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Users size={15} style={{ color: 'var(--text-2)' }} />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>
                {loading ? '—' : (stats?.referralCount ?? 0)}
              </p>
              <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-3)' }}>Friends referred</p>
            </div>
          </div>

          <div style={{
            flex: 1, padding: '16px 18px', borderRadius: 6,
            background: stats?.rewardActive ? 'rgba(124,58,237,0.08)' : 'var(--bg-elevated)',
            border: `1px solid ${stats?.rewardActive ? 'rgba(124,58,237,0.3)' : 'var(--border)'}`,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 6,
              background: stats?.rewardActive ? 'rgba(124,58,237,0.2)' : 'rgba(255,255,255,0.06)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Gift size={15} style={{ color: stats?.rewardActive ? '#a78bfa' : 'var(--text-2)' }} />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: stats?.rewardActive ? '#a78bfa' : 'var(--text-2)' }}>
                {loading ? '—' : stats?.rewardActive ? 'Active reward' : 'No active reward'}
              </p>
              <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-3)' }}>
                {!loading && stats?.rewardActive && stats.rewardExpiresAt
                  ? `Premium until ${formatExpiry(stats.rewardExpiresAt)}`
                  : 'Refer a friend to earn Premium'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Your code */}
      <div>
        <FieldLabel>Your referral code</FieldLabel>
        <div style={{
          display: 'inline-flex', alignItems: 'center',
          padding: '6px 14px', borderRadius: 4,
          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--text-1)', fontFamily: 'monospace' }}>
            {loading ? '…' : (stats?.referralCode ?? '—')}
          </span>
        </div>
        <SubLabel>Your code is automatically applied when someone uses your referral link.</SubLabel>
      </div>
    </div>
  );
}
