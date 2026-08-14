import { StandardDefinition, StandardLevel } from '../interfaces/standard-definition.interface';

/**
 * CATÁLOGO MAESTRO DE ESTÁNDARES MÍNIMOS SG-SST (60 estándares).
 *
 * Única fuente de verdad del catálogo normativo. Los códigos 1.1.1–7.1.4
 * corresponden a los 50 estándares VERIFICADOS en la plataforma (PHVA
 * documental + Evaluación Inicial + módulos avanzados). Los 10 restantes
 * (1.1.9, 1.1.10, 2.12.1, 2.13.1, 3.3.4, 3.4.1, 4.3.1, 4.4.1, 5.2.1, 7.2.1)
 * son ítems del anexo de la Resolución 0312 de 2019 que aún no tienen módulo
 * en la plataforma: se registran con `moduleRoute: ''` y se incorporarán en
 * una fase posterior de integración.
 *
 * Los niveles 7 y 21 se derivan por `applicableLevels` (catalog-7.ts y
 * catalog-21.ts) para no duplicar definiciones.
 *
 * NOTA DE PESOS: `normativeWeight` conserva el peso normativo original. Los
 * 50 códigos implementados de la plataforma suman exactamente 100 (escala
 * PHVA). Los 10 ítems PLANNED del anexo añaden 1 punto cada uno, por lo que el
 * catálogo de 60 suma 110: es intencional. El peso EFECTIVO que usa el sistema
 * se calcula automáticamente (utils/effective-weights.ts) solo sobre los
 * estándares IMPLEMENTED/PARTIAL y siempre suma exactamente 100.
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
    title: 'Asignación de recursos financieros al SG-SST',
    description: 'Ítem del anexo Resolución 0312: asignación presupuestal específica para el SG-SST. Sin módulo en la plataforma aún.',
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
    title: 'Asignación de recursos técnicos y de otra índole',
    description: 'Ítem del anexo Resolución 0312: recursos técnicos, tecnológicos y de otra índole para el SG-SST. Sin módulo en la plataforma aún.',
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
    implementationStatus: 'PARTIAL',
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
    moduleRoute: '/documents/plan',
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
    implementationStatus: 'PARTIAL',
    title: 'Adquisiciones',
    description: 'Criterios de SST integrados en compras de bienes y servicios con evaluación de proveedores.',
    chapter: 'Gestión integral del SG-SST',
    phva: 'HACER',
    normativeWeight: 1,
    applicableLevels: ['60'],
    moduleRoute: '/documents/plan',
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
    implementationStatus: 'PARTIAL',
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
    implementationStatus: 'PARTIAL',
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
    title: 'Plan estratégico de seguridad vial',
    description: 'Ítem del anexo Resolución 0312: plan estratégico de seguridad vial para empresas obligadas. Sin módulo en la plataforma aún.',
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
    title: 'Prevención de accidentes en industrias mayores',
    description: 'Ítem del anexo Resolución 0312: prevención de accidentes mayores en industrias de alto riesgo. Sin módulo en la plataforma aún.',
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
    implementationStatus: 'PARTIAL',
    title: 'Perfil sociodemográfico',
    description: 'Caracterización sociodemográfica de la población trabajadora, actualizada como mínimo una vez al año.',
    chapter: 'Gestión del talento humano',
    phva: 'PLANEAR',
    normativeWeight: 3,
    applicableLevels: ['60'],
    moduleRoute: '/documents/do',
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
    implementationStatus: 'PARTIAL',
    title: 'Exámenes médicos ocupacionales',
    description: 'Evaluaciones médicas ocupacionales de ingreso, periódicos y de egreso según el riesgo del cargo.',
    chapter: 'Gestión del talento humano',
    phva: 'HACER',
    normativeWeight: 3,
    applicableLevels: ['7', '21', '60'],
    moduleRoute: '/documents/do',
    priorityMetadata: { criticality: 'ALTA', estimatedEffort: 'MEDIO' },
    // FASE 7.7.B.1 — Textos tomados de DoPage (condicionesSalud).
    criteria:
      'La organización ejecuta evaluaciones médicas ocupacionales conforme a la normatividad y garantiza confidencialidad, trazabilidad y seguimiento de resultados.',
    modeReview:
      'Solicitar evidencias de exámenes médicos de ingreso, periódicos y de egreso según el riesgo del cargo, verificando cumplimiento de periodicidad y custodia de historias clínicas ocupacionales.',
    section: { id: 'do-condiciones-salud', title: 'Condiciones de salud en el trabajo (9%)', percentage: 9 },
  },
  {
    code: '3.1.3',
    implementationStatus: 'PARTIAL',
    title: 'Seguimiento a recomendaciones médicas',
    description: 'Gestión oportuna de recomendaciones y restricciones médicas ocupacionales.',
    chapter: 'Gestión del talento humano',
    phva: 'HACER',
    normativeWeight: 3,
    applicableLevels: ['60'],
    moduleRoute: '/documents/do',
    priorityMetadata: { criticality: 'MEDIA', estimatedEffort: 'MEDIO' },
    // FASE 7.7.B.1 — Textos tomados de DoPage (condicionesSalud).
    criteria:
      'Se evidencia gestión oportuna de recomendaciones médicas ocupacionales, con acciones documentadas y monitoreo de su efectividad.',
    modeReview:
      'Revisar el mecanismo para gestionar recomendaciones o restricciones médicas y confirmar evidencia de ajustes laborales, reubicaciones o controles implementados.',
    section: { id: 'do-condiciones-salud', title: 'Condiciones de salud en el trabajo (9%)', percentage: 9 },
  },
  {
    code: '3.2.1',
    implementationStatus: 'IMPLEMENTED',
    title: 'Registro de ausentismo',
    description: 'Consolidado de ausentismo por causa médica y no médica con análisis periódico de tendencias.',
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
    title: 'Investigación de enfermedades laborales',
    description: 'Investigación documentada de casos de enfermedad laboral con análisis causal y plan de acción.',
    chapter: 'Gestión del talento humano',
    phva: 'HACER',
    normativeWeight: 2.5,
    applicableLevels: ['60'],
    moduleRoute: '/incidents',
    priorityMetadata: { criticality: 'MEDIA', estimatedEffort: 'MEDIO' },
    // FASE 7.7.B.1 — Textos tomados de DoPage (registroInvestigacion).
    criteria:
      'Los eventos relacionados con enfermedad laboral se investigan de forma documentada, con planes de acción y verificación de eficacia.',
    modeReview:
      'Solicitar investigaciones de casos reportados de enfermedad laboral o sospecha, verificando análisis causal, medidas de intervención y seguimiento al cierre de acciones.',
    section: { id: 'do-registro-investigacion', title: 'Registro e investigación (5%)', percentage: 5 },
  },
  {
    code: '3.3.1',
    implementationStatus: 'PARTIAL',
    title: 'Programas de vigilancia epidemiológica',
    description: 'PVE priorizados según matriz de peligros con diseño metodológico, indicadores y ejecución.',
    chapter: 'Gestión del talento humano',
    phva: 'HACER',
    normativeWeight: 2,
    applicableLevels: ['60'],
    moduleRoute: '/documents/do',
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
    implementationStatus: 'PARTIAL',
    title: 'Medición y análisis de indicadores de salud',
    description: 'Indicadores de salud laboral calculados, analizados y comunicados periódicamente.',
    chapter: 'Gestión del talento humano',
    phva: 'VERIFICAR',
    normativeWeight: 2,
    applicableLevels: ['60'],
    moduleRoute: '/documents/do',
    priorityMetadata: { criticality: 'BAJA', estimatedEffort: 'MEDIO' },
    // FASE 7.7.B.1 — Textos tomados de DoPage (vigilanciaSalud).
    criteria:
      'Se calcula, analiza y comunica periódicamente indicadores de salud laboral para definir acciones preventivas y correctivas.',
    modeReview:
      'Verificar indicadores de salud laboral (incidencia, prevalencia, severidad, frecuencia de eventos y ausentismo) y su análisis para toma de decisiones.',
    section: { id: 'do-vigilancia-salud', title: 'Vigilancia de la salud (6%)', percentage: 6 },
  },
  {
    code: '3.3.3',
    implementationStatus: 'PARTIAL',
    title: 'Intervención y seguimiento de casos',
    description: 'Gestión integral de casos de salud laboral con trazabilidad de acciones y cierre.',
    chapter: 'Gestión del talento humano',
    phva: 'HACER',
    normativeWeight: 2,
    applicableLevels: ['60'],
    moduleRoute: '/documents/do',
    priorityMetadata: { criticality: 'MEDIA', estimatedEffort: 'MEDIO' },
    // FASE 7.7.B.1 — Textos tomados de DoPage (vigilanciaSalud).
    criteria:
      'Existe gestión integral de casos de salud laboral con trazabilidad de acciones, responsables y verificación de cierre.',
    modeReview:
      'Evaluar soportes de intervención sobre casos identificados en vigilancia de la salud y evidencias de seguimiento por medicina laboral y SST.',
    section: { id: 'do-vigilancia-salud', title: 'Vigilancia de la salud (6%)', percentage: 6 },
  },
  {
    code: '3.3.4',
    implementationStatus: 'PLANNED',
    title: 'Programas de promoción y prevención en salud',
    description: 'Ítem del anexo Resolución 0312: programas de promoción de la salud y prevención de la enfermedad laboral. Sin módulo en la plataforma aún.',
    chapter: 'Gestión del talento humano',
    phva: 'HACER',
    normativeWeight: 1,
    applicableLevels: ['60'],
    moduleRoute: '',
    priorityMetadata: { criticality: 'MEDIA', estimatedEffort: 'MEDIO' },
  },
  {
    code: '3.4.1',
    implementationStatus: 'PLANNED',
    title: 'Indicadores de salud y bienestar',
    description: 'Ítem del anexo Resolución 0312: indicadores de salud y bienestar de la población trabajadora. Sin módulo en la plataforma aún.',
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
    phva: 'PLANEAR',
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
    implementationStatus: 'PARTIAL',
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
    implementationStatus: 'PARTIAL',
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
    implementationStatus: 'PARTIAL',
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
    implementationStatus: 'PARTIAL',
    title: 'Verificación de aplicación de medidas',
    description: 'Seguimiento al cumplimiento y efectividad de las medidas implementadas.',
    chapter: 'Procedimientos y programas',
    phva: 'VERIFICAR',
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
    implementationStatus: 'PARTIAL',
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
    title: 'Procedimiento de investigación de accidentes e incidentes',
    description: 'Ítem del anexo Resolución 0312: investigación de accidentes e incidentes de trabajo con análisis causal. Sin módulo en la plataforma aún.',
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
    title: 'Gestión del riesgo psicosocial',
    description: 'Ítem del anexo Resolución 0312: evaluación e intervención del riesgo psicosocial. Sin módulo en la plataforma aún.',
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
    implementationStatus: 'PARTIAL',
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
    implementationStatus: 'PARTIAL',
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
    title: 'Programa de simulacros de emergencia',
    description: 'Ítem del anexo Resolución 0312: programa de simulacros con evaluación de la respuesta. Sin módulo en la plataforma aún.',
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
    implementationStatus: 'PARTIAL',
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
    implementationStatus: 'PARTIAL',
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
    implementationStatus: 'PARTIAL',
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
    implementationStatus: 'PARTIAL',
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
    title: 'Plan de mejoramiento anual del SG-SST',
    description: 'Ítem del anexo Resolución 0312: plan de mejoramiento anual consolidado del SG-SST. Sin módulo en la plataforma aún.',
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
