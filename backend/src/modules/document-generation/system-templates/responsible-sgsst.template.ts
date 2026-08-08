import PizZip from 'pizzip';

/**
 * Plantilla documental de sistema del Responsable del SG-SST (PHVA 1.1.1).
 *
 * Fase 2 — Primer documento formal generado automáticamente por el sistema con
 * enfoque Resolución 0312 de 2019. La plantilla declara las variables que
 * DocumentGenerationService resuelve vía ResponsibleSgsstVariableResolver y
 * renderiza con DocxRenderer (delimitadores { } + parser de paths punto a
 * punto).
 *
 * Fase 8.3.D — el documento oficial se completa con las secciones que
 * representan la información diligenciada, validada y aprobada:
 *
 *   - Empresa:        {company.name} {company.nit} {company.address}
 *   - Responsable:    {responsible.name} {responsible.document}
 *                     {responsible.position} {responsible.profession}
 *                     {responsible.sstProfessionalType} {responsible.email}
 *   - Licencia SST:   {license.number} {license.type} {license.issuingAuthority}
 *                     {license.issueDate} {license.documentStatus}
 *                     {license.documentValidity}   ← dato documental opcional,
 *                     NUNCA requisito de cumplimiento (la licencia SST no
 *                     posee vencimiento normativo obligatorio).
 *   - Formación:      {formation.course50HoursDate} {formation.course50HoursEvidence}
 *                     {formation.course20HoursState} {formation.course20HoursDate}
 *                     {formation.course20HoursEvidence}
 *   - Designación:    {designation.date} {designation.number}
 *                     {designation.issuerName} {designation.issuerPosition}
 *                     {designation.evidence}
 *   - Evidencias:     {evidences.list} (texto multilínea)
 *   - Cumplimiento:   {compliance.status} {compliance.reason}
 *   - SG-SST:         {sgsst.standardType} {sgsst.evaluationLevel}
 *   - Asignación:     {assignment.responsibility} {assignment.functions}
 *   - Control:        {document.code} {document.version} {document.generatedAt}
 *   - Aprobación:     {approval.status} {approval.approvedBy} {approval.approvedAt}
 *
 * NOTA: el schema de Company no persiste dirección; company.address queda null
 * y el renderer lo reemplaza por cadena vacía (nullGetter). Si en el futuro el
 * módulo de empresas agrega address, el resolver lo poblará automáticamente.
 *
 * La sección de licencia NO calcula días restantes, ni estados "Vencida" o
 * "Próxima a vencer": la vigencia solo se expone como dato documental cuando
 * existe un valor explícito (license.documentValidity).
 */
export const RESPONSIBLE_SG_SST_TEMPLATE_VARIABLES: string[] = [
  // Empresa
  'company.name',
  'company.nit',
  'company.address',
  // Responsable del SG-SST
  'responsible.name',
  'responsible.document',
  'responsible.position',
  'responsible.profession',
  'responsible.sstProfessionalType',
  'responsible.email',
  // Licencia SST
  'license.number',
  'license.type',
  'license.issuingAuthority',
  'license.issueDate',
  'license.documentStatus',
  'license.documentValidity',
  // Formación requerida
  'formation.course50HoursDate',
  'formation.course50HoursEvidence',
  'formation.course20HoursState',
  'formation.course20HoursDate',
  'formation.course20HoursEvidence',
  // Designación del Responsable del SG-SST
  'designation.date',
  'designation.number',
  'designation.issuerName',
  'designation.issuerPosition',
  'designation.evidence',
  // Evidencias del expediente
  'evidences.list',
  // Cumplimiento
  'compliance.status',
  'compliance.reason',
  // SG-SST
  'sgsst.standardType',
  'sgsst.evaluationLevel',
  // Asignación
  'assignment.responsibility',
  'assignment.functions',
  // Control documental
  'document.code',
  'document.version',
  'document.generatedAt',
  // Aprobación
  'approval.status',
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
 * Construye un .docx mínimo válido con los placeholders del documento formal
 * del Responsable del SG-SST. Cada línea es un párrafo con su variable para que
 * DocxRenderer la reemplace al generar la instancia.
 */
export function buildResponsibleSgsstTemplateDocx(): Buffer {
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
    'RESPONSABLE DEL SG-SST — PHVA 1.1.1 (Resolución 0312 de 2019)',
    '',
    'Empresa: {company.name}',
    'NIT: {company.nit}',
    'Dirección: {company.address}',
    '',
    '1. Identificación del Responsable:',
    'Nombre: {responsible.name}',
    'Documento: {responsible.document}',
    'Cargo: {responsible.position}',
    'Profesión: {responsible.profession}',
    'Perfil profesional SST: {responsible.sstProfessionalType}',
    'Correo: {responsible.email}',
    '',
    '2. Licencia de Seguridad y Salud en el Trabajo:',
    'Número de licencia: {license.number}',
    'Tipo de licencia: {license.type}',
    'Autoridad expedidora: {license.issuingAuthority}',
    'Fecha de expedición: {license.issueDate}',
    'Estado documental: {license.documentStatus}',
    'Vigencia indicada en el documento (opcional): {license.documentValidity}',
    '',
    '3. Formación requerida:',
    'Curso de capacitación virtual de 50 horas — Fecha: {formation.course50HoursDate}',
    'Evidencia del curso 50 horas: {formation.course50HoursEvidence}',
    'Actualización de 20 horas: {formation.course20HoursState}',
    'Fecha de la actualización (20 horas): {formation.course20HoursDate}',
    'Evidencia de la actualización: {formation.course20HoursEvidence}',
    '',
    '4. Designación del Responsable del SG-SST:',
    'Fecha de designación: {designation.date}',
    'Número de designación: {designation.number}',
    'Nombre de quien designa: {designation.issuerName}',
    'Cargo de quien designa: {designation.issuerPosition}',
    'Evidencia de designación: {designation.evidence}',
    '',
    '5. Evidencias verificadas:',
    '{evidences.list}',
    '',
    '6. Resultado de verificación:',
    'Estado: {compliance.status}',
    'Código: 1.1.1',
    'Resultado de la validación: {compliance.reason}',
    '',
    '7. Control documental:',
    'Código: {document.code}',
    'Versión: {document.version}',
    'Generado: {document.generatedAt}',
    '',
    '8. Aprobación:',
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
