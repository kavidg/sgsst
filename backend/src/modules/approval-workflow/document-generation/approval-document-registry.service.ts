import { Inject, Injectable } from '@nestjs/common';
import { ApprovalEntity } from '../enums/approval-entity.enum';
import {
  APPROVAL_DOCUMENT_GENERATORS,
  ApprovalDocumentGenerator,
} from './approval-document-generator.interface';

/**
 * Registry de documentos aprobables del Approval Workflow Core (Fase 2.1).
 *
 * Resuelve module + entity → ApprovalDocumentGenerator. Los generadores se
 * registran mediante el token multi-provider APPROVAL_DOCUMENT_GENERATORS
 * (mismo patrón que APPROVAL_ADAPTERS), de modo que cada módulo aporta sus
 * generadores sin que el Core conozca su lógica.
 *
 * Entidades del SG-SST con documento formal:
 *   - PHVA_ADVANCED: RESPONSIBLE_SG_SST (Fase 2.1).
 *   - COPASST: 'CopasstPeriod' (clave real del flujo, Fase 3) con alias
 *     PHVA_ADVANCED:'COPASST' (clave normalizada).
 *   - PHVA_ADVANCED: 'PhvaAdvancedResponsibilities' (clave real del flujo,
 *     Fase 4) con alias PHVA_ADVANCED:'RESPONSIBILITIES' (clave normalizada).
 *   - PHVA_ADVANCED: 'PhvaAdvancedResourceAssignment' (clave real del flujo,
 *     Fase 5) con alias PHVA_ADVANCED:'RESOURCE_ASSIGNMENT' (clave normalizada).
 *   - PHVA_ADVANCED: 'PhvaAdvancedSstPolicy' (clave real del flujo, Fase 6)
 *     con alias PHVA_ADVANCED:'SST_POLICY' (clave normalizada).
 *   - CONVIVENCIA (fases posteriores).
 */
@Injectable()
export class ApprovalDocumentRegistryService {
  private readonly generators = new Map<string, ApprovalDocumentGenerator>();

  constructor(
    @Inject(APPROVAL_DOCUMENT_GENERATORS)
    generators: ApprovalDocumentGenerator[],
  ) {
    for (const generator of generators) {
      // Registra la clave canónica (module + entityType) y, si el generador
      // declara aliases (Fase 3: COPASST:'CopasstPeriod' real +
      // PHVA_ADVANCED:'COPASST' normalizada), todas ellas apuntan al MISMO
      // generador: no se duplica la generación, solo la resolución.
      const keys = [
        { module: generator.module, entityType: generator.entityType },
        ...(generator.aliases ?? []),
      ];

      for (const key of keys) {
        const registryKey = this.key(key.module, key.entityType);
        // Guard: dos generadores distintos para la misma module:entity indican
        // una configuración errónea (uno pisaría al otro en silencio).
        const existing = this.generators.get(registryKey);
        if (existing && existing !== generator) {
          console.warn(
            `[ApprovalDocumentRegistry] duplicate generator for ${registryKey}; the last registration wins`,
          );
        }
        this.generators.set(registryKey, generator);
      }
    }
  }

  /**
   * Resuelve el generador registrado para una entidad aprobada.
   *
   * @returns El generador o undefined si la entidad no tiene documento formal
   * registrado (el listener simplemente no genera nada).
   */
  findGenerator(
    module: ApprovalEntity,
    entityType: string,
  ): ApprovalDocumentGenerator | undefined {
    return this.generators.get(this.key(module, entityType));
  }

  private key(module: ApprovalEntity, entityType: string): string {
    return `${module.toString()}:${entityType}`;
  }
}
