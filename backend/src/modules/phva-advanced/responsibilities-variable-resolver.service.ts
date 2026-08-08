import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Company, CompanyDocument } from '../companies/schemas/company.schema';
import {
  PhvaAdvancedResponsibilities,
  PhvaAdvancedResponsibilitiesDocument,
} from './schemas/phva-advanced-responsibilities.schema';

/** Filas del arreglo responsibilities que NO son la fila de metadatos __META__. */
const META_TITLE = '__META__';

/**
 * Contexto de dominio resuelto para la plantilla de la Matriz de
 * Responsabilidades del SG-SST (PHVA 1.1.2). Los valores que no existen en el
 * sistema se devuelven null (el renderer los convierte en cadena vacía vía
 * nullGetter, sin lanzar excepción). Las listas (responsiblePersons,
 * assignments) se entregan como arreglos; el servicio de generación las
 * formatea a texto multilínea antes de pasarlas al renderer.
 */
export interface ResponsibilitiesContext {
  company: {
    name: string | null;
    nit: string | null;
  };
  responsibilities: {
    title: string | null;
    description: string | null;
  };
  responsible: {
    name: string | null;
    position: string | null;
    functions: string | null;
  };
  responsiblePersons: string[];
  assignments: string[];
  legalRepresentative: {
    name: string | null;
    signed: boolean;
  };
}

/**
 * ResponsibilitiesVariableResolverService: resolver de dominio del documento
 * de la Matriz de Responsabilidades del SG-SST (PHVA 1.1.2).
 *
 * Fase 4 — Recibe companyId y sourceEntityId (id del registro 1.1.2) y entrega
 * SOLO el contexto de variables de la plantilla:
 *
 *   { company, responsibilities, responsible, responsiblePersons, assignments, legalRepresentative }
 *
 * NO genera documentos y NO modifica registros: es una consulta de solo lectura
 * que reúne datos reales del sistema (empresa, matriz de responsabilidades y
 * metadatos de aprobación/representante legal del __META__).
 *
 * El estado de aprobación y el representante legal viven en la fila '__META__'
 * del arreglo responsibilities (JSON en category). Este resolver es parte del
 * módulo phva-advanced (no del Approval Workflow Core), por lo que puede leer
 * el JSON embebido de forma defensiva (try/catch) para las variables
 * documentales, igual que el propio PhvaAdvancedService lo hace en
 * submit/approve/reject.
 */
@Injectable()
export class ResponsibilitiesVariableResolverService {
  constructor(
    @InjectModel(PhvaAdvancedResponsibilities.name)
    private readonly responsibilitiesModel: Model<PhvaAdvancedResponsibilitiesDocument>,
    @InjectModel(Company.name)
    private readonly companyModel: Model<CompanyDocument>,
  ) {}

  /**
   * Resuelve el contexto de variables para la plantilla de Responsabilidades.
   *
   * @param companyId - Empresa (valida pertenencia del registro).
   * @param sourceEntityId - Id del registro PHVA 1.1.2 (PhvaAdvancedResponsibilities).
   */
  async resolve(
    companyId: Types.ObjectId,
    sourceEntityId: Types.ObjectId,
  ): Promise<ResponsibilitiesContext> {
    const record = await this.responsibilitiesModel.findById(sourceEntityId).exec();

    if (!record) {
      throw new NotFoundException('Responsibilities record not found');
    }

    if (record.companyId.toString() !== companyId.toString()) {
      throw new NotFoundException('Responsibilities record not found');
    }

    const company = await this.companyModel.findById(companyId).exec();
    const meta = this.readMeta(record);
    const entries = (record.responsibilities ?? []).filter(
      (entry) => entry.title !== META_TITLE,
    );
    const activeEntries = entries.filter((entry) => entry.active);

    return {
      company: {
        name: company?.name ?? null,
        nit: company?.nit ?? null,
      },
      responsibilities: {
        title: 'Matriz de Responsabilidades del SG-SST',
        description: record.complianceReason || null,
      },
      responsible: {
        // Solo se usa el representante legal (nombre legible); si no existe, null
        // → cadena vacía en el documento (nunca un ObjectId crudo).
        name: meta?.legalRepresentativeName || null,
        position: meta?.legalRepresentativeSigned
          ? 'Representante Legal'
          : 'Responsable del SG-SST',
        functions: meta?.legalRepresentativeSigned
          ? 'Representa legalmente a la empresa en el SG-SST y vela por el cumplimiento de las responsabilidades asignadas.'
          : null,
      },
      responsiblePersons: activeEntries.map((entry) => {
        const role = entry.role ?? '';
        return `${entry.title ?? ''} — ${role}`;
      }),
      assignments: activeEntries.map((entry) => {
        const assigned = entry.employeeId ? 'asignado' : 'sin asignar';
        const signature = entry.requiresSignature
          ? entry.signature?.signedAt
            ? 'firmado'
            : 'firma pendiente'
          : '';
        return `${entry.title ?? ''} — ${assigned}${signature ? ` (${signature})` : ''}`;
      }),
      legalRepresentative: {
        name: meta?.legalRepresentativeName || null,
        signed: Boolean(meta?.legalRepresentativeSigned),
      },
    };
  }

  /**
   * Lee la fila __META__ del arreglo responsibilities (JSON en category) de
   * forma defensiva. Devuelve null si no existe o no es JSON válido (mismo
   * comportamiento tolerante que PhvaAdvancedService).
   */
  private readMeta(
    record: PhvaAdvancedResponsibilitiesDocument,
  ): {
    legalRepresentativeName?: string;
    legalRepresentativeSigned?: boolean;
    approvalStatus?: string;
  } | null {
    const metaIndex = record.responsibilities.findIndex(
      (entry) => entry.title === META_TITLE,
    );
    if (metaIndex < 0) {
      return null;
    }
    try {
      return JSON.parse(record.responsibilities[metaIndex].category) as {
        legalRepresentativeName?: string;
        legalRepresentativeSigned?: boolean;
        approvalStatus?: string;
      };
    } catch {
      return null;
    }
  }

}
