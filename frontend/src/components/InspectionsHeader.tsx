import { useMemo, useState } from 'react';

const PHVA_STAGES = ['Planear', 'Hacer', 'Verificar', 'Actuar'] as const;
type PHVAStage = (typeof PHVA_STAGES)[number];

type ScheduleItem = {
  etapa: PHVAStage;
  actividad: string;
  responsable: string;
  cronograma: Record<string, '' | 'x' | 'check'>;
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

const initialSchedule: ScheduleItem[] = [];

function InspectionsHeaderTable() {
  return (
    <table className="inspections-table inspections-summary-table">
      <tbody>
        <tr>
          <th className="inspections-table__header-cell inspections-summary-table__header-cell">OBJETIVO</th>
          <th className="inspections-table__header-cell inspections-summary-table__header-cell">NOMBRE DEL INDICADOR</th>
          <th className="inspections-table__header-cell inspections-summary-table__header-cell">FÓRMULA DEL INDICADOR</th>
          <th className="inspections-table__header-cell inspections-summary-table__header-cell">RESPONSABLE</th>
          <th className="inspections-table__header-cell inspections-summary-table__header-cell">META</th>
          <th className="inspections-table__header-cell inspections-summary-table__header-cell">FRECUENCIA</th>
        </tr>
        <tr>
          <td className="inspections-table__cell inspections-summary-table__objective" rowSpan={2}>
            Identificar condiciones inseguras en las instalaciones, verificar su intervención y medir el cumplimiento
            del programa de inspecciones.
          </td>
          <td className="inspections-table__cell inspections-summary-table__indicator-name">Cumplimiento</td>
          <td className="inspections-table__cell">(Inspecciones ejecutadas / Inspecciones programadas) × 100</td>
          <td className="inspections-table__cell inspections-table__cell--center">SST</td>
          <td className="inspections-table__cell inspections-table__cell--center">100% actividades programadas</td>
          <td className="inspections-table__cell inspections-table__cell--center">Semestral</td>
        </tr>
        <tr>
          <td className="inspections-table__cell inspections-summary-table__indicator-name">Eficacia</td>
          <td className="inspections-table__cell">(Condiciones cerradas / Condiciones reportadas) × 100</td>
          <td className="inspections-table__cell inspections-table__cell--center">SST</td>
          <td className="inspections-table__cell inspections-table__cell--center">100% condiciones cerradas</td>
          <td className="inspections-table__cell inspections-table__cell--center">Semestral</td>
        </tr>
        <tr>
          <th className="inspections-table__header-cell inspections-summary-table__header-cell" colSpan={2}>
            ALCANCE
          </th>
          <th className="inspections-table__header-cell inspections-summary-table__header-cell" colSpan={2}>
            RECURSOS NECESARIOS
          </th>
          <th className="inspections-table__header-cell inspections-summary-table__header-cell" colSpan={2}>
            DOCUMENTOS DE REFERENCIA
          </th>
        </tr>
        <tr>
          <td className="inspections-table__cell" colSpan={2}>Aplica para todas las áreas.</td>
          <td className="inspections-table__cell inspections-table__cell--center" colSpan={2}>
            Económicos, técnicos, humanos e infraestructura.
          </td>
          <td className="inspections-table__cell inspections-table__cell--center" colSpan={2}>Legislación aplicable</td>
        </tr>
      </tbody>
    </table>
  );
}

export function InspectionsHeader() {
  const [schedule, setSchedule] = useState<ScheduleItem[]>(initialSchedule);
  const [selectedStage, setSelectedStage] = useState<PHVAStage>('Planear');
  const [activityDescription, setActivityDescription] = useState('');

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
    if (value !== '' && value !== 'x' && value !== 'check') return;

    setSchedule((prev) =>
      prev.map((item, rowIndex) =>
        rowIndex === index ? { ...item, cronograma: { ...item.cronograma, [key]: value } } : item
      )
    );
  };

  const addRowToStage = () => {
    const trimmedDescription = activityDescription.trim();
    if (!trimmedDescription) return;

    const newRow: ScheduleItem = {
      etapa: selectedStage,
      actividad: trimmedDescription,
      responsable: '',
      cronograma: emptyScheduleValues(),
    };

    setSchedule((prev) => {
      const insertAfterIndex = [...prev].reverse().findIndex((item) => item.etapa === selectedStage);

      if (insertAfterIndex === -1) {
        return [...prev, newRow];
      }

      const insertIndex = prev.length - insertAfterIndex;
      return [...prev.slice(0, insertIndex), newRow, ...prev.slice(insertIndex)];
    });
    setActivityDescription('');
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
        {schedule.length === 0 ? (
          <tr>
            <td className="inspections-table__cell inspections-table__cell--center" colSpan={27}>
              No hay actividades registradas. Agrega una fila para comenzar tu cronograma.
            </td>
          </tr>
        ) : schedule.map((row, index) => {
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
                    <select
                      value={row.cronograma[key]}
                      onChange={(event) => handleScheduleValueChange(index, key, event.target.value)}
                      className={`inspections-table__binary-select ${
                        row.cronograma[key] === 'check'
                          ? 'inspections-table__binary-select--check'
                          : row.cronograma[key] === 'x'
                            ? 'inspections-table__binary-select--x'
                            : ''
                      }`}
                      aria-label={`Seleccionar estado ${key} para ${row.actividad}`}
                    >
                      <option value="">—</option>
                      <option value="x">X</option>
                      <option value="check">✓</option>
                    </select>
                  </td>
                ))
              )}
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
      <div className="inspections-table-wrapper">
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <select
            value={selectedStage}
            onChange={(event) => setSelectedStage(event.target.value as PHVAStage)}
            className="inspections-table__input"
            aria-label="Seleccionar etapa"
          >
            {PHVA_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {stage}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={activityDescription}
            onChange={(event) => setActivityDescription(event.target.value)}
            className="inspections-table__input"
            placeholder="Descripción de la actividad"
            aria-label="Descripción de actividad"
          />
          <button type="button" onClick={addRowToStage} className="inspections-section__save-button">
            Agregar fila
          </button>
        </div>
      </div>
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
