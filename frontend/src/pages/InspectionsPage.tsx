import { useEffect, useState } from 'react';
import { InspectionsHeader } from '../components/InspectionsHeader';
import { useCompanyContext } from '../context/CompanyContext';
import { fetchInspectionActivities, fetchInspectionScheduleByCompany } from '../api';
import type { InspectionActivityModel } from '../api';
import { AdvancedPageLayout } from '../components/advanced-layout/AdvancedPageLayout';
import { AdvancedHeader, type HeaderAction } from '../components/advanced-layout/AdvancedHeader';
import { AdvancedKpiGrid } from '../components/advanced-layout/AdvancedKpiGrid';
import { Card } from '../components/ui/Card';

interface InspectionsPageProps {
  token: string;
}

export function InspectionsPage({ token }: InspectionsPageProps) {
  const { companyId } = useCompanyContext();
  const [scheduleData, setScheduleData] = useState<InspectionActivityModel[]>([]);
  const [activitiesData, setActivitiesData] = useState<InspectionActivityModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastSync, setLastSync] = useState('');

  const allData = [...activitiesData, ...scheduleData];
  const totalActividades = allData.length;
  const ejecutadas = allData.filter((a) => a.status === 'completed').length;
  const pendientes = totalActividades - ejecutadas;
  const cumplimiento = totalActividades > 0 ? Math.round((ejecutadas / totalActividades) * 100) : 0;

  const loadData = async () => {
    if (!token || !companyId) return;

    setLoading(true);
    setError('');

    try {
      const [activities, schedule] = await Promise.all([
        fetchInspectionActivities(token),
        fetchInspectionScheduleByCompany(token, companyId),
      ]);
      setActivitiesData(activities);
      setScheduleData(schedule);
      setLastSync(new Date().toLocaleString('es-CO'));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible cargar el cronograma de inspecciones.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [token, companyId]);

  const headerActions: HeaderAction[] = [
    { label: '🔄 Recargar datos', onClick: loadData, variant: 'secondary' },
  ];

  return (
    <AdvancedPageLayout>
      <AdvancedHeader
        moduleCode="SST-INS-001"
        moduleTitle="Inspecciones SST"
        description="Planeación, ejecución y seguimiento del programa de inspecciones bajo ciclo PHVA"
        statusBadge={<span className="badge badge--success">🟢 Activo</span>}
        actions={headerActions}
      />

      <AdvancedKpiGrid
        items={[
          { label: 'Total actividades', value: totalActividades },
          {
            label: 'Ejecutadas',
            value: ejecutadas,
            variant: ejecutadas > 0 ? 'success' : 'default',
          },
          {
            label: 'Pendientes',
            value: pendientes,
            variant: pendientes > 0 ? 'warning' : 'default',
          },
          {
            label: 'Cumplimiento',
            value: `${cumplimiento}%`,
            variant: cumplimiento >= 80 ? 'success' : cumplimiento >= 50 ? 'warning' : cumplimiento > 0 ? 'danger' : 'default',
          },
        ]}
        columns={4}
      />

      {error && !loading ? <pre className="error">{error}</pre> : null}
      {loading ? <p className="muted">Cargando datos de inspecciones...</p> : null}

      <InspectionsHeader
        initialData={allData}
      />

      <Card title="Auditoría del módulo">
        <div className="grid grid-3">
          <div>
            <p className="label" style={{ margin: 0, fontSize: '0.82rem' }}>Total registros</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0.25rem 0 0' }}>{allData.length}</p>
          </div>
          <div>
            <p className="label" style={{ margin: 0, fontSize: '0.82rem' }}>Última sincronización</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0.25rem 0 0' }}>{lastSync || '—'}</p>
          </div>
          <div>
            <p className="label" style={{ margin: 0, fontSize: '0.82rem' }}>Estado del módulo</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0.25rem 0 0' }}>🟢 Activo</p>
          </div>
        </div>
      </Card>

      <p className="muted" style={{ fontSize: '0.82rem', textAlign: 'right' }}>
        Última actualización: {lastSync || '—'}
      </p>
    </AdvancedPageLayout>
  );
}
