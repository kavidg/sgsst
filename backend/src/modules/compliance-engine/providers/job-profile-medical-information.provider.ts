import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JobProfile, JobProfileDocument } from '../../job-profile/schemas/job-profile.schema';
import { Employee, EmployeeDocument } from '../../employees/schemas/employee.schema';
import {
  OccupationalExam,
  OccupationalExamDocument,
  ExamStatus,
} from '../../occupational-exam/schemas/occupational-exam.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';

/**
 * Evaluación automática del estándar 3.1.3 "Información al médico de los
 * perfiles de cargo" (FASE 30D-2). Semantic: EXACT.
 *
 * Mide la disponibilidad/suministro de la información de los perfiles de cargo
 * para la realización de las evaluaciones médicas ocupacionales:
 *
 * - C1 (25%): Existencia y cobertura de perfiles de cargo activos asociados a
 *   los trabajadores de la empresa.
 * - C2 (25%): Completitud de la información funcional del perfil (descripción,
 *   funciones y responsabilidades).
 * - C3 (25%): Completitud de la información relevante para la valoración
 *   médica ocupacional (condiciones de trabajo, peligros/riesgos asociados
 *   vía matriz Risk, e información médico-ocupacional del cargo).
 * - C4 (25%): Evidencia PRE-examen explícita de que el perfil fue
 *   suministrado/disponibilizado al médico evaluador
 *   (occupationalContext.providedToEvaluator = true + jobProfileId +
 *   providedAt + providedBy, con coherencia temporal providedAt <= examDate).
 *
 * REGLA ANTI-FALSIFICACIÓN: la existencia de un examen, una recomendación
 * médica o `Employee.position` NO se considera evidencia de C4. Los exámenes
 * históricos sin contexto PRE-examen tienen C4 = 0 (no se inventa evidencia
 * retroactiva).
 */
@Injectable()
export class JobProfileMedicalInformationProvider implements ComplianceProvider {
  private static readonly COMPLIANCE_TARGET = 90;

  constructor(
    @InjectModel(JobProfile.name)
    private readonly jobProfileModel: Model<JobProfileDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    @InjectModel(OccupationalExam.name)
    private readonly examModel: Model<OccupationalExamDocument>,
  ) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const companyObjectId = new Types.ObjectId(companyId);

    const [employees, profiles, exams] = await Promise.all([
      this.employeeModel.find({ companyId: companyObjectId }).exec(),
      this.jobProfileModel.find({ companyId: companyObjectId }).exec(),
      this.examModel.find({ companyId: companyObjectId }).exec(),
    ]);

    const totalEmployees = employees.length;

