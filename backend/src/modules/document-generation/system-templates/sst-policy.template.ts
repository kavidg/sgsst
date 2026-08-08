import PizZip from 'pizzip';

/**
 * Plantilla documental de sistema de la Política de Seguridad y Salud en el
 * Trabajo (PHVA 2.1.1).
 *
 * Fase 6 — Documento formal generado automáticamente cuando la Política SST es
 * aprobada mediante el Approval Workflow (ApprovalDocumentGenerationListener
 * → SstPolicyDocumentGenerator → PhvaAdvancedService.generateSstPolicyDocument).
 *
 * Agrupación de variables:
 * - Empresa:  {{company.name}} {{company.nit}} {{company.address}} {{company.city}}
 * - Política: {{policy.objective}} {{policy.scope}} {{policy.commitments}}
 *             {{policy.content}} {{policy.legalFramework}} {{policy.version}}
 *             {{policy.reviewDate}}
 * - Control:  {{document.code}} {{document.version}} {{document.generatedAt}}
 * - Aprobación: {{approval.approvedBy}} {{approval.approvedAt}} {{approval.status}}
 */
export const SST_POLICY_TEMPLATE_VARIABLES: string[] = [
  // Empresa
  'company.name',
  'company.nit',
  'company.address',
  'company.city',
  // Política
  'policy.objective',
  'policy.scope',
  'policy.commitments',
  'policy.content',
  'policy.legalFramework',
  'policy.version',
  'policy.reviewDate',
  // Control documental
  'document.code',
  'document.version',
  'document.generatedAt',
  // Aprobación
  'approval.approvedBy',
  'approval.approvedAt',
  'approval.status',
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
 * Construye un .docx mínimo válido con los placeholders de la Política SST.
 * Cada línea es un párrafo con su variable para que DocxRenderer la reemplace
 * al generar la instancia.
 */
export function buildSstPolicyTemplateDocx(): Buffer {
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
    'POLÍTICA DE SEGURIDAD Y SALUD EN EL TRABAJO — PHVA 2.1.1',
    '',
    'Empresa: {company.name}',
    'NIT: {company.nit}',
    'Dirección: {company.address}',
    'Ciudad: {company.city}',
    '',
    'Política:',
    'Objetivo: {policy.objective}',
    'Alcance: {policy.scope}',
    'Compromisos: {policy.commitments}',
    'Contenido:',
    '{policy.content}',
    'Marco legal: {policy.legalFramework}',
    'Versión: {policy.version}',
    'Fecha de revisión: {policy.reviewDate}',
    '',
    'Control documental:',
    'Código: {document.code}',
    'Versión: {document.version}',
    'Fecha de generación: {document.generatedAt}',
    '',
    'Aprobación:',
    'Estado: {approval.status}',
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
