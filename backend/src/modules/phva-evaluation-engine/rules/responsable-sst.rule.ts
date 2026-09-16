import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { PhvaAdvancedService } from '../../phva-advanced/phva-advanced.service';
import {
  PhvaAdvancedResponsableSstDocument,
  ResponsableSstDocumentType,
} from '../../phva-advanced/schemas/phva-advanced-responsable-sst.schema';
import {
  AutoEvaluationResult,
  RuleOutcome,
} from '../interfaces/auto-evaluation-result';
import { StandardRule, StandardRuleContext } from '../interfaces/standard-rule';
import { buildRuleResult } from '../utils/rule-result.factory';

// ============================================================
// Regla 1.1.1 — Responsable del SG-SST (FASE 1)
// ============================================================
//
// Replica la semántica REAL de PhvaAdvancedService.calculateCompliance()
// (módulo phva-advanced) sin modificarlo:
//
// - PENDING        = información insuficiente (campos o evidencias no
//                    aportadas; no hay un hecho que permita decidir) →
//                    PENDIENTE_ANALISIS en el motor.
// - NON_COMPLIANT  = incumplimiento DEMOSTRABLE y solo cuando la base del
//                    registro está completa:
//                    Caso A: curso 50h supera el umbral de 3 años sin
//                            actualización de 20 horas (fecha Y certificado).
//                    Caso B: licencia de perfil exigido sin evidencia
//                            documental cargada.
// - COMPLIES       = todos los requisitos demostrados → CUMPLE_TOTALMENTE.
//
// NOTA normativa replicada del módulo (Fase 1.1.1): la licencia SST NO tiene
// vencimiento normativo obligatorio. Una licenseExpiresAt antigua o ausente
// NUNCA genera incumplimiento. El único requisito documental de la licencia
// es la carga del documento para los tipos que lo exigen.

export const RESPONSABLE_SST_STANDARD_CODE = '1.1.1';

const MODULE_SOURCE = 'phva-advanced/responsable-sst';

/** Tipos de licencia que exigen documento de licencia (regla vigente del módulo). */
const LICENSE_TYPES_REQUIRING_DOCUMENT: readonly string[] = [
  'Tecnólogo SST',
  'Profesional SST',
  'Especialista SST',
];

/** Claves de texto (y fecha del curso) obligatorias del registro del responsable. */
type ResponsableSstRequiredKey =
  | 'fullName'
  | 'documentNumber'
  | 'position'
  | 'profession'
  | 'sstProfessionalType'
  | 'sstLicenseNumber'
  | 'licenseType'
  | 'issuingAuthority'
  | 'course50HoursDate';

const REQUIRED_FIELDS: ReadonlyArray<{
  key: ResponsableSstRequiredKey;
  label: string;
  missingMessage: string;
}> = [
  { key: 'fullName', label: 'Nombre completo', missingMessage: 'Falta registrar el nombre completo del Responsable SST.' },
  { key: 'documentNumber', label: 'Número de documento', missingMessage: 'Falta registrar el número de documento del Responsable SST.' },
  { key: 'position', label: 'Cargo', missingMessage: 'Falta registrar el cargo del Responsable SST.' },
  { key: 'profession', label: 'Profesión', missingMessage: 'Falta registrar la profesión del Responsable SST.' },
  { key: 'sstProfessionalType', label: 'Tipo de profesional SST', missingMessage: 'Falta registrar el tipo de profesional SST (profesional o posgrado SST).' },
  { key: 'sstLicenseNumber', label: 'Número de licencia SST', missingMessage: 'Falta registrar el número de licencia SST.' },
  { key: 'licenseType', label: 'Tipo de licencia SST', missingMessage: 'Falta registrar el tipo de licencia SST.' },
  { key: 'issuingAuthority', label: 'Entidad emisora de la licencia', missingMessage: 'Falta registrar la entidad emisora de la licencia SST.' },
  { key: 'course50HoursDate', label: 'Fecha del curso de 50 horas', missingMessage: 'Falta registrar la fecha del curso de 50 horas en SG-SST.' },
];

/**
 * Espejo puro del umbral vigente del módulo (PhvaAdvancedService):
 * el curso se considera vencido cuando fecha + 3 años es anterior al inicio
 * del día de hoy en UTC (el límite exacto NO está vencido).
 */
