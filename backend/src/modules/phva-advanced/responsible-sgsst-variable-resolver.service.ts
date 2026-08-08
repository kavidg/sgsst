import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Company, CompanyDocument } from '../companies/schemas/company.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  PhvaAdvancedResponsableSst,
  PhvaAdvancedResponsableSstDocument,
  ResponsableSstDocumentType,
} from './schemas/phva-advanced-responsable-sst.schema';

/** Valor estándar para datos ausentes en el documento oficial (nunca undefined). */
const NOT_REGISTERED = 'No registrado';
const NOT_REGISTERED_DATE = 'No registrada';

/** Etiquetas legibles de cada tipo de evidencia del expediente 1.1.1. */
const EVIDENCE_LABELS: Record<ResponsableSstDocumentType, string> = {
  [ResponsableSstDocumentType.DIPLOMA]: 'Diploma / título profesional',
  [ResponsableSstDocumentType.FIFTY_HOUR_CERTIFICATE]: 'Certificado curso virtual 50 horas',
  [ResponsableSstDocumentType.TWENTY_HOUR_UPDATE_CERTIFICATE]: 'Certificado actualización 20 horas',
  [ResponsableSstDocumentType.SST_LICENSE_PDF]: 'Licencia SST (PDF)',
  [ResponsableSstDocumentType.SST_LICENSE_SCANNED]: 'Licencia SST (escaneo)',
  [ResponsableSstDocumentType.SST_LICENSE_RESOLUTION]: 'Licencia SST (resolución)',
  [ResponsableSstDocumentType.SST_LICENSE_SUPPORTING]: 'Licencia SST (soporte adicional)',
  [ResponsableSstDocumentType.DESIGNATION]: 'Designación del Responsable del SG-SST',
};

