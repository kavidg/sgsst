import PizZip from 'pizzip';

/**
 * Plantillas documentales de sistema de la Capacitación COPASST (PHVA 1.1.7,
 * Fase 4).
 *
 * Cuatro documentos formales del estándar 1.1.7, generados manualmente desde
 * la UI de Gestión Avanzada (Fase 4) y preparados para conectarse al Approval
 * Workflow en la Fase 5:
 *
 *   1. COPASST_TRAINING_CERTIFICATE   — Certificado de capacitación COPASST.
 *   2. COPASST_TRAINING_ATTENDANCE    — Lista de asistencia por sesión.
 *   3. COPASST_TRAINING_REPORT        — Informe documental de la capacitación.
 *   4. COPASST_TRAINING_COMPLIANCE    — Reporte de cumplimiento (estado actual).
 *
 * Siguen el patrón de copasst.template.ts: cada línea es un párrafo con su
 * placeholder ({variable.path}) para que DocxRenderer la reemplace al generar
 * la instancia. Las listas se entregan como texto multilínea (el renderer usa
 * linebreaks:true). Valores ausentes → null → cadena vacía (nullGetter), sin
 * excepción.
 *
 * NO contiene lógica de negocio: únicamente la estructura DOCX base y las
 * variables declaradas explícitamente (evitar placeholders silenciosos).
 */

/** Variables del Certificado de capacitación COPASST (1.1.7). */
export const COPASST_TRAINING_CERTIFICATE_VARIABLES: string[] = [
  // Empresa
  'company.name',
  'company.nit',
  // Participante (snapshot histórico de la sesión)
  'participant.name',
  'participant.userId',
  'participant.committeeRole',
  'participant.representationType',
  // Capacitación (sesión ejecutada)
  'training.title',
  'training.type',
  'training.date',
  'training.endDate',
  'training.duration',
  'training.instructor',
  'training.location',
  'training.evaluation',
  // Control documental
  'document.code',
  'document.year',
  'document.generatedAt',
];

/** Variables de la Lista de asistencia por sesión (1.1.7). */
export const COPASST_TRAINING_ATTENDANCE_VARIABLES: string[] = [
  // Empresa
  'company.name',
  'company.nit',
  // Capacitación (sesión)
  'training.title',
  'training.type',
  'training.date',
  'training.duration',
  'training.instructor',
  'training.location',
  // Participantes (snapshot histórico + espacio de firma)
  'participants',
  // Control documental
  'document.code',
  'document.year',
  'document.generatedAt',
];

/** Variables del Informe de capacitación (1.1.7). */
export const COPASST_TRAINING_REPORT_VARIABLES: string[] = [
  // Empresa
  'company.name',
  'company.nit',
  // Identificación del estándar
  'training.year',
  'training.period',
  'training.program',
  // Sesiones y cobertura
  'sessions.executed',
  'sessions.programmed',
  'participants.total',
  'participants.trained',
  'participants.pending',
  'coverage.percentage',
  // Evidencias y evaluaciones
  'evidences.total',
  'evaluations.attempts',
  'evaluations.passed',
  // Estado de cumplimiento
  'compliance.status',
  'compliance.reason',
  // Historial relevante
  'history',
  // Control documental
  'document.code',
  'document.generatedAt',
];

/** Variables del Reporte de cumplimiento (1.1.7). */
export const COPASST_TRAINING_COMPLIANCE_VARIABLES: string[] = [
  // Empresa
  'company.name',
  'company.nit',
  // Estado actual
  'compliance.status',
  'compliance.reason',
  // Cobertura
  'coverage.totalMembers',
  'coverage.trainedMembers',
  'coverage.pendingMembers',
  'coverage.percentage',
  // Sesiones
  'sessions.programmed',
  'sessions.executed',
  'sessions.expired',
  // Evidencias
  'evidences.total',
  'evidences.attendance',
  'evidences.signatures',
  'evidences.certificates',
  // Evaluaciones
  'evaluations.attempts',
  'evaluations.passed',
  // Observaciones / findings
  'observations',
  // Control documental
  'document.code',
  'document.generatedAt',
];

/** Escapa texto para XML de document.xml. */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Construye un .docx mínimo válido con los placeholders indicados (mismo
 * patrón de copasst.template.ts). Cada línea es un párrafo con su variable.
 */
function buildMinimalDocx(lines: string[]): Buffer {
  const zip = new PizZip();

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );

  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );

  const bodyXml = lines
    .map(
      (line) =>
        `<w:p><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`,
    )
    .join('');

  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyXml}
  </w:body>
