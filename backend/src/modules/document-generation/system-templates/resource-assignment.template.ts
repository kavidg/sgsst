import PizZip from 'pizzip';

/**
 * Plantilla documental de sistema de la Asignación de Recursos para el SG-SST
 * (PHVA 1.1.3).
 *
 * Fase 5 — Documento formal generado automáticamente cuando el punto 1.1.3 es
 * aprobado mediante el Approval Workflow (ApprovalDocumentGenerationListener
 * → ResourceAssignmentDocumentGenerator →
 * PhvaAdvancedService.generateResourceAssignmentDocument).
 *
 * Agrupación de variables:
 * - Empresa:      {{company.name}} {{company.nit}}
 * - Recursos:     {{resources.human}} {{resources.technical}}
 *                 {{resources.financial}} {{resources.physical}}
 * - Asignación:   {{assignment.responsible}}
 * - Control:      {{document.date}}
 * - Aprobación:   {{approval.approvedBy}} {{approval.approvedAt}}
 *
 * NOTA: las listas de recursos se entregan como texto multilínea por el
 * servicio de generación (el renderer DOCX espera valores escalares por
 * placeholder).
 */
export const RESOURCE_ASSIGNMENT_TEMPLATE_VARIABLES: string[] = [
  // Empresa
  'company.name',
  'company.nit',
  // Recursos
  'resources.human',
  'resources.technical',
  'resources.financial',
  'resources.physical',
  // Asignación
  'assignment.responsible',
  // Control documental
  'document.date',
  // Aprobación
  'approval.approvedBy',
  'approval.approvedAt',
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
 * Construye un .docx mínimo válido con los placeholders de la Asignación de
 * Recursos del SG-SST. Cada línea es un párrafo con su variable para que
 * DocxRenderer la reemplace al generar la instancia.
 */
export function buildResourceAssignmentTemplateDocx(): Buffer {
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
    'ASIGNACIÓN DE RECURSOS PARA EL SG-SST — PHVA 1.1.3 (Resolución 0312 de 2019)',
    '',
    'Empresa: {company.name}',
    'NIT: {company.nit}',
    '',
    'Recursos asignados:',
    'Humanos: {resources.human}',
    'Técnicos: {resources.technical}',
    'Financieros: {resources.financial}',
    'Físicos: {resources.physical}',
    '',
    'Asignación:',
    'Responsable: {assignment.responsible}',
    '',
    'Control documental:',
    'Fecha: {document.date}',
    '',
    'Aprobación:',
    'Aprobado por: {approval.approvedBy}',
    'Fecha de aprobación: {approval.approvedAt}',
  ];

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
