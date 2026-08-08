import PizZip from 'pizzip';

/**
 * Plantilla documental de sistema del COPASST (Fase 3).
 *
 * Documento formal de conformación del Comité Paritario de Seguridad y Salud
 * en el Trabajo, generado automáticamente cuando el periodo COPASST es
 * aprobado mediante el Approval Workflow (ApprovalDocumentGenerationListener
 * → CopasstDocumentGenerator → PhvaAdvancedService.generateCopasstDocument).
 *
 * Agrupación de variables:
 * - Empresa:      {{company.name}} {{company.nit}} {{company.address}}
 *                 {{company.workerCount}}
 * - COPASST:      {{copasst.startDate}} {{copasst.endDate}} {{copasst.period}}
 * - Integrantes:  {{members}}
 * - Representantes:{{employerRepresentatives}} {{workerRepresentatives}}
 * - Funciones:    {{functions}}
 * - Aprobación:   {{approval.approvedBy}} {{approval.approvedAt}} {{approval.status}}
 * - Control:      {{document.code}} {{document.version}} {{document.generatedAt}}
 *
 * NOTA: el schema de Company no persiste dirección; company.address queda null
 * y el renderer lo reemplaza por cadena vacía (nullGetter). workerCount se
 * resuelve desde company.employeeCount.
 */
export const COPASST_TEMPLATE_VARIABLES: string[] = [
  // Empresa
  'company.name',
  'company.nit',
  'company.address',
  'company.workerCount',
  // COPASST
  'copasst.startDate',
  'copasst.endDate',
  'copasst.period',
  // Integrantes y representantes
  'members',
  'employerRepresentatives',
  'workerRepresentatives',
  // Funciones
  'functions',
  // Aprobación
  'approval.status',
  'approval.approvedBy',
  'approval.approvedAt',
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

/** Convierte un salto de línea real en <w:br/> para párrafos multilínea. */
function toXmlText(line: string): string {
  return escapeXml(line);
}

/**
 * Construye un .docx mínimo válido con los placeholders del documento de
 * conformación del COPASST. Cada línea es un párrafo con su variable para que
 * DocxRenderer la reemplace al generar la instancia.
 */
export function buildCopasstTemplateDocx(): Buffer {
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

  const lines: string[] = [
    'ACTA DE CONFORMACIÓN DEL COMITÉ PARITARIO DE SEGURIDAD Y SALUD EN EL TRABAJO (COPASST)',
    '',
    'Empresa: {company.name}',
    'NIT: {company.nit}',
    'Dirección: {company.address}',
    'Número de trabajadores: {company.workerCount}',
    '',
    'Periodo del comité:',
    'Inicio: {copasst.startDate}',
    'Fin: {copasst.endDate}',
    'Periodo: {copasst.period}',
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
    'Funciones del comité:',
    '{functions}',
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
