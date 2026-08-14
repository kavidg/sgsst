import { Injectable, Logger } from '@nestjs/common';
import { StandardDefinition } from '../standard-catalog/interfaces/standard-definition.interface';
import { StandardCatalogService } from '../standard-catalog/standard-catalog.service';
import { EvaluationStandard, StandardEvaluationStatus } from './schemas/initial-evaluation.schema';

/**
 * Catálogo LEGACY de la evaluación inicial SG-SST (FALLBACK TEMPORAL).
 *
 * FASE 6A: se conserva intacto para garantizar compatibilidad total. El
 * StandardCatalog solo reemplaza este catálogo cuando la verificación de
 * equivalencia demuestra que ambos producen el mismo resultado observable
 * (códigos, orden, pesos, capítulos, títulos y descripciones). Su eliminación
 * definitiva se hará en una fase posterior de limpieza.
 */
export const LEGACY_INITIAL_EVALUATION_CATALOG: Array<
  Omit<EvaluationStandard, 'status' | 'observations' | 'evidence' | 'attachments' | 'autoEvaluated' | 'evaluatedAt' | 'evaluatedBy'>
> = [
  { code: '1.1.1', chapter: '1. Recursos', title: 'Responsable del SG-SST', description: 'Asignación del responsable SST con perfil y soportes.', weight: 0.5, autoSource: 'Responsable SST' },
  { code: '1.1.2', chapter: '1. Recursos', title: 'Responsabilidades en SG-SST', description: 'Matriz de responsabilidades para todos los niveles.', weight: 0.5 },
  { code: '1.1.3', chapter: '1. Recursos', title: 'Asignación de recursos', description: 'Recursos financieros, técnicos y humanos.', weight: 0.5 },
  { code: '1.1.4', chapter: '1. Recursos', title: 'Afiliación a riesgos laborales', description: 'Cobertura en riesgos laborales del personal.', weight: 0.5 },
  { code: '1.1.5', chapter: '1. Recursos', title: 'Trabajadores alto riesgo', description: 'Identificación y control de tareas de alto riesgo.', weight: 0.5 },
  { code: '1.1.6', chapter: '1. Recursos', title: 'Conformación COPASST', description: 'COPASST vigente y operativo.', weight: 0.5, autoSource: 'COPASST' },
  // FASE 6: 1.1.7 entra al diagnóstico automático (módulo real en Gestión
  // Avanzada). Peso/capítulo/título alineados con el StandardCatalog.
  { code: '1.1.7', chapter: '1. Recursos', title: 'Capacitación COPASST', description: 'Formación pertinente y periódica de los integrantes del COPASST.', weight: 0.5, autoSource: 'Capacitación COPASST' },
  { code: '1.1.8', chapter: '1. Recursos', title: 'Comité de convivencia', description: 'Comité de convivencia laboral conformado.', weight: 0.5 },
  { code: '1.2.1', chapter: '1. Capacitación', title: 'Programa de capacitación SST', description: 'Programa anual de capacitación, inducción y reinducción.', weight: 6, autoSource: 'Capacitaciones' },
  { code: '2.1.1', chapter: '2. Gestión integral', title: 'Política SST', description: 'Política SST vigente, aprobada y divulgada.', weight: 1, autoSource: 'Política SST' },
  { code: '2.2.1', chapter: '2. Gestión integral', title: 'Objetivos SST', description: 'Objetivos SST medibles y alineados con la política.', weight: 1, autoSource: 'Objetivos SST' },
];

/** Resultado de la verificación de equivalencia entre ambos catálogos. */
export interface CatalogComparisonResult {
  /** true si ambos catálogos producen exactamente el mismo resultado observable. */
  equivalent: boolean;
  /** Diferencias encontradas (vacío si equivalent). */
  differences: string[];
}

/** Convierte el catálogo legacy en estándares de evaluación listos para Mongo. */
export function buildLegacyStandards(): EvaluationStandard[] {
  return LEGACY_INITIAL_EVALUATION_CATALOG.map((item) => ({
    ...item,
    status: StandardEvaluationStatus.DOES_NOT_COMPLY,
    observations: '',
    evidence: [],
    attachments: [],
    autoEvaluated: false,
  }));
}

/**
 * Convierte definiciones del StandardCatalog en estándares de evaluación.
 *
 * Es la capa adaptadora: StandardDefinition → EvaluationStandard. El peso
 * efectivo proviene de `normativeWeight` (catálogo normativo, sin normalizar).
 */
export function buildCatalogStandards(definitions: readonly StandardDefinition[]): EvaluationStandard[] {
  return definitions.map((definition) => ({
    code: definition.code,
    chapter: definition.chapter,
    title: definition.title,
    description: definition.description,
    weight: definition.normativeWeight,
    status: StandardEvaluationStatus.DOES_NOT_COMPLY,
    observations: '',
    evidence: [],
    attachments: [],
    autoEvaluated: false,
  }));
}

/**
 * Verificación de equivalencia observable entre el catálogo legacy y el que
 * produce el StandardCatalog para el nivel de la empresa.
 *
 * Compara: presencia de códigos, orden, pesos, capítulos, títulos y
 * descripciones. Cualquier diferencia invalida la equivalencia (el fallback
 * legacy se mantiene). Nunca lanza.
 *
 * Alcance: `phva` y `moduleRoute` son metadatos del StandardCatalog que NO
 * existen en el EvaluationStandard legacy, por lo que no forman parte de la
 * equivalencia observable de la evaluación inicial (el schema se mantiene
 * intacto por compatibilidad).
 */