export function isCourseOlderThanThreeYearsFrom(courseDate: Date, today: Date): boolean {
  const expiry = new Date(courseDate);
  expiry.setUTCFullYear(expiry.getUTCFullYear() + 3);
  return expiry < today;
}

function startOfTodayUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

@Injectable()
export class ResponsableSstRule implements StandardRule {
  constructor(private readonly phvaAdvancedService: PhvaAdvancedService) {}

  supports(code: string): boolean {
    return code === RESPONSABLE_SST_STANDARD_CODE;
  }

  getModule(): string {
    return MODULE_SOURCE;
  }

  async evaluate(context: StandardRuleContext): Promise<AutoEvaluationResult> {
    // Lectura tolerante: un módulo no iniciado es información insuficiente,
    // nunca un incumplimiento ni un NO_APLICA.
    let record: PhvaAdvancedResponsableSstDocument;
    try {
      record = await this.phvaAdvancedService.findResponsableSstByCompany(
        new Types.ObjectId(context.companyId),
      );
    } catch {
      return buildRuleResult({
        code: RESPONSABLE_SST_STANDARD_CODE,
        outcomes: [
          {
            requirement: 'Gestión avanzada del Responsable del SG-SST iniciada',
            satisfied: false,
            missingInformation:
              'La gestión avanzada del Responsable del SG-SST (1.1.1) aún no ha sido iniciada. Diligencia el formulario y carga los documentos para poder evaluar el estándar.',
          },
        ],
      });
    }

    const outcomes: RuleOutcome[] = [];

    // ── Campos base obligatorios (regla vigente; licenseExpiresAt excluido) ──
    const missingFields: ResponsableSstRequiredKey[] = [];
    for (const field of REQUIRED_FIELDS) {
      const value = record[field.key];
      const present = value !== undefined && value !== null && String(value).trim() !== '';
      if (!present) missingFields.push(field.key);
    }
    const baseComplete = missingFields.length === 0;

    if (baseComplete) {
      outcomes.push({
        requirement: 'Campos base del responsable completos',
        satisfied: true,
        evidence:
          'Nombre, documento, cargo, profesión, tipo profesional, licencia, tipo de licencia, entidad emisora y fecha del curso de 50 horas diligenciados.',
      });
    } else {
      for (const key of missingFields) {
        const field = REQUIRED_FIELDS.find((item) => item.key === key);
        if (!field) continue;
        outcomes.push({
          requirement: `Campo requerido registrado: ${field.label}`,
          satisfied: false,
          missingInformation: field.missingMessage,
        });
      }
    }

    const documents = record.documents ?? [];
    const hasDocument = (type: ResponsableSstDocumentType): boolean =>
      documents.some((document) => document.type === type);

    // ── Diploma (soporte académico) ─────────────────────────────────────────
    const diploma = documents.find((document) => document.type === ResponsableSstDocumentType.DIPLOMA);
    outcomes.push({
      requirement: 'Diploma del Responsable SST cargado',
      satisfied: Boolean(diploma),
      ...(diploma ? { evidence: `Documento cargado: ${diploma.fileName}.` } : {}),
      ...(diploma ? {} : { missingInformation: 'Falta cargar el diploma del Responsable SST (soporte académico de la hoja de vida).' }),
    });

    // ── Certificado del curso de 50 horas ──────────────────────────────────
    const certificate50 = documents.find(
      (document) => document.type === ResponsableSstDocumentType.FIFTY_HOUR_CERTIFICATE,
    );
    outcomes.push({
      requirement: 'Certificado del curso de 50 horas en SG-SST cargado',
      satisfied: Boolean(certificate50),
      ...(certificate50 ? { evidence: `Documento cargado: ${certificate50.fileName}.` } : {}),
      ...(certificate50 ? {} : { missingInformation: 'Falta cargar el certificado del curso de 50 horas en SG-SST.' }),
    });

    // ── Designación formal (fecha + quien designa + cargo de quien designa) ─
    const designationDataComplete = Boolean(
      record.designationDate &&
        String(record.designationIssuerName ?? '').trim() &&
        String(record.designationIssuerPosition ?? '').trim(),
    );
    outcomes.push({
      requirement: 'Designación formal registrada (fecha, nombre y cargo de quien designa)',
      satisfied: designationDataComplete,
      ...(designationDataComplete
        ? { evidence: `Designación registrada con fecha ${record.designationDate?.toISOString().slice(0, 10) ?? ''} y emisor ${String(record.designationIssuerName ?? '').trim()}.` }
        : { missingInformation: 'Falta registrar la designación del Responsable SST (fecha de designación, nombre y cargo de quien designa).' }),
    });

    const designationDocument = documents.find(
      (document) => document.type === ResponsableSstDocumentType.DESIGNATION,
    );
    outcomes.push({
      requirement: 'Documento de designación cargado',
      satisfied: Boolean(designationDocument),
      ...(designationDocument ? { evidence: `Documento cargado: ${designationDocument.fileName}.` } : {}),
      ...(designationDocument ? {} : { missingInformation: 'Falta cargar el documento de designación del Responsable SST.' }),
    });

    // ── Licencia SST: único requisito documental vigente (nunca vencimiento) ─
    const licenseType = String(record.licenseType ?? '').trim();
    if (licenseType !== '') {
      const licenseRequiresDocument = LICENSE_TYPES_REQUIRING_DOCUMENT.includes(licenseType);
      const hasLicenseDocument =
        hasDocument(ResponsableSstDocumentType.SST_LICENSE_PDF) ||
        hasDocument(ResponsableSstDocumentType.SST_LICENSE_SCANNED);

      if (licenseRequiresDocument) {
        if (hasLicenseDocument) {
          outcomes.push({
            requirement: 'Documento de licencia SST cargado (cuando el tipo de licencia lo exige)',
            satisfied: true,
            evidence: `Documento de licencia cargado para el tipo "${licenseType}".`,
          });
        } else if (baseComplete) {
          // Caso B del módulo: incumplimiento demostrable (base completa).
          outcomes.push({
            requirement: 'Documento de licencia SST cargado (cuando el tipo de licencia lo exige)',
            satisfied: false,
            finding: {
              title: 'Documento de licencia SST no cargado',
              description: `La licencia SST es requerida documentalmente para el tipo "${licenseType}" y no se ha cargado ningún documento de licencia (PDF o escaneada).`,
              source: MODULE_SOURCE,
            },
          });
        } else {
          outcomes.push({
            requirement: 'Documento de licencia SST cargado (cuando el tipo de licencia lo exige)',
            satisfied: null,
            evidence: 'No evaluable: el registro base del responsable está incompleto.',
          });
        }
      } else {
        outcomes.push({
          requirement: 'Documento de licencia SST cargado (cuando el tipo de licencia lo exige)',
          satisfied: true,
          evidence: `El tipo de licencia "${licenseType}" no exige documento de licencia según la regla vigente.`,
        });
      }
    }

    // ── Actualización de 20 horas (umbral de 3 años del curso de 50 horas) ──
    const course50HoursDate = record.course50HoursDate;
    const courseExpired = course50HoursDate
      ? isCourseOlderThanThreeYearsFrom(course50HoursDate, startOfTodayUtc(new Date()))
      : false;
    const has20HourCertificate = hasDocument(ResponsableSstDocumentType.TWENTY_HOUR_UPDATE_CERTIFICATE);

    if (!courseExpired) {
      outcomes.push({
        requirement: 'Actualización de 20 horas cuando el curso de 50 horas supera 3 años',
        satisfied: true,
        evidence: 'El curso de 50 horas está dentro del umbral de 3 años; no se exige actualización.',
      });
    } else if (record.course20HoursDate && has20HourCertificate) {
      outcomes.push({
        requirement: 'Actualización de 20 horas cuando el curso de 50 horas supera 3 años',
        satisfied: true,
        evidence: 'Actualización de 20 horas registrada con fecha y certificado cargado.',
      });
    } else if (baseComplete) {
      // Caso A del módulo: incumplimiento demostrable (base completa).
      outcomes.push({
        requirement: 'Actualización de 20 horas cuando el curso de 50 horas supera 3 años',
        satisfied: false,
        finding: {
          title: 'Actualización de 20 horas pendiente',
          description:
            'El curso de 50 horas supera el umbral de 3 años y no se registró la actualización de 20 horas (fecha y certificado).',
          source: MODULE_SOURCE,
        },
      });
    } else {
      outcomes.push({
        requirement: 'Actualización de 20 horas cuando el curso de 50 horas supera 3 años',
        satisfied: null,
        evidence: 'No evaluable: el registro base del responsable está incompleto.',
      });
    }

    return buildRuleResult({ code: RESPONSABLE_SST_STANDARD_CODE, outcomes });
  }
}
