import { useMemo, useState } from 'react';

type ScheduleItem = {
  etapa: string;
  actividad: string;
  responsable: string;
  fecha: string;
  estado: boolean;
};

const initialSchedule: ScheduleItem[] = [
  {
    etapa: 'Planear',
    actividad: 'Establecer objetivos y metas',
    responsable: '',
    fecha: '',
    estado: false,
  },
  {
    etapa: 'Planear',
    actividad: 'Establecer indicadores de gestión',
    responsable: '',
    fecha: '',
    estado: false,
  },
  {
    etapa: 'Planear',
    actividad: 'Establecer los mecanismos para controlar el riesgo',
    responsable: '',
    fecha: '',
    estado: false,
  },
];

function InspectionsHeaderTable() {
  return (
    <table className="inspections-table">
      <tbody>
        <tr>
          <th className="inspections-table__header-cell inspections-table__header-cell--narrow">OBJETIVO</th>
          <td className="inspections-table__cell" colSpan={5}>
            Identificar condiciones inseguras en las instalaciones, verificar su intervención y medir el cumplimiento
            del programa de inspecciones.
          </td>
        </tr>
        <tr>
          <th className="inspections-table__header-cell">INDICADORES</th>
          <td className="inspections-table__cell" colSpan={2}>
            <p>
              <span className="font-semibold">Cumplimiento:</span> (Inspecciones ejecutadas / Inspecciones programadas)
              × 100
            </p>
            <p>
              <span className="font-semibold">Eficacia:</span> (Condiciones cerradas / Condiciones reportadas) × 100
            </p>
          </td>
          <th className="inspections-table__header-cell">RESPONSABLE</th>
          <td className="inspections-table__cell">SST</td>
          <th className="inspections-table__header-cell">FRECUENCIA</th>
          <td className="inspections-table__cell">Semestral</td>
        </tr>
        <tr>
          <th className="inspections-table__header-cell">META</th>
          <td className="inspections-table__cell" colSpan={2}>
            100% actividades
          </td>
          <th className="inspections-table__header-cell" colSpan={2}>
            META (Eficacia)
          </th>
          <td className="inspections-table__cell" colSpan={2}>
            100% condiciones cerradas
          </td>
        </tr>
        <tr>
          <th className="inspections-table__header-cell">ALCANCE</th>
          <td className="inspections-table__cell" colSpan={5}>
            Aplica para todas las áreas.
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export function InspectionsHeader() {
  const [schedule, setSchedule] = useState<ScheduleItem[]>(initialSchedule);

  const etapaCounts = useMemo(() => {
    return schedule.reduce<Record<string, number>>((acc, item) => {
      acc[item.etapa] = (acc[item.etapa] ?? 0) + 1;
      return acc;
    }, {});
  }, [schedule]);

  const handleFieldChange = <K extends keyof ScheduleItem>(index: number, field: K, value: ScheduleItem[K]) => {
    setSchedule((prev) => prev.map((item, rowIndex) => (rowIndex === index ? { ...item, [field]: value } : item)));
  };

  const InspectionsSchedule = () => (
    <table className="inspections-table">
      <thead>
        <tr>
          <th className="inspections-table__header-cell inspections-table__header-cell--center">Etapa</th>
          <th className="inspections-table__header-cell inspections-table__header-cell--center">Actividades</th>
          <th className="inspections-table__header-cell inspections-table__header-cell--center">Responsable</th>
          <th className="inspections-table__header-cell inspections-table__header-cell--center">Fecha</th>
          <th className="inspections-table__header-cell inspections-table__header-cell--center">Estado</th>
        </tr>
      </thead>
      <tbody>
        {schedule.map((row, index) => {
          const showEtapa = index === 0 || schedule[index - 1].etapa !== row.etapa;

          return (
            <tr key={`${row.etapa}-${row.actividad}`}>
              {showEtapa ? (
                <td className="inspections-table__stage-cell" rowSpan={etapaCounts[row.etapa]}>
                  {row.etapa.toUpperCase()}
                </td>
              ) : null}
              <td className="inspections-table__cell">{row.actividad}</td>
              <td className="inspections-table__cell">
                <input
                  type="text"
                  value={row.responsable}
                  onChange={(event) => handleFieldChange(index, 'responsable', event.target.value)}
                  className="inspections-table__input"
                  placeholder="Asignar responsable"
                />
              </td>
              <td className="inspections-table__cell">
                <input
                  type="date"
                  value={row.fecha}
                  onChange={(event) => handleFieldChange(index, 'fecha', event.target.value)}
                  className="inspections-table__input"
                />
              </td>
              <td className="inspections-table__cell inspections-table__cell--center">
                <input
                  type="checkbox"
                  checked={row.estado}
                  onChange={(event) => handleFieldChange(index, 'estado', event.target.checked)}
                  className="inspections-table__checkbox"
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <section className="inspections-section">
      <InspectionsHeaderTable />
      <InspectionsSchedule />
      <button
        type="button"
        onClick={() => console.log('Cronograma actual:', schedule)}
        className="inspections-section__save-button"
      >
        Guardar cronograma
      </button>
    </section>
  );
}
