import { Types } from 'mongoose';
import { AutomationResultDto } from '../../compliance-automation/dto/automation-result.dto';
import { AlertsService } from '../../alerts/alerts.service';
import { AnnualWorkPlanService } from '../../annual-work-plan/services/annual-work-plan.service';
import { DocumentMasterService } from '../../document-management/services/document-master.service';
import { UserDocument } from '../../users/schemas/user.schema';

/**
 * Contexto compartido por los ejecutores de pasos (patrón Strategy).
 *
 * Contiene los datos de la petición y las referencias a los servicios
 * existentes del sistema que el runner puede reutilizar. No recalcula
 * cumplimiento ni crea lógica duplicada.
 */
export interface ExecutionContext {
  companyId: Types.ObjectId;
  /** Identificador de la ejecución (se usa para códigos únicos). */
  automationId: string;
  executedBy: string;
  executionDate: Date;
  /** Usuario que ejecuta la automatización (resuelto desde executedBy). */
  user: UserDocument | null;
  /** AutomationResult READY que originó la ejecución. */
  automationResult: AutomationResultDto;
  /** Servicios existentes reutilizables por los ejecutores. */
  annualWorkPlanService: AnnualWorkPlanService;
  alertsService: AlertsService;
  documentMasterService: DocumentMasterService;
}
