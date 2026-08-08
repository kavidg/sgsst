import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Company, CompanyDocument } from '../companies/schemas/company.schema';
import { SstPolicy, SstPolicyDocument } from './schemas/phva-advanced-sst-policy.schema';

/**
 * Contexto de dominio resuelto para la plantilla de la Política de Seguridad
 * y Salud en el Trabajo (PHVA 2.1.1). Los valores que no existen en el sistema
 * se devuelven null (el renderer los convierte en cadena vacía vía nullGetter,
 * sin lanzar excepción).
 */
export interface SstPolicyContext {
  company: {
    name: string | null;
    nit: string | null;
    address: string | null;
    city: string | null;
  };
  policy: {
    objective: string | null;
    scope: string | null;
    commitments: string | null;
    content: string | null;
    legalFramework: string | null;
    version: string | null;
    reviewDate: string | null;
  };
}

/**
 * SstPolicyVariableResolverService: resolver de dominio del documento de la
 * Política de Seguridad y Salud en el Trabajo (PHVA 2.1.1).
 *
 * Fase 6 — Recibe companyId y sourceEntityId (id del registro de la política)
 * y entrega SOLO el contexto de variables de la plantilla:
 *
 *   { company, policy }
 *
 * NO genera documentos y NO modifica registros: es una consulta de solo lectura
 * que reúne datos reales del sistema (empresa y política vigente).
 *
 * Valores ausentes → null (documentados en el contrato):
 * - company.address / company.city: el schema de Company no persiste esos
 *   campos.
 * - policy.objective / scope / commitments / legalFramework: el módulo PHVA
 *   almacena la política como un único campo content (sin secciones separadas);
 *   el contenido completo se expone en policy.content.
 * - policy.reviewDate: se resuelve desde la fecha de vencimiento de la versión
 *   vigente (currentPolicyVersion.expiresAt) si existe.
 */
@Injectable()
export class SstPolicyVariableResolverService {
  constructor(
    @InjectModel(SstPolicy.name)
    private readonly sstPolicyModel: Model<SstPolicyDocument>,
    @InjectModel(Company.name)
    private readonly companyModel: Model<CompanyDocument>,
  ) {}

  /**
   * Resuelve el contexto de variables para la plantilla de la Política SST.
   *
   * @param companyId - Empresa (valida pertenencia de la entidad).
   * @param sourceEntityId - Id del registro de la política (SstPolicy).
   */
  async resolve(
    companyId: Types.ObjectId,
    sourceEntityId: Types.ObjectId,
  ): Promise<SstPolicyContext> {
    const record = await this.loadRecord(companyId, sourceEntityId);
    const company = await this.companyModel.findById(companyId).exec();

    // La fecha de revisión se toma de la versión vigente (expiresAt) como
    // indicador de la próxima revisión de la política.
    const currentVersion = record.versions.find(
      (version) => version.version === record.currentVersion,
    );
    const reviewDate = currentVersion?.expiresAt
      ? currentVersion.expiresAt.toISOString()
      : null;

    return {
      company: {
        name: company?.name ?? null,
        nit: company?.nit ?? null,
        // El schema de Company no almacena dirección ni ciudad: null → cadena vacía.
        address: null,
        city: null,
      },
      policy: {
        // El módulo almacena la política como un único campo content: las
        // secciones separadas no existen como campos propios → null.
        objective: null,
        scope: null,
        commitments: null,
        content: record.content || null,
        legalFramework: null,
        version: record.currentVersion || null,
        reviewDate,
      },
    };
  }

  private async loadRecord(
    companyId: Types.ObjectId,
    sourceEntityId: Types.ObjectId,
  ): Promise<SstPolicyDocument> {
    const record = await this.sstPolicyModel.findById(sourceEntityId).exec();

    if (!record) {
      throw new NotFoundException('SST Policy not found');
    }

    if (record.companyId.toString() !== companyId.toString()) {
      throw new NotFoundException('SST Policy not found');
    }

    return record;
  }
}
