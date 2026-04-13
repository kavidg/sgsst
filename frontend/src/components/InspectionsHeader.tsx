const planningActivities = [
  'Establecer objetivos y metas',
  'Establecer indicadores de gestión',
  'Establecer los mecanismos para controlar el riesgo',
];

const scheduleRows = [
  { actividad: 'Definir objetivos y metas SST', responsable: 'Líder SST', frecuencia: 'Mensual', estado: 'Programada' },
  {
    actividad: 'Actualizar indicadores de gestión',
    responsable: 'Coordinador HSE',
    frecuencia: 'Trimestral',
    estado: 'En seguimiento',
  },
  {
    actividad: 'Revisar mecanismos de control del riesgo',
    responsable: 'COPASST',
    frecuencia: 'Mensual',
    estado: 'Pendiente',
  },
];

export function InspectionsHeader() {
  return (
    <section className="bg-white rounded-2xl shadow-sm p-6 md:p-8 space-y-6">
      <table className="w-full border-2 border-black border-collapse text-sm md:text-base">
        <thead>
          <tr>
            <th className="border border-black bg-slate-300 py-3 px-4 text-center font-bold tracking-wide" colSpan={2}>
              ACTIVIDADES
            </th>
          </tr>
        </thead>
        <tbody>
          {planningActivities.map((activity, index) => (
            <tr key={activity}>
              {index === 0 ? (
                <td
                  className="border border-black bg-blue-500 text-white font-semibold text-center align-middle px-4 py-3"
                  rowSpan={planningActivities.length}
                >
                  PLANEAR
                </td>
              ) : null}
              <td className="border border-black border-dashed px-4 py-3">{activity}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <table className="w-full border-2 border-black border-collapse text-sm md:text-base">
        <thead>
          <tr>
            <th className="border border-black bg-slate-200 px-4 py-2 text-left font-semibold">Actividad programada</th>
            <th className="border border-black bg-slate-200 px-4 py-2 text-left font-semibold">Responsable</th>
            <th className="border border-black bg-slate-200 px-4 py-2 text-left font-semibold">Frecuencia</th>
            <th className="border border-black bg-slate-200 px-4 py-2 text-left font-semibold">Estado</th>
          </tr>
        </thead>
        <tbody>
          {scheduleRows.map((row) => (
            <tr key={row.actividad}>
              <td className="border border-black px-4 py-2">{row.actividad}</td>
              <td className="border border-black px-4 py-2">{row.responsable}</td>
              <td className="border border-black px-4 py-2">{row.frecuencia}</td>
              <td className="border border-black px-4 py-2">{row.estado}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
