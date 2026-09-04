import type { DocumentDashboardSummary } from '../../types/document-dashboard';
import { documentTypeLabel } from './catalog-ui';

/**
 * Tarjetas del Panel documental (SPRINT FRONT-5).
 *
 * Componente estrictamente presentacional: recibe el resumen ya calculado por
 * getDocumentDashboard() y lo renderiza. No realiza llamadas API ni contiene
 * lógica de agregación. Sin any, TypeScript estricto.
 */
export function DocumentDashboardCards({ summary }: { summary: DocumentDashboardSummary | null }) {
  if (!summary) {
    return <p className="muted">Cargando panel documental...</p>;
  }

  const kpis: { label: string; value: number; variant: string; extra?: string }[] = [
    { label: 'Total en gestión', value: summary.totalDocuments, variant: 'info', extra: 'Documentos maestros' },
    { label: 'Vigentes', value: summary.approved, variant: 'good' },
    { label: 'Pendientes', value: summary.pending, variant: 'warning' },
    { label: 'Archivados', value: summary.archived, variant: 'info' },
  ];

  // Agregar KPIs de vencimiento si están disponibles
  if (summary.expiringSoon !== undefined && summary.expiringSoon > 0) {
    kpis.push({ label: 'Próximos a vencer', value: summary.expiringSoon, variant: 'warning' });
  }
  if (summary.expired !== undefined && summary.expired > 0) {
    kpis.push({ label: 'Vencidos', value: summary.expired, variant: 'danger' });
  }

  const visibleTypes = summary.byType.filter((t) => t.count > 0);

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div className="doc-stats-grid">
        {kpis.map((kpi) => (
          <div key={kpi.label} className={`doc-stat-card doc-stat-card--${kpi.variant}`}>
            <div className="doc-stat-card__label">{kpi.label}</div>
            <div className="doc-stat-card__value">{kpi.value}</div>
            {kpi.extra ? <div className="muted" style={{ fontSize: '.8rem' }}>{kpi.extra}</div> : null}
          </div>
        ))}
      </div>

      <div className="advanced-management__section">
        <h3>Documentos maestros por tipo</h3>
        {visibleTypes.length === 0 ? (
          <p className="muted">Sin documentos en gestión.</p>
        ) : (
          <div style={{ display: 'grid', gap: '.5rem' }}>
            {visibleTypes.map((typeSummary) => (
              <div key={typeSummary.documentType}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '.3rem 0' }}>
                <span>{documentTypeLabel(typeSummary.documentType)}</span>
                <strong>{typeSummary.count}</strong>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
