type KpiCardProps = {
  title: string;
  value: string | number;
  emphasizeValue?: boolean;
};

export function KpiCard({ title, value, emphasizeValue = false }: KpiCardProps) {
  return (
    <article
      style={{
        background: '#fff',
        border: '1px solid #dbe3ee',
        borderRadius: 12,
        padding: '1rem',
        minHeight: 120,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <h3 style={{ margin: 0, fontSize: '1rem', color: '#334155' }}>{title}</h3>
      <p
        style={{
          margin: '0.75rem 0 0',
          fontSize: emphasizeValue ? '2.2rem' : '1.8rem',
          fontWeight: 700,
          color: '#0f172a',
          lineHeight: 1.1,
        }}
      >
        {value}
      </p>
    </article>
  );
}
