import { useMemo, useState } from 'react';

type ScheduleItem = {
  etapa: string;
  actividad: string;
  responsable: string;
  cronograma: Record<string, '' | '0' | '1'>;
  fecha: string;
  estado: boolean;
};

const scheduleHeaders = [
  { mes: 'ENE', claves: ['eneP', 'eneE'] },
  { mes: 'FEB', claves: ['febP', 'febE'] },
  { mes: 'MAR', claves: ['marP', 'marE'] },
  { mes: 'ABR', claves: ['abrP', 'abrE'] },
  { mes: 'MAY', claves: ['mayP', 'mayE'] },
  { mes: 'JUN', claves: ['junP', 'junE'] },
  { mes: 'JUL', claves: ['julP', 'julE'] },
  { mes: 'AGO.', claves: ['agoP', 'agoE'] },
  { mes: 'SEP.', claves: ['sepP', 'sepE'] },
  { mes: 'OCT', claves: ['octP', 'octE'] },
  { mes: 'NOV', claves: ['novP', 'novE'] },
  { mes: 'DIC', claves: ['dicP', 'dicE'] },
] as const;

const emptyScheduleValues = (): ScheduleItem['cronograma'] =>
  Object.fromEntries(scheduleHeaders.flatMap((item) => item.claves.map((clave) => [clave, '']))) as ScheduleItem['cronograma'];

const initialSchedule: ScheduleItem[] = [
  {
    etapa: 'Planear',
    actividad: 'Establecer objetivos y metas',
    responsable: '',
    cronograma: emptyScheduleValues(),
    fecha: '',
    estado: false,
  },
  {
    etapa: 'Planear',
    actividad: 'Establecer indicadores de gestión',
    responsable: '',
    cronograma: emptyScheduleValues(),
    fecha: '',
    estado: false,
  },
  {
    etapa: 'Planear',
    actividad: 'Establecer los mecanismos para controlar el riesgo',
    responsable: '',
    cronograma: emptyScheduleValues(),
    fecha: '',
    estado: false,
  },
  {
    etapa: 'Hacer',
    actividad: 'Inspecciones locativas',
    responsable: '',
    cronograma: emptyScheduleValues(),
    fecha: '',
    estado: false,
  },
  {
    etapa: 'Hacer',
    actividad: 'Inspecciones de extintores',
    responsable: '',
    cronograma: emptyScheduleValues(),
    fecha: '',
    estado: false,
  },
  {
    etapa: 'Hacer',
    actividad: 'Inspeccion gerencial',
    responsable: '',
    cronograma: emptyScheduleValues(),
    fecha: '',
    estado: false,
  },
  {
    etapa: 'Hacer',
    actividad: 'inspeccion a productos quimicos',
    responsable: '',
    cronograma: emptyScheduleValues(),
    fecha: '',
    estado: false,
  },
  {
    etapa: 'Hacer',
    actividad: 'Inspeccion a extintores',
    responsable: '',
    cronograma: emptyScheduleValues(),
    fecha: '',
    estado: false,
  },
  {
    etapa: 'Hacer',
    actividad: 'Inspección a vehiculos',
    responsable: '',
    cronograma: emptyScheduleValues(),
    fecha: '',
    estado: false,
  },
  {
    etapa: 'Hacer',
    actividad: 'Inspección a herramientas',
    responsable: '',
    cronograma: emptyScheduleValues(),
    fecha: '',
    estado: false,
  },
  {
    etapa: 'Hacer',
    actividad: 'Inspección botiquin',
    responsable: '',
    cronograma: emptyScheduleValues(),
    fecha: '',
    estado: false,
  },
  {
    etapa: 'Hacer',
    actividad: 'Inspeccion de EPPS s',
    responsable: '',
    cronograma: emptyScheduleValues(),
    fecha: '',
    estado: false,
  },
  {
    etapa: 'Hacer',
    actividad: 'capacitar al personar en alistamiento e inspeccion de vehiculos.',
    responsable: '',
    cronograma: emptyScheduleValues(),
    fecha: '',
    estado: false,
  },
  {
    etapa: 'Verificar',
    actividad: 'Seguimiento a Indicadores',
    responsable: '',
    cronograma: emptyScheduleValues(),
    fecha: '',
    estado: false,
  },
  {
    etapa: 'Verificar',
    actividad: 'Seguimiento a las acciones tomadas frente a los hallazgos',
    responsable: '',
    cronograma: emptyScheduleValues(),
    fecha: '',
    estado: false,
  },
  {
    etapa: 'Actuar',
    actividad: 'Implementación de acciones correctivas y preventivas / correctivos',
    responsable: '',
    cronograma: emptyScheduleValues(),
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

  const handleScheduleValueChange = (index: number, key: keyof ScheduleItem['cronograma'], value: string) => {
    if (value !== '' && value !== '0' && value !== '1') return;

    setSchedule((prev) =>
      prev.map((item, rowIndex) =>
        rowIndex === index ? { ...item, cronograma: { ...item.cronograma, [key]: value } } : item
      )
    );
  };

  const InspectionsSchedule = () => (
    <div className="inspections-table-wrapper">
      <table className="inspections-table">
        <thead>
        <tr>
          <th className="inspections-table__header-cell inspections-table__header-cell--center" rowSpan={3}>
            Etapa
          </th>
          <th className="inspections-table__header-cell inspections-table__header-cell--center" rowSpan={3}>
            Actividades
          </th>
          <th className="inspections-table__header-cell inspections-table__header-cell--center" rowSpan={3}>
            Responsable
          </th>
          <th className="inspections-table__header-cell inspections-table__header-cell--center" colSpan={12}>
            SEMESTRE I
          </th>
          <th className="inspections-table__header-cell inspections-table__header-cell--center" colSpan={12}>
            SEMESTRE II
          </th>
          <th className="inspections-table__header-cell inspections-table__header-cell--center" rowSpan={3}>
            Fecha
          </th>
          <th className="inspections-table__header-cell inspections-table__header-cell--center" rowSpan={3}>
            Estado
          </th>
        </tr>
        <tr>
          {scheduleHeaders.map((item) => (
            <th key={item.mes} className="inspections-table__header-cell inspections-table__header-cell--center" colSpan={2}>
              {item.mes}
            </th>
          ))}
        </tr>
        <tr>
          {scheduleHeaders.flatMap((item) =>
            item.claves.map((key) => (
              <th key={key} className="inspections-table__header-cell inspections-table__header-cell--center">
                {key.endsWith('P') ? 'P' : 'E'}
              </th>
            ))
          )}
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
              {scheduleHeaders.flatMap((item) =>
                item.claves.map((key) => (
                  <td key={`${row.etapa}-${row.actividad}-${key}`} className="inspections-table__cell inspections-table__cell--center">
                    <input
                      type="text"
                      value={row.cronograma[key]}
                      onChange={(event) => handleScheduleValueChange(index, key, event.target.value)}
                      className="inspections-table__binary-input"
                      maxLength={1}
                      inputMode="numeric"
                      pattern="[01]"
                    />
                  </td>
                ))
              )}
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
    </div>
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