    // ── NO_DATA: sin trabajadores no hay proceso ocupacional que evaluar ──
    if (totalEmployees === 0) {
      return {
        module: 'job-profile-medical-information',
        percentage: 0,
        status: 'NO_DATA',
        findings: [
          {
            id: 'job-profile-no-workers',
            module: 'job-profile-medical-information',
            title: 'Sin trabajadores registrados',
            description:
              'No hay trabajadores registrados para evaluar el estándar 3.1.3 (información de perfiles de cargo al médico). Registrar empleados para evaluar el cumplimiento.',
            priority: FindingPriority.HIGH,
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
        pending: 0,
        completed: 0,
        overdue: 0,
        phases: { do: 0 } as Partial<Record<CompliancePhaseKey, number>>,
      };
    }

    const activeProfiles = profiles.filter((profile) => profile.active === true);
    const activeProfileIds = new Set(activeProfiles.map((p) => String(p._id)));
    // Incluye perfiles inactivos: un perfil desactivado tras la evaluación no
    // invalida retroactivamente la evidencia registrada para esa evaluación.
    const companyProfileIds = new Set(profiles.map((p) => String(p._id)));

    // ══════════════════════════════════════════════════════════════════════
    // C1 — Existencia y cobertura de perfiles activos (25%)
    // ══════════════════════════════════════════════════════════════════════
    const employeesWithActiveProfile = employees.filter(
      (employee) =>
        employee.jobProfileId && activeProfileIds.has(String(employee.jobProfileId)),
    ).length;
    const c1 = employeesWithActiveProfile / totalEmployees;

    // ══════════════════════════════════════════════════════════════════════
    // C2 — Información funcional (25%)
    // C3 — Información relevante para valoración médica (25%)
    // ══════════════════════════════════════════════════════════════════════
    let c2 = 0;
    let c3 = 0;
    if (activeProfiles.length > 0) {
      const functionalAccum = activeProfiles.reduce((sum, profile) => {
        let score = 0;
        if ((profile.description ?? '').trim().length > 0) score += 1 / 3;
        if ((profile.functions ?? []).length > 0) score += 1 / 3;
        if ((profile.responsibilities ?? []).length > 0) score += 1 / 3;
        return sum + score;
      }, 0);
      c2 = functionalAccum / activeProfiles.length;

      const medicalAccum = activeProfiles.reduce((sum, profile) => {
        let score = 0;
        if ((profile.workConditions ?? []).length > 0) score += 1 / 3;
        if ((profile.associatedHazardIds ?? []).length > 0) score += 1 / 3;
        if ((profile.medicalRelevantInformation ?? '').trim().length > 0) score += 1 / 3;
        return sum + score;
      }, 0);
      c3 = medicalAccum / activeProfiles.length;
    }

    // ══════════════════════════════════════════════════════════════════════
    // C4 — Evidencia PRE-examen (25%)
    // ══════════════════════════════════════════════════════════════════════
    const employeeIds = new Set(employees.map((employee) => String(employee._id)));
    const eligibleExams = exams.filter(
      (exam) =>
        exam.status !== ExamStatus.CANCELLED &&
        employeeIds.has(String(exam.employeeId)),
    );

    const validEvidenceCount = eligibleExams.filter((exam) =>
      this.hasValidPreExamEvidence(exam, companyProfileIds),
    ).length;

    const c4 = eligibleExams.length > 0 ? validEvidenceCount / eligibleExams.length : 0;

    // ══════════════════════════════════════════════════════════════════════
    // CÁLCULO FINAL (25/25/25/25) — sin redondeos intermedios
    // ══════════════════════════════════════════════════════════════════════
    const percentage = Math.round(c1 * 25 + c2 * 25 + c3 * 25 + c4 * 25);

    const status =
      percentage >= JobProfileMedicalInformationProvider.COMPLIANCE_TARGET
        ? 'TARGET_MET'
        : 'TARGET_NOT_MET';

    // ── Findings ──
    const findings: ProviderComplianceResult['findings'] = [];

    const withoutProfile = totalEmployees - employeesWithActiveProfile;
    if (withoutProfile > 0) {
      findings.push({
        id: 'job-profile-coverage-pending',
        module: 'job-profile-medical-information',
        title: `${withoutProfile} trabajador(es) sin perfil de cargo activo`,
        description:
          `${withoutProfile} de ${totalEmployees} trabajadores no tienen un perfil de cargo activo asociado. El estándar 3.1.3 requiere que la información del cargo esté disponible para la evaluación médica ocupacional.`,
        priority: FindingPriority.HIGH,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    const incompleteFunctional = activeProfiles.filter(
      (profile) =>
        (profile.description ?? '').trim().length === 0 &&
        (profile.functions ?? []).length === 0 &&
        (profile.responsibilities ?? []).length === 0,
    ).length;
    if (incompleteFunctional > 0) {
      findings.push({
        id: 'job-profile-functional-incomplete',
        module: 'job-profile-medical-information',
        title: `${incompleteFunctional} perfil(es) sin información funcional`,
        description:
          `${incompleteFunctional} perfil(es) de cargo activo(s) carecen de descripción, funciones o responsabilidades. La información funcional es insumo para la valoración médica ocupacional (3.1.3).`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    const withoutMedicalInfo = activeProfiles.filter(
      (profile) =>
        (profile.workConditions ?? []).length === 0 &&
        (profile.associatedHazardIds ?? []).length === 0 &&
        (profile.medicalRelevantInformation ?? '').trim().length === 0,
    ).length;
    if (withoutMedicalInfo > 0) {
      findings.push({
        id: 'job-profile-medical-info-incomplete',
        module: 'job-profile-medical-information',
        title: `${withoutMedicalInfo} perfil(es) sin información relevante para valoración médica`,
        description:
          `${withoutMedicalInfo} perfil(es) de cargo activo(s) no registran condiciones de trabajo, riesgos asociados ni información médico-ocupacional del cargo. El estándar 3.1.3 exige suministrar esta información al médico evaluador.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    const examsWithoutEvidence = eligibleExams.length - validEvidenceCount;
    if (examsWithoutEvidence > 0) {
      findings.push({
        id: 'job-profile-pre-exam-evidence-pending',
        module: 'job-profile-medical-information',
        title: `${examsWithoutEvidence} evaluación(es) sin evidencia PRE-examen de perfil suministrado`,
        description:
          `${examsWithoutEvidence} de ${eligibleExams.length} evaluaciones médicas no tienen contexto PRE-examen que demuestre el suministro del perfil de cargo al médico evaluador (occupationalContext con providedToEvaluator, perfil, fecha y actor). Registrar la evidencia al momento de la evaluación.`,
        priority: FindingPriority.HIGH,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // ── Pending / Completed ──
    const completed = validEvidenceCount;
    const pending = eligibleExams.length - validEvidenceCount;

    return {
      module: 'job-profile-medical-information',
      percentage,
      status,
      findings,
      pending,
      completed,
      overdue: 0,
      phases: { do: percentage } as Partial<Record<CompliancePhaseKey, number>>,
    };
  }

  /**
   * Evidencia PRE-examen válida SOLO si existe explícitamente:
   * - occupationalContext.providedToEvaluator === true;
   * - jobProfileId perteneciente a la MISMA empresa;
   * - providedAt fecha válida;
   * - providedBy actor no vacío;
   * - coherencia temporal: providedAt <= examDate cuando examDate existe.
   *
   * NO se acepta como evidencia: la existencia del examen, de una
   * recomendación médica, workerAcknowledged o communicationDate.
   */
  private hasValidPreExamEvidence(
    exam: OccupationalExamDocument,
    companyProfileIds: ReadonlySet<string>,
  ): boolean {
    const context = exam.occupationalContext;
    if (!context) return false;
    if (context.providedToEvaluator !== true) return false;
    if (!context.jobProfileId) return false;
    if (!companyProfileIds.has(String(context.jobProfileId))) return false;
    if (!context.providedAt) return false;

    const providedAt = new Date(context.providedAt);
    if (Number.isNaN(providedAt.getTime())) return false;

    if ((context.providedBy ?? '').trim().length === 0) return false;

    if (exam.examDate) {
      const examDate = new Date(exam.examDate);
      if (!Number.isNaN(examDate.getTime()) && providedAt.getTime() > examDate.getTime()) {
        return false;
      }
    }

    return true;
  }
}
