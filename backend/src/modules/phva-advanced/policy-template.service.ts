import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PolicyTemplate, PolicyTemplateDocument, SectorAnnualObjective } from './schemas/policy-template.schema';

@Injectable()
export class PolicyTemplateService {
  constructor(
    @InjectModel(PolicyTemplate.name)
    private readonly templateModel: Model<PolicyTemplateDocument>,
  ) {}

  // ================================================================
  // SEED — inserts default templates if none exist
  // ================================================================
  async seedDefaults(): Promise<number> {
    const count = await this.templateModel.countDocuments().exec();
    if (count > 0) return 0; // already seeded

    const defaults = this.defaultSectorTemplates();
    await this.templateModel.insertMany(defaults);
    return defaults.length;
  }

  // ================================================================
  // CRUD
  // ================================================================
  async findAll(activeOnly = false): Promise<PolicyTemplateDocument[]> {
    const filter = activeOnly ? { active: true } : {};
    return this.templateModel.find(filter).sort({ sector: 1 }).exec();
  }

  async findBySector(sector: string): Promise<PolicyTemplateDocument> {
    // Try exact match first
    let template = await this.templateModel.findOne({ sector }).exec();
    
    // Try case-insensitive match
    if (!template) {
      template = await this.templateModel.findOne({
        sector: { $regex: new RegExp(`^${this.escapeRegex(sector)}$`, 'i') },
      }).exec();
    }
    
    // Try partial match (e.g., 'Comercio Minorista' contains 'Comercio')
    if (!template) {
      const sectorLower = sector.toLowerCase();
      const allTemplates = await this.templateModel.find({ active: true }).exec();
      template = allTemplates.find((t) =>
        sectorLower.includes(t.sector.toLowerCase()) ||
        t.sector.toLowerCase().includes(sectorLower)
      ) ?? null;
    }
    
    if (!template) {
      // Fallback: return generic template
      const generic = await this.templateModel.findOne({ sector: 'General' }).exec();
      if (generic) return generic;
      throw new NotFoundException(`No se encontró plantilla para el sector: ${sector}`);
    }
    return template;
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  async findById(id: string): Promise<PolicyTemplateDocument> {
    const template = await this.templateModel.findById(id).exec();
    if (!template) throw new NotFoundException('Plantilla no encontrada');
    return template;
  }

  async create(dto: CreatePolicyTemplateDto): Promise<PolicyTemplateDocument> {
    const existing = await this.templateModel.findOne({ sector: dto.sector }).exec();
    if (existing) throw new BadRequestException(`Ya existe una plantilla para el sector: ${dto.sector}`);
    return this.templateModel.create(dto);
  }

  async update(id: string, dto: UpdatePolicyTemplateDto): Promise<PolicyTemplateDocument> {
    const template = await this.templateModel.findById(id).exec();
    if (!template) throw new NotFoundException('Plantilla no encontrada');

    // If sector is being changed, check uniqueness
    if (dto.sector && dto.sector !== template.sector) {
      const conflict = await this.templateModel.findOne({ sector: dto.sector }).exec();
      if (conflict) throw new BadRequestException(`Ya existe una plantilla para el sector: ${dto.sector}`);
    }

    Object.assign(template, dto);
    template.version = (template.version || 0) + 1;
    return template.save();
  }

  async remove(id: string): Promise<void> {
    const result = await this.templateModel.deleteOne({ _id: id }).exec();
    if (result.deletedCount === 0) throw new NotFoundException('Plantilla no encontrada');
  }

  // ================================================================
  // SECTOR TEMPLATE DATA — comprehensive, enterprise-grade
  // ================================================================
  private defaultSectorTemplates(): Array<{
    sector: string;
    sectorRisks: string[];
    sectorCommitments: string[];
    legalReferences: string[];
    recommendedResponsibilities: string[];
    suggestedAnnualObjectives: SectorAnnualObjective[];
  }> {
    return [
      {
        sector: 'General',
        sectorRisks: [
          'Identificación de peligros y valoración de riesgos en todos los procesos',
          'Implementación de controles operacionales para prevenir accidentes y enfermedades laborales',
          'Promoción de estilos de vida saludables y prevención de enfermedades laborales',
          'Gestión de emergencias y planes de contingencia',
        ],
        sectorCommitments: [
          'Proveer los recursos financieros, técnicos y humanos necesarios para el SG-SST',
          'Cumplir con la normatividad colombiana vigente en SST',
          'Promover la participación activa de todos los trabajadores en el sistema',
          'Revisar periódicamente el desempeño del SG-SST para su mejora continua',
        ],
        legalReferences: [
          'Ley 1562 de 2012 — Sistema General de Riesgos Laborales',
          'Decreto 1072 de 2015 — Decreto Único Reglamentario del Sector Trabajo',
          'Resolución 0312 de 2019 — Estándares Mínimos del SG-SST',
          'Ley 776 de 2002 — Prestaciones del Sistema General de Riesgos Laborales',
          'Código Sustantivo del Trabajo — Obligaciones del empleador en SST',
        ],
        recommendedResponsibilities: [
          'GERENCIA: Aprobar política SST, asignar recursos y revisar resultados',
          'RESPONSABLE SST: Implementar, coordinar y hacer seguimiento al SG-SST',
          'MANDOS MEDIOS: Aplicar controles y velar por el cumplimiento en sus áreas',
          'TRABAJADORES: Cumplir normas, usar EPP y reportar condiciones inseguras',
          'COPASST: Vigilar y promover la seguridad y salud en la organización',
        ],
        suggestedAnnualObjectives: [
          { name: 'Fortalecer la cultura de prevención', indicator: '% de participación en capacitaciones', targetValue: 85, responsible: 'Responsable SST', description: 'Capacitar al menos al 85% de los trabajadores en temas SST' },
          { name: 'Mejorar indicadores de accidentalidad', indicator: 'Tasa de accidentalidad', targetValue: 0, responsible: 'Coordinador SST', description: 'Reducir la tasa de accidentalidad laboral' },
          { name: 'Actualizar matriz de identificación de peligros', indicator: '% de procesos evaluados', targetValue: 100, responsible: 'Líder SST', description: 'Evaluar el 100% de los procesos productivos' },
        ],
      },
      {
        sector: 'Construcción',
        sectorRisks: [
          'Trabajo en alturas: uso obligatorio de arnés de seguridad, líneas de vida y anclajes certificados según Resolución 1409 de 2012',
          'Manipulación de equipos pesados: excavadoras, montacargas y grúas con operadores certificados',
          'Excavaciones y zanjas: apuntalamiento, señalización y protección contra derrumbes',
          'Riesgos eléctricos: bloqueo y etiquetado (LOTO), distancias de seguridad y equipos dieléctricos',
          'Exposición a ruido, polvo y vibraciones: EPP auditivo, respiradores y monitoreo ambiental',
          'Caídas al mismo y distinto nivel: barandas, mallas de seguridad y orden en obra',
          'Manipulación de materiales pesados: ayudas mecánicas, técnicas de izaje y procedimientos seguros',
          'Riesgos biológicos por excavaciones: exposición a vectores, aguas estancadas y residuos',
          'Condiciones climáticas extremas: trabajo a la intemperie, golpe de calor e hipotermia',
          'Demoliciones y estructuras inestables: protocolos de seguridad y peritaje estructural',
        ],
        sectorCommitments: [
          'Proveer y exigir el uso de EPP certificados para trabajo en alturas y protección contra caídas',
          'Capacitar y certificar a todos los operarios en trabajo seguro en alturas',
          'Implementar un sistema de permisos de trabajo para actividades críticas (excavaciones, izajes, eléctricos)',
          'Realizar inspecciones de seguridad semanales en todas las obras',
          'Garantizar la estabilidad estructural de excavaciones, andamios y encofrados',
          'Fomentar una cultura de seguridad donde todo incidente se reporte e investigue',
        ],
        legalReferences: [
          'Resolución 1409 de 2012 — Reglamento de Seguridad para Trabajo en Alturas',
          'Resolución 0312 de 2019 — Estándares Mínimos del SG-SST (Capítulo Construcción)',
          'Decreto 1072 de 2015, Capítulo 6 — Seguridad en Construcción',
          'NTC 6001 — Gestión de Seguridad y Salud en Construcción',
          'Ley 1562 de 2012 — Riesgos Laborales en el Sector Construcción',
        ],
        recommendedResponsibilities: [
          'GERENCIA: Asignar presupuesto para EPP y capacitaciones certificadas',
          'RESIDENTE DE OBRA: Supervisar cumplimiento de permisos de trabajo y control de riesgos',
          'RESPONSABLE SST: Realizar inspecciones y asegurar competencias del personal',
          'SUPERVISORES: Verificar uso correcto de EPP y detener trabajos inseguros',
          'TRABAJADORES: Reportar condiciones inseguras y usar correctamente los EPP',
        ],
        suggestedAnnualObjectives: [
          { name: 'Cero accidentes por trabajo en alturas', indicator: 'Número de incidentes en alturas', targetValue: 0, responsible: 'Residente de Obra', description: 'Implementar controles para eliminar accidentes relacionados con trabajo en alturas' },
          { name: '100% de trabajadores certificados en alturas', indicator: '% de trabajadores certificados', targetValue: 100, responsible: 'Responsable SST', description: 'Garantizar que todo trabajador que realice trabajo en alturas tenga certificación vigente' },
          { name: 'Inspecciones semanales completas', indicator: '% de inspecciones ejecutadas', targetValue: 100, responsible: 'Supervisor de Obra', description: 'Ejecutar el 100% de las inspecciones de seguridad programadas' },
        ],
      },
      {
        sector: 'Manufactura',
        sectorRisks: [
          'Riesgos mecánicos en maquinaria industrial: guardas de seguridad, paros de emergencia y LOTO',
          'Manipulación manual de cargas: ergonomía, ayudas mecánicas y rotación de puestos',
          'Exposición a sustancias químicas: hojas de seguridad (SDS), ventilación y EPP específico',
          'Riesgo de incendio y explosión: sistemas de detección, extinción y plan de emergencia',
          'Ruido industrial: programas de conservación auditiva y monitoreo periódico',
          'Riesgos ergonómicos por movimientos repetitivos y posturas forzadas',
          'Exposición a temperaturas extremas en procesos productivos',
          'Atrapamiento en cintas transportadoras y equipos rotativos',
          'Riesgos eléctricos en paneles de control y subestaciones',
          'Generación de residuos peligrosos: clasificación, almacenamiento y disposición final',
        ],
        sectorCommitments: [
          'Implementar programa de bloqueo y etiquetado (LOTO) en toda la maquinaria industrial',
          'Realizar evaluaciones ergonómicas periódicas con planes de intervención',
          'Mantener inventario y hojas de seguridad de todas las sustancias químicas utilizadas',
          'Capacitar al personal en manejo seguro de maquinaria y equipos',
          'Implementar programa de conservación auditiva con monitoreo ambiental y evaluaciones médicas',
          'Establecer sistema de gestión de residuos peligrosos conforme a normatividad ambiental',
        ],
        legalReferences: [
          'Resolución 2400 de 1979 — Reglamento de Higiene y Seguridad Industrial',
          'Decreto 1072 de 2015, Libro 2, Parte 2, Título 4 — SST en Industria',
          'Resolución 0312 de 2019 — Estándares Mínimos para Manufactura',
          'Decreto 351 de 2014 — Ergonomía en Puestos de Trabajo',
          'Norma NFPA 70E — Seguridad Eléctrica en Lugares de Trabajo',
        ],
        recommendedResponsibilities: [
          'GERENCIA: Aprobar inversiones en controles de ingeniería y EPP',
          'DIRECTOR DE PLANTA: Supervisar cumplimiento de LOTO y mantenimiento de equipos',
          'RESPONSABLE SST: Realizar evaluaciones de riesgo mecánico y químico',
          'MANTENIMIENTO: Implementar programas de mantenimiento predictivo y preventivo',
          'OPERARIOS: Reportar condiciones inseguras y participar en pausas activas',
        ],
        suggestedAnnualObjectives: [
          { name: 'Reducir accidentalidad en operación de maquinaria', indicator: 'Número de incidentes con maquinaria', targetValue: 0, responsible: 'Director de Planta', description: 'Implementar controles y capacitación para eliminar accidentes con maquinaria' },
          { name: 'Implementar LOTO en 100% de equipos críticos', indicator: '% de equipos con LOTO implementado', targetValue: 100, responsible: 'Jefe de Mantenimiento', description: 'Implementar programa de bloqueo y etiquetado en todos los equipos críticos' },
          { name: 'Evaluación ergonómica de todos los puestos operativos', indicator: '% de puestos evaluados', targetValue: 100, responsible: 'Responsable SST', description: 'Evaluar ergonómicamente el 100% de puestos operativos y generar planes de acción' },
        ],
      },
      {
        sector: 'Comercio',
        sectorRisks: [
          'Riesgos ergonómicos por movimientos repetitivos y posturas prolongadas en cajas y bodegas',
          'Manipulación y almacenamiento de mercancías: estanterías seguras y levantamiento seguro',
          'Atención al público: medidas de seguridad ciudadana y prevención de robos',
          'Riesgo eléctrico en instalaciones comerciales y equipos de refrigeración',
          'Iluminación, ventilación y condiciones ambientales en locales comerciales',
          'Desplazamientos en áreas de venta: pisos resbaladizos, escaleras y obstáculos',
          'Trabajo en horarios extendidos y rotativos: fatiga y estrés laboral',
          'Exposición a temperaturas extremas en áreas de almacenamiento frigorífico',
          'Carga y descarga de mercancías en muelles: atrapamientos y golpes',
          'Seguridad perimetral y control de accesos en horarios nocturnos',
        ],
        sectorCommitments: [
          'Adecuar puestos de trabajo con mobiliario ergonómico en cajas y áreas administrativas',
          'Capacitar al personal en manejo seguro de cargas y uso de ayudas mecánicas',
          'Implementar protocolos de seguridad ciudadana para atención al público',
          'Mantener condiciones óptimas de iluminación, temperatura y ventilación',
          'Realizar mantenimiento preventivo de estanterías, equipos de frío y sistemas eléctricos',
          'Promover pausas activas y gestión del estrés en horarios de alta afluencia',
        ],
        legalReferences: [
          'Resolución 0312 de 2019 — Estándares Mínimos para el Sector Comercio',
          'Decreto 1072 de 2015 — SST General Aplicable al Comercio',
          'Resolución 2400 de 1979 — Reglamento de Higiene y Seguridad',
          'Ley 1355 de 2009 — Obesidad y Enfermedades Crónicas (pausas activas)',
          'Decreto 1477 de 2014 — Tabla de Enfermedades Laborales (ergonómicas)',
        ],
        recommendedResponsibilities: [
          'GERENCIA: Aprobar inversiones en mobiliario y adecuación de instalaciones',
          'JEFE DE TIENDA: Velar por condiciones seguras en puntos de venta',
          'RESPONSABLE SST: Realizar evaluaciones de riesgos psicosociales y ergonómicos',
          'SUPERVISORES: Asegurar pausas activas y uso de ayudas mecánicas',
          'COLABORADORES: Reportar condiciones inseguras y mantener orden en áreas de trabajo',
        ],
        suggestedAnnualObjectives: [
          { name: 'Reducir trastornos musculoesqueléticos en cajeros', indicator: '% de cajeros con molestias reportadas', targetValue: 30, responsible: 'Responsable SST', description: 'Reducir en un 30% los reportes de molestias musculoesqueléticas en personal de cajas' },
          { name: 'Implementar programa de pausas activas', indicator: '% de cumplimiento de pausas', targetValue: 90, responsible: 'Jefe de Tienda', description: 'Lograr un 90% de cumplimiento del programa de pausas activas' },
          { name: 'Cero incidentes en áreas de almacenamiento', indicator: 'Número de incidentes en bodega', targetValue: 0, responsible: 'Jefe de Bodega', description: 'Implementar controles para eliminar incidentes en almacenes y bodegas' },
        ],
      },
      {
        sector: 'Servicios',
        sectorRisks: [
          'Riesgos psicosociales: carga mental, estrés laboral, acoso y violencia en el trabajo',
          'Trabajo en oficinas: ergonomía de puestos con pantallas de visualización de datos (PVD)',
          'Desplazamientos laborales: seguridad vial, accidentes in itinere y en misión',
          'Trabajo remoto: condiciones de seguridad y salud en teletrabajo',
          'Relaciones interpersonales: promoción de convivencia laboral y prevención de acoso',
          'Fatiga visual por exposición prolongada a pantallas',
          'Sedentarismo y estilo de vida saludable: promoción de actividad física',
          'Atención al cliente: manejo de conflictos y situaciones de estrés',
          'Condiciones ambientales en oficinas: calidad del aire, iluminación y ruido',
          'Uso de equipos electrónicos: riesgos eléctricos y sobrecargas',
        ],
        sectorCommitments: [
          'Implementar programa de gestión del riesgo psicosocial con evaluaciones periódicas',
          'Proveer mobiliario ergonómico y capacitación en higiene postural',
          'Establecer políticas de desconexión laboral y gestión del tiempo de trabajo',
          'Realizar evaluaciones de condiciones de teletrabajo y adecuación de puestos remotos',
          'Fomentar estilos de vida saludable con pausas activas, actividad física y alimentación saludable',
          'Promover la convivencia laboral y prevenir el acoso mediante canales de denuncia',
        ],
        legalReferences: [
          'Resolución 2764 de 2022 — Evaluación de Riesgo Psicosocial',
          'Ley 1221 de 2008 — Teletrabajo y Condiciones de SST',
          'Decreto 1072 de 2015 — SST General',
          'Ley 1010 de 2006 — Acoso Laboral',
          'Resolución 0312 de 2019 — Estándares Mínimos (Sector Servicios)',
        ],
        recommendedResponsibilities: [
          'GERENCIA: Promover cultura de bienestar y gestión del estrés',
          'TALENTO HUMANO: Implementar programa de riesgo psicosocial',
          'RESPONSABLE SST: Evaluar puestos y condiciones de teletrabajo',
          'LÍDERES DE EQUIPO: Fomentar pausas activas y desconexión laboral',
          'TRABAJADORES: Reportar factores de riesgo psicosocial',
        ],
        suggestedAnnualObjectives: [
          { name: 'Evaluar riesgo psicosocial en todos los colaboradores', indicator: '% de colaboradores evaluados', targetValue: 100, responsible: 'Responsable SST', description: 'Evaluar el riesgo psicosocial del 100% de colaboradores' },
          { name: 'Implementar teletrabajo seguro', indicator: '% de teletrabajadores con evaluación', targetValue: 100, responsible: 'TTHH', description: 'Evaluar y certificar condiciones de teletrabajo para todos los remotos' },
          { name: 'Reducir ausentismo por estrés', indicator: 'Días perdidos por estrés', targetValue: 30, responsible: 'Bienestar', description: 'Reducir en un 30% los días perdidos por causas relacionadas con estrés' },
        ],
      },
      {
        sector: 'Transporte',
        sectorRisks: [
          'Seguridad vial: programas de conducción segura, fatiga al volante y tiempos de conducción',
          'Gestión de fatiga del conductor: pausas activas, rotación y monitoreo de horas de conducción',
          'Mantenimiento preventivo de vehículos: frenos, llantas, luces y sistemas de seguridad',
          'Carga y descarga de mercancías: técnicas seguras, amarre y estabilización',
          'Emergencias en carretera: kit de emergencia, comunicaciones y procedimientos',
          'Exposición a agentes ambientales: clima adverso, contaminación y radiación solar',
          'Riesgos ergonómicos por posturas prolongadas al volante: dolor lumbar y sedentarismo',
          'Manipulación de combustibles: prevención de incendios y derrames',
          'Operación de vehículos de carga pesada: maniobras en espacios reducidos',
          'Ciberseguridad en flotas: protección de sistemas de rastreo y gestión',
        ],
        sectorCommitments: [
          'Implementar programa de seguridad vial con monitoreo de conductores y vehículos',
          'Establecer límites de conducción y pausas obligatorias según normatividad',
          'Realizar mantenimiento preventivo programado de toda la flota',
          'Capacitar a conductores en manejo defensivo, emergencias y estabilidad de carga',
          'Proveer equipos de seguridad vehicular y kits de emergencia en ruta',
          'Implementar sistema de gestión de fatiga con monitoreo de horas de conducción',
        ],
        legalReferences: [
          'Ley 1503 de 2011 — Seguridad Vial y Movilidad',
          'Resolución 1565 de 2014 — Plan Estratégico de Seguridad Vial (PESV)',
          'Decreto 1079 de 2015 — Sector Transporte',
          'Decreto 1072 de 2015 — SST Aplicable al Transporte',
          'Resolución 0312 de 2019 — Estándares Mínimos para Transporte',
        ],
        recommendedResponsibilities: [
          'GERENCIA: Aprobar PESV y asignar recursos para flota segura',
          'JEFE DE FLOTA: Supervisar mantenimiento preventivo y evaluaciones de conductores',
          'RESPONSABLE SST: Implementar programa de seguridad vial y fatiga',
          'CONDUCTORES: Cumplir normas de tránsito, pausas y reportar condiciones inseguras',
          'LOGÍSTICA: Planificar rutas seguras y tiempos de conducción adecuados',
        ],
        suggestedAnnualObjectives: [
          { name: 'Cero accidentes de tránsito', indicator: 'Número de accidentes viales', targetValue: 0, responsible: 'Jefe de Flota', description: 'Implementar controles para eliminar accidentes de tránsito' },
          { name: '100% de conductores capacitados en conducción segura', indicator: '% de conductores capacitados', targetValue: 100, responsible: 'Responsable SST', description: 'Capacitar al 100% de conductores en manejo defensivo' },
          { name: 'PESV implementado y en operación', indicator: 'Cumplimiento del PESV', targetValue: 90, responsible: 'Gerencia', description: 'Implementar el Plan Estratégico de Seguridad Vial con cumplimiento >= 90%' },
        ],
      },
      {
        sector: 'Salud',
        sectorRisks: [
          'Exposición biológica: agentes infecciosos, sangre y fluidos corporales, precauciones universales',
          'Manejo de residuos peligrosos: clasificación, almacenamiento, desactivación y disposición final',
          'Riesgo de cortopunzantes: uso seguro de agujas, bisturís y eliminación en guardianes',
          'Manipulación de pacientes: biomecánica corporal, ayudas mecánicas y prevención de lesiones',
          'Control de infecciones: higiene de manos, aislamiento y protocolos de bioseguridad',
          'Radiaciones ionizantes en servicios de imágenes diagnósticas: blindaje, dosimetría y EPP',
          'Exposición a gases anestésicos y medicamentos peligrosos (quimioterapia)',
          'Riesgos psicosociales: estrés asistencial, burnout y desgaste profesional',
          'Trabajo en turnos nocturnos y prolongados: fatiga y trastornos del sueño',
          'Violencia ocupacional: agresiones de pacientes y familiares en servicios críticos',
        ],
        sectorCommitments: [
          'Implementar y auditar el programa de bioseguridad y precauciones universales',
          'Garantizar la disponibilidad de EPP adecuado para cada nivel de riesgo biológico',
          'Capacitar a todo el personal en manejo seguro de residuos peligrosos',
          'Realizar vigilancia epidemiológica de exposiciones ocupacionales (accidentes biológicos)',
          'Establecer programa de prevención de lesiones osteomusculares en personal asistencial',
          'Implementar programa de salud mental para prevención del burnout asistencial',
        ],
        legalReferences: [
          'Decreto 351 de 2014 — SST para el Sector Salud',
          'Resolución 1164 de 2002 — Manual de Gestión de Residuos Hospitalarios',
          'Decreto 1072 de 2015 — SST General',
          'Ley 1122 de 2007 — Riesgos Laborales en Salud',
          'Circular 019 de 2020 — Bioseguridad en Instituciones de Salud',
        ],
        recommendedResponsibilities: [
          'GERENCIA: Aprobar presupuesto para bioseguridad y EPP',
          'DIRECTOR MÉDICO: Supervisar protocolos de bioseguridad y control de infecciones',
          'RESPONSABLE SST: Implementar vigilancia epidemiológica y programa de riesgo biológico',
          'JEFE DE ENFERMERÍA: Velar por cumplimiento de precauciones universales',
          'PERSONAL ASISTENCIAL: Usar EPP adecuado y reportar accidentes biológicos',
        ],
        suggestedAnnualObjectives: [
          { name: 'Cero accidentes biológicos', indicator: 'Número de accidentes biológicos reportados', targetValue: 0, responsible: 'Responsable SST', description: 'Implementar controles para eliminar accidentes con material biológico' },
          { name: '100% de residuos peligrosos gestionados correctamente', indicator: '% de residuos con disposición adecuada', targetValue: 100, responsible: 'Jefe de Servicios', description: 'Garantizar la gestión adecuada del 100% de residuos peligrosos' },
          { name: 'Evaluar riesgo psicosocial del personal asistencial', indicator: '% evaluado', targetValue: 100, responsible: 'Talento Humano', description: 'Evaluar riesgo psicosocial al 100% del personal asistencial' },
        ],
      },
      {
        sector: 'Educación',
        sectorRisks: [
          'Riesgos psicosociales: estrés laboral docente, violencia escolar y acoso',
          'Condiciones de infraestructura: aulas, laboratorios y áreas recreativas seguras',
          'Gestión de emergencias escolares: simulacros, rutas de evacuación y brigadas',
          'Exposición a agentes biológicos en laboratorios y entornos educativos',
          'Manipulación de sustancias químicas en laboratorios educativos',
          'Riesgos ergonómicos por posturas prolongadas y uso de pantallas',
          'Exposición a ruido en aulas y áreas comunes',
          'Desplazamientos internos: escaleras, rampas y pasillos seguros',
          'Atención a estudiantes con necesidades especiales: riesgos asociados',
          'Enfermedades infectocontagiosas en entornos educativos: control y prevención',
        ],
        sectorCommitments: [
          'Implementar programa de convivencia escolar y prevención del acoso',
          'Mantener infraestructura educativa segura: señalización, barandas y extintores',
          'Realizar simulacros de emergencia periódicos con toda la comunidad educativa',
          'Proveer EPP y capacitación para laboratorios y talleres educativos',
          'Fomentar la salud mental y el bienestar del personal docente y administrativo',
          'Establecer protocolos de bioseguridad para control de infecciones en el aula',
        ],
        legalReferences: [
          'Ley 1620 de 2013 — Convivencia Escolar y Acoso',
          'Ley 115 de 1994 — Ley General de Educación (infraestructura segura)',
          'Decreto 1072 de 2015 — SST General',
          'Resolución 0312 de 2019 — Estándares Mínimos para Educación',
          'Ley 1562 de 2012 — Riesgos Laborales Docentes',
        ],
        recommendedResponsibilities: [
          'RECTORÍA: Aprobar plan de gestión de riesgos institucionales',
          'COORDINADORES: Supervisar simulacros y condiciones de infraestructura',
          'RESPONSABLE SST: Evaluar riesgos laborales del personal docente y administrativo',
          'DOCENTES: Reportar condiciones inseguras y promover autocuidado en estudiantes',
          'COMITÉ ESCOLAR: Participar en elaboración de planes de emergencia',
        ],
        suggestedAnnualObjectives: [
          { name: 'Implementar programa de salud mental docente', indicator: '% de docentes evaluados', targetValue: 100, responsible: 'Bienestar', description: 'Evaluar salud mental del 100% del personal docente' },
          { name: 'Cero accidentes en laboratorios', indicator: 'Número de incidentes en laboratorios', targetValue: 0, responsible: 'Coordinador de Laboratorios', description: 'Implementar controles para eliminar accidentes en laboratorios' },
          { name: 'Mejorar preparación para emergencias', indicator: '% de simulacros realizados', targetValue: 100, responsible: 'Comité Escolar', description: 'Ejecutar el 100% de simulacros programados' },
        ],
      },
      {
        sector: 'Tecnología',
        sectorRisks: [
          'Riesgos ergonómicos: puestos de trabajo con pantallas, pausas activas y mobiliario ajustable',
          'Riesgos psicosociales: trabajo bajo presión, jornadas extendidas, entregas ágiles y teletrabajo',
          'Riesgo eléctrico en equipos de cómputo, servidores y centros de datos',
          'Exposición a campos electromagnéticos en centros de procesamiento de datos',
          'Condiciones de iluminación y clima laboral en entornos tecnológicos',
          'Fatiga visual por exposición prolongada a pantallas de computador',
          'Sedentarismo y trabajo prolongado sentado: promoción de movimiento',
          'Aislamiento social en teletrabajo: salud mental y conexión con el equipo',
          'Trabajo en horarios flexibles: gestión del tiempo y desconexión laboral',
          'Seguridad informática: estrés por incidentes de ciberseguridad',
        ],
        sectorCommitments: [
          'Proveer mobiliario ergonómico ajustable (sillas, escritorios, soportes de pantalla)',
          'Implementar programa de pausas activas y ejercicios visuales',
          'Establecer política de desconexión laboral y gestión de jornadas extendidas',
          'Evaluar condiciones de teletrabajo y adecuar puestos remotos',
          'Realizar evaluaciones de riesgo psicosocial con enfoque en sector tecnológico',
          'Promover actividad física y estilos de vida saludable en el entorno laboral',
        ],
        legalReferences: [
          'Ley 1221 de 2008 — Teletrabajo',
          'Resolución 2764 de 2022 — Riesgo Psicosocial',
          'Decreto 1072 de 2015 — SST General',
          'Resolución 0312 de 2019 — Estándares Mínimos',
          'Guía Técnica Colombiana GTC 45 — Ergonomía en Puestos con PVD',
        ],
        recommendedResponsibilities: [
          'GERENCIA: Aprobar inversiones en bienestar y ergonomía',
          'LÍDERES TÉCNICOS: Promover pausas activas y respetar horarios',
          'RESPONSABLE SST: Evaluar condiciones de teletrabajo y ergonomía',
          'TTHH: Implementar programa de salud mental y prevención del burnout',
          'COLABORADORES: Participar en pausas activas y reportar condiciones inseguras',
        ],
        suggestedAnnualObjectives: [
          { name: 'Evaluar condiciones de teletrabajo al 100%', indicator: '% de teletrabajadores evaluados', targetValue: 100, responsible: 'Responsable SST', description: 'Evaluar condiciones ergonómicas y de SST del 100% de teletrabajadores' },
          { name: 'Reducir síntomas de fatiga visual', indicator: '% de colaboradores con molestias visuales', targetValue: 30, responsible: 'Bienestar', description: 'Reducir en un 30% los reportes de fatiga visual en el equipo' },
          { name: 'Mejorar salud mental y satisfacción laboral', indicator: 'Puntuación en encuesta de clima', targetValue: 85, responsible: 'TTHH', description: 'Alcanzar un 85% de satisfacción en encuesta de clima laboral' },
        ],
      },
      {
        sector: 'Agricultura',
        sectorRisks: [
          'Exposición a plaguicidas y agroquímicos: manejo seguro, EPP y vigilancia epidemiológica',
          'Riesgos con maquinaria agrícola: tractores, cosechadoras y equipos de labranza',
          'Trabajo a la intemperie: golpe de calor, protección solar e hidratación',
          'Manipulación manual de cargas pesadas y posturas forzadas en cultivos',
          'Riesgos biológicos: zoonosis, mordeduras de serpientes y picaduras de insectos',
          'Cortes y laceraciones con herramientas manuales: machetes, podadoras y guadañas',
          'Exposición a ruido y vibraciones en maquinaria agrícola',
          'Condiciones sanitarias en alojamientos rurales y áreas de descanso',
          'Riesgo de incendios forestales y agrícolas',
          'Desplazamiento en terrenos irregulares: caídas y lesiones',
        ],
        sectorCommitments: [
          'Implementar programa de manejo seguro de plaguicidas con EPP certificado',
          'Capacitar a trabajadores en uso seguro de maquinaria y herramientas agrícolas',
          'Proveer protección solar, hidratación y áreas de sombra para trabajo al aire libre',
          'Realizar vigilancia epidemiológica de intoxicaciones por plaguicidas',
          'Establecer protocolos de emergencia para mordeduras, picaduras y golpe de calor',
          'Garantizar condiciones sanitarias adecuadas en alojamientos rurales',
        ],
        legalReferences: [
          'Decreto 1843 de 1991 — Uso y Manejo de Plaguicidas',
          'Resolución 0312 de 2019 — Estándares Mínimos para Agricultura',
          'Ley 1562 de 2012 — Riesgos Laborales en el Sector Agropecuario',
          'Decreto 1072 de 2015 — SST General',
          'Resolución 2400 de 1979 — Reglamento de Higiene Agrícola',
        ],
        recommendedResponsibilities: [
          'PROPIETARIO/GERENTE: Aprobar inversiones en EPP y controles',
          'INGENIERO AGRÓNOMO: Supervisar manejo seguro de agroquímicos',
          'RESPONSABLE SST: Realizar vigilancia epidemiológica y capacitaciones',
          'JEFES DE CAMPO: Asegurar uso de EPP y condiciones de hidratación',
          'TRABAJADORES: Usar EPP adecuado y reportar síntomas de intoxicación',
        ],
        suggestedAnnualObjectives: [
          { name: 'Cero intoxicaciones por plaguicidas', indicator: 'Número de intoxicaciones reportadas', targetValue: 0, responsible: 'Responsable SST', description: 'Implementar controles para eliminar intoxicaciones por agroquímicos' },
          { name: '100% de trabajadores con EPP adecuado', indicator: '% de trabajadores con EPP completo', targetValue: 100, responsible: 'Jefe de Campo', description: 'Garantizar que el 100% de trabajadores cuente con EPP adecuado' },
          { name: 'Evaluar condiciones sanitarias en alojamientos rurales', indicator: '% de alojamientos evaluados', targetValue: 100, responsible: 'Gerencia', description: 'Evaluar condiciones sanitarias del 100% de alojamientos rurales' },
        ],
      },
      {
        sector: 'Minería',
        sectorRisks: [
          'Riesgos geotécnicos: deslizamientos, derrumbes y estabilidad de taludes',
          'Ventilación en espacios confinados: monitoreo de gases, atmósferas peligrosas y controles',
          'Exposición a polvo de sílice y material particulado: control ambiental y EPP respiratorio',
          'Ruido y vibraciones en equipos mineros: programas de conservación auditiva',
          'Manipulación de explosivos: almacenamiento, transporte y detonación segura',
          'Trabajo en alturas en tajos abiertos y plataformas de perforación',
          'Riesgos eléctricos en subestaciones y equipos de minería',
          'Atrapamiento en equipos de trituración y transporte de mineral',
          'Inundaciones en minería subterránea: sistemas de drenaje y monitoreo',
          'Condiciones extremas de temperatura y humedad en minería subterránea',
        ],
        sectorCommitments: [
          'Implementar sistema de monitoreo geotécnico continuo en tajos y galerías',
          'Mantener sistemas de ventilación forzada y monitoreo de gases en tiempo real',
          'Realizar control ambiental de sílice con monitoreo periódico y EPP respiratorio',
          'Establecer programa de conservación auditiva con monitoreo audiométrico',
          'Implementar procedimientos seguros para manipulación de explosivos',
          'Capacitar a todo el personal en respuesta a emergencias mineras',
        ],
        legalReferences: [
          'Decreto 1886 de 2015 — Reglamento de Seguridad Minera',
          'Resolución 0312 de 2019 — Estándares Mínimos para Minería',
          'Ley 1562 de 2012 — Riesgos Laborales en Minería',
          'Decreto 1072 de 2015 — SST General',
          'Resolución 2400 de 1979 — Seguridad en Minería',
        ],
        recommendedResponsibilities: [
          'GERENCIA: Aprobar inversiones en seguridad minera y monitoreo',
          'INGENIERO DE MINAS: Supervisar condiciones geotécnicas y ventilación',
          'RESPONSABLE SST: Implementar programas de conservación auditiva y control de sílice',
          'SUPERVISORES: Asegurar cumplimiento de procedimientos de voladura',
          'MINEROS: Reportar condiciones inseguras y usar EPP adecuado',
        ],
        suggestedAnnualObjectives: [
          { name: 'Cero accidentes por derrumbes', indicator: 'Número de incidentes geotécnicos', targetValue: 0, responsible: 'Ingeniero de Minas', description: 'Implementar monitoreo geotécnico para eliminar accidentes por derrumbes' },
          { name: 'Control de exposición a sílice al 100%', indicator: '% de puntos con niveles seguros', targetValue: 100, responsible: 'Responsable SST', description: 'Mantener niveles de sílice dentro de límites permisibles en todas las áreas' },
          { name: 'Programa de conservación auditiva implementado', indicator: '% de trabajadores con audiometría', targetValue: 100, responsible: 'Responsable SST', description: 'Realizar audiometrías al 100% de trabajadores expuestos a ruido' },
        ],
      },
      {
        sector: 'Petróleo y Gas',
        sectorRisks: [
          'Trabajo en espacios confinados: monitoreo de atmósferas peligrosas y permisos de entrada',
          'Manejo de hidrocarburos y sustancias inflamables: prevención de incendio y explosión',
          'Trabajo en alturas en plataformas y estructuras: sistemas de detención de caídas y anclajes',
          'Operaciones de perforación y extracción: controles de seguridad críticos',
          'Emergencias ambientales: planes de contingencia y respuesta a derrames',
          'Exposición a gases tóxicos (H2S, CO): monitoreo continuo y EPP respiratorio',
          'Riesgos de explosión en plantas de procesamiento: sistemas de alivio y venteo',
          'Operaciones de izaje de equipos pesados: grúas, aparejos y maniobras críticas',
          'Fatiga en personal de operaciones 24/7: gestión de turnos y descansos',
          'Condiciones climáticas extremas en locaciones remotas: logística de emergencias',
        ],
        sectorCommitments: [
          'Implementar sistema de permisos de trabajo para actividades críticas (espacios confinados, trabajo en alturas, caliente)',
          'Mantener sistemas de detección de gases y alarmas en todas las áreas operativas',
          'Desarrollar y entrenar planes de respuesta a emergencias para derrames, fugas e incendios',
          'Realizar inspecciones de seguridad de equipos críticos antes de cada operación',
          'Capacitar al personal en manejo seguro de hidrocarburos y sustancias peligrosas',
          'Implementar programa de fatiga y gestión de turnos para operaciones continuas',
        ],
        legalReferences: [
          'Decreto 1072 de 2015 — SST General',
          'Resolución 181595 de 2020 — Seguridad en Hidrocarburos',
          'Resolución 0312 de 2019 — Estándares Mínimos',
          'NTC 1200 — Seguridad en Operaciones Petroleras',
          'Ley 1562 de 2012 — Riesgos Laborales en Sector Oil & Gas',
        ],
        recommendedResponsibilities: [
          'GERENCIA: Aprobar planes de respuesta a emergencias y presupuesto de seguridad',
          'SUPERINTENDENTE DE OPERACIONES: Velar por cumplimiento de permisos de trabajo',
          'RESPONSABLE SST: Implementar monitoreo de gases y programas de seguridad crítica',
          'SUPERVISORES: Asegurar controles operacionales y EPP',
          'OPERADORES: Cumplir procedimientos y reportar desviaciones de proceso',
        ],
        suggestedAnnualObjectives: [
          { name: 'Cero incidentes en espacios confinados', indicator: 'Número de incidentes en espacios confinados', targetValue: 0, responsible: 'Superintendente', description: 'Eliminar incidentes en espacios confinados mediante controles y capacitación' },
          { name: '100% de permisos de trabajo cumplidos', indicator: '% de cumplimiento de PT', targetValue: 100, responsible: 'Supervisor de Seguridad', description: 'Lograr 100% de cumplimiento del sistema de permisos de trabajo' },
          { name: 'Cero derrames ambientales', indicator: 'Número de derrames reportados', targetValue: 0, responsible: 'Gerencia HSE', description: 'Implementar controles para eliminar derrames de hidrocarburos' },
        ],
      },
      {
        sector: 'Pesca',
        sectorRisks: [
          'Riesgos biológicos en ambientes húmedos y mojados: hongos, bacterias y parásitos',
          'Manipulación manual de cargas pesadas y sobreesfuerzos en procesamiento',
          'Operaciones en cadena de frío: hipotermia, quemaduras por frío y condiciones térmicas extremas',
          'Trabajo en embarcaciones: seguridad marítima, equipos de flotación y naufragio',
          'Corte y procesamiento de productos pesqueros: uso seguro de herramientas cortantes',
          'Pisos resbaladizos en plantas de procesamiento: calzado antideslizante y drenajes',
          'Exposición a vibraciones en embarcaciones y maquinaria de procesamiento',
          'Ruido en bodegas y áreas de procesamiento: protección auditiva',
          'Fatiga por jornadas extendidas en temporadas de pesca',
          'Condiciones climáticas adversas en alta mar: protocolos de tormenta',
        ],
        sectorCommitments: [
          'Proveer calzado antideslizante, ropa impermeable y EPP para ambiente húmedo',
          'Implementar protocolos de seguridad marítima con equipos de flotación y balsas salvavidas',
          'Capacitar en uso seguro de herramientas de corte y procesamiento',
          'Establecer pausas activas y rotación de puestos en cámaras de frío',
          'Realizar monitoreo de condiciones térmicas en áreas de cadena de frío',
          'Implementar programa de fatiga con límites de jornada en temporada alta',
        ],
        legalReferences: [
          'Decreto 1072 de 2015 — SST General',
          'Decreto 1273 de 2020 — Seguridad en Actividades Pesqueras',
          'Resolución 0312 de 2019 — Estándares Mínimos para Pesca',
          'Ley 1562 de 2012 — Riesgos Laborales en Pesca',
          'Código Internacional de Seguridad Marítima (ISM)',
        ],
        recommendedResponsibilities: [
          'GERENCIA: Aprobar inversiones en seguridad marítima y EPP',
          'CAPITÁN DE EMBARCACIÓN: Velar por seguridad de tripulación en alta mar',
          'RESPONSABLE SST: Implementar protocolos de cadena de frío y manejo de cargas',
          'JEFE DE PLANTA: Supervisar condiciones de procesamiento y uso de EPP',
          'TRIPULANTES: Usar EPP y seguir protocolos de seguridad marítima',
        ],
        suggestedAnnualObjectives: [
          { name: 'Cero accidentes en procesamiento pesquero', indicator: 'Número de cortes/laceraciones', targetValue: 0, responsible: 'Jefe de Planta', description: 'Implementar controles para eliminar accidentes con herramientas cortantes' },
          { name: '100% de personal capacitado en seguridad marítima', indicator: '% de tripulación capacitada', targetValue: 100, responsible: 'Capitán', description: 'Capacitar al 100% de tripulación en seguridad marítima y uso de EPP de flotación' },
          { name: 'Prevenir hipotermia en cadena de frío', indicator: 'Reportes de síntomas por frío', targetValue: 0, responsible: 'Responsable SST', description: 'Implementar controles para prevenir hipotermia en áreas de frío' },
        ],
      },
      {
        sector: 'Hoteles',
        sectorRisks: [
          'Riesgos ergonómicos en limpieza y mantenimiento de habitaciones: posturas forzadas y movimientos repetitivos',
          'Manipulación de cargas en cocina y bodegas: levantamiento seguro y ayudas mecánicas',
          'Atención al público: seguridad ciudadana, manejo de conflictos y situaciones de emergencia',
          'Trabajo en alturas en mantenimiento de fachadas y cubiertas',
          'Riesgos eléctricos en instalaciones y equipos de cocina',
          'Exposición a temperaturas extremas en cocina (calor) y cámaras de frío',
          'Cortes y quemaduras en cocina: uso seguro de cuchillos, freidoras y hornos',
          'Pisos resbaladizos en áreas de lavandería, cocina y piscinas',
          'Caídas al mismo nivel por superficies mojadas y desorden',
          'Riesgos psicosociales: estrés por atención al cliente, trabajo en turnos y fines de semana',
        ],
        sectorCommitments: [
          'Implementar programa de ergonomía para personal de camareras y mantenimiento',
          'Capacitar en manejo seguro de cargas y uso de ayudas mecánicas en cocina y bodegas',
          'Establecer protocolos de seguridad ciudadana y manejo de emergencias',
          'Mantener condiciones seguras en áreas de cocina con EPP para calor y cortes',
          'Realizar inspecciones de seguridad en áreas húmedas y piscinas',
          'Implementar programa de gestión del estrés para personal de atención al público',
        ],
        legalReferences: [
          'Decreto 1072 de 2015 — SST General',
          'Resolución 0312 de 2019 — Estándares Mínimos para Hotelería',
          'Resolución 2400 de 1979 — Higiene y Seguridad en Hoteles',
          'Ley 1562 de 2012 — Riesgos Laborales en Hospitalidad',
          'NTC 6001 — Gestión de SST en Hoteles y Restaurantes',
        ],
        recommendedResponsibilities: [
          'GERENCIA GENERAL: Aprobar inversiones en seguridad hotelera',
          'JEFE DE MANTENIMIENTO: Supervisar condiciones de infraestructura y equipos',
          'RESPONSABLE SST: Implementar programas de ergonomía y riesgo psicosocial',
          'JEFES DE DEPARTAMENTO: Velar por condiciones seguras en sus áreas',
          'COLABORADORES: Reportar condiciones inseguras y participar en capacitaciones',
        ],
        suggestedAnnualObjectives: [
          { name: 'Reducir accidentes en áreas de lavandería y cocina', indicator: 'Número de incidentes reportados', targetValue: 0, responsible: 'Jefe de Servicios', description: 'Implementar controles para eliminar accidentes en áreas húmedas y de cocina' },
          { name: '100% de personal capacitado en manejo de emergencias', indicator: '% de personal capacitado', targetValue: 100, responsible: 'Responsable SST', description: 'Capacitar al 100% del personal en protocolos de emergencia hotelera' },
          { name: 'Evaluar riesgo psicosocial en personal de atención', indicator: '% evaluado', targetValue: 100, responsible: 'TTHH', description: 'Evaluar riesgo psicosocial al 100% del personal de atención al público' },
        ],
      },
      {
        sector: 'Logística',
        sectorRisks: [
          'Manipulación de cargas pesadas: técnicas de levantamiento seguro y ayudas mecánicas',
          'Operación de montacargas, grúas y equipos de carga: certificación y procedimientos seguros',
          'Circulación de vehículos internos: peatones, zonas de carga y señalización vial',
          'Almacenamiento en estanterías altas: estabilidad, alturas máximas y protección',
          'Riesgos eléctricos en sistemas automatizados de almacén',
          'Exposición a ruido constante en centros de distribución',
          'Riesgos ergonómicos por movimientos repetitivos en clasificación y embalaje',
          'Condiciones ambientales en muelles de carga: temperaturas extremas y corrientes de aire',
          'Atrapamiento entre estanterías y equipos de carga',
          'Fatiga por horarios extendidos en temporadas de alta demanda',
        ],
        sectorCommitments: [
          'Implementar programa de seguridad en operaciones de carga y descarga',
          'Certificar a todos los operadores de montacargas y grúas',
          'Establecer zonas peatonales segregadas y señalización de seguridad vial interna',
          'Realizar mantenimiento preventivo de estanterías y sistemas de almacenamiento',
          'Implementar programa de ergonomía para puestos de clasificación y embalaje',
          'Gestionar la fatiga mediante rotación de puestos y pausas programadas',
        ],
        legalReferences: [
          'Decreto 1072 de 2015 — SST General',
          'Resolución 0312 de 2019 — Estándares Mínimos para Logística',
          'Resolución 2400 de 1979 — Seguridad en Almacenes y Bodegas',
          'Ley 1562 de 2012 — Riesgos Laborales en Logística',
          'NTC 170 — Seguridad en Operaciones con Montacargas',
        ],
        recommendedResponsibilities: [
          'GERENCIA: Aprobar inversiones en ayudas mecánicas y equipos de carga',
          'JEFE DE BODEGA: Supervisar condiciones de almacenamiento y circulación',
          'RESPONSABLE SST: Implementar programas de ergonomía y seguridad vial',
          'SUPERVISORES: Asegurar uso de EPP y procedimientos de carga',
          'OPERADORES: Reportar condiciones inseguras y mantener orden en bodega',
        ],
        suggestedAnnualObjectives: [
          { name: 'Cero atrapamientos en bodega', indicator: 'Número de incidentes por atrapamiento', targetValue: 0, responsible: 'Jefe de Bodega', description: 'Implementar controles para eliminar atrapamientos en estanterías y equipos' },
          { name: '100% de operadores certificados', indicator: '% de operadores certificados', targetValue: 100, responsible: 'Responsable SST', description: 'Certificar al 100% de operadores de montacargas y grúas' },
          { name: 'Reducir incidentes por manipulación de cargas', indicator: 'Número de incidentes por carga', targetValue: 0, responsible: 'Jefe de Operaciones', description: 'Implementar controles ergonómicos y ayudas mecánicas para eliminar lesiones por carga' },
        ],
      },
      {
        sector: 'Turismo',
        sectorRisks: [
          'Riesgos psicosociales: estrés por atención al cliente, trabajo en temporada alta y horarios extendidos',
          'Desplazamientos laborales frecuentes: seguridad vial para guías y personal de campo',
          'Condiciones climáticas adversas en actividades turísticas al aire libre',
          'Atención a grupos grandes: control de multitudes y gestión de emergencias',
          'Seguridad de instalaciones turísticas: piscinas, áreas recreativas y alojamientos',
          'Riesgos biológicos en actividades de ecoturismo: contacto con fauna y flora',
          'Trabajo en horarios nocturnos y fines de semana en actividades turísticas',
          'Exposición al sol y radiación UV en actividades al aire libre',
          'Manipulación de alimentos en servicios turísticos: higiene y seguridad alimentaria',
          'Emergencias en zonas remotas: comunicación, evacuación y primeros auxilios',
        ],
        sectorCommitments: [
          'Capacitar al personal en manejo de emergencias y atención de primeros auxilios',
          'Implementar protocolos de seguridad para actividades turísticas de aventura',
          'Proveer EPP y protección solar para actividades al aire libre',
          'Establecer programa de gestión del estrés para temporadas de alta demanda',
          'Realizar inspecciones de seguridad en instalaciones turísticas (piscinas, áreas comunes)',
          'Implementar comunicación satelital o alternativa para zonas remotas',
        ],
        legalReferences: [
          'Decreto 1072 de 2015 — SST General',
          'Resolución 0312 de 2019 — Estándares Mínimos para Turismo',
          'Ley 1101 de 2006 — Seguridad en Turismo de Aventura',
          'NTC 5154 — Seguridad en Ecoturismo',
          'Ley 1562 de 2012 — Riesgos Laborales en Turismo',
        ],
        recommendedResponsibilities: [
          'GERENCIA: Aprobar planes de seguridad turística y protocolos de emergencia',
          'COORDINADOR DE OPERACIONES: Supervisar seguridad en actividades turísticas',
          'RESPONSABLE SST: Implementar programas de riesgo psicosocial y seguridad vial',
          'GUÍAS TURÍSTICOS: Velar por seguridad de visitantes y reportar condiciones inseguras',
          'PERSONAL OPERATIVO: Usar EPP y seguir protocolos de emergencia',
        ],
        suggestedAnnualObjectives: [
          { name: 'Cero incidentes en actividades de aventura', indicator: 'Número de incidentes en tours', targetValue: 0, responsible: 'Coordinador de Operaciones', description: 'Implementar controles para eliminar incidentes en actividades turísticas de aventura' },
          { name: '100% de guías certificados en primeros auxilios', indicator: '% de guías certificados', targetValue: 100, responsible: 'Responsable SST', description: 'Certificar al 100% de guías turísticos en primeros auxilios y RCP' },
          { name: 'Evaluar riesgo psicosocial en temporada alta', indicator: 'Puntuación de estrés laboral', targetValue: 60, responsible: 'TTHH', description: 'Reducir puntuación de estrés en temporada alta mediante intervenciones' },
        ],
      },
    ];
  }
}

// DTO interfaces
export interface CreatePolicyTemplateDto {
  sector: string;
  sectorRisks?: string[];
  sectorCommitments?: string[];
  legalReferences?: string[];
  recommendedResponsibilities?: string[];
  suggestedAnnualObjectives?: SectorAnnualObjective[];
  active?: boolean;
}

export interface UpdatePolicyTemplateDto {
  sector?: string;
  sectorRisks?: string[];
  sectorCommitments?: string[];
  legalReferences?: string[];
  recommendedResponsibilities?: string[];
  suggestedAnnualObjectives?: SectorAnnualObjective[];
  active?: boolean;
}