export function compareCatalogs(legacy: EvaluationStandard[], standard: EvaluationStandard[]): CatalogComparisonResult {
  const differences: string[] = [];
  const standardByCode = new Map(standard.map((item) => [item.code, item]));

  // Códigos y campos por código (en orden legacy).
  for (const legacyItem of legacy) {
    const standardItem = standardByCode.get(legacyItem.code);
    if (!standardItem) {
      differences.push(`${legacyItem.code}: ausente en StandardCatalog`);
      continue;
    }
    if (standardItem.weight !== legacyItem.weight) {
      differences.push(`${legacyItem.code}: weight legacy=${legacyItem.weight} vs standard=${standardItem.weight}`);
    }
    if (standardItem.chapter !== legacyItem.chapter) {
      differences.push(`${legacyItem.code}: chapter legacy="${legacyItem.chapter}" vs standard="${standardItem.chapter}"`);
    }
    if (standardItem.title !== legacyItem.title) {
      differences.push(`${legacyItem.code}: title legacy="${legacyItem.title}" vs standard="${standardItem.title}"`);
    }
    if (standardItem.description !== legacyItem.description) {
      differences.push(`${legacyItem.code}: description difiere`);
    }
  }

  // Orden relativo de los códigos legacy dentro del StandardCatalog.
  const legacyCodes = legacy.map((item) => item.code);
  const legacyCodesSet = new Set(legacyCodes);
  const standardLegacyOrder = standard.filter((item) => legacyCodesSet.has(item.code)).map((item) => item.code);
  if (standardLegacyOrder.join('|') !== legacyCodes.join('|')) {
    differences.push(`orden difiere: legacy [${legacyCodes.join(', ')}] vs standard [${standardLegacyOrder.join(', ')}]`);
  }

  // Códigos adicionales que el StandardCatalog expondría para el nivel.
  const extraCodes = standard.filter((item) => !legacyCodesSet.has(item.code)).map((item) => item.code);
  if (extraCodes.length) {
    differences.push(`códigos extra en StandardCatalog (nivel): ${extraCodes.join(', ')}`);
  }

  return { equivalent: differences.length === 0, differences };
}

/**
 * InitialEvaluationCatalogAdapter — capa adaptadora entre el StandardCatalog
 * (fuente oficial de estándares) y el módulo InitialEvaluation.
 *
 * Flujo (FASE 6A):
 *
 *   company.standardsType
 *        ↓
 *   StandardCatalogService.getApplicableStandards(level)
 *        ↓
 *   buildCatalogStandards()  (StandardDefinition → EvaluationStandard)
 *        ↓
 *   compareCatalogs() vs catálogo legacy
 *        ├─ equivalente → se usa el catálogo oficial
 *        └─ diferencia / vacío / error / nivel inválido → FALLBACK legacy
 *
 * NUNCA lanza: si el StandardCatalog falla, la evaluación inicial se crea con
 * el catálogo legacy y se registra la razón en logs de desarrollo.
 *
 * NOTA IMPORTANTE (activación): con los catálogos actuales la equivalencia
 * NO puede cumplirse porque los CONJUNTOS de códigos difieren (legacy = 10
 * códigos fijos vs nivel 7→11, 21→22, 60→60). El fallback es por tanto el
 * comportamiento permanente hasta una fase futura de conciliación que decida
 * la forma objetivo (subset legacy o catálogo completo del nivel). No basta
 * alinear pesos/capítulos: deben coincidir los códigos y su orden.
 */
@Injectable()
export class InitialEvaluationCatalogAdapter {
  private readonly logger = new Logger(InitialEvaluationCatalogAdapter.name);

  constructor(private readonly catalogService: StandardCatalogService) {}

  resolveStandards(company?: { standardsType?: string } | null): EvaluationStandard[] {
    const legacy = buildLegacyStandards();
    const level = company?.standardsType;

    if (!level || !this.catalogService.isValidLevel(level)) {
      this.logger.debug(`standardsType ausente/inválido ('${level ?? ''}'): usando fallback legacy`);
      return legacy;
    }

    let standardStandards: EvaluationStandard[];
    try {
      standardStandards = buildCatalogStandards(this.catalogService.getApplicableStandards(level));
    } catch (error) {
      this.logger.warn(`StandardCatalog lanzó excepción (nivel ${level}): usando fallback legacy. ${String(error)}`);
      return legacy;
    }

    if (standardStandards.length === 0) {
      this.logger.warn(`StandardCatalog devolvió catálogo vacío (nivel ${level}): usando fallback legacy`);
      return legacy;
    }

    const comparison = compareCatalogs(legacy, standardStandards);
    if (comparison.equivalent) {
      this.logger.log(`Equivalencia verificada (nivel ${level}): usando catálogo oficial del StandardCatalog`);
      return standardStandards;
    }

    // Diferencia esperada hoy (códigos extra + pesos/capítulos): log de
    // desarrollo (debug), no ruido en producción. El fallback es permanente
    // hasta la fase de conciliación de catálogos.
    this.logger.debug(
      `Equivalencia NO verificada (nivel ${level}, ${comparison.differences.length} diferencias): usando fallback legacy. ${comparison.differences.join(' | ')}`,
    );
    return legacy;
  }
}
