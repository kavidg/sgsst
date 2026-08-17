import PizZip from 'pizzip';

/**
 * Plantillas documentales de sistema del Comité de Convivencia Laboral
 * (PHVA 1.1.8, Fase 5).
 *
 * Acta de conformación: documento formal de conformación del Comité de
 * Convivencia Laboral, generado cuando el periodo es aprobado mediante el
 * Approval Workflow (ApprovalDocumentGenerationListener → ConvivenciaDocumentGenerator
 * → ConvivenciaDocumentService) o manualmente desde el módulo.
 *
 * Reporte de cumplimiento: reporte no normativo del estado actual del dominio
 * (consume SOLO el snapshot de cumplimiento: complianceStatus, complianceReason,
 * percentage, metCriteria, missingCriteria y conteos reales). NO reimplementa
 * reglas del Compliance Engine ni inventa requisitos normativos.
 *
 * Seguridad de datos: ninguna plantilla incluye secureToken, OTP, teléfonos,
 * documentos de identidad, URLs internas, contenido de casos confidenciales ni
 * información sensible no autorizada. Los casos solo se exponen como conteos
 * agregados.
 *
 * Agrupación de variables del Acta de conformación:
 * - Empresa:       {{company.name}} {{company.nit}} {{company.workerCount}}
 * - Convivencia:   {{convivencia.periodName}} {{convivencia.startDate}}
 *                  {{convivencia.endDate}} {{convivencia.status}}
 * - Integrantes:   {{members}} {{employerRepresentatives}} {{workerRepresentatives}}
 * - Aprobación:    {{approval.status}} {{approval.approvedBy}} {{approval.approvedAt}}
 * - Control:       {{document.code}} {{document.version}} {{document.generatedAt}}
 *
 * Agrupación de variables del Reporte de cumplimiento:
 * - Empresa:       {{company.name}} {{company.nit}}
 * - Cumplimiento:  {{compliance.status}} {{compliance.reason}} {{compliance.percentage}}
 * - Criterios:     {{criteria.met}} {{criteria.missing}}
 * - Periodo:       {{period.status}} {{period.approvalStatus}} {{period.memberCount}}
 *                  {{period.meetingCount}} {{period.completedMeetingCount}}
 *                  {{period.evidenceCount}} {{period.commitmentCount}}
 * - Casos:         {{cases.total}} {{cases.open}} {{cases.closed}}
 * - Control:       {{document.code}} {{document.version}} {{document.generatedAt}}
 */
export const CONVIVENCIA_TEMPLATE_VARIABLES: string[] = [
  // Empresa
  'company.name',
  'company.nit',
  'company.workerCount',
  // Convivencia
  'convivencia.periodName',
  'convivencia.startDate',
  'convivencia.endDate',
  'convivencia.status',
  // Integrantes y representantes
  'members',
  'employerRepresentatives',
  'workerRepresentatives',
  // Aprobación
  'approval.status',
  'approval.approvedBy',
  'approval.approvedAt',
  // Control documental
  'document.code',
  'document.version',
  'document.generatedAt',
];

export const CONVIVENCIA_COMPLIANCE_VARIABLES: string[] = [
  // Empresa
  'company.name',
  'company.nit',
  // Cumplimiento
  'compliance.status',
  'compliance.reason',
  'compliance.percentage',
  // Criterios
  'criteria.met',
  'criteria.missing',
  // Periodo
  'period.status',
  'period.approvalStatus',
  'period.memberCount',
  'period.meetingCount',
  'period.completedMeetingCount',
  'period.evidenceCount',
  'period.commitmentCount',
  // Casos (solo conteos agregados)
  'cases.total',
  'cases.open',
  'cases.closed',
  // Control documental
  'document.code',
  'document.version',
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

/** Convierte una línea de texto en un párrafo XML seguro. */
function toXmlText(line: string): string {
  return escapeXml(line);
}

function buildDocx(lines: string[]): Buffer {
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
        `<w:p><w:r><w:t xml:space="preserve">${toXmlText(line)}</w:t></w:r></w:p>`,
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
 * Construye el .docx base del Acta de conformación del Comité de Convivencia
 * Laboral (1.1.8). Cada línea es un párrafo con su variable para que el
 * DocxRenderer la reemplace al generar la instancia.
 */
export function buildConvivenciaConstitutionDocx(): Buffer {
  const lines: string[] = [
    'ACTA DE CONFORMACIÓN DEL COMITÉ DE CONVIVENCIA LABORAL',
    '',
    'Empresa: {company.name}',
    'NIT: {company.nit}',
    'Número de trabajadores: {company.workerCount}',
    '',
    'Periodo del comité:',
    'Nombre: {convivencia.periodName}',
    'Inicio: {convivencia.startDate}',
    'Fin: {convivencia.endDate}',
    'Estado del periodo: {convivencia.status}',
    '',
    'Integrantes del comité:',
    '{members}',
    '',
    'Representantes del empleador:',
    '{employerRepresentatives}',
    '',
    'Representantes de los trabajadores:',
    '{workerRepresentatives}',
    '',
    'Aprobación:',
    'Estado: {approval.status}',
    'Aprobado por: {approval.approvedBy}',
    'Fecha de aprobación: {approval.approvedAt}',
    '',
    'Control documental:',
    'Código: {document.code}',
    'Versión: {document.version}',
    'Generado: {document.generatedAt}',
  ];
  return buildDocx(lines);
}

/**
 * Construye el .docx base del Reporte de cumplimiento del Comité de Convivencia
 * Laboral (1.1.8). Reporte NO normativo: consume el snapshot del dominio.
 */
export function buildConvivenciaComplianceDocx(): Buffer {
  const lines: string[] = [
    'REPORTE DE CUMPLIMIENTO — COMITÉ DE CONVIVENCIA LABORAL (1.1.8)',
    '',
    'Empresa: {company.name}',
    'NIT: {company.nit}',
    '',
    'Estado de cumplimiento: {compliance.status}',
    'Porcentaje de progreso: {compliance.percentage}%',
    'Observación: {compliance.reason}',
    '',
    'Criterios presentes:',
    '{criteria.met}',
    '',
    'Criterios pendientes:',
    '{criteria.missing}',
    '',
    'Periodo:',
    'Estado del periodo: {period.status}',
    'Estado de aprobación: {period.approvalStatus}',
    'Miembros registrados: {period.memberCount}',
    'Reuniones registradas: {period.meetingCount}',
    'Reuniones realizadas: {period.completedMeetingCount}',
    'Evidencias registradas: {period.evidenceCount}',
    'Compromisos registrados: {period.commitmentCount}',
    '',
    'Casos confidenciales (conteos agregados):',
    'Total: {cases.total}',
    'Abiertos: {cases.open}',
    'Cerrados: {cases.closed}',
    '',
    'Control documental:',
    'Código: {document.code}',
    'Versión: {document.version}',
    'Generado: {document.generatedAt}',
  ];
  return buildDocx(lines);
}
