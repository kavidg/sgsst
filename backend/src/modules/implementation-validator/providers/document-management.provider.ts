import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { StepId } from '../../implementation-wizard/schemas/implementation-wizard.schema';
import {
  DocumentInstance,
  DocumentInstanceDocument,
} from '../../document-generation/schemas/document-instance.schema';
import { DocumentStatus } from '../../document-generation/types/renderer.types';
import { deriveStepStatus } from '../implementation-calculator';
import {
  ProviderValidationResult,
  WizardValidationProvider,
} from '../interfaces/wizard-validation-provider.interface';

/**
 * Valida el paso `document_management` del Centro de Implementación usando el
 * catálogo documental real (DocumentInstance):
 *
 * - Documentos generados para la empresa.
 * - Documentos aprobados o firmados.
 */
@Injectable()
export class DocumentManagementProvider implements WizardValidationProvider {
  readonly stepId: StepId = 'document_management';

  constructor(
    @InjectModel(DocumentInstance.name)
    private readonly instanceModel: Model<DocumentInstanceDocument>,
  ) {}

  async getValidation(companyId: string): Promise<ProviderValidationResult> {
    try {
      const objectId = new Types.ObjectId(companyId);
      const [total, approved] = await Promise.all([
        this.instanceModel.countDocuments({ companyId: objectId }),
        this.instanceModel.countDocuments({
          companyId: objectId,
          // La instancia se crea con status GENERATED; el estado de aprobación
          // se persiste en approvalStatus (APPROVED/APPROVED_AND_SIGNED). Se
          // consultan ambos campos para tolerar ambas variantes de datos.
          $or: [
            { status: { $in: [DocumentStatus.APPROVED, DocumentStatus.SIGNED] } },
            { approvalStatus: { $in: ['APPROVED', 'APPROVED_AND_SIGNED'] } },
          ],
        }),
      ]);

      let percentage = 0;
      if (total > 0) percentage += 60;
      if (approved > 0) percentage += 40;
      percentage = Math.max(0, Math.min(100, percentage));

      return {
        stepId: this.stepId,
        percentage,
        status: deriveStepStatus(percentage),
        details: `${total} documento(s) generado(s), ${approved} aprobado(s)/firmado(s)`,
        criteria: ['Documentos generados', 'Documentos aprobados/firmados'],
        pendingCriteria: [
          ...(total > 0 ? [] : ['Generar documentos del SG-SST']),
          ...(approved > 0 ? [] : ['Aprobar o firmar documentos generados']),
        ],
        data: { total, approved },
      };
    } catch {
      return {
        stepId: this.stepId,
        percentage: 0,
        status: 'PENDING',
        details: 'Catálogo documental no disponible',
      };
    }
  }
}
