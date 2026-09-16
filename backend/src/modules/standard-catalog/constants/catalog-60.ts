import { StandardDefinition, StandardLevel } from '../interfaces/standard-definition.interface';

/**
 * CATÁLOGO MAESTRO DE ESTÁNDARES MÍNIMOS SG-SST (60 estándares).
 *
 * Única fuente de verdad del catálogo normativo. Los códigos 1.1.1–7.1.4
 * corresponden a los estándares VERIFICADOS en la plataforma (PHVA
 * documental + Evaluación Inicial + módulos avanzados). Los 9 restantes
 * (1.1.9, 1.1.10, 2.12.1, 2.13.1, 3.4.1, 4.3.1, 4.4.1, 5.2.1, 7.2.1) son
 * ítems del anexo de la Resolución 0312 de 2019 que aún no tienen módulo en
 * la plataforma: se registran con `moduleRoute: ''` y se incorporarán en una
 * fase posterior de integración. 3.3.4/3.3.5/3.3.6 conservan el módulo y la
 * infraestructura técnica construida en las fases 35C-2/35D-2/35E-2, pero
 * quedaron FUERA DEL ALCANCE aprobado por los socios (SCOPE-1): se marcan
 * `classification: 'OUT_OF_SCOPE'` + `implementationStatus: 'PLANNED'`, con
 * providers/analyzers desregistrados del scoring.
 *
 * Los niveles 7 y 21 se derivan por `applicableLevels` (catalog-7.ts y
 * catalog-21.ts) para no duplicar definiciones.
 *
 * NOTA DE PESOS: `normativeWeight` conserva el peso normativo original. Los
 * 50 códigos implementados originales de la plataforma suman exactamente 100
 * (escala PHVA). Los ítems PLANNED del anexo añaden 1 punto cada uno; con el
 * peso normativo original de los códigos implementados posteriormente, la
 * suma de la plataforma supera 100 y los anexos añaden los suyos: es
 * intencional. El peso EFECTIVO que usa el sistema se calcula automáticamente
 * (utils/effective-weights.ts) solo sobre los estándares IMPLEMENTED/PARTIAL
 * y siempre suma exactamente 100.
 */