</w:document>`,
  );

  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/**
 * Certificado de capacitación COPASST (1.1.7). Se genera para un participante
 * concreto de una sesión EJECUTADA (usa el snapshot histórico del participante,
 * nunca re-resuelve el miembro actual del periodo).
 */
export function buildCopasstTrainingCertificateDocx(): Buffer {
  return buildMinimalDocx([
    'CERTIFICADO DE CAPACITACIÓN COPASST',
    'Estándar 1.1.7 — Capacitación de los integrantes del COPASST',
    '',
    'La empresa {company.name} con NIT {company.nit} certifica que:',
    '',
    'Nombre del participante: {participant.name}',
    'Identificación (userId): {participant.userId}',
    'Rol en el COPASST: {participant.committeeRole}',
    'Representación: {participant.representationType}',
    '',
    'Participó y aprobó la capacitación:',
    '',
    'Título: {training.title}',
    'Tipo: {training.type}',
    'Fecha: {training.date}',
    'Fecha de finalización: {training.endDate}',
    'Duración: {training.duration}',
    'Instructor: {training.instructor}',
    'Lugar: {training.location}',
    'Resultado de evaluación: {training.evaluation}',
    '',
    'Control documental:',
    'Código: {document.code}',
    'Año: {document.year}',
    'Generado: {document.generatedAt}',
  ]);
}

/**
 * Lista de asistencia por sesión (1.1.7). Usa EXCLUSIVAMENTE el snapshot
 * histórico de participantes de la sesión (inmutable); no re-resuelve los
 * miembros actuales del periodo COPASST.
 */
export function buildCopasstTrainingAttendanceDocx(): Buffer {
  return buildMinimalDocx([
    'LISTA DE ASISTENCIA — CAPACITACIÓN COPASST',
    'Estándar 1.1.7 — Capacitación de los integrantes del COPASST',
    '',
    'Empresa: {company.name}',
    'NIT: {company.nit}',
    '',
    'Capacitación: {training.title}',
    'Tipo: {training.type}',
    'Fecha: {training.date}',
    'Duración: {training.duration}',
    'Instructor: {training.instructor}',
    'Lugar: {training.location}',
    '',
    'Participantes:',
    '{participants}',
    '',
    'Control documental:',
    'Código: {document.code}',
    'Año: {document.year}',
    'Generado: {document.generatedAt}',
  ]);
}

/**
 * Informe documental de la capacitación COPASST (1.1.7). Usa únicamente datos
 * reales del dominio (empresa, sesiones, participantes, cobertura, evidencias,
 * evaluaciones, estado de cumplimiento e historial). No inventa contenido
 * normativo.
 */
export function buildCopasstTrainingReportDocx(): Buffer {
  return buildMinimalDocx([
    'INFORME DE CAPACITACIÓN COPASST',
    'Estándar 1.1.7 — Capacitación de los integrantes del COPASST',
    '',
    'Empresa: {company.name}',
    'NIT: {company.nit}',
    '',
    'Identificación:',
    'Año: {training.year}',
    'Periodo COPASST: {training.period}',
    '',
    'Programa anual:',
    '{training.program}',
    '',
    'Sesiones:',
    'Ejecutadas: {sessions.executed}',
    'Programadas: {sessions.programmed}',
    '',
    'Participantes:',
    'Total miembros activos: {participants.total}',
    'Miembros capacitados: {participants.trained}',
    'Miembros pendientes: {participants.pending}',
    'Cobertura: {coverage.percentage}%',
    '',
    'Evidencias: {evidences.total}',
    '',
    'Evaluaciones:',
    'Intentos: {evaluations.attempts}',
    'Aprobadas: {evaluations.passed}',
    '',
    'Estado de cumplimiento: {compliance.status}',
    'Observación: {compliance.reason}',
    '',
    'Historial relevante:',
    '{history}',
    '',
    'Control documental:',
    'Código: {document.code}',
    'Generado: {document.generatedAt}',
  ]);
}

/**
 * Reporte de cumplimiento (1.1.7). Consume únicamente el estado actual del
 * dominio; NO implementa reglas del Compliance Engine (fase posterior).
 */
export function buildCopasstTrainingComplianceDocx(): Buffer {
  return buildMinimalDocx([
    'REPORTE DE CUMPLIMIENTO — CAPACITACIÓN COPASST',
    'Estándar 1.1.7 — Capacitación de los integrantes del COPASST',
    '',
    'Empresa: {company.name}',
    'NIT: {company.nit}',
    '',
    'Estado actual: {compliance.status}',
    'Observación: {compliance.reason}',
    '',
    'Cobertura:',
    'Miembros activos: {coverage.totalMembers}',
    'Miembros capacitados: {coverage.trainedMembers}',
    'Miembros pendientes: {coverage.pendingMembers}',
    'Porcentaje de cobertura: {coverage.percentage}%',
    '',
    'Sesiones:',
    'Programadas: {sessions.programmed}',
    'Ejecutadas: {sessions.executed}',
    'Vencidas: {sessions.expired}',
    '',
    'Evidencias:',
    'Total: {evidences.total}',
    'Asistencia: {evidences.attendance}',
    'Firmas: {evidences.signatures}',
    'Certificados: {evidences.certificates}',
    '',
    'Evaluaciones:',
    'Intentos: {evaluations.attempts}',
    'Aprobadas: {evaluations.passed}',
    '',
    'Observaciones / findings:',
    '{observations}',
    '',
    'Control documental:',
    'Código: {document.code}',
    'Generado: {document.generatedAt}',
  ]);
}
