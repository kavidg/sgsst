import { Injectable } from '@nestjs/common';
import { CATALOG_21 } from './constants/catalog-21';
import { CATALOG_60, STANDARD_LEVELS } from './constants/catalog-60';
import { CATALOG_7 } from './constants/catalog-7';
import { EffectiveStandardCatalogDto, EffectiveStandardDto } from './dto/effective-standard.dto';
import { StandardCatalogDto } from './dto/standard-catalog.dto';
import { StandardDto } from './dto/standard.dto';
import {
  PhvaPhase,
  StandardDefinition,
  StandardLevel,
  StandardSection,
} from './interfaces/standard-definition.interface';
import { computeEffectiveWeights } from './utils/effective-weights';

/**
 * Catálogos por nivel. Los niveles 7 y 21 se derivan del maestro (catalog-60)
 * por `applicableLevels` — única fuente de verdad, sin definiciones duplicadas.
 */
const CATALOGS: Record<StandardLevel, readonly StandardDefinition[]> = {
  '7': CATALOG_7,
  '21': CATALOG_21,
  '60': CATALOG_60,
};

/**
 * StandardCatalogService — módulo de SOLO LECTURA.
 *
 * Fuente central de verdad del catálogo normativo de estándares mínimos del
 * SG-SST (Resolución 0312 de 2019). No lee ni escribe en Mongo: consume los
 * catálogos estáticos y expone DTOs para el frontend y para la integración
 * futura de InitialEvaluation, PHVA y evaluaciones.
 *
 * FASE 5.1: además del catálogo normativo (`getCatalog`, contrato intacto),
 * expone el catálogo EFECTIVO normalizado (`getEffectiveCatalog`) con
 * `effectiveWeight` (suma exacta 100) y `implementationStatus`, más métodos de
 * consulta por estado de implementación.
 */
@Injectable()
export class StandardCatalogService {
  /** Guard de tipo: valida que un string sea un nivel de estándares. */
  isValidLevel(value: string): value is StandardLevel {
    return (STANDARD_LEVELS as readonly string[]).includes(value);
  }

  /**
   * Catálogo completo de un nivel (DTO normativo, contrato existente intacto).
   */
  getCatalog(level: StandardLevel): StandardCatalogDto {
    return this.buildDto(level, CATALOGS[level]);
  }

  /**
   * Definiciones crudas aplicables a un nivel (para consumo interno
   * de otros engines sin pasar por el DTO).
   */
  getApplicableStandards(level: StandardLevel): readonly StandardDefinition[] {
    return CATALOGS[level];
  }

  /**
   * Estándares de un nivel filtrados por fase del ciclo PHVA.
   */
  getStandardsByPhva(level: StandardLevel, phva: PhvaPhase): StandardCatalogDto {
    const definitions = CATALOGS[level].filter((standard) => standard.phva === phva);
    return this.buildDto(level, definitions);
  }

  /** Busca un estándar por código dentro del nivel (null si no existe). */
  getStandardByCode(level: StandardLevel, code: string): StandardDefinition | null {
    return CATALOGS[level].find((standard) => standard.code === code) ?? null;
  }

  /** Niveles válidos del catálogo (comodín para validaciones externas). */
  get levels(): readonly StandardLevel[] {
    return STANDARD_LEVELS;
  }

  // ────────────────────────────────────────────────────────────────────────
  // FASE 5.1 — Estado de implementación y catálogo efectivo
  // ────────────────────────────────────────────────────────────────────────

  /** Estándares del nivel con módulo funcional (IMPLEMENTED + PARTIAL). */
  getImplementedStandards(level: StandardLevel): StandardDefinition[] {
    return CATALOGS[level].filter((standard) => standard.implementationStatus !== 'PLANNED');
  }

  /** Estándares del nivel sin implementar aún (PLANNED). */
  getPendingStandards(level: StandardLevel): StandardDefinition[] {
    return CATALOGS[level].filter((standard) => standard.implementationStatus === 'PLANNED');
  }

  /**
   * Suma del peso normativo de los estándares implementados (IMPLEMENTED +
   * PARTIAL). Es el numerador de la normalización; NO es el peso efectivo.
   */
  getImplementedWeight(level: StandardLevel): number {
    return this.getImplementedStandards(level).reduce(
      (acc, standard) => acc + standard.normativeWeight,
      0,
    );
  }

  /**
   * Catálogo EFECTIVO normalizado: solo estándares IMPLEMENTED/PARTIAL con
   * `effectiveWeight` calculado automáticamente (suma exacta 100) y
   * `implementationStatus`. El catálogo normativo NO se modifica.
   */
  getEffectiveCatalog(level: StandardLevel): EffectiveStandardCatalogDto {
    const active = this.getImplementedStandards(level);
    const effectiveByCode = computeEffectiveWeights(CATALOGS[level]);

    const standards: EffectiveStandardDto[] = active.map((definition) => ({
      ...this.mapOptionalMetadata(definition),
      code: definition.code,
      title: definition.title,
      description: definition.description,
      chapter: definition.chapter,
      phva: definition.phva,
      normativeWeight: definition.normativeWeight,
      effectiveWeight: effectiveByCode.get(definition.code) ?? 0,
      applicableLevels: [...definition.applicableLevels],
      moduleRoute: definition.moduleRoute,
      implementationStatus: definition.implementationStatus,
    }));

    const effectiveTotal = standards.reduce((acc, standard) => acc + standard.effectiveWeight, 0);

    return {
      level,
      count: standards.length,
      effectiveTotal: round2(effectiveTotal),
      implementedCount: standards.filter(
        (standard) => standard.implementationStatus === 'IMPLEMENTED',
      ).length,
      plannedCount: CATALOGS[level].length - standards.length,
      standards,
    };
  }

  // ────────────────────────────────────────────────────────────────────────

  private toDto(definition: StandardDefinition): StandardDto {
    return {
      ...this.mapOptionalMetadata(definition),
      code: definition.code,
      title: definition.title,
      description: definition.description,
      chapter: definition.chapter,
      phva: definition.phva,
      weight: definition.normativeWeight,
      applicableLevels: [...definition.applicableLevels],
      moduleRoute: definition.moduleRoute,
      implementationStatus: definition.implementationStatus,
    };
  }

  /**
   * Campos opcionales compartidos por los DTOs (DRY).
   *
   * FASE 7.1 — Preparación de arquitectura del PHVA dinámico: los nuevos
   * campos criteria/modeReview/section viajan hasta el endpoint SOLO cuando
   * el estándar tiene información (los cinco estándares piloto). Para el resto
   * se retornan como undefined: no se inventa ni se genera contenido.
   */
  private mapOptionalMetadata(definition: StandardDefinition): {
    validationProvider?: string;
    priorityMetadata?: StandardDefinition['priorityMetadata'];
    criteria?: string;
    modeReview?: string;
    section?: StandardSection;
  } {
    return {
      ...(definition.validationProvider ? { validationProvider: definition.validationProvider } : {}),
      ...(definition.priorityMetadata ? { priorityMetadata: definition.priorityMetadata } : {}),
      criteria: definition.criteria,
      modeReview: definition.modeReview,
      section: definition.section,
    };
  }

  private buildDto(
    level: StandardLevel,
    definitions: readonly StandardDefinition[],
  ): StandardCatalogDto {
    return {
      level,
      count: definitions.length,
      standards: definitions.map((definition) => this.toDto(definition)),
    };
  }
}

/** Redondea a 2 decimales (evita 99.9999… en la suma del peso efectivo). */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