export const CATALOG_60: readonly StandardDefinition[] = [
  // ───────────────────────── CAPÍTULO 1. RECURSOS ─────────────────────────
  {
    code: '1.1.1',
    implementationStatus: 'IMPLEMENTED',
    title: 'Responsable del SG-SST',
    description: 'Asignación del responsable SST con perfil, licencia vigente y soportes académicos.',
    chapter: 'Recursos',
    phva: 'PLANEAR',
    normativeWeight: 0.5,
    applicableLevels: ['7', '21', '60'],
    moduleRoute: '/documents/plan',
    validationProvider: 'responsible-sst.provider',
    priorityMetadata: { criticality: 'ALTA', estimatedEffort: 'BAJO' },
    // FASE 7.1 — Textos tomados de PlanPage (financialResourcesItems).
    criteria:
      'Asignar una persona que cumpla con el siguiente perfil:\n- Profesional en Seguridad y Salud en el Trabajo, o profesional con posgrado en SST\n- Licencia vigente en Seguridad y Salud en el Trabajo\n- Certificado del curso de capacitación virtual de 50 horas en SG-SST',
    modeReview:
      'Solicitar el documento en el que consta la asignación del responsable del Sistema de Gestión de Seguridad y Salud en el Trabajo, verificando que se encuentren definidas sus responsabilidades.\nAdicionalmente, validar la hoja de vida con los respectivos soportes académicos y experiencia relacionada con Seguridad y Salud en el Trabajo.',
    section: { id: 'plan-recursos', title: 'Recursos financieros, técnicos, humanos... (4%)', percentage: 4 },
  },
  {
    code: '1.1.2',
    implementationStatus: 'IMPLEMENTED',
    title: 'Responsabilidades en SG-SST',
    description: 'Matriz de responsabilidades en SG-SST para todos los niveles de la organización.',
    chapter: 'Recursos',
    phva: 'PLANEAR',
    normativeWeight: 0.5,
    applicableLevels: ['7', '21', '60'],
    moduleRoute: '/advanced-management/1.1.2',
    validationProvider: 'responsibilities.provider',
    priorityMetadata: { criticality: 'MEDIA', estimatedEffort: 'BAJO' },
    // FASE 7.7.B.1 — Textos tomados de PlanPage (financialResourcesItems).
    criteria:
      'La organización debe evidenciar por escrito la asignación de responsabilidades en SG-SST para dirección, mandos medios, trabajadores y contratistas, con divulgación y aceptación documentada.',
    modeReview:
      'Revisar la matriz o acto administrativo donde se asignan las responsabilidades en SG-SST para todos los niveles de la organización.\nConfirmar que las funciones estén alineadas con el tamaño, la actividad económica y la estructura organizacional de la empresa.',
    section: { id: 'plan-recursos', title: 'Recursos financieros, técnicos, humanos... (4%)', percentage: 4 },
  },
  {
    code: '1.1.3',
    implementationStatus: 'IMPLEMENTED',
    title: 'Asignación de recursos',
    description: 'Presupuesto anual o plan de inversión del SG-SST con recursos financieros, técnicos y humanos.',
    chapter: 'Recursos',
    phva: 'PLANEAR',
    normativeWeight: 0.5,
    applicableLevels: ['21', '60'],
    moduleRoute: '/advanced-management/1.1.3',
    validationProvider: 'resource-assignment.provider',
    priorityMetadata: { criticality: 'MEDIA', estimatedEffort: 'MEDIO' },
    // FASE 7.7.B.1 — Textos tomados de PlanPage (financialResourcesItems).
    criteria:
      'La empresa debe demostrar asignación formal y suficiente de recursos para implementar, mantener y mejorar el SG-SST, con trazabilidad de ejecución y seguimiento periódico.',
    modeReview:
      'Solicitar el presupuesto anual o plan de inversión del SG-SST y verificar la disponibilidad de recursos financieros, técnicos y humanos.\nCorroborar que el presupuesto incluya actividades de prevención, capacitación, vigilancia epidemiológica y mejora continua.',
    section: { id: 'plan-recursos', title: 'Recursos financieros, técnicos, humanos... (4%)', percentage: 4 },
  },
  {
    code: '1.1.4',
    implementationStatus: 'IMPLEMENTED',
    title: 'Afiliación a riesgos laborales',
    description: 'Cobertura en el Sistema General de Riesgos Laborales de todo el personal vinculado.',
    chapter: 'Recursos',
    phva: 'PLANEAR',
    normativeWeight: 0.5,
    applicableLevels: ['7', '21', '60'],
    moduleRoute: '/company-configuration',
    validationProvider: 'arl-affiliations.provider',
    priorityMetadata: { criticality: 'ALTA', estimatedEffort: 'BAJO' },
    // FASE 7.7.B.1 — Textos tomados de PlanPage (financialResourcesItems).
    criteria:
      'Todos los trabajadores vinculados a la organización deben encontrarse afiliados al Sistema General de Riesgos Laborales de manera oportuna y conforme a la normatividad vigente.',
    modeReview:
      'Validar certificados de afiliación a la ARL y confirmar que todo el personal dependiente, independiente y en misión esté cubierto conforme al nivel de riesgo.\nVerificar consistencia entre nómina, contratos y base de afiliación reportada.',
    section: { id: 'plan-recursos', title: 'Recursos financieros, técnicos, humanos... (4%)', percentage: 4 },
  },
  {
    code: '1.1.5',
    implementationStatus: 'IMPLEMENTED',
    title: 'Trabajadores alto riesgo',
    description: 'Identificación y control de trabajadores expuestos a peligros de alto riesgo.',
    chapter: 'Recursos',
    phva: 'PLANEAR',
    normativeWeight: 0.5,
    applicableLevels: ['21', '60'],
    moduleRoute: '/company-configuration',
    validationProvider: 'special-pension.provider',
    priorityMetadata: { criticality: 'MEDIA', estimatedEffort: 'MEDIO' },
    // FASE 7.7.B.1 — Textos tomados de PlanPage (financialResourcesItems).
    criteria:
      'La empresa debe contar con identificación documentada de trabajadores expuestos a alto riesgo y demostrar medidas de intervención, control y vigilancia en salud ocupacional.',
    modeReview:
      'Examinar el inventario de cargos y tareas críticas para identificar trabajadores expuestos a peligros de alto riesgo.\nVerificar soportes de controles implementados, exámenes ocupacionales y seguimiento a condiciones de salud asociadas al riesgo.',
    section: { id: 'plan-recursos', title: 'Recursos financieros, técnicos, humanos... (4%)', percentage: 4 },
  },
  {
    code: '1.1.6',
    implementationStatus: 'IMPLEMENTED',
    title: 'Conformación COPASST',
    description: 'COPASST conformado, vigente y operativo con representación paritaria.',
    chapter: 'Recursos',
    phva: 'PLANEAR',
    normativeWeight: 0.5,
    applicableLevels: ['21', '60'],
    moduleRoute: '/advanced-management/1.1.6',
    validationProvider: 'copasst.provider',
    priorityMetadata: { criticality: 'MEDIA', estimatedEffort: 'MEDIO' },
    // FASE 7.7.B.1 — Textos tomados de PlanPage (financialResourcesItems).
    criteria:
      'Debe existir COPASST conformado de acuerdo con la normatividad aplicable, con integrantes elegidos, actas firmadas y funcionamiento documentado.',
    modeReview:
      'Solicitar actas de convocatoria, elección y conformación del COPASST, verificando representación paritaria y período de vigencia.\nConfirmar evidencias de instalación formal, cronograma de reuniones y seguimiento a compromisos.',
    section: { id: 'plan-recursos', title: 'Recursos financieros, técnicos, humanos... (4%)', percentage: 4 },
  },
  {
    code: '1.1.7',
    // FASE 6: 1.1.7 pasa de PARTIAL a IMPLEMENTED porque el módulo de Gestión
    // Avanzada ya cubre programa anual, sesiones, cobertura, evidencias,
    // documentos, aprobación y cumplimiento, y el Implementation Validator lo
    // valida con datos reales (copasst-training.provider). El peso normativo
    // NO cambia: el peso efectivo se recalcula solo y la suma sigue siendo 100.
    implementationStatus: 'IMPLEMENTED',
    title: 'Capacitación COPASST',
    description: 'Formación pertinente y periódica de los integrantes del COPASST.',
    chapter: 'Recursos',
    phva: 'PLANEAR',
    normativeWeight: 0.5,
    applicableLevels: ['21', '60'],
    moduleRoute: '/advanced-management/1.1.7',
    validationProvider: 'copasst-training.provider',
    priorityMetadata: { criticality: 'BAJA', estimatedEffort: 'BAJO' },
    // FASE 7.7.B.1 — Textos tomados de PlanPage (financialResourcesItems).
    criteria:
      'Los miembros del COPASST deben recibir formación pertinente y periódica para cumplir sus funciones, con evidencia de evaluación de la efectividad de la capacitación.',
    modeReview:
      'Revisar certificados y registros de asistencia de las capacitaciones impartidas a integrantes del COPASST.\nValidar que los contenidos aborden identificación de peligros, investigación de incidentes, inspecciones y promoción de la cultura preventiva.',
    section: { id: 'plan-recursos', title: 'Recursos financieros, técnicos, humanos... (4%)', percentage: 4 },
  },
  {
    code: '1.1.8',
    implementationStatus: 'IMPLEMENTED',
    title: 'Comité de Convivencia',
    description: 'Comité de Convivencia Laboral conformado y operando conforme a la normativa.',
    chapter: 'Recursos',
    phva: 'PLANEAR',
    normativeWeight: 0.5,
    applicableLevels: ['21', '60'],
    moduleRoute: '/advanced-management/1.1.8',
    validationProvider: 'convivencia.provider',
    priorityMetadata: { criticality: 'MEDIA', estimatedEffort: 'MEDIO' },
    // FASE 7.7.B.1 — Textos tomados de PlanPage (financialResourcesItems).
    criteria:
      'El Comité de Convivencia Laboral debe estar conformado y operando conforme a la normativa, con trazabilidad de actuaciones y garantías de confidencialidad.',
    modeReview:
      'Verificar acta de conformación del Comité de Convivencia Laboral, reglamento interno y mecanismos de recepción y gestión de casos.\nCorroborar registro de reuniones, planes de acción y actividades de prevención del acoso laboral.',
    section: { id: 'plan-recursos', title: 'Recursos financieros, técnicos, humanos... (4%)', percentage: 4 },
  },
  {
    code: '1.1.9',
    implementationStatus: 'PLANNED',
    classification: 'DUPLICATE',
    duplicateOf: '1.1.3',
    title: 'Asignación de recursos financieros al SG-SST',
    description: 'Duplicado semántico de 1.1.3 (Asignación de recursos). Subdivisión interna, no estándar puntuable independiente de la Resolución 0312.',
    chapter: 'Recursos',
    phva: 'PLANEAR',
    normativeWeight: 1,
    applicableLevels: ['60'],
    moduleRoute: '',
    priorityMetadata: { criticality: 'MEDIA', estimatedEffort: 'MEDIO' },
  },
  {
    code: '1.1.10',
    implementationStatus: 'PLANNED',
    classification: 'DUPLICATE',
    duplicateOf: '1.1.3',
    title: 'Asignación de recursos técnicos y de otra índole',
    description: 'Duplicado semántico de 1.1.3 (Asignación de recursos). Subdivisión interna, no estándar puntuable independiente de la Resolución 0312.',
    chapter: 'Recursos',
    phva: 'PLANEAR',
    normativeWeight: 1,
    applicableLevels: ['60'],
    moduleRoute: '',
    priorityMetadata: { criticality: 'MEDIA', estimatedEffort: 'MEDIO' },
  },
  {
    code: '1.2.1',
    implementationStatus: 'IMPLEMENTED',
    title: 'Programa Capacitación PyP',
    description: 'Programa anual de capacitación en promoción y prevención aprobado, ejecutado y con seguimiento.',
    chapter: 'Recursos',
    phva: 'PLANEAR',
    normativeWeight: 2,
    applicableLevels: ['7', '21', '60'],
    moduleRoute: '/advanced-management/1.2.1',
    validationProvider: 'training.provider',
    priorityMetadata: { criticality: 'ALTA', estimatedEffort: 'MEDIO' },
    // FASE 7.1 — Textos tomados de PlanPage (trainingItems).
    criteria:
      'La organización cuenta con un programa de capacitación PyP estructurado, actualizado y ejecutado, orientado al control de riesgos prioritarios y al fortalecimiento de la cultura de prevención.',
    modeReview:
      'Solicitar el programa anual de capacitación en promoción y prevención (PyP) y verificar su aprobación, cronograma, responsables y cobertura por procesos.\nComprobar evidencias de ejecución (listas de asistencia, evaluaciones, materiales y actas) y seguimiento a indicadores de cumplimiento.',
    section: { id: 'plan-capacitacion', title: 'Capacitación en el SG-SST (6%)', percentage: 6 },
  },
  {
    code: '1.2.2',
    implementationStatus: 'IMPLEMENTED',
    title: 'Inducción y Reinducción SG-SST',
    description: 'Procedimiento de inducción y reinducción en SG-SST para todo el personal.',
    chapter: 'Recursos',
    phva: 'PLANEAR',
    normativeWeight: 2,
    applicableLevels: ['21', '60'],
    moduleRoute: '/trainings',
    priorityMetadata: { criticality: 'MEDIA', estimatedEffort: 'BAJO' },
    // FASE 7.7.B.1 — Textos tomados de PlanPage (trainingItems).
    criteria:
      'Se evidencia que todo el personal recibe inducción inicial y reinducción periódica en SG-SST con contenidos mínimos obligatorios, evaluación de comprensión y trazabilidad documental.',
    modeReview:
      'Revisar el procedimiento de inducción y reinducción en SG-SST para trabajadores directos, contratistas y personal temporal.\nValidar registros de asistencia, evaluación de aprendizaje y periodicidad de reinducciones según cambios de proceso, cargo o normatividad.',
    section: { id: 'plan-capacitacion', title: 'Capacitación en el SG-SST (6%)', percentage: 6 },
  },
  {
    code: '1.2.3',
    implementationStatus: 'IMPLEMENTED',
    title: 'Curso 50 horas SG-SST',
    description: 'Certificado vigente del curso virtual de 50 horas en SG-SST de los roles obligados.',
    chapter: 'Recursos',
    phva: 'PLANEAR',
    normativeWeight: 2,
    applicableLevels: ['21', '60'],
    moduleRoute: '/company-configuration',
    validationProvider: 'course-50-hours.provider',
    priorityMetadata: { criticality: 'ALTA', estimatedEffort: 'BAJO' },
    // FASE 7.7.B.1 — Textos tomados de PlanPage (trainingItems).
    criteria:
      'La empresa demuestra que los roles obligados cuentan con certificación del curso virtual de 50 horas en SG-SST, conforme a los requisitos normativos y a las responsabilidades asignadas.',
    modeReview:
      'Verificar certificados vigentes del curso de 50 horas en SG-SST del responsable del sistema y de los perfiles que la organización haya definido como críticos para su implementación.\nCorroborar la autenticidad de los soportes y la actualización cuando aplique.',
    section: { id: 'plan-capacitacion', title: 'Capacitación en el SG-SST (6%)', percentage: 6 },
  },

  // ──────────────── CAPÍTULO 2. GESTIÓN INTEGRAL DEL SG-SST ────────────────
  {
    code: '2.1.1',
    implementationStatus: 'IMPLEMENTED',
    title: 'Política SST',
    description: 'Política de SST vigente, aprobada por la alta dirección, comunicada y actualizada.',
    chapter: 'Gestión integral del SG-SST',
    phva: 'PLANEAR',
    normativeWeight: 1,
    applicableLevels: ['7', '21', '60'],
    moduleRoute: '/advanced-management/2.1.1',
    validationProvider: 'sst-policy.provider',
    priorityMetadata: { criticality: 'ALTA', estimatedEffort: 'MEDIO' },
    // FASE 7.7.B.1 — Textos tomados de PlanPage (integralManagementItems).
    criteria:
      'La organización cuenta con política de SST vigente, aprobada, comunicada a todos los niveles y alineada con los objetivos del SG-SST.',
    modeReview:
      'Solicitar la política de SST firmada por la alta dirección y verificar su divulgación, actualización y coherencia con los peligros y riesgos priorizados.',
    section: { id: 'plan-gestion-integral', title: 'Gestión Integral del SG-SST (15%)', percentage: 15 },
  },
  {
    code: '2.2.1',
    implementationStatus: 'IMPLEMENTED',
    title: 'Objetivos SST',
    description: 'Objetivos de SST medibles, con metas, responsables, recursos e indicadores de seguimiento.',
    chapter: 'Gestión integral del SG-SST',
    phva: 'PLANEAR',
    normativeWeight: 1,
    applicableLevels: ['7', '21', '60'],
    moduleRoute: '/documents/plan',
    validationProvider: 'sst-objectives.provider',
    priorityMetadata: { criticality: 'MEDIA', estimatedEffort: 'MEDIO' },
    // FASE 7.7.B.1 — Textos tomados de PlanPage (integralManagementItems).
    criteria:
      'Existen objetivos de SST documentados, medibles y monitoreados periódicamente para asegurar su cumplimiento.',
    modeReview:
      'Revisar los objetivos de SST y validar que sean medibles, con metas, responsables, recursos e indicadores de seguimiento.',
    section: { id: 'plan-gestion-integral', title: 'Gestión Integral del SG-SST (15%)', percentage: 15 },
  },
  {
    code: '2.3.1',
    implementationStatus: 'IMPLEMENTED',
    title: 'Evaluación inicial',
    description: 'Diagnóstico inicial del SG-SST con metodología, alcance y plan de cierre de brechas.',
    chapter: 'Gestión integral del SG-SST',
    phva: 'PLANEAR',
    normativeWeight: 1,
    applicableLevels: ['7', '21', '60'],
    moduleRoute: '/documents/plan',
    validationProvider: 'initial-evaluation.provider',
    priorityMetadata: { criticality: 'ALTA', estimatedEffort: 'MEDIO' },
    // FASE 7.1 — Textos tomados de PlanPage (integralManagementItems).
    criteria:
      'La empresa evidencia evaluación inicial del SG-SST con resultados documentados y plan de cierre de brechas.',
    modeReview:
      'Verificar el diagnóstico inicial del SG-SST, su metodología, alcance y plan de intervención derivado de los hallazgos.',
    section: { id: 'plan-gestion-integral', title: 'Gestión Integral del SG-SST (15%)', percentage: 15 },
  },
  {
    code: '2.4.1',
    implementationStatus: 'IMPLEMENTED',
    title: 'Plan anual de trabajo',
    description: 'Plan anual de trabajo del SG-SST aprobado, con actividades, cronograma, responsables y presupuesto.',
    chapter: 'Gestión integral del SG-SST',
    phva: 'PLANEAR',
    normativeWeight: 2,
    applicableLevels: ['7', '21', '60'],
    moduleRoute: '/advanced-management/2.4.1',
    validationProvider: 'annual-plan.provider',
    priorityMetadata: { criticality: 'ALTA', estimatedEffort: 'MEDIO' },
    // FASE 7.1 — Textos tomados de PlanPage (integralManagementItems).
    criteria:
      'La organización cuenta con plan anual de trabajo del SG-SST aprobado, ejecutado y con seguimiento documentado.',
    modeReview:
      'Solicitar el plan anual de trabajo y validar actividades, cronograma, responsables, presupuesto e indicadores de ejecución.',
    section: { id: 'plan-gestion-integral', title: 'Gestión Integral del SG-SST (15%)', percentage: 15 },
  },
  {
    code: '2.5.1',
    implementationStatus: 'IMPLEMENTED',
    title: 'Conservación documental',
    description: 'Procedimiento de gestión documental del SG-SST con tiempos de retención y trazabilidad.',
    chapter: 'Gestión integral del SG-SST',
    phva: 'HACER',
    normativeWeight: 2,
    applicableLevels: ['21', '60'],
    moduleRoute: '/document-management',
    validationProvider: 'document-management.provider',
    priorityMetadata: { criticality: 'MEDIA', estimatedEffort: 'MEDIO' },
    // FASE 7.7.B.1 — Textos tomados de PlanPage (integralManagementItems).
    criteria:
      'Se garantiza la conservación y disponibilidad de los documentos y registros del SG-SST conforme a la normatividad.',
    modeReview:
      'Revisar el procedimiento de gestión documental del SG-SST, tiempos de retención, trazabilidad y controles de acceso.',
    section: { id: 'plan-gestion-integral', title: 'Gestión Integral del SG-SST (15%)', percentage: 15 },
  },
  {
    code: '2.6.1',
    implementationStatus: 'IMPLEMENTED',
    title: 'Rendición de cuentas',
    description: 'Evidencias de rendición de cuentas sobre resultados del SG-SST a trabajadores e interesados.',
    chapter: 'Gestión integral del SG-SST',
    phva: 'VERIFICAR',
    normativeWeight: 1,
    applicableLevels: ['21', '60'],
    moduleRoute: '/accountability',
    priorityMetadata: { criticality: 'BAJA', estimatedEffort: 'BAJO' },
    // FASE 7.7.B.1 — Textos tomados de PlanPage (integralManagementItems).
    criteria:
      'La empresa realiza rendición de cuentas periódica del SG-SST con soportes de comunicación y compromisos de mejora.',
    modeReview:
      'Validar evidencias de rendición de cuentas sobre resultados del SG-SST a trabajadores y partes interesadas internas.',
    section: { id: 'plan-gestion-integral', title: 'Gestión Integral del SG-SST (15%)', percentage: 15 },
  },
  {
    code: '2.7.1',
    implementationStatus: 'IMPLEMENTED',
    title: 'Matriz legal',
    description: 'Matriz legal actualizada con requisitos aplicables, estado de cumplimiento y plan de acción.',
    chapter: 'Gestión integral del SG-SST',
    phva: 'PLANEAR',
    normativeWeight: 2,
    applicableLevels: ['21', '60'],
    moduleRoute: '/legal-matrix',
    validationProvider: 'legal-matrix.provider',
    priorityMetadata: { criticality: 'MEDIA', estimatedEffort: 'MEDIO' },
    // FASE 7.7.B.1 — Textos tomados de PlanPage (integralManagementItems).
    criteria:
      'Existe matriz legal vigente del SG-SST, con actualización periódica y evaluación del cumplimiento normativo.',
    modeReview:
      'Verificar matriz legal actualizada con requisitos aplicables, estado de cumplimiento y plan de acción frente a brechas.',
    section: { id: 'plan-gestion-integral', title: 'Gestión Integral del SG-SST (15%)', percentage: 15 },
  },
  {
    code: '2.8.1',
    implementationStatus: 'IMPLEMENTED',
    title: 'Comunicación',
    description: 'Mecanismos de comunicación interna y externa del SG-SST con registros de difusión.',
    chapter: 'Gestión integral del SG-SST',
    phva: 'HACER',
    normativeWeight: 1,
    applicableLevels: ['21', '60'],
    moduleRoute: '/communication',
    validationProvider: 'communication.provider',
    priorityMetadata: { criticality: 'MEDIA', estimatedEffort: 'BAJO' },
    // FASE 7.7.B.1 — Textos tomados de PlanPage (integralManagementItems).
    criteria:
      'La organización implementa estrategias de comunicación del SG-SST y conserva evidencias de socialización efectiva.',
    modeReview:
      'Revisar mecanismos de comunicación interna y externa del SG-SST, incluyendo medios, frecuencia y registros de difusión.',
    section: { id: 'plan-gestion-integral', title: 'Gestión Integral del SG-SST (15%)', percentage: 15 },
  },
  {
    code: '2.9.1',
    implementationStatus: 'IMPLEMENTED',
    title: 'Adquisiciones',
    description: 'Criterios de SST integrados en compras de bienes y servicios con evaluación de proveedores.',
    chapter: 'Gestión integral del SG-SST',
    phva: 'HACER',
    normativeWeight: 1,
    applicableLevels: ['60'],
    moduleRoute: '/acquisitions',
    validationProvider: 'acquisition.provider',
    priorityMetadata: { criticality: 'BAJA', estimatedEffort: 'MEDIO' },
    // FASE 7.7.B.1 — Textos tomados de PlanPage (integralManagementItems).
    criteria:
      'Los procesos de adquisición integran criterios de SST y cuentan con registros de evaluación de proveedores.',
    modeReview:
      'Validar criterios de SST incluidos en compras de bienes y servicios, así como su aplicación en procesos de selección.',
    section: { id: 'plan-gestion-integral', title: 'Gestión Integral del SG-SST (15%)', percentage: 15 },
  },
  {
    code: '2.10.1',
    implementationStatus: 'IMPLEMENTED',
    title: 'Contratación',
    description: 'Requisitos de SST para contratistas y subcontratistas con inducción, control y seguimiento.',
    chapter: 'Gestión integral del SG-SST',
    phva: 'HACER',
    normativeWeight: 2,
    applicableLevels: ['60'],
    moduleRoute: '/documents/plan',
    priorityMetadata: { criticality: 'MEDIA', estimatedEffort: 'MEDIO' },
    // FASE 7.7.B.1 — Textos tomados de PlanPage (integralManagementItems).
    criteria:
      'La contratación de terceros incorpora lineamientos de SST y evidencia control del cumplimiento durante la ejecución.',
    modeReview:
      'Revisar requisitos de SST establecidos para contratistas y subcontratistas, incluyendo inducción, control y seguimiento.',
    section: { id: 'plan-gestion-integral', title: 'Gestión Integral del SG-SST (15%)', percentage: 15 },
  },
  {
    code: '2.11.1',
    implementationStatus: 'IMPLEMENTED',
    title: 'Gestión del cambio',
    description: 'Procedimiento de gestión del cambio con evaluación de impactos en SST.',
    chapter: 'Gestión integral del SG-SST',
    phva: 'HACER',
    normativeWeight: 1,
    applicableLevels: ['60'],
    moduleRoute: '/documents/plan',
    priorityMetadata: { criticality: 'BAJA', estimatedEffort: 'MEDIO' },
    // FASE 7.7.B.1 — Textos tomados de PlanPage (integralManagementItems).
    criteria:
      'La empresa aplica gestión del cambio en SST con análisis de riesgos y acciones de control antes de implementar cambios.',
    modeReview:
      'Solicitar procedimiento de gestión del cambio y verificar evaluación de impactos en SST ante cambios de procesos o estructura.',
    section: { id: 'plan-gestion-integral', title: 'Gestión Integral del SG-SST (15%)', percentage: 15 },
  },
  {
    code: '2.12.1',
    implementationStatus: 'PLANNED',
    classification: 'COMPLEMENTARY',
    title: 'Plan estratégico de seguridad vial',
    description: 'Requisito complementario (Artículo 32). No es estándar puntuable independiente de la Tabla de Valores de la Resolución 0312.',
    chapter: 'Gestión integral del SG-SST',
    phva: 'PLANEAR',
    normativeWeight: 1,
    applicableLevels: ['60'],
    moduleRoute: '',
    priorityMetadata: { criticality: 'MEDIA', estimatedEffort: 'ALTO' },
  },
  {
    code: '2.13.1',
    implementationStatus: 'PLANNED',
    classification: 'COMPLEMENTARY',
    title: 'Prevención de accidentes en industrias mayores',
    description: 'Requisito complementario (Artículo 33). No es estándar puntuable independiente de la Tabla de Valores de la Resolución 0312.',
    chapter: 'Gestión integral del SG-SST',
    phva: 'HACER',
    normativeWeight: 1,
    applicableLevels: ['60'],
    moduleRoute: '',
    priorityMetadata: { criticality: 'ALTA', estimatedEffort: 'ALTO' },
  },

  // ──────────────── CAPÍTULO 3. GESTIÓN DEL TALENTO HUMANO ────────────────
  {
    code: '3.1.1',
    implementationStatus: 'IMPLEMENTED',
    title: 'Perfil sociodemográfico',
    description: 'Caracterización sociodemográfica de la población trabajadora, actualizada como mínimo una vez al año.',
    chapter: 'Gestión del talento humano',
    phva: 'PLANEAR',
    normativeWeight: 3,
    applicableLevels: ['60'],
    moduleRoute: '/sociodemographic-management',
    priorityMetadata: { criticality: 'MEDIA', estimatedEffort: 'MEDIO' },
    // FASE 7.7.B.1 — Textos tomados de DoPage (condicionesSalud).
    criteria:
      'Existe perfil sociodemográfico documentado, actualizado y utilizado como insumo para la planificación de actividades de promoción y prevención en salud laboral.',
    modeReview:
      'Verificar que la empresa cuente con una caracterización sociodemográfica de su población trabajadora y que se actualice como mínimo una vez al año o ante cambios relevantes en el personal.',
    section: { id: 'do-condiciones-salud', title: 'Condiciones de salud en el trabajo (9%)', percentage: 9 },
  },
  {
    code: '3.1.2',
    // FASE 30E: 3.1.2 (Promoción y prevención en salud) se implementa con
    // infraestructura real y provider EXACT (health-promotion). Antes su
    // metadata heredaba el texto legacy de exámenes médicos ocupacionales
    // (WRONG_MAPPING detectado en 30B-2/30C). El peso normativo NO cambia (3.0).
    implementationStatus: 'IMPLEMENTED',
    title: 'Promoción y prevención en salud',
    description: 'Actividades de promoción y prevención de la salud en el trabajo según el diagnóstico de condiciones de salud y los peligros/riesgos prioritarios.',
    chapter: 'Gestión del talento humano',
    phva: 'HACER',
    normativeWeight: 3,
    applicableLevels: ['7', '21', '60'],
    moduleRoute: '/health-promotion',
    validationProvider: 'health-promotion.provider',
    priorityMetadata: { criticality: 'ALTA', estimatedEffort: 'MEDIO' },
    criteria:
      'La organización planifica y ejecuta actividades reales de promoción y prevención en salud dirigidas a la población trabajadora, con población objetivo definida, responsables, participantes alcanzados y evidencia de ejecución durante el período evaluado.',
    modeReview:
      'Verificar la existencia de actividades de promoción y prevención en salud (según el diagnóstico de condiciones de salud y los peligros/riesgos prioritarios) con evidencia de ejecución real: fecha, responsable, participantes y registro de la actividad. La planificación sin ejecución, los exámenes médicos ocupacionales o las recomendaciones médicas NO sustituyen esta evidencia.',
    section: { id: 'do-condiciones-salud', title: 'Condiciones de salud en el trabajo (9%)', percentage: 9 },
  },
  {
    code: '3.1.3',
    // FASE 30D-2: 3.1.3 pasa de PLANNED a IMPLEMENTED con provider EXACT
    // (job-profile-medical-information) tras construir la infraestructura:
    // - JobProfile (entidad tenant-aware de perfiles de cargo);
    // - Employee.jobProfileId (relación estructurada empleado → perfil);
    // - associatedHazardIds referenciando la matriz Risk (sin duplicación);
    // - occupationalContext PRE-examen en OccupationalExam (evidencia C4 real).
    // El peso normativo NO cambia (3.0). La UI de gestión (moduleRoute
    // '/job-profiles') queda como deuda de integración frontend.
    implementationStatus: 'IMPLEMENTED',
    title: 'Información al médico de perfiles de cargo',
    description: 'Información de perfiles de cargo y condiciones de trabajo suministrada al médico evaluador para la interpretación de los resultados de las evaluaciones médicas.',
    chapter: 'Gestión del talento humano',
    phva: 'HACER',
    normativeWeight: 3,
    applicableLevels: ['60'],
    moduleRoute: '/job-profiles',
    validationProvider: 'job-profile-medical-information.provider',
    priorityMetadata: { criticality: 'MEDIA', estimatedEffort: 'MEDIO' },
    criteria:
      'La organización dispone de perfiles de cargo con la información de funciones, condiciones de trabajo, peligros/riesgos asociados e información relevante para la valoración médica ocupacional, y esa información se suministra al médico para la realización de las evaluaciones médicas ocupacionales.',
    modeReview:
      'Verificar que existan perfiles de cargo estructurados y asociados a los trabajadores, que incluyan condiciones de trabajo y peligros/riesgos, y que exista constancia de que esa información fue suministrada al médico evaluador (evidencia PRE-examen vinculada a cada evaluación médica ocupacional).',
    section: { id: 'do-condiciones-salud', title: 'Condiciones de salud en el trabajo (9%)', percentage: 9 },
  },
  {
    code: '3.1.4',
    implementationStatus: 'IMPLEMENTED',
    title: 'Evaluaciones médicas ocupacionales',
    description: 'Realización de evaluaciones médicas ocupacionales de ingreso, periódicas y de egreso con periodicidad según riesgo, peligros relacionados y comunicación de resultados.',
    chapter: 'Gestión del talento humano',
    phva: 'HACER',
    normativeWeight: 3,
    applicableLevels: ['7', '21', '60'],
    moduleRoute: '/documents/do',
    priorityMetadata: { criticality: 'ALTA', estimatedEffort: 'MEDIO' },
    criteria:
      'Se realizan evaluaciones médicas ocupacionales de ingreso, periódicas y de egreso, definiendo la periodicidad, asociando peligros relacionados y comunicando resultados por escrito al trabajador.',
    modeReview:
      'Verificar que se realicen evaluaciones médicas de ingreso, periódicas y de egreso según la periodicidad definida, que se asocien peligros relevantes y que exista constancia de comunicación de resultados al trabajador.',
    section: { id: 'do-condiciones-salud', title: 'Condiciones de salud en el trabajo (9%)', percentage: 9 },
  },
  {
    code: '3.1.5',
    implementationStatus: 'IMPLEMENTED',
    semantic: 'EXACT',
    title: 'Custodia de historias clínicas',
    description: 'Custodia de las historias clínicas ocupacionales con confidencialidad, integridad, disponibilidad y conservación según la normatividad.',
    chapter: 'Gestión del talento humano',
    phva: 'HACER',
    normativeWeight: 1,
    applicableLevels: ['60'],
    moduleRoute: '/occupational-medical-record-custody',
    validationProvider: 'occupational-medical-record-custody.provider',
    priorityMetadata: { criticality: 'MEDIA', estimatedEffort: 'MEDIO' },
    criteria:
      'La organización custodia las historias clínicas ocupacionales bajo condiciones controladas de confidencialidad, integridad y disponibilidad, con responsable de custodia identificado, ubicación de archivo controlada y conservación según la normatividad vigente.',
    modeReview:
      'Verificar que existan registros de custodia de historias clínicas ocupacionales con responsable designado, ubicación controlada, referencias administrativas completas y confirmación explícita de confidencialidad, integridad y disponibilidad. La revisión trabaja EXCLUSIVAMENTE con metadatos de custodia: no evalúa contenido clínico, diagnósticos, resultados médicos ni recomendaciones.',
    section: { id: 'do-condiciones-salud', title: 'Condiciones de salud en el trabajo (9%)', percentage: 9 },
  },
  {
    code: '3.1.6',
    // FASE 33: 3.1.6 implementado con entidad propia WorkRestriction (metadata
    // only, sin contenido clínico) y provider EXACT work-restriction. Frontera
    // con 3.1.3 (información PRE-evaluación al médico vía JobProfile) intacta:
    // 3.1.6 acredita la gestión POST-evaluación de restricciones/recomendaciones
    // laborales. Una evidencia = un estándar de scoring.
    implementationStatus: 'IMPLEMENTED',
    semantic: 'EXACT',
    title: 'Restricciones y recomendaciones médico-laborales',
    description: 'Gestión de restricciones y recomendaciones médico-laborales emitidas por el médico evaluador, con seguimiento y ajustes laborales.',
    chapter: 'Gestión del talento humano',
    phva: 'HACER',
    normativeWeight: 1,
    applicableLevels: ['60'],
    moduleRoute: '/work-restrictions',
    validationProvider: 'work-restriction.provider',
    priorityMetadata: { criticality: 'MEDIA', estimatedEffort: 'MEDIO' },
    criteria:
      'La organización registra y gestiona administrativamente las restricciones y recomendaciones médico-laborales emitidas por el médico evaluador, con acciones laborales asociadas, responsable y seguimiento administrativo, control de vigencia y cierre trazable, sin almacenar contenido clínico.',
    modeReview:
      'Verificar la existencia de registros de restricciones/recomendaciones médico-laborales con acciones laborales registradas, responsable y/o seguimiento administrativo y cierre/control de vigencia. La evidencia es EXCLUSIVAMENTE administrativa (WorkRestriction): no se consumen diagnósticos, CIE, historias clínicas, tratamientos, medicamentos ni resultados clínicos, y no se infiere evidencia desde MedicalRecommendation, OccupationalExam ni JobProfile.',
    section: { id: 'do-condiciones-salud', title: 'Condiciones de salud en el trabajo (9%)', percentage: 9 },
  },
  {
    code: '3.1.7',
    // FASE 32: 3.1.7 se implementa reutilizando HealthPromotionActivity con
    // frontera normativa explícita (complianceStandard = STANDARD_3_1_7).
    // Provider EXACT LifestyleHealthyEnvironmentProvider; una evidencia =
    // un estándar de scoring (3.1.2 ó 3.1.7, nunca ambos).
    implementationStatus: 'IMPLEMENTED',
    semantic: 'EXACT',
    title: 'Estilos de vida y entornos saludables (controles tabaquismo, alcoholismo, farmacodependencia y otros)',
    description: 'Promoción de estilos de vida saludables y condiciones de entorno laboral que favorezcan la salud, incluyendo controles sobre tabaquismo, alcoholismo, farmacodependencia y otros factores contemplados por el estándar.',
    chapter: 'Gestión del talento humano',
    phva: 'HACER',
    normativeWeight: 1,
    applicableLevels: ['60'],
    moduleRoute: '/health-promotion',
    validationProvider: 'lifestyle-healthy-environment.provider',
    priorityMetadata: { criticality: 'BAJA', estimatedEffort: 'MEDIO' },
    criteria:
      'La organización ejecuta intervenciones clasificadas de estilos de vida y entornos saludables (controles de tabaquismo, alcoholismo, farmacodependencia y otros), con población objetivo y trabajadores alcanzados registrados, evidencia de ejecución real (fecha, responsable, participantes) y continuidad durante el período evaluado.',
    modeReview:
      'Verificar la existencia de actividades/intervenciones clasificadas para 3.1.7 con ejecución real: fecha, responsable, participantes alcanzados y registro documental. La cobertura se mide por participantes reales de actividades ejecutadas, no por la población objetivo convocada. Una misma actividad no puede puntuar simultáneamente 3.1.2 y 3.1.7 (una evidencia = un estándar de scoring).',
    section: { id: 'do-condiciones-salud', title: 'Condiciones de salud en el trabajo (9%)', percentage: 9 },
  },
  {
    code: '3.1.8',
    // FASE 34B: 3.1.8 se implementa con módulo propio
    // (WorkplaceSanitaryCondition). Provider EXACT; la evidencia proviene
    // EXCLUSIVAMENTE de la colección propia — NO de EnvironmentalMeasurement,
    // HazardousSubstance, InspectionActivity ni DocumentMaster
    // (frontera anti-double-scoring FASE 34A).
    implementationStatus: 'IMPLEMENTED',
    semantic: 'EXACT',
    title: 'Agua potable, servicios sanitarios y disposición de basuras',
    description: 'Disponibilidad de agua potable, servicios sanitarios adecuados y manejo adecuado de residuos sólidos en el lugar de trabajo.',
    chapter: 'Gestión del talento humano',
    phva: 'HACER',
    normativeWeight: 1,
    applicableLevels: ['60'],
    moduleRoute: '/workplace-sanitary-conditions',
    validationProvider: 'workplace-sanitary-conditions.provider',
    priorityMetadata: { criticality: 'MEDIA', estimatedEffort: 'BAJO' },
    criteria:
      'La organización registra y verifica de forma trazable la disponibilidad y condición de agua potable, la existencia y condición de servicios sanitarios y el manejo/disposición de basuras en el lugar de trabajo, cubriendo los tres componentes, con estado/aptitud conforme, fecha, responsable y evidencia de verificación, y vigencia dentro de la frecuencia definida.',
    modeReview:
      'Verificar registros activos por componente (agua potable, servicios sanitarios, manejo de basuras) con resultado de verificación conforme, trazabilidad completa (fecha, responsable, evidencia) y verificación vigente según la frecuencia declarada. La evidencia proviene EXCLUSIVAMENTE de WorkplaceSanitaryCondition; una inspección (4.2.4), un mantenimiento (4.2.5), una medición ambiental (4.1.4), un inventario de sustancias (4.1.3) o un documento NO generan cumplimiento de 3.1.8.',
    section: { id: 'do-condiciones-salud', title: 'Condiciones de salud en el trabajo (9%)', percentage: 9 },
  },
  {
    code: '3.1.9',
    // FASE 34C: 3.1.9 se implementa con módulo propio (WasteManagementRecord
    // + WasteTypeDeclaration). Provider EXACT; la evidencia proviene
    // EXCLUSIVAMENTE de la colección propia — NO de HazardousSubstance,
    // EnvironmentalMeasurement, InspectionActivity ni DocumentMaster
    // (frontera anti-double-scoring FASE 34A/34C).
    implementationStatus: 'IMPLEMENTED',
    semantic: 'EXACT',
    title: 'Eliminación adecuada de residuos sólidos, líquidos o gaseosos',
    description: 'Manejo y disposición final adecuada de residuos sólidos, líquidos y gaseosos, peligrosos y no peligrosos, generados en el lugar de trabajo.',
    chapter: 'Gestión del talento humano',
    phva: 'HACER',
    normativeWeight: 1,
    applicableLevels: ['60'],
    moduleRoute: '/waste-management',
    validationProvider: 'waste-management.provider',
    priorityMetadata: { criticality: 'MEDIA', estimatedEffort: 'BAJO' },
    criteria:
      'La organización identifica los residuos que realmente genera (sólidos, líquidos o gaseosos), los maneja (segregación, almacenamiento temporal, contención) y los elimina/dispone adecuadamente (gestor autorizado, tratamiento, disposición final), con trazabilidad completa (fecha de disposición, responsable, evidencia y destino) y continuidad dentro de la frecuencia declarada.',
    modeReview:
      'Verificar registros activos por tipo de residuo realmente generado (declaración explícita de la empresa) con manejo y método de disposición, trazabilidad completa (fecha, responsable, evidencia, destino) y disposición vigente según la frecuencia. La evidencia proviene EXCLUSIVAMENTE de WasteManagementRecord; una sustancia peligrosa (4.1.3), una medición ambiental (4.1.4), una inspección (4.2.4), un mantenimiento (4.2.5), un registro de condiciones sanitarias (3.1.8) o un documento NO generan cumplimiento de 3.1.9. Un residuo peligroso (hazardous=true) es clasificación operativa, no cumplimiento automático.',
    section: { id: 'do-condiciones-salud', title: 'Condiciones de salud en el trabajo (9%)', percentage: 9 },
  },
  {
    code: '3.2.1',
    implementationStatus: 'IMPLEMENTED',
    title: 'Reporte de accidentes de trabajo y enfermedades laborales',
    description: 'Reporte oportuno de accidentes de trabajo y enfermedades laborales a la ARL y EPS dentro de los 2 días hábiles siguientes al evento o diagnóstico.',
    chapter: 'Gestión del talento humano',
    phva: 'HACER',
    normativeWeight: 2.5,
    applicableLevels: ['60'],
    moduleRoute: '/absenteeism',
    priorityMetadata: { criticality: 'MEDIA', estimatedEffort: 'BAJO' },
    // FASE 7.7.B.1 — Textos tomados de DoPage (registroInvestigacion).
    criteria:
      'La empresa mantiene registro sistemático de ausentismo y utiliza la información para orientar decisiones de intervención en SST.',
    modeReview:
      'Validar que exista consolidado de ausentismo por causa médica y no médica, con análisis periódico de tendencias y variables críticas (área, cargo, diagnóstico general).',
    section: { id: 'do-registro-investigacion', title: 'Registro e investigación (5%)', percentage: 5 },
  },
  {
    code: '3.2.2',
    implementationStatus: 'IMPLEMENTED',
    title: 'Investigación de incidentes, accidentes y enfermedades laborales',
    description: 'Investigación documentada de incidentes, accidentes de trabajo y enfermedades laborales con análisis causal, responsables, acciones y seguimiento.',
    chapter: 'Gestión del talento humano',
    phva: 'HACER',
    normativeWeight: 2.5,
    applicableLevels: ['60'],
    moduleRoute: '/disease-investigation-management',
    priorityMetadata: { criticality: 'MEDIA', estimatedEffort: 'MEDIO' },
    // FASE 7.7.B.1 — Textos tomados de DoPage (registroInvestigacion).
    criteria:
      'Los eventos relacionados con enfermedad laboral se investigan de forma documentada, con planes de acción y verificación de eficacia.',
    modeReview:
      'Solicitar investigaciones de casos reportados de enfermedad laboral o sospecha, verificando análisis causal, medidas de intervención y seguimiento al cierre de acciones.',
    section: { id: 'do-registro-investigacion', title: 'Registro e investigación (5%)', percentage: 5 },
  },
  {
    code: '3.2.3',
    implementationStatus: 'IMPLEMENTED',
    title: 'Registro y análisis estadístico de accidentes y enfermedades laborales',
    description: 'Registro y análisis estadístico de accidentes de trabajo y enfermedades laborales con tendencias y comparación entre períodos.',
    chapter: 'Gestión del talento humano',
    phva: 'HACER',
    normativeWeight: 2,
    applicableLevels: ['60'],
    moduleRoute: '/accident-statistics',
    priorityMetadata: { criticality: 'ALTA', estimatedEffort: 'BAJO' },
  },
  {
    code: '3.3.1',
    implementationStatus: 'IMPLEMENTED',
    title: 'Medición de la frecuencia de la accidentalidad',
    description: 'Medición de la frecuencia de la accidentalidad de trabajo calculada como número de accidentes por 100.000 horas-trabajadas.',
    chapter: 'Gestión del talento humano',
    phva: 'HACER',
    normativeWeight: 2,
    applicableLevels: ['60'],
    moduleRoute: '/epidemiological-surveillance',
    priorityMetadata: { criticality: 'MEDIA', estimatedEffort: 'ALTO' },
    // FASE 7.7.B.1 — Textos tomados de DoPage (vigilanciaSalud).
    criteria:
      'La organización implementa programas de vigilancia epidemiológica alineados con riesgos prioritarios y evidencia seguimiento de resultados.',
    modeReview:
      'Revisar los PVE priorizados según matriz de peligros (biomecánico, psicosocial, químico u otros), su diseño metodológico, indicadores y ejecución.',
    section: { id: 'do-vigilancia-salud', title: 'Vigilancia de la salud (6%)', percentage: 6 },
  },
  {
    code: '3.3.2',
    implementationStatus: 'IMPLEMENTED',
    title: 'Medición de la severidad de la accidentalidad',
    description: 'Medición de la severidad de la accidentalidad calculada como número de días perdidos por 100.000 horas-trabajadas.',
    chapter: 'Gestión del talento humano',
    phva: 'HACER',
    normativeWeight: 2,
    applicableLevels: ['60'],
    moduleRoute: '/health-indicators',
    priorityMetadata: { criticality: 'BAJA', estimatedEffort: 'MEDIO' },
    criteria:
      'Se calcula, analiza y comunica periódicamente indicadores de salud laboral: frecuencia de accidentalidad, severidad, mortalidad, prevalencia de enfermedad laboral, incidencia y ausentismo por causa médica, para definir acciones preventivas y correctivas.',
    modeReview:
      'Verificar indicadores de salud laboral (frecuencia, severidad, mortalidad, prevalencia, incidencia y ausentismo) y su análisis para toma de decisiones.',
    section: { id: 'do-vigilancia-salud', title: 'Vigilancia de la salud (6%)', percentage: 6 },
  },
  {
    code: '3.3.3',
    implementationStatus: 'IMPLEMENTED',
    title: 'Medición de la mortalidad por accidentes de trabajo',
    description: 'Medición de la mortalidad laboral calculada como número de muertes por cada 100.000 trabajadores expuestos.',
    chapter: 'Gestión del talento humano',
    phva: 'HACER',
    normativeWeight: 2,
    applicableLevels: ['60'],
    moduleRoute: '/case-intervention',
    priorityMetadata: { criticality: 'MEDIA', estimatedEffort: 'MEDIO' },
    // FASE 7.7.B.1 — Textos tomados de DoPage (vigilanciaSalud).
    criteria:
      'Existe gestión integral de casos de salud laboral con trazabilidad de acciones, responsables y verificación de cierre.',
    modeReview:
      'Evaluar soportes de intervención sobre casos identificados en vigilancia de la salud y evidencias de seguimiento por medicina laboral y SST.',
    section: { id: 'do-vigilancia-salud', title: 'Vigilancia de la salud (6%)', percentage: 6 },
  },
  {
    // SCOPE-1: 3.3.4 queda FUERA DEL ALCANCE aprobado por los socios
    // (el alcance llega hasta 3.3.3 y continúa en 4.1.1). El provider
    // DiseasePrevalenceProvider y su infraestructura (OccupationalDiseaseStatisticalCase)
    // se conservan como infraestructura futura, desregistrados del
    // ComplianceEngine y del StandardAnalysis: ya no puntúan ni se analizan.
    code: '3.3.4',
    implementationStatus: 'PLANNED',
    classification: 'OUT_OF_SCOPE',
    title: 'Medición de la prevalencia de enfermedad laboral',
    description: 'Medición de la prevalencia de enfermedad laboral calculada como número de casos existentes por 1.000 trabajadores expuestos.',
    chapter: 'Gestión del talento humano',
    phva: 'HACER',
    normativeWeight: 1,
    applicableLevels: ['60'],
    moduleRoute: '/occupational-disease-statistical-cases',
    priorityMetadata: { criticality: 'MEDIA', estimatedEffort: 'MEDIO' },
    // SCOPE-1: provider desregistrado del scoring. El texto FASE 35C-2 se
    // conserva como documentación de la infraestructura futura.
    criteria:
      'La prevalencia de enfermedad laboral se mide a una fecha de corte: casos calificados (QUALIFIED), activos en el registro estadístico y con fecha de reconocimiento, por cada 1.000 trabajadores de referencia del mismo tenant.',
    modeReview:
      'Verificar que el registro estadístico de enfermedad laboral esté en uso, con calificación ocupacional vigente, fecha de reconocimiento de los casos y una población de referencia válida para el cálculo de la tasa.',
  },
  {
    // SCOPE-1: 3.3.5 queda FUERA DEL ALCANCE aprobado por los socios. El
    // provider DiseaseIncidenceProvider se conserva como infraestructura
    // futura, desregistrado del ComplianceEngine y del StandardAnalysis.
    code: '3.3.5',
    implementationStatus: 'PLANNED',
    classification: 'OUT_OF_SCOPE',
    title: 'Medición de la incidencia de enfermedad laboral',
    description: 'Medición de la incidencia de enfermedad laboral calculada como número de nuevos casos por 1.000 trabajadores expuestos en un período.',
    chapter: 'Gestión del talento humano',
    phva: 'HACER',
    normativeWeight: 1,
    applicableLevels: ['60'],
    moduleRoute: '/occupational-disease-statistical-cases',
    priorityMetadata: { criticality: 'MEDIA', estimatedEffort: 'MEDIO' },
    // SCOPE-1: provider desregistrado del scoring. El texto FASE 35D-2 se
    // conserva como documentación de la infraestructura futura.
    criteria:
      'La incidencia de enfermedad laboral se mide por período: casos nuevos (primera ocurrencia estadística calificada como QUALIFIED, activos y con fecha de reconocimiento dentro del período) por cada 1.000 trabajadores de la población de referencia del mismo tenant.',
    modeReview:
      'Verificar que el registro estadístico identifique casos nuevos, con calificación ocupacional vigente, fecha de reconocimiento dentro del período y una población de referencia válida para el cálculo de la tasa.',
  },
  {
    // SCOPE-1: 3.3.6 queda FUERA DEL ALCANCE aprobado por los socios. El
    // provider MedicalAbsenteeismProvider y su infraestructura
    // (CompanyPeriodScheduledWorkData) se conservan como infraestructura
    // futura, desregistrados del ComplianceEngine y del StandardAnalysis.
    code: '3.3.6',
    implementationStatus: 'PLANNED',
    classification: 'OUT_OF_SCOPE',
    title: 'Medición del ausentismo por causa médica',
    description: 'Medición del ausentismo laboral por causa médica calculado como proporción de días perdidos por causa médica respecto a los días laborables.',
    chapter: 'Gestión del talento humano',
    phva: 'HACER',
    normativeWeight: 1,
    applicableLevels: ['60'],
    moduleRoute: '/absenteeism',
    priorityMetadata: { criticality: 'MEDIA', estimatedEffort: 'MEDIO' },
    criteria:
      'La organización mide mensualmente el ausentismo por causa médica como la proporción entre los días de ausencia por incapacidad laboral o común del mes y los días de trabajo programados en el mes, expresada en porcentaje, con denominador declarado y trazable por período.',
    modeReview:
      'Verificar que exista un registro mensual de días de trabajo programados (denominador declarado) y que las ausencias por incapacidad médica estén registradas con fechas y clasificación estructurada, atribuyendo a cada mes únicamente los días correspondientes (sin doble contabilización). El indicador es metadata-only: no consume diagnósticos ni contenido clínico.',
  },
  {
    code: '3.4.1',
    implementationStatus: 'PLANNED',
    classification: 'COMPLEMENTARY',
    title: 'Indicadores de salud y bienestar',
    description: 'Extensión funcional complementaria del sistema. No corresponde a un estándar puntuable independiente de la Tabla de Valores.',
    chapter: 'Gestión del talento humano',
    phva: 'VERIFICAR',
    normativeWeight: 1,
    applicableLevels: ['60'],
    moduleRoute: '',
    priorityMetadata: { criticality: 'BAJA', estimatedEffort: 'BAJO' },
  },

  // ─────────────────── CAPÍTULO 4. PROCEDIMIENTOS Y PROGRAMAS ───────────────────
  {
    code: '4.1.1',
    implementationStatus: 'IMPLEMENTED',
    title: 'Metodología identificación de peligros',
    description: 'Metodología documentada para la identificación de peligros, evaluación y valoración de riesgos.',
    chapter: 'Procedimientos y programas',
    phva: 'HACER',
    normativeWeight: 4,
    applicableLevels: ['7', '21', '60'],
    moduleRoute: '/risks',
    priorityMetadata: { criticality: 'ALTA', estimatedEffort: 'MEDIO' },
    // FASE 7.1 — Textos tomados de DoPage (identificacionPeligros).
    criteria:
      'Existe metodología formal para identificar peligros y valorar riesgos, actualizada y aplicada de manera consistente en la organización.',
    modeReview:
      'Verificar que la organización cuente con una metodología documentada para la identificación de peligros, evaluación y valoración de riesgos, aplicable a todos los procesos y cargos.',
    section: { id: 'do-identificacion-peligros', title: 'Identificación de peligros (15%)', percentage: 15 },
  },
  {
    code: '4.1.2',
    implementationStatus: 'IMPLEMENTED',
    title: 'Participación de trabajadores',
    description: 'Evidencias de participación de trabajadores en la identificación de peligros y valoración de riesgos.',
    chapter: 'Procedimientos y programas',
    phva: 'HACER',
    normativeWeight: 4,
    applicableLevels: ['60'],
    moduleRoute: '/risks',
    priorityMetadata: { criticality: 'MEDIA', estimatedEffort: 'BAJO' },
    // FASE 7.7.B.1 — Textos tomados de DoPage (identificacionPeligros).
    criteria:
      'La identificación de peligros incorpora participación activa de los trabajadores y deja trazabilidad de sus aportes.',
    modeReview:
      'Revisar evidencias de participación de trabajadores y representantes en la identificación de peligros y valoración de riesgos, incluyendo reuniones, inspecciones y reportes.',
    section: { id: 'do-identificacion-peligros', title: 'Identificación de peligros (15%)', percentage: 15 },
  },
  {
    code: '4.1.3',
    implementationStatus: 'IMPLEMENTED',
    title: 'Sustancias peligrosas',
    description: 'Inventario de sustancias químicas peligrosas, hojas de datos de seguridad y controles implementados.',
    chapter: 'Procedimientos y programas',
    phva: 'HACER',
    normativeWeight: 3,
    applicableLevels: ['60'],
    moduleRoute: '/risks',
    priorityMetadata: { criticality: 'MEDIA', estimatedEffort: 'MEDIO' },
    // FASE 7.7.B.1 — Textos tomados de DoPage (identificacionPeligros).
    criteria:
      'La empresa identifica y gestiona los riesgos asociados a sustancias peligrosas con soportes documentales y medidas de control.',
    modeReview:
      'Validar inventario de sustancias químicas peligrosas, hojas de datos de seguridad y controles implementados para su manipulación, almacenamiento y disposición.',
    section: { id: 'do-identificacion-peligros', title: 'Identificación de peligros (15%)', percentage: 15 },
  },
  {
    code: '4.1.4',
    implementationStatus: 'IMPLEMENTED',
    title: 'Mediciones ambientales',
    description: 'Mediciones higiénicas ambientales según riesgos priorizados con análisis y acciones derivadas.',
    chapter: 'Procedimientos y programas',
    phva: 'HACER',
    normativeWeight: 4,
    applicableLevels: ['60'],
    moduleRoute: '/risks',
    priorityMetadata: { criticality: 'MEDIA', estimatedEffort: 'ALTO' },
    // FASE 7.7.B.1 — Textos tomados de DoPage (identificacionPeligros).
    criteria:
      'Se realizan mediciones ambientales cuando aplica, con análisis de resultados y ejecución de acciones de intervención.',
    modeReview:
      'Solicitar mediciones higiénicas ambientales (físicos, químicos, biológicos u otros) según riesgos priorizados y verificar su periodicidad, análisis y acciones derivadas.',
    section: { id: 'do-identificacion-peligros', title: 'Identificación de peligros (15%)', percentage: 15 },
  },
  {
    code: '4.2.1',
    implementationStatus: 'IMPLEMENTED',
    title: 'Implementación de medidas de control',
    description: 'Plan de intervención para riesgos priorizados con controles de ingeniería, administrativos y de protección.',
    chapter: 'Procedimientos y programas',
    phva: 'HACER',
    normativeWeight: 2.5,
    applicableLevels: ['7', '21', '60'],
    moduleRoute: '/risks',
    priorityMetadata: { criticality: 'ALTA', estimatedEffort: 'MEDIO' },
    // FASE 7.7.B.1 — Textos tomados de DoPage (medidasControl).
    criteria:
      'La organización implementa medidas de prevención y control acordes con la jerarquía de controles y riesgos identificados.',
    modeReview:
      'Revisar el plan de intervención para riesgos priorizados y verificar implementación de controles de ingeniería, administrativos y de protección personal.',
    section: { id: 'do-medidas-control', title: 'Medidas de prevención y control (15%)', percentage: 15 },
  },
  {
    code: '4.2.2',
    implementationStatus: 'IMPLEMENTED',
    title: 'Verificación de aplicación de medidas',
    description: 'Seguimiento al cumplimiento y efectividad de las medidas implementadas.',
    chapter: 'Procedimientos y programas',
    phva: 'HACER',
    normativeWeight: 2.5,
    applicableLevels: ['60'],
    moduleRoute: '/risks',
    priorityMetadata: { criticality: 'MEDIA', estimatedEffort: 'BAJO' },
    // FASE 7.7.B.1 — Textos tomados de DoPage (medidasControl).
    criteria:
      'Existe verificación periódica de la aplicación de controles y seguimiento al cierre de hallazgos.',
    modeReview:
      'Evaluar evidencias de seguimiento al cumplimiento y efectividad de las medidas implementadas mediante inspecciones, observaciones y registros.',
    section: { id: 'do-medidas-control', title: 'Medidas de prevención y control (15%)', percentage: 15 },
  },
  {
    code: '4.2.3',
    implementationStatus: 'IMPLEMENTED',
    title: 'Procedimientos e instructivos',
    description: 'Procedimientos e instructivos de trabajo seguro para tareas críticas, actualizados y divulgados.',
    chapter: 'Procedimientos y programas',
    phva: 'HACER',
    normativeWeight: 2.5,
    applicableLevels: ['60'],
    moduleRoute: '/risks',
    priorityMetadata: { criticality: 'MEDIA', estimatedEffort: 'MEDIO' },
    // FASE 7.7.B.1 — Textos tomados de DoPage (medidasControl).
    criteria:
      'La empresa dispone de procedimientos e instructivos de trabajo seguro vigentes y aplicados en actividades de riesgo.',
    modeReview:
      'Solicitar procedimientos e instructivos seguros para tareas críticas, verificando actualización, divulgación y comprensión por parte de los trabajadores.',
    section: { id: 'do-medidas-control', title: 'Medidas de prevención y control (15%)', percentage: 15 },
  },
  {
    code: '4.2.4',
    implementationStatus: 'IMPLEMENTED',
    title: 'Inspecciones',
    description: 'Programa de inspecciones planeadas de seguridad con frecuencia, cobertura y seguimiento.',
    chapter: 'Procedimientos y programas',
    phva: 'HACER',
    normativeWeight: 2.5,
    applicableLevels: ['60'],
    moduleRoute: '/inspections',
    priorityMetadata: { criticality: 'MEDIA', estimatedEffort: 'BAJO' },
    // FASE 7.7.B.1 — Textos tomados de DoPage (medidasControl).
    criteria:
      'Se ejecutan inspecciones periódicas con registro de hallazgos, responsables y verificación de acciones correctivas.',
    modeReview:
      'Revisar programa de inspecciones planeadas de seguridad, frecuencia, cobertura y seguimiento a condiciones subestándar detectadas.',
    section: { id: 'do-medidas-control', title: 'Medidas de prevención y control (15%)', percentage: 15 },
  },
  {
    code: '4.2.5',
    implementationStatus: 'IMPLEMENTED',
    title: 'Mantenimiento',
    description: 'Programa de mantenimiento preventivo y correctivo de equipos, instalaciones y herramientas.',
    chapter: 'Procedimientos y programas',
    phva: 'HACER',
    normativeWeight: 2.5,
    applicableLevels: ['60'],
    moduleRoute: '/inspections',
    priorityMetadata: { criticality: 'MEDIA', estimatedEffort: 'MEDIO' },
    // FASE 7.7.B.1 — Textos tomados de DoPage (medidasControl).
    criteria:
      'La organización realiza mantenimiento con trazabilidad documental para prevenir fallas que generen riesgos laborales.',
    modeReview:
      'Verificar programa de mantenimiento preventivo y correctivo de equipos, instalaciones y herramientas con impacto en SST.',
    section: { id: 'do-medidas-control', title: 'Medidas de prevención y control (15%)', percentage: 15 },
  },
  {
    code: '4.2.6',
    implementationStatus: 'IMPLEMENTED',
    title: 'EPP',
    description: 'Matriz de EPP por cargo o tarea con entrega, reposición, capacitación y supervisión.',
    chapter: 'Procedimientos y programas',
    phva: 'HACER',
    normativeWeight: 2.5,
    applicableLevels: ['60'],
    moduleRoute: '/risks',
    priorityMetadata: { criticality: 'MEDIA', estimatedEffort: 'BAJO' },
    // FASE 7.7.B.1 — Textos tomados de DoPage (medidasControl).
    criteria:
      'Se gestiona integralmente el uso de EPP con criterios técnicos, registros de entrega y evidencia de uso efectivo.',
    modeReview:
      'Comprobar matriz de EPP por cargo o tarea, entrega, reposición, capacitación y supervisión del uso adecuado.',
    section: { id: 'do-medidas-control', title: 'Medidas de prevención y control (15%)', percentage: 15 },
  },
  {
    code: '4.3.1',
    implementationStatus: 'PLANNED',
    classification: 'DUPLICATE',
    duplicateOf: '3.2.2',
    title: 'Procedimiento de investigación de accidentes e incidentes',
    description: 'Duplicado semántico de 3.2.2 (Investigación de enfermedades laborales). La investigación de incidentes/accidentes es un único estándar puntuable en la Resolución 0312.',
    chapter: 'Procedimientos y programas',
    phva: 'VERIFICAR',
    normativeWeight: 1,
    applicableLevels: ['60'],
    moduleRoute: '',
    priorityMetadata: { criticality: 'MEDIA', estimatedEffort: 'MEDIO' },
  },
  {
    code: '4.4.1',
    implementationStatus: 'PLANNED',
    classification: 'COMPLEMENTARY',
    title: 'Gestión del riesgo psicosocial',
    description: 'Extensión funcional complementaria del sistema. No corresponde a un estándar puntuable independiente identificado en la Tabla de Valores de la Resolución 0312.',
    chapter: 'Procedimientos y programas',
    phva: 'HACER',
    normativeWeight: 1,
    applicableLevels: ['60'],
    moduleRoute: '',
    priorityMetadata: { criticality: 'MEDIA', estimatedEffort: 'ALTO' },
  },

  // ─────────────────── CAPÍTULO 5. EMERGENCIAS (PHVA Hacer) ───────────────────
  {
    code: '5.1.1',
    implementationStatus: 'IMPLEMENTED',
    title: 'Plan de emergencias',
    description: 'Plan de prevención, preparación y respuesta ante emergencias documentado y actualizado.',
    chapter: 'Procedimientos y programas',
    phva: 'HACER',
    normativeWeight: 5,
    applicableLevels: ['60'],
    moduleRoute: '/documents/do',
    priorityMetadata: { criticality: 'ALTA', estimatedEffort: 'MEDIO' },
    // FASE 7.7.B.1 — Textos tomados de DoPage (gestionAmenazas).
    criteria:
      'La organización cuenta con plan de emergencias documentado, socializado y actualizado, con acciones preventivas y procedimientos de respuesta definidos.',
    modeReview:
      'Revisar que exista plan de prevención, preparación y respuesta ante emergencias, con identificación de amenazas, recursos, rutas de evacuación, responsables y mecanismos de actualización.',
    section: { id: 'do-gestion-amenazas', title: 'Plan de Prevención, Preparación y Respuesta ante Emergencias (10%)', percentage: 10 },
  },
  {
    code: '5.1.2',
    implementationStatus: 'IMPLEMENTED',
    title: 'Brigada de emergencia',
    description: 'Brigada de emergencia conformada y entrenada con simulacros y disponibilidad de equipos.',
    chapter: 'Procedimientos y programas',
    phva: 'HACER',
    normativeWeight: 5,
    applicableLevels: ['60'],
    moduleRoute: '/documents/do',
    priorityMetadata: { criticality: 'MEDIA', estimatedEffort: 'MEDIO' },
    // FASE 7.7.B.1 — Textos tomados de DoPage (gestionAmenazas).
    criteria:
      'Existe brigada de emergencia conformada y entrenada, con evidencias de preparación y capacidad de respuesta ante escenarios de emergencia.',
    modeReview:
      'Verificar la conformación de la brigada de emergencia, perfiles de brigadistas, capacitación, entrenamiento, simulacros y disponibilidad de equipos para atención de incidentes.',
    section: { id: 'do-gestion-amenazas', title: 'Plan de Prevención, Preparación y Respuesta ante Emergencias (10%)', percentage: 10 },
  },
  {
    code: '5.2.1',
    implementationStatus: 'PLANNED',
    classification: 'COMPLEMENTARY',
    title: 'Programa de simulacros de emergencia',
    description: 'Extensión funcional complementaria del plan de emergencias. No corresponde a un estándar puntuable independiente de la Tabla de Valores.',
    chapter: 'Procedimientos y programas',
    phva: 'VERIFICAR',
    normativeWeight: 1,
    applicableLevels: ['60'],
    moduleRoute: '',
    priorityMetadata: { criticality: 'MEDIA', estimatedEffort: 'BAJO' },
  },

  // ─────────────────── CAPÍTULO 6. VERIFICACIÓN (PHVA Verificar) ───────────────────
  {
    code: '6.1.1',
    implementationStatus: 'IMPLEMENTED',
    title: 'Indicadores SG-SST',
    description: 'Indicadores del SG-SST medidos y analizados periódicamente con evidencia de decisiones.',
    chapter: 'Verificación y mejora',
    phva: 'VERIFICAR',
    normativeWeight: 1.25,
    applicableLevels: ['60'],
    moduleRoute: '/dashboard',
    priorityMetadata: { criticality: 'MEDIA', estimatedEffort: 'BAJO' },
    // FASE 7.7.B.1 — Textos tomados de CheckPage (verificacionItems).
    criteria:
      'La organización cuenta con indicadores del SG-SST medidos y analizados periódicamente, con evidencia de decisiones tomadas para mantener o mejorar su desempeño.',
    modeReview:
      'Solicitar los indicadores definidos del SG-SST y verificar su medición periódica (estructura, proceso y resultado), fórmula, meta, responsable y análisis de tendencias.',
    section: { id: 'check-verificacion', title: 'Verificación del Sistema de Gestión de Seguridad y Salud en el Trabajo (5%)', percentage: 5 },
  },
  {
    code: '6.1.2',
    implementationStatus: 'IMPLEMENTED',
    title: 'Auditoría anual',
    description: 'Auditoría anual al SG-SST con hallazgos documentados y seguimiento al cierre de acciones.',
    chapter: 'Verificación y mejora',
    phva: 'VERIFICAR',
    normativeWeight: 1.25,
    applicableLevels: ['60'],
    moduleRoute: '/document-management',
    priorityMetadata: { criticality: 'MEDIA', estimatedEffort: 'MEDIO' },
    // FASE 7.7.B.1 — Textos tomados de CheckPage (verificacionItems).
    criteria:
      'Se evidencia ejecución de auditoría anual al SG-SST con hallazgos documentados, responsables definidos y seguimiento al cierre de acciones.',
    modeReview:
      'Revisar el programa y el informe de auditoría interna anual del SG-SST, validando alcance, criterios, competencias del auditor, hallazgos y plan de acción.',
    section: { id: 'check-verificacion', title: 'Verificación del Sistema de Gestión de Seguridad y Salud en el Trabajo (5%)', percentage: 5 },
  },
  {
    code: '6.1.3',
    implementationStatus: 'IMPLEMENTED',
    title: 'Revisión alta dirección',
    description: 'Revisión periódica del SG-SST por la alta dirección con decisiones y compromisos documentados.',
    chapter: 'Verificación y mejora',
    phva: 'VERIFICAR',
    normativeWeight: 1.25,
    applicableLevels: ['60'],
    moduleRoute: '/accountability',
    priorityMetadata: { criticality: 'MEDIA', estimatedEffort: 'BAJO' },
    // FASE 7.7.B.1 — Textos tomados de CheckPage (verificacionItems).
    criteria:
      'La alta dirección realiza revisión periódica del SG-SST y deja evidencia de decisiones y compromisos para su mejora continua.',
    modeReview:
      'Verificar acta o informe de revisión por la alta dirección con análisis de resultados del SG-SST, cumplimiento de objetivos, recursos y definición de mejoras.',
    section: { id: 'check-verificacion', title: 'Verificación del Sistema de Gestión de Seguridad y Salud en el Trabajo (5%)', percentage: 5 },
  },
  {
    code: '6.1.4',
    implementationStatus: 'IMPLEMENTED',
    title: 'Planificación auditorías COPASST',
    description: 'Planificación de auditorías y seguimiento de compromisos del COPASST.',
    chapter: 'Verificación y mejora',
    phva: 'VERIFICAR',
    normativeWeight: 1.25,
    applicableLevels: ['60'],
    moduleRoute: '/documents/check',
    priorityMetadata: { criticality: 'BAJA', estimatedEffort: 'BAJO' },
    // FASE 7.7.B.1 — Textos tomados de CheckPage (verificacionItems).
    criteria:
      'Existe planificación documentada de auditorías o verificaciones con participación del COPASST y trazabilidad de resultados y acciones de mejora.',
    modeReview:
      'Solicitar la planificación de auditorías o verificaciones con participación del COPASST, incluyendo cronograma, alcance y seguimiento a recomendaciones.',
    section: { id: 'check-verificacion', title: 'Verificación del Sistema de Gestión de Seguridad y Salud en el Trabajo (5%)', percentage: 5 },
  },

  // ─────────────────── CAPÍTULO 7. ACTUAR (PHVA Actuar) ───────────────────
  {
    code: '7.1.1',
    implementationStatus: 'IMPLEMENTED',
    title: 'Acciones preventivas y correctivas',
    description: 'Acciones preventivas y correctivas definidas, ejecutadas y verificadas para evitar recurrencias.',
    chapter: 'Verificación y mejora',
    phva: 'ACTUAR',
    normativeWeight: 2.5,
    applicableLevels: ['60'],
    moduleRoute: '/documents/act',
    priorityMetadata: { criticality: 'MEDIA', estimatedEffort: 'MEDIO' },
    // FASE 7.7.B.1 — Textos tomados de ActPage (actuarItems).
    criteria:
      'La organización define, ejecuta y verifica acciones preventivas y correctivas para evitar la recurrencia de no conformidades en el SG-SST.',
    modeReview:
      'Verificar evidencias de acciones preventivas y correctivas derivadas de hallazgos, con responsables, fechas y seguimiento al cierre.',
    section: { id: 'act-mejoramiento', title: 'Mejoramiento (10%)', percentage: 10 },
  },
  {
    code: '7.1.2',
    implementationStatus: 'IMPLEMENTED',
    title: 'Acciones mejora alta dirección',
    description: 'Acciones de mejora aprobadas por la alta dirección con seguimiento a su implementación.',
    chapter: 'Verificación y mejora',
    phva: 'ACTUAR',
    normativeWeight: 2.5,
    applicableLevels: ['60'],
    moduleRoute: '/documents/act',
    priorityMetadata: { criticality: 'MEDIA', estimatedEffort: 'BAJO' },
    // FASE 7.7.B.1 — Textos tomados de ActPage (actuarItems).
    criteria:
      'Se evidencian acciones de mejora aprobadas por la alta dirección con seguimiento a su implementación y efectividad.',
    modeReview:
      'Revisar decisiones de la alta dirección orientadas al mejoramiento continuo del SG-SST, incluyendo recursos, prioridades y metas.',
    section: { id: 'act-mejoramiento', title: 'Mejoramiento (10%)', percentage: 10 },
  },
  {
    code: '7.1.3',
    implementationStatus: 'IMPLEMENTED',
    title: 'Acciones por accidentes',
    description: 'Accidentes e incidentes generan acciones de mejora con análisis causal y cierre documentado.',
    chapter: 'Verificación y mejora',
    phva: 'ACTUAR',
    normativeWeight: 2.5,
    applicableLevels: ['60'],
    moduleRoute: '/incidents',
    priorityMetadata: { criticality: 'MEDIA', estimatedEffort: 'MEDIO' },
    // FASE 7.7.B.1 — Textos tomados de ActPage (actuarItems).
    criteria:
      'Los accidentes e incidentes generan acciones de mejora con análisis causal, responsables definidos y cierre documentado.',
    modeReview:
      'Solicitar investigaciones de accidentes e incidentes y validar que los planes de acción asociados se ejecuten y verifiquen.',
    section: { id: 'act-mejoramiento', title: 'Mejoramiento (10%)', percentage: 10 },
  },
  {
    code: '7.1.4',
    implementationStatus: 'IMPLEMENTED',
    title: 'Plan de mejoramiento',
    description: 'Plan de mejoramiento del SG-SST con acciones, responsables y seguimiento al cierre.',
    chapter: 'Verificación y mejora',
    phva: 'ACTUAR',
    normativeWeight: 2.5,
    applicableLevels: ['60'],
    moduleRoute: '/documents/act',
    priorityMetadata: { criticality: 'MEDIA', estimatedEffort: 'MEDIO' },
    // FASE 7.7.B.1 — Textos tomados de ActPage (actuarItems).
    criteria:
      'Existe plan de mejoramiento del SG-SST implementado y monitoreado periódicamente para garantizar la mejora continua.',
    modeReview:
      'Validar la existencia de un plan de mejoramiento consolidado del SG-SST con priorización, cronograma, responsables e indicadores.',
    section: { id: 'act-mejoramiento', title: 'Mejoramiento (10%)', percentage: 10 },
  },
  {
    code: '7.2.1',
    implementationStatus: 'PLANNED',
    classification: 'DUPLICATE',
    duplicateOf: '7.1.4',
    title: 'Plan de mejoramiento anual del SG-SST',
    description: 'Duplicado semántico de 7.1.4 (Plan de mejoramiento). Subdivisión interna, no estándar puntuable independiente de la Resolución 0312.',
    chapter: 'Verificación y mejora',
    phva: 'ACTUAR',
    normativeWeight: 1,
    applicableLevels: ['60'],
    moduleRoute: '',
    priorityMetadata: { criticality: 'MEDIA', estimatedEffort: 'MEDIO' },
  },
];

/** Conjunto de niveles válidos del catálogo (comodín para validaciones). */
export const STANDARD_LEVELS: readonly StandardLevel[] = ['7', '21', '60'];