/** Formatea una fecha a YYYY-MM-DD (o null si no existe). */
function formatDate(value?: Date | string | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

/**
 * Contexto de dominio resuelto para la plantilla del Responsable del SG-SST.
 * Los valores que no existen en el sistema se devuelven con el fallback legible
 * 'No registrado'/'No registrada' (nunca undefined/null), de modo que el
 * documento oficial jamás muestre literales vacíos ni "undefined".
 *
 * Reglas normativas (Fase 1.1.1 y 8.3.D):
 * - La licencia SST NO tiene fecha de vencimiento obligatoria: license.expiresAt
 *   solo se expone como dato documental (license.documentValidity) cuando existe
 *   un valor explícito; el documento NO calcula días restantes ni estados
 *   "Vencida"/"Próxima a vencer".
 * - La actualización de 20 horas se muestra según la decisión ya calculada por
 *   el backend (requires20HourUpdate); el template no vuelve a implementar la
 *   regla normativa.
 */
export interface ResponsibleSgsstContext {
  company: {
    name: string | null;
    nit: string | null;
    address: string | null;
  };
  responsible: {
    name: string;
    document: string;
    position: string;
    profession: string;
    sstProfessionalType: string;
    email: string;
  };
  license: {
    number: string;
    type: string;
    issuingAuthority: string;
    issueDate: string;
    documentStatus: string;
    /** Vigencia indicada en el documento (opcional). Dato documental, nunca requisito. */
    documentValidity: string;
  };
  formation: {
    course50HoursDate: string;
    course50HoursEvidence: string;
    /** 'No requerida según la condición registrada' | 'Registrada' | 'Pendiente de actualización'. */
    course20HoursState: string;
    course20HoursDate: string;
    course20HoursEvidence: string;
  };
  designation: {
    date: string;
    number: string;
    issuerName: string;
    issuerPosition: string;
    evidence: string;
  };
  evidences: {
    /** Texto multilínea con las evidencias del expediente (type, archivo, fecha, estado). */
    list: string;
  };
  compliance: {
    status: string;
    reason: string;
  };
  sgsst: {
    standardType: string | null;
    evaluationLevel: string | null;
  };
  assignment: {
    responsibility: string | null;
    functions: string | null;
  };
  approval: {
    status: string;
    approvedBy: string;
    approvedAt: string;
  };
}

/**
 * ResponsibleSgsstVariableResolver: resolver de dominio del documento formal
 * del Responsable del SG-SST (PHVA 1.1.1).
 *
 * Fase 2 — Recibe companyId y sourceEntityId (id del registro PHVA 1.1.1) y
 * entrega SOLO el contexto de variables de la plantilla:
 *
 *   { company, responsible, license, formation, designation, evidences,
 *     compliance, sgsst, assignment, approval }
 *
 * Fase 8.3.D — el contexto se completa con licencia, formación, designación,
 * evidencias, cumplimiento y aprobación legibles para el documento oficial.
 *
 * NO genera documentos y NO modifica registros: es una consulta de solo lectura
 * que reúne datos reales del sistema (empresa, usuario responsable, tipo de
 * estándares, estado de cumplimiento del punto 1.1.1, evidencias del
 * expediente y metadata de aprobación).
 *
 * Valores ausentes → fallback legible 'No registrado'/'No registrada'
 * (documentados en el contrato):
 * - company.address: el schema de Company no persiste dirección.
 * - responsible.email: se resuelve desde el usuario updatedBy si existe.
 */
@Injectable()
export class ResponsibleSgsstVariableResolver {
  constructor(
    @InjectModel(PhvaAdvancedResponsableSst.name)
    private readonly responsableSstModel: Model<PhvaAdvancedResponsableSstDocument>,
    @InjectModel(Company.name)
    private readonly companyModel: Model<CompanyDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  /**
   * Resuelve el contexto de variables para la plantilla del Responsable SG-SST.
   *
   * @param companyId - Empresa (valida pertenencia de la entidad).
   * @param sourceEntityId - Id del registro PHVA 1.1.1 (PhvaAdvancedResponsableSst).
   */
  async resolve(
    companyId: Types.ObjectId,
    sourceEntityId: Types.ObjectId,
  ): Promise<ResponsibleSgsstContext> {
    const record = await this.loadRecord(companyId, sourceEntityId);
    const company = await this.companyModel.findById(companyId).exec();
    const responsibleUser = record.updatedBy
      ? await this.userModel.findById(record.updatedBy).exec()
      : null;

    const documents = record.documents ?? [];

    // Evidencias individuales relevantes del expediente.
    const diploma = documents.find((doc) => doc.type === ResponsableSstDocumentType.DIPLOMA);
    const certificate50 = documents.find((doc) => doc.type === ResponsableSstDocumentType.FIFTY_HOUR_CERTIFICATE);
    const update20 = documents.find((doc) => doc.type === ResponsableSstDocumentType.TWENTY_HOUR_UPDATE_CERTIFICATE);
    const designationDoc = documents.find((doc) => doc.type === ResponsableSstDocumentType.DESIGNATION);

    // Evidencias del expediente → texto multilínea para el renderer DOCX.
    const evidencesList = documents.length
      ? documents.map((doc) => {
          const label = EVIDENCE_LABELS[doc.type] ?? doc.type;
          const uploaded = formatDate(doc.uploadedAt);
          return `${label} — ${doc.fileName}${uploaded ? ` (cargado ${uploaded})` : ''} — Registrada`;
        }).join('\n')
      : 'Sin evidencias registradas';

    // Decisión de actualización de 20 horas YA calculada por el backend
    // (calculateCompliance en phva-advanced.service.ts). El template consume
    // esta decisión; no reimplementa la regla normativa.
    let course20HoursState: string;
    if (!record.requires20HourUpdate) {
      course20HoursState = 'No requerida según la condición registrada';
    } else if (record.course20HoursDate) {
      course20HoursState = 'Registrada';
    } else {
      course20HoursState = 'Pendiente de actualización';
    }

    // Estado de aprobación legible (APPROVED/APPROVED_AND_SIGNED → Aprobado).
    const approvalStatus = record.approvalStatus ?? '';
    const approvalStatusLabel =
      approvalStatus === 'APPROVED' || approvalStatus === 'APPROVED_AND_SIGNED'
        ? 'Aprobado'
        : approvalStatus === 'PENDING_APPROVAL'
          ? 'Pendiente de aprobación'
          : approvalStatus === 'REJECTED'
            ? 'Rechazado'
            : approvalStatus === 'ARCHIVED'
              ? 'Archivado'
              : approvalStatus === 'DRAFT' || !approvalStatus
                ? 'Borrador'
                : approvalStatus;

    // Aprobador y fecha desde la metadata de aprobación del registro.
    const approvedBy = record.approvedBy?.email || NOT_REGISTERED;
    const approvedAt = formatDate(record.approvedBy?.timestamp) || NOT_REGISTERED_DATE;

    return {
      company: {
        name: company?.name ?? null,
        nit: company?.nit ?? null,
        // El schema de Company no almacena dirección: null → cadena vacía.
        address: null,
      },
      responsible: {
        name: record.fullName || NOT_REGISTERED,
        document: record.documentNumber || NOT_REGISTERED,
        position: record.position || NOT_REGISTERED,
        profession: record.profession || NOT_REGISTERED,
        sstProfessionalType: record.sstProfessionalType || NOT_REGISTERED,
        email: responsibleUser?.email ?? NOT_REGISTERED,
      },
      license: {
        number: record.sstLicenseNumber || NOT_REGISTERED,
        type: record.licenseType || NOT_REGISTERED,
        issuingAuthority: record.issuingAuthority || NOT_REGISTERED,
        issueDate: formatDate(record.licenseIssueDate) || NOT_REGISTERED_DATE,
        // Estado DOCUMENTAL registrado (Pendiente cuando no existe fecha); nunca
        // se deriva del paso del tiempo (corrección Fase 1.1.1).
        documentStatus: record.licenseStatus || 'Pendiente',
        // Dato documental opcional: solo si existe un valor explícito del
        // documento/acto. NUNCA requisito de cumplimiento.
        documentValidity: formatDate(record.licenseExpiresAt) || 'No registrada (sin vencimiento normativo)',
      },
      formation: {
        course50HoursDate: formatDate(record.course50HoursDate) || NOT_REGISTERED_DATE,
        course50HoursEvidence: certificate50?.fileName || NOT_REGISTERED,
        course20HoursState,
        course20HoursDate: formatDate(record.course20HoursDate) || NOT_REGISTERED_DATE,
        course20HoursEvidence: update20?.fileName || NOT_REGISTERED,
      },
      designation: {
        date: formatDate(record.designationDate) || NOT_REGISTERED_DATE,
        number: record.designationNumber || NOT_REGISTERED,
        issuerName: record.designationIssuerName || NOT_REGISTERED,
        issuerPosition: record.designationIssuerPosition || NOT_REGISTERED,
        evidence: designationDoc?.fileName || NOT_REGISTERED,
      },
      evidences: {
        list: evidencesList,
      },
      compliance: {
        status: record.complianceStatus || NOT_REGISTERED,
        reason: record.complianceReason || NOT_REGISTERED,
      },
      sgsst: {
        standardType: company?.standardsType ?? null,
        evaluationLevel: record.complianceStatus || null,
      },
      assignment: {
        responsibility: record.position
          ? `Responsable del SG-SST: ${record.position}`
          : 'Responsable del SG-SST',
        functions:
          record.observations?.trim() ||
          record.profession?.trim() ||
          record.sstProfessionalType?.trim() ||
          null,
      },
      approval: {
        status: approvalStatusLabel,
        approvedBy,
        approvedAt,
      },
    };
  }

  private async loadRecord(
    companyId: Types.ObjectId,
    sourceEntityId: Types.ObjectId,
  ): Promise<PhvaAdvancedResponsableSstDocument> {
    const record = await this.responsableSstModel.findById(sourceEntityId).exec();

    if (!record) {
      throw new NotFoundException('Responsable SST record not found');
    }

    if (record.companyId.toString() !== companyId.toString()) {
      throw new NotFoundException('Responsable SST record not found');
    }

    return record;
  }
}
