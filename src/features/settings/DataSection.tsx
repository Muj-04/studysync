'use client';
import { useEffect, useState, useCallback } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Trash2, Download } from 'lucide-react';
import { KEYS, storageSet } from '@/lib/storage';
import { getUserStorageStats, getLimitUsageStats, deleteAllVoiceNotesForUser, deleteAllDrawingsForUser, exportAllUserData } from '@/lib/supabase/db';
import { PLAN_LIMITS, PLAN_LABELS } from '@/lib/planLimits';
import { Divider, FieldLabel, SectionTitle, SubLabel, GhostBtn, StatusMsg } from './controls';
import { ConfirmModal } from './ConfirmModal';

export function UsageBar({ used, max, label }: { used: number; max: number; label: string }) {
  const pct = Math.min(100, max > 0 ? (used / max) * 100 : 0);
  const nearLimit = pct >= 80;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 12, color: nearLimit ? 'var(--red, #ef4444)' : 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
          {used} / {max}
        </span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 2,
          width: `${pct}%`,
          background: nearLimit ? 'var(--red, #ef4444)' : 'var(--accent)',
          transition: 'width 0.3s ease',
        }} />
      </div>
    </div>
  );
}

export function DataSection() {
  const { t } = useLanguage();
  const [stats, setStats] = useState<{ documents: number; voiceNotes: number; drawings: number } | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [limitStats, setLimitStats] = useState<{
    documents: number;
    voiceStorageBytes: number;
    aiRequestsThisMonth: number;
    plan: 'free' | 'premium' | 'pro';
    isVip: boolean;
  } | null>(null);

  const [clearDrawState, setClearDrawState] = useState<'idle' | 'confirm' | 'loading'>('idle');
  const [clearNotesState, setClearNotesState] = useState<'idle' | 'confirm' | 'loading'>('idle');
  const [exportLoading, setExportLoading] = useState(false);
  const [error, setError] = useState('');

  const refreshStats = useCallback(() => {
    return Promise.all([getUserStorageStats(), getLimitUsageStats()]).then(([nextStats, nextLimits]) => {
      setStats(nextStats);
      setLimitStats(nextLimits);
    }).catch(() => { setError('Could not load storage usage. Please try again.'); })
      .finally(() => setStatsLoading(false));
  }, []);
  useEffect(() => { void refreshStats(); }, [refreshStats]);

  const doClearDrawings = useCallback(async () => {
    setClearDrawState('loading');
    setError('');
    try {
      await deleteAllDrawingsForUser();
      storageSet(KEYS.DRAWINGS, {});
      storageSet(KEYS.PAGE_IMAGES, {});
      setClearDrawState('idle');
      await refreshStats();
    } catch (error) {
      setClearDrawState('confirm');
      setError(error instanceof Error ? error.message : 'Could not delete drawings. Please try again.');
    }
  }, [refreshStats]);

  const doClearNotes = useCallback(async () => {
    setClearNotesState('loading');
    setError('');
    try {
      await deleteAllVoiceNotesForUser();
      storageSet(KEYS.VOICE_NOTES, []);
      setClearNotesState('idle');
      await refreshStats();
    } catch (error) {
      setClearNotesState('confirm');
      setError(error instanceof Error ? error.message : 'Could not delete recordings. Please try again.');
    }
  }, [refreshStats]);

  const doExport = useCallback(async () => {
    setExportLoading(true);
    setError('');
    let url: string | undefined;
    try {
      const data = await exportAllUserData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `studysync-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not export data. Please try again.');
    } finally {
      if (url) URL.revokeObjectURL(url);
      setExportLoading(false);
    }
  }, []);

  return (
    <div>
      <SectionTitle>{t('set_data_title')}</SectionTitle>
      {error && <StatusMsg type="err">{error}</StatusMsg>}

      {/* Usage stats */}
      <div style={{ marginBottom: 24 }}>
        <FieldLabel>{t('set_data_usage')}</FieldLabel>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16,
        }}>
          {([
            { label: t('set_data_documents'), key: 'documents' },
            { label: t('set_data_voice'),     key: 'voiceNotes' },
            { label: t('set_data_drawings'),  key: 'drawings' },
          ] as const).map(({ label, key }) => (
            <div key={key} style={{
              padding: '12px 14px', borderRadius: 4,
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              textAlign: 'center',
            }}>
              <p style={{ margin: '0 0 2px', fontSize: 20, fontWeight: 700, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>
                {statsLoading ? '—' : stats?.[key] ?? 0}
              </p>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--text-3)', fontWeight: 500 }}>{label}</p>
            </div>
          ))}
        </div>

        {/* Per-plan usage bars */}
        {limitStats && !limitStats.isVip && (
          <div style={{
            padding: '14px 16px', borderRadius: 4,
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          }}>
            <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)' }}>
              {PLAN_LABELS[limitStats.plan]} {t('set_data_plan_limits')}
            </p>
            {PLAN_LIMITS[limitStats.plan].documents !== Infinity && (
              <UsageBar
                used={limitStats.documents}
                max={PLAN_LIMITS[limitStats.plan].documents}
                label={t('set_data_documents')}
              />
            )}
            <UsageBar
              used={Math.round(limitStats.voiceStorageBytes / (1024 * 1024))}
              max={Math.round(PLAN_LIMITS[limitStats.plan].voiceStorageBytes / (1024 * 1024))}
              label={t('set_data_voice_storage')}
            />
            <UsageBar
              used={limitStats.aiRequestsThisMonth}
              max={PLAN_LIMITS[limitStats.plan].aiRequestsPerMonth}
              label={t('set_data_ai_requests')}
            />
            {limitStats.plan !== 'pro' && (
              <a href="/pricing" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', display: 'inline-block', marginTop: 4 }}>
                {t('set_data_upgrade_limits')}
              </a>
            )}
          </div>
        )}
      </div>

      <Divider />

      {/* Clear drawings */}
      <div style={{ marginBottom: 20 }}>
        <FieldLabel>{t('set_data_drawings')}</FieldLabel>
        <GhostBtn danger onClick={() => setClearDrawState('confirm')} disabled={clearDrawState === 'loading'}>
          <Trash2 size={13} />
          {t('set_data_clear_drawings')}
        </GhostBtn>
        <SubLabel>{t('set_data_clear_drawings_hint')}</SubLabel>
      </div>

      {/* Clear voice notes */}
      <div style={{ marginBottom: 20 }}>
        <FieldLabel>{t('set_data_voice')}</FieldLabel>
        <GhostBtn danger onClick={() => setClearNotesState('confirm')} disabled={clearNotesState === 'loading'}>
          <Trash2 size={13} />
          {t('set_data_delete_voice')}
        </GhostBtn>
        <SubLabel>{t('set_data_delete_voice_hint')}</SubLabel>
      </div>

      <Divider />

      {/* Export */}
      <div>
        <FieldLabel>{t('set_data_export')}</FieldLabel>
        <GhostBtn onClick={doExport} disabled={exportLoading}>
          <Download size={13} />
          {exportLoading ? t('set_data_exporting') : t('set_data_export_json')}
        </GhostBtn>
        <SubLabel>{t('set_data_export_hint')}</SubLabel>
      </div>

      {/* Confirm modals */}
      {(clearDrawState === 'confirm' || clearDrawState === 'loading') && (
        <ConfirmModal
          error={error}
          title={t('set_data_clear_title')}
          body={t('set_data_clear_body')}
          confirmLabel={t('set_data_clear_btn')}
          onConfirm={doClearDrawings}
          onCancel={() => setClearDrawState('idle')}
          loading={clearDrawState === 'loading'}
        />
      )}
      {(clearNotesState === 'confirm' || clearNotesState === 'loading') && (
        <ConfirmModal
          error={error}
          title={t('set_data_del_voice_title')}
          body={t('set_data_del_voice_body')}
          confirmLabel={t('set_data_del_voice_btn')}
          onConfirm={doClearNotes}
          onCancel={() => setClearNotesState('idle')}
          loading={clearNotesState === 'loading'}
        />
      )}
    </div>
  );
}
