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
    <table className="w-full border-2 border-black border-collapse text-sm md:text-base">
      <tbody>
        <tr>
          <th className="border border-black bg-gray-100 font-semibold text-left px-4 py-3 w-1/5">OBJETIVO</th>
          <td className="border border-black px-4 py-3" colSpan={5}>
            Identificar condiciones inseguras en las instalaciones, verificar su intervención y medir el cumplimiento
            del programa de inspecciones.
          </td>
        </tr>
        <tr>
          <th className="border border-black bg-gray-100 font-semibold text-left px-4 py-3">INDICADORES</th>
          <td className="border border-black px-4 py-3" colSpan={2}>
            <p>
              <span className="font-semibold">Cumplimiento:</span> (Inspecciones ejecutadas / Inspecciones programadas)
              × 100
            </p>
            <p>
              <span className="font-semibold">Eficacia:</span> (Condiciones cerradas / Condiciones reportadas) × 100
            </p>
          </td>
          <th className="border border-black bg-gray-100 font-semibold text-left px-4 py-3">RESPONSABLE</th>
          <td className="border border-black px-4 py-3">SST</td>
          <th className="border border-black bg-gray-100 font-semibold text-left px-4 py-3">FRECUENCIA</th>
          <td className="border border-black px-4 py-3">Semestral</td>
        </tr>
        <tr>
          <th className="border border-black bg-gray-100 font-semibold text-left px-4 py-3">META</th>
          <td className="border border-black px-4 py-3" colSpan={2}>
            100% actividades
          </td>
          <th className="border border-black bg-gray-100 font-semibold text-left px-4 py-3" colSpan={2}>
            META (Eficacia)
          </th>
          <td className="border border-black px-4 py-3" colSpan={2}>
            100% condiciones cerradas
          </td>
        </tr>
        <tr>
          <th className="border border-black bg-gray-100 font-semibold text-left px-4 py-3">ALCANCE</th>
          <td className="border border-black px-4 py-3" colSpan={5}>
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
    <table className="w-full border-2 border-black border-collapse text-sm md:text-base">
      <thead>
        <tr>
          <th className="border border-black bg-gray-100 py-3 px-4 text-center font-semibold">Etapa</th>
          <th className="border border-black bg-gray-100 py-3 px-4 text-center font-semibold">Actividades</th>
          <th className="border border-black bg-gray-100 py-3 px-4 text-center font-semibold">Responsable</th>
          <th className="border border-black bg-gray-100 py-3 px-4 text-center font-semibold">Fecha</th>
          <th className="border border-black bg-gray-100 py-3 px-4 text-center font-semibold">Estado</th>
        </tr>
      </thead>
      <tbody>
        {schedule.map((row, index) => {
          const showEtapa = index === 0 || schedule[index - 1].etapa !== row.etapa;

          return (
            <tr key={`${row.etapa}-${row.actividad}`}>
              {showEtapa ? (
                <td className="border border-black bg-blue-500 text-white font-semibold text-center align-middle px-4 py-3" rowSpan={etapaCounts[row.etapa]}>
                  {row.etapa.toUpperCase()}
                </td>
              ) : null}
              <td className="border border-black px-4 py-3">{row.actividad}</td>
              <td className="border border-black px-4 py-3">
                <input
                  type="text"
                  value={row.responsable}
                  onChange={(event) => handleFieldChange(index, 'responsable', event.target.value)}
                  className="w-full border border-slate-400 rounded-md px-3 py-2"
                  placeholder="Asignar responsable"
                />
              </td>
              <td className="border border-black px-4 py-3">
                <input
                  type="date"
                  value={row.fecha}
                  onChange={(event) => handleFieldChange(index, 'fecha', event.target.value)}
                  className="w-full border border-slate-400 rounded-md px-3 py-2"
                />
              </td>
              <td className="border border-black px-4 py-3 text-center align-middle">
                <input
                  type="checkbox"
                  checked={row.estado}
                  onChange={(event) => handleFieldChange(index, 'estado', event.target.checked)}
                  className="h-5 w-5 accent-blue-600"
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <section className="space-y-8">
      <InspectionsHeaderTable />
      <InspectionsSchedule />
      <button
        type="button"
        onClick={() => console.log('Cronograma actual:', schedule)}
        className="border-2 border-black rounded-md px-5 py-2 font-semibold hover:bg-slate-100 transition-colors"
      >
        Guardar cronograma
      </button>
    </section>
  );
}
