import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ApprovalDecision } from '../../enums/approval-decision.enum';
import { ApprovalStatus } from '../../enums/approval-status.enum';
import { ApprovalActor } from '../../interfaces/approval-actor.interface';
import { ApplyDecisionContext } from '../approval-adapter.interface';
import { PhvaAdvancedService } from '../../../phva-advanced/phva-advanced.service';
import { User, UserDocument } from '../../../users/schemas/user.schema';
import { mapPhvaAdvancedStatus } from '../../utils/phva-status-map';

/**
 * Handler de la sub-entidad SST Policy (2.1.1) del módulo PHVA Advanced para
 * el Approval Workflow Core.
 *
 * Conecta el motor de aprobaciones con el flujo existente de la Política de
 * Seguridad y Salud en el Trabajo SIN modificar sus endpoints ni su lógica:
 * reutiliza EXCLUSIVAMENTE PhvaAdvancedService.approveSstPolicy para aplicar la
 * decisión. Ese método conserva exactamente la validación de firmas
 * obligatorias, las PolicySignature, el PolicyHistory, las PolicyVersion, las
 * PolicySocialization, las comunicaciones automáticas, el approvalDocument, el
 * auditHistory y las versiones del módulo.
 *
 * Particularidad del dominio: la política es UNO por empresa (itemCode fijo
 * '2.1.1'), por lo que getEntity soporta entityId opcional — cuando no se
 * provee, resuelve la política vigente por companyId (findSstPolicyByCompany).
 *
 * Estados locales (enum español del schema SstPolicyStatus):
 * 'Borrador', 'Pendiente aprobación', 'Aprobado', 'Vencido', 'Archivado'.
 * 'Vencido' (EXPIRED) es un ciclo cerrado y se mapea al ApprovalStatus.ARCHIVED
 * canónico del motor (misma equivalencia de negocio que el archivo).
 *
 * El módulo NO posee rechazo real de política: NO existe rejectSstPolicy, por
 * lo que las decisiones REJECTED y ADJUSTMENTS_REQUESTED no tienen transición
 * de negocio y se rechazan con BadRequestException controlado (no se inventan
 * estados nuevos).
 */
@Injectable()
export class SstPolicyHandler {
  constructor(
    @Inject(forwardRef(() => PhvaAdvancedService))
    private readonly phvaAdvancedService: PhvaAdvancedService,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  /**
   * Carga la política validando pertenencia por companyId y devuelve el
   * contexto de la entidad (entity, status, version).
   *
   * Soporta dos escenarios:
   * A) entityId presente → carga la política específica.
   * B) entityId undefined → carga la política vigente de la empresa.
   */
  async getEntity(companyId: string, entityId?: string) {
    const record = entityId
      ? await this.phvaAdvancedService.findSstPolicyById(new Types.ObjectId(entityId))
      : await this.phvaAdvancedService.findSstPolicyByCompany(
          new Types.ObjectId(companyId),
        );

    if (record.companyId.toString() !== companyId) {
      throw new NotFoundException('SST Policy not found');
    }

    return {
      entity: record,
      status: record.status,
      // El registro conserva su propia versión textual (currentVersion "1.0");
      // se expone 1 por contrato del motor (mismo patrón que ResourceAssignment).
      version: 1,
    };
  }

  /**
   * Aplica una decisión del motor sobre la política real, reutilizando la
   * lógica existente (PhvaAdvancedService.approveSstPolicy) que conserva
   * firmas, historial, versiones, socializaciones y comunicaciones del módulo.
   *
   * REJECTED y ADJUSTMENTS_REQUESTED no poseen flujo real en el módulo (no
   * existe rejectSstPolicy), por lo que se lanzan errores controlados sin
   * inventar transiciones.
   */
  async applyDecision(ctx: ApplyDecisionContext) {
    const record = await this.phvaAdvancedService.findSstPolicyById(
      new Types.ObjectId(ctx.entityId.toString()),
    );
    if (record.companyId.toString() !== ctx.companyId.toString()) {
      throw new NotFoundException('SST Policy not found');
    }

    switch (ctx.decision) {
      case ApprovalDecision.APPROVED: {
        const user = await this.resolveUser(ctx.actor);
        return this.phvaAdvancedService.approveSstPolicy(ctx.companyId, user);
      }
      case ApprovalDecision.REJECTED:
        throw new BadRequestException('SST Policy does not support rejection.');
      case ApprovalDecision.ADJUSTMENTS_REQUESTED:
        throw new BadRequestException(
          'SST Policy does not support adjustments requests.',
        );
    }
  }

  /**
   * Traduce el enum español del schema (SstPolicyStatus) al ApprovalStatus
   * canónico del motor.
   *
   * 'Borrador' → DRAFT
   * 'Pendiente aprobación' → PENDING_APPROVAL
   * 'Aprobado' → APPROVED
   * 'Vencido' (EXPIRED) → ARCHIVED  (ciclo cerrado por vencimiento)
   * 'Archivado' → ARCHIVED
   *
   * Cualquier estado desconocido se mapea a DRAFT (equivalencia explícita:
   * un valor inesperado no puede considerarse aprobado ni pendiente).
   */
  mapStatus(localStatus: string): ApprovalStatus {
    // Conversión canónica centralizada (Fase 6.7): 'Borrador' → DRAFT,
    // 'Pendiente aprobación' → PENDING_APPROVAL, 'Aprobado' → APPROVED,
    // 'Vencido'/'Archivado' → ARCHIVED (ciclo cerrado), desconocido → DRAFT.
    return mapPhvaAdvancedStatus(localStatus);
  }

  allowedRoles(): string[] {
    // Roles actuales de aprobación de SST Policy (controller): owner y manager.
    return ['owner', 'manager'];
  }

  /**
   * Resuelve el usuario que aprueba: si el actor trae un ObjectId lo usa
   * directamente; si trae un UID de Firebase (o userId sin ObjectId) lo busca
   * en la colección User.
   */
  private async resolveUser(actor: ApprovalActor): Promise<UserDocument> {
    let user: UserDocument | null = null;
    if (Types.ObjectId.isValid(actor.userId)) {
      user = await this.userModel.findById(actor.userId).exec();
    }
    if (!user) {
      user = await this.userModel
        .findOne({ firebaseUid: actor.firebaseUid ?? actor.userId })
        .exec();
    }
    if (!user) {
      throw new NotFoundException(`User ${actor.userId} not found`);
    }
    return user;
  }
}
