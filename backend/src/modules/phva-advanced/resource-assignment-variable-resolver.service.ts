import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Company, CompanyDocument } from '../companies/schemas/company.schema';
import {
  PhvaAdvancedResourceAssignment,
  PhvaAdvancedResourceAssignmentDocument,
} from './schemas/phva-advanced-resource-assignment.schema';

/**
 * Contexto de dominio resuelto para la plantilla de la Asignación de Recursos
 * del SG-SST (PHVA 1.1.3). Los valores que no existen en el sistema se
 * devuelven null (el renderer los convierte en cadena vacía vía nullGetter, sin
 * lanzar excepción). Las listas (resources.human, resources.technical,
 * resources.financial, resources.physical) se entregan como arreglos; el
 * servicio de generación las formatea a texto multilínea antes de pasarlas al
 * renderer.
 */
export interface ResourceAssignmentContext {
  company: {
    name: string | null;
    nit: string | null;
  };
  resources: {
    human: string[];
    technical: string[];
    financial: string[];
    physical: string[];
  };
  assignment: {
    responsible: string | null;
  };
}

/**
 * ResourceAssignmentVariableResolverService: resolver de dominio del documento
 * de la Asignación de Recursos para el SG-SST (PHVA 1.1.3).
 *
 * Fase 5 — Recibe companyId y sourceEntityId (id del registro 1.1.3) y entrega
 * SOLO el contexto de variables de la plantilla:
 *
 *   { company, resources, assignment }
 *
 * NO genera documentos y NO modifica registros: es una consulta de solo lectura
 * que reúne datos reales del sistema (empresa y recursos humanos/técnicos/
 * financieros/físicos registrados).
 */
@Injectable()
export class ResourceAssignmentVariableResolverService {
  constructor(
    @InjectModel(PhvaAdvancedResourceAssignment.name)
    private readonly resourceAssignmentModel: Model<PhvaAdvancedResourceAssignmentDocument>,
    @InjectModel(Company.name)
    private readonly companyModel: Model<CompanyDocument>,
  ) {}

  /**
   * Resuelve el contexto de variables para la plantilla de Asignación de
   * Recursos.
   *
   * @param companyId - Empresa (valida pertenencia del registro).
   * @param sourceEntityId - Id del registro PHVA 1.1.3.
   */
  async resolve(
    companyId: Types.ObjectId,
    sourceEntityId: Types.ObjectId,
  ): Promise<ResourceAssignmentContext> {
    const record = await this.resourceAssignmentModel
      .findById(sourceEntityId)
      .exec();

    if (!record) {
      throw new NotFoundException('Resource assignment not found');
    }

    if (record.companyId.toString() !== companyId.toString()) {
      throw new NotFoundException('Resource assignment not found');
    }

    const company = await this.companyModel.findById(companyId).exec();

    const human = (record.humanResources ?? [])
      .filter((entry) => entry.active)
      .map((entry) => {
        const roles = entry.role ?? '';
        return `${roles}`;
      });

    const technical = (record.technicalResources ?? []).map((entry) => {
      const quantity = entry.quantity ?? 1;
      const status = entry.status ?? 'OPERATIVO';
      return `${entry.name ?? ''} (${quantity}) — ${status}`;
    });

    const financial = (record.financialResources ?? []).map((entry) => {
      const value = entry.value ?? 0;
      const status = entry.status ?? 'PENDIENTE';
      return `${entry.concept ?? ''} — $${value.toLocaleString('es-CO')} (${status})`;
    });

    // El módulo no registra recursos físicos como colección propia: se reporta
    // la cantidad de evidencias cargadas como indicador de inventario físico.
    const physical = (record.evidences ?? []).map(
      (evidence) => evidence.fileName ?? '',
    );

    return {
      company: {
        name: company?.name ?? null,
        nit: company?.nit ?? null,
      },
      resources: {
        human,
        technical,
        financial,
        physical,
      },
      assignment: {
        responsible: record.approvedBy?.email || null,
      },
    };
  }
}
