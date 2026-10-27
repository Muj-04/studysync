'use client';
import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Check } from 'lucide-react';
import { getUserSettings, saveUserSettings, getStudyStreak, getTodayStudySeconds } from '@/lib/supabase/db';
import { FieldLabel, SectionTitle, SubLabel, PrimaryBtn } from './controls';

export function StudySection() {
  const { t } = useLanguage();
  const [streak, setStreak] = useState(0);
  const [todaySeconds, setTodaySeconds] = useState(0);
  const [goal, setGoal] = useState(2);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.all([getStudyStreak(), getTodayStudySeconds(), getUserSettings()]).then(([s, secs, settings]) => {
      setStreak(s);
      setTodaySeconds(secs);
      setGoal(settings.dailyStudyGoalHours);
    });
  }, []);

  const todayHours = todaySeconds / 3600;
  const goalProgress = Math.min(1, todayHours / goal);

  const handleSaveGoal = async () => {
    await saveUserSettings({ dailyStudyGoalHours: goal });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
      <SectionTitle>{t('set_study_title')}</SectionTitle>

      {/* Streak */}
      <div style={{ marginBottom: 28 }}>
        <FieldLabel>{t('set_study_streak')}</FieldLabel>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
          background: 'var(--bg-elevated)', borderRadius: 4,
          padding: '16px 20px', border: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: 36 }}>🔥</div>
          <div>
            <p style={{ margin: 0, fontSize: 28, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1 }}>{streak}</p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
              {streak === 1 ? t('set_study_day') : t('set_study_days')}
            </p>
          </div>
          {streak >= 7 && (
            <span style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 4, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontSize: 12, fontWeight: 600 }}>
              🎯 {streak}+ {t('set_study_days')}!
            </span>
          )}
        </div>
        <SubLabel>{t('set_study_streak_hint')}</SubLabel>
      </div>

      {/* Today's progress */}
      <div style={{ marginBottom: 28 }}>
        <FieldLabel>{t('set_study_today')}</FieldLabel>
        <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
            {todaySeconds < 60
              ? `${todaySeconds}s`
              : todaySeconds < 3600
                ? `${Math.floor(todaySeconds / 60)}m`
                : `${(todaySeconds / 3600).toFixed(1)}h`} {t('set_study_studied')}
          </span>
          <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{t('set_study_goal_label')}: {goal}h</span>
        </div>
        <div style={{ height: 10, borderRadius: 4, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${goalProgress * 100}%`, background: goalProgress >= 1 ? '#22c55e' : 'var(--accent)', borderRadius: 4, transition: 'width 0.4s ease' }} />
        </div>
        {goalProgress >= 1 && (
          <p style={{ margin: '6px 0 0', fontSize: 12, color: '#22c55e', fontWeight: 500 }}>
            {t('set_study_goal_achieved')}
          </p>
        )}
      </div>

      {/* Daily goal setting */}
      <div style={{ marginBottom: 24 }}>
        <FieldLabel>{t('set_study_daily_goal')}</FieldLabel>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {[1, 2, 3, 4].map((h) => (
            <button
              key={h}
              onClick={() => setGoal(h)}
              style={{
                height: 36, padding: '0 16px', borderRadius: 4,
                background: goal === h ? 'var(--accent)' : 'var(--bg-elevated)',
                color: goal === h ? '#fff' : 'var(--text-2)',
                border: `1px solid ${goal === h ? 'var(--accent)' : 'var(--border)'}`,
                fontSize: 13, fontWeight: goal === h ? 600 : 400, cursor: 'pointer', fontFamily: 'inherit',
                transition: 'all 0.12s',
              }}
            >{h}h</button>
          ))}
          <button
            onClick={() => setGoal(5)}
            style={{
              height: 36, padding: '0 16px', borderRadius: 4,
              background: goal >= 5 ? 'var(--accent)' : 'var(--bg-elevated)',
              color: goal >= 5 ? '#fff' : 'var(--text-2)',
              border: `1px solid ${goal >= 5 ? 'var(--accent)' : 'var(--border)'}`,
              fontSize: 13, fontWeight: goal >= 5 ? 600 : 400, cursor: 'pointer', fontFamily: 'inherit',
              transition: 'all 0.12s',
            }}
          >4h+</button>
        </div>
        <PrimaryBtn onClick={handleSaveGoal} loading={false} disabled={false}>
          {saved ? <><Check size={13} /> {t('common_done')}</> : t('set_study_save_goal')}
        </PrimaryBtn>
      </div>
    </div>
  );
}
