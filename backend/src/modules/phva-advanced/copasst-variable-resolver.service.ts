import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Company, CompanyDocument } from '../companies/schemas/company.schema';
import {
  CopasstPeriod,
  CopasstPeriodDocument,
} from '../copasst/schemas/copasst.schema';

/**
 * Funciones normativas del COPASST (Resolución 2013 de 1986, art. 11 — vigente
 * en el marco del SG-SST). Se usan como valor por defecto de la variable
 * {{functions}} de la plantilla de conformación del comité.
 */
export const DEFAULT_COPASST_FUNCTIONS: string[] = [
  'Proponer a la dirección de la empresa el programa de seguridad y salud en el trabajo.',
  'Vigilar el desarrollo de las actividades que en materia de medicina, higiene y seguridad industrial debe realizar la empresa.',
  'Participar en la investigación de los accidentes de trabajo y enfermedades laborales.',
  'Servir como órgano de coordinación entre empleador y trabajadores en la solución de problemas relativos a la SST.',
  'Solicitar periódicamente a la empresa información sobre accidentalidad y enfermedades laborales.',
  'Hacer recomendaciones para mejorar las condiciones de trabajo y velar por su cumplimiento.',
];

/** Formatea una fecha ISO a formato YYYY-MM-DD para el documento. */
function formatDate(value: Date | string | undefined): string {
  if (!value) {
    return '';
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toISOString().slice(0, 10);
}

/**
 * Contexto de dominio resuelto para la plantilla de conformación del COPASST.
 * Los valores que no existen en el sistema se devuelven null (el renderer los
 * convierte en cadena vacía vía nullGetter, sin lanzar excepción). Las listas
 * (members, employerRepresentatives, workerRepresentatives, functions) se
 * entregan como arreglos; el servicio de generación las formatea a texto
 * multilínea antes de pasarlas al renderer.
 */
export interface CopasstContext {
  company: {
    name: string | null;
    nit: string | null;
    address: string | null;
    workerCount: number | null;
  };
  copasst: {
    startDate: string;
    endDate: string;
    period: string | null;
  };
  members: string[];
  employerRepresentatives: string[];
  workerRepresentatives: string[];
  functions: string[];
}

/**
 * CopasstVariableResolverService: resolver de dominio del documento de
 * conformación del COPASST (Fase 3).
 *
 * Recibe companyId y periodId (sourceEntityId = id del periodo COPASST) y
 * entrega SOLO el contexto de variables de la plantilla:
 *
 *   { company, copasst, members, employerRepresentatives, workerRepresentatives, functions }
 *
 * NO genera documentos y NO maneja aprobación: es una consulta de solo lectura
 * que reúne datos reales del sistema (empresa, periodo COPASST e integrantes).
 *
 * Valores ausentes → null (documentados en el contrato):
 * - company.address: el schema de Company no persiste dirección.
 * - company.workerCount: se resuelve desde company.employeeCount.
 */
@Injectable()
export class CopasstVariableResolverService {
  constructor(
    @InjectModel(CopasstPeriod.name)
    private readonly copasstPeriodModel: Model<CopasstPeriodDocument>,
    @InjectModel(Company.name)
    private readonly companyModel: Model<CompanyDocument>,
  ) {}

  /**
   * Resuelve el contexto de variables para la plantilla del COPASST.
   *
   * @param companyId - Empresa (valida pertenencia del periodo).
   * @param periodId - Id del periodo COPASST (PhvaAdvancedCopasst / CopasstPeriod).
   */
  async resolve(
    companyId: Types.ObjectId,
    periodId: Types.ObjectId,
  ): Promise<CopasstContext> {
    const period = await this.copasstPeriodModel.findById(periodId).exec();

    if (!period) {
      throw new NotFoundException('COPASST period not found');
    }

    if (period.companyId.toString() !== companyId.toString()) {
      throw new NotFoundException('COPASST period not found');
    }

    const company = await this.companyModel.findById(companyId).exec();

    const members = (period.members ?? []).map((member) => {
      const role = member.committeeRole ?? '';
      const representation = member.representationType ?? '';
      const principal = member.principalType ?? '';
      return `${member.userName ?? ''} — ${role} (${representation}${principal ? ` ${principal}` : ''})`;
    });

    const employerRepresentatives = (period.members ?? [])
      .filter((member) => member.representationType === 'EMPLEADOR')
      .map((member) => `${member.userName ?? ''} — ${member.committeeRole ?? ''}`);

    const workerRepresentatives = (period.members ?? [])
      .filter((member) => member.representationType === 'TRABAJADOR')
      .map((member) => `${member.userName ?? ''} — ${member.committeeRole ?? ''}`);

    return {
      company: {
        name: company?.name ?? null,
        nit: company?.nit ?? null,
        // El schema de Company no almacena dirección: null → cadena vacía.
        address: null,
        workerCount: company?.employeeCount ?? null,
      },
      copasst: {
        startDate: formatDate(period.startDate),
        endDate: formatDate(period.endDate),
        period: period.periodName ?? null,
      },
      members,
      employerRepresentatives,
      workerRepresentatives,
      functions: DEFAULT_COPASST_FUNCTIONS,
    };
  }
}
