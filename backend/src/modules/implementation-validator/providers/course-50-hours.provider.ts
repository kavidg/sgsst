import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { ComplianceCredentialsService } from '../../compliance-credentials/compliance-credentials.service';
import {
  CredentialCourseType,
  CredentialStatus,
  CredentialValidationStatus,
} from '../../compliance-credentials/enums/credential.enums';
import { StepId } from '../../implementation-wizard/schemas/implementation-wizard.schema';
import { deriveStepStatus } from '../implementation-calculator';
import {
  ProviderValidationResult,
  WizardValidationProvider,
} from '../interfaces/wizard-validation-provider.interface';

/**
 * Valida el paso `course_50_hours` del Centro de Implementación usando los
 * certificados de cumplimiento del curso SG-SST de 50 horas:
 *
 * - Existe un certificado COURSE_50_HOURS.
 * - validationStatus VALID.
 * - Vigente (status !== VENCIDO).
 */
@Injectable()
export class Course50HoursProvider implements WizardValidationProvider {
  readonly stepId: StepId = 'course_50_hours';

  constructor(
    private readonly credentialsService: ComplianceCredentialsService,
  ) {}

  async getValidation(companyId: string): Promise<ProviderValidationResult> {
    try {
      const credentials = await this.credentialsService.findAll(
        new Types.ObjectId(companyId),
      );
      const course50 = (credentials ?? []).filter(
        (credential) => credential.courseType === CredentialCourseType.COURSE_50_HOURS,
      );

      const valid = course50.filter(
        (credential) =>
          credential.validationStatus === CredentialValidationStatus.VALID &&
          credential.status !== CredentialStatus.VENCIDO,
      );

      let percentage = 0;
      if (course50.length > 0) percentage += 40;
      if (course50.some((credential) => credential.validationStatus === CredentialValidationStatus.VALID)) {
        percentage += 30;
      }
      if (valid.length > 0) percentage += 30;
      percentage = Math.max(0, Math.min(100, percentage));

      return {
        stepId: this.stepId,
        percentage,
        status: deriveStepStatus(percentage),
        details: `${valid.length} certificado(s) de 50 horas válido(s) de ${course50.length} registrado(s)`,
        criteria: ['Certificado de 50 horas registrado', 'Validación VALID', 'Vigencia vigente'],
        pendingCriteria: [
          ...(course50.length > 0 ? [] : ['Registrar certificado de 50 horas']),
          ...(course50.some((c) => c.validationStatus === CredentialValidationStatus.VALID) ? [] : ['Completar validación del certificado']),
          ...(valid.length > 0 ? [] : ['Actualizar certificado vencido/inválido']),
        ],
        data: { total: course50.length, valid: valid.length },
      };
    } catch {
      return {
        stepId: this.stepId,
        percentage: 0,
        status: 'PENDING',
        details: 'Certificados de curso SG-SST no disponibles',
      };
    }
  }
}
