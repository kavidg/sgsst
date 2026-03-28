import { ReactNode } from 'react';

type KpiCardProps = {
  title: string;
  value: string | number;
  icon?: ReactNode;
  emphasizeValue?: boolean;
};

export function KpiCard({ title, value, icon, emphasizeValue = false }: KpiCardProps) {
  return (
    <article className="card kpi-card">
      <div className="actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 className="kpi-title">{title}</h3>
        {icon}
      </div>
      <p className="kpi-value" style={{ fontSize: emphasizeValue ? '2.3rem' : '2rem' }}>{value}</p>
    </article>
  );
}
