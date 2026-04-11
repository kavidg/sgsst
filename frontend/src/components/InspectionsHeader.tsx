export function InspectionsHeader() {
  return (
    <section className="bg-white rounded-2xl shadow-sm p-6 md:p-8 space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-500 uppercase tracking-wide">Inspecciones SST</p>
        <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">Programa de Inspecciones</h1>
        <p className="text-slate-600 max-w-3xl">
          Gestiona inspecciones planeadas para identificar actos y condiciones inseguras de forma oportuna,
          promoviendo la prevención de accidentes y el fortalecimiento de la cultura de seguridad.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 p-4 bg-slate-50/70 space-y-2">
          <h2 className="text-base font-semibold text-slate-900">Cumplimiento</h2>
          <p className="text-sm text-slate-600">Mide el porcentaje de inspecciones ejecutadas frente a las programadas.</p>
          <p className="text-sm font-medium text-slate-800">Fórmula: (Inspecciones realizadas / Inspecciones programadas) × 100</p>
        </article>
        <article className="rounded-2xl border border-slate-200 p-4 bg-slate-50/70 space-y-2">
          <h2 className="text-base font-semibold text-slate-900">Eficacia</h2>
          <p className="text-sm text-slate-600">Evalúa el cierre efectivo de hallazgos críticos en el periodo definido.</p>
          <p className="text-sm font-medium text-slate-800">Fórmula: (Hallazgos cerrados / Hallazgos detectados) × 100</p>
        </article>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <article className="rounded-xl border border-slate-200 p-4 space-y-1">
          <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">Responsable</h3>
          <p className="text-sm text-slate-600">Líder SST y supervisores de área.</p>
        </article>
        <article className="rounded-xl border border-slate-200 p-4 space-y-1">
          <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">Meta</h3>
          <p className="text-sm text-slate-600">Cumplimiento ≥ 95% y eficacia ≥ 90% mensual.</p>
        </article>
        <article className="rounded-xl border border-slate-200 p-4 space-y-1">
          <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">Frecuencia</h3>
          <p className="text-sm text-slate-600">Seguimiento mensual con revisión trimestral.</p>
        </article>
      </div>

      <article className="rounded-2xl border border-slate-200 p-4 md:p-5 bg-slate-50/60 space-y-2">
        <h2 className="text-base font-semibold text-slate-900">Alcance</h2>
        <p className="text-sm text-slate-600">
          Aplica a todas las áreas operativas, administrativas y de apoyo de la organización, incluyendo
          equipos, instalaciones, procesos críticos y condiciones de trabajo que puedan representar riesgos
          para las personas, el ambiente o la continuidad operacional.
        </p>
      </article>
    </section>
  );
}
