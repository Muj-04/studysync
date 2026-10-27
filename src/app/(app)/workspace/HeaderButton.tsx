
export default function HdrBtn({
  onClick, title, active = false, tone = 'default', children,
}: {
  onClick?: () => void;
  title?: string;
  active?: boolean;
  tone?: 'default' | 'danger';
  children: React.ReactNode;
}) {
  const isDanger = tone === 'danger';
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        width: 42, height: 42,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 4, flexShrink: 0,
        background: isDanger ? 'var(--red-muted)' : active ? 'var(--bg-active)' : 'transparent',
        border: `1px solid ${isDanger ? 'var(--red-muted)' : active ? 'var(--border-strong)' : 'transparent'}`,
        color: isDanger ? 'var(--red)' : active ? 'var(--text-1)' : 'var(--text-2)',
        cursor: 'pointer',
        transition: 'background 0.13s, color 0.13s, border-color 0.13s',
      }}
      onMouseOver={(e) => {
        if (isDanger) {
          Object.assign(e.currentTarget.style, {
            background: 'var(--red)', color: '#fff', borderColor: 'var(--red)',
          });
          return;
        }
        if (!active) Object.assign(e.currentTarget.style, {
          background: 'var(--bg-hover)', color: 'var(--text-1)', borderColor: 'var(--border)',
        });
      }}
      onMouseOut={(e) => {
        if (isDanger) {
          Object.assign(e.currentTarget.style, {
            background: 'var(--red-muted)', color: 'var(--red)', borderColor: 'var(--red-muted)',
          });
          return;
        }
        if (!active) Object.assign(e.currentTarget.style, {
          background: 'transparent', color: 'var(--text-2)', borderColor: 'transparent',
        });
      }}
    >
      {children}
    </button>
  );
}
