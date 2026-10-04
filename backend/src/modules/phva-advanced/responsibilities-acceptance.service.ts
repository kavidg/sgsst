import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PhvaAdvancedResponsibilities, PhvaAdvancedResponsibilitiesDocument, ResponsibilityAssignmentEntry } from './schemas/phva-advanced-responsibilities.schema';
import { Company, CompanyDocument } from '../companies/schemas/company.schema';
import { Employee, EmployeeDocument } from '../employees/schemas/employee.schema';
import {
  CampaignStatus,
  WorkerStatus,
} from '../worker-signature-campaign/schemas/worker-signature-campaign.schema';
import { WorkerSignatureCampaignService } from '../worker-signature-campaign/worker-signature-campaign.service';
// Fase 3A — entrega por email del enlace (mismo token, misma /sign/:token).
import {
  NotificationDeliveryService,
  AcceptanceEmailDeliveryResult,
} from '../notifications/notification-delivery.service';
import { NotificationDeliveryStatus, DeliveryChannel } from '../notifications/schemas/notification-delivery.schema';
// Fase 3B-1 — mismo enlace por WhatsApp (otro canal, mismo proceso).
import { DeliveryMethod } from '../worker-signature-campaign/schemas/worker-signature-campaign.schema';

/**
 * Fase 1 — Flujo "Enviar a aceptación" para 1.1.2 (Responsabilidades SG-SST).
 *
 * Convierte las responsabilidades asignadas a `Employee` en campañas de firma
 * reutilizando el motor existente `worker-signature-campaign` (un enlace
 * `/sign/:token` por trabajador). Reglas:
 *
 * - Employee es la ÚNICA fuente de trabajadores: `employeeId` se valida
 *   tenant-safe con el patrón del repo (`findOne({ _id, companyId })`).
 * - Solo empleados ACTIVOS son elegibles (no se crean campañas para
 *   retirados/inactivos).
 * - Un (empleado, versión) no puede tener campañas ACTIVAS duplicadas: si ya
 *   existe una, se reutiliza (dedup).
 * - El contenido firmado queda CONGELADO: snapshot por empleado al crear la
 *   campaña (`documentContent`) + `documentVersion` explícita.
 * - Sin canales automáticos en esta fase (correo/WhatsApp postergados): el
 *   enlace queda disponible para entrega manual en la UI.
 */

export const RESPONSIBILITIES_SOURCE_MODULE = 'RESPONSIBILITIES_1.1.2';

/** Resultado por trabajador del envío a aceptación. */
export interface AcceptanceDispatchResult {
  employeeId: string;
  employeeName: string;
  /** true = campaña existente reutilizada (dedup); false = creada ahora. */
  reused: boolean;
  campaignId: string;
  /** Enlace público del trabajador: `/sign/:token`. */
  signUrl: string;
  token: string;
  /** Fase 3A — resultado de la entrega por email (no bloquea el flujo). */
  emailDelivery?: {
    attempted: boolean;
    success: boolean;
    status: string;
    errorCode?: string;
  };
  /** Fase 3B-1 — resultado de la entrega por WhatsApp (no bloquea el flujo). */
  whatsappDelivery?: {
    attempted: boolean;
    success: boolean;
    status: string;
    errorCode?: string;
  };
}

export interface AcceptanceCampaignStatus {
  campaignId: string;
  documentVersion: string;
  campaignStatus: string;
  workerStatus: string;
  signUrl: string;
  /** Fase 3A — email del trabajador (si Employee lo tiene). */
  email?: string;
  /** Fase 3A — estado del último intento de entrega (PENDING/SENT/FAILED). */
  emailDeliveryStatus?: string;
  emailSentAt?: Date;
  emailErrorCode?: string;
  /** Fase 3B-1 — teléfono y estado del último intento WhatsApp. */
  phone?: string;
  whatsappDeliveryStatus?: string;
  whatsappSentAt?: Date;
  whatsappErrorCode?: string;
}

interface MetaSnapshot {
  currentVersion?: string;
  [key: string]: unknown;
}

function metaIndexOf(
  responsibilities: ResponsibilityAssignmentEntry[],
): number {
  return responsibilities.findIndex((entry) => entry.title === '__META__');
}

function readMeta(responsibilities: ResponsibilityAssignmentEntry[]): MetaSnapshot | null {
  const index = metaIndexOf(responsibilities);
  if (index < 0) return null;
  try {
    return JSON.parse(responsibilities[index].category) as MetaSnapshot;
  } catch {
    return null;
  }
}

@Injectable()
export class ResponsibilitiesAcceptanceService {
  private readonly logger = new Logger(ResponsibilitiesAcceptanceService.name);

  constructor(
    @InjectModel(PhvaAdvancedResponsibilities.name)
    private readonly responsibilitiesModel: Model<PhvaAdvancedResponsibilitiesDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    private readonly campaignService: WorkerSignatureCampaignService,
    /** Fase 3A — entrega del enlace por email (Resend vía adapter). */
    private readonly notificationDeliveryService: NotificationDeliveryService,
    private readonly configService: ConfigService,
    @InjectModel(Company.name)
    private readonly companyModel: Model<CompanyDocument>,
  ) {}

  /**
   * Envía a aceptación los empleados seleccionados. Crea UNA campaña por
   * trabajador (contenido congelado con SUS responsabilidades asignadas),
   * activa la campaña (genera el token/enlace) y devuelve el resultado por
   * empleado. Idempotente por (companyId, employeeId, versión):
   * reutiliza la campaña activa equivalente.
   */
  async sendToAcceptance(
    companyId: Types.ObjectId,
    employeeIds: string[],
  ): Promise<{ version: string; results: AcceptanceDispatchResult[]; rejected: Array<{ employeeId: string; reason: string }> }> {
    const uniqueIds = Array.from(new Set(employeeIds.map((id) => id?.trim()).filter(Boolean)));
    if (!uniqueIds.length) throw new BadRequestException('Selecciona al menos un empleado.');

    const record = await this.responsibilitiesModel
      .findOne({ companyId, itemCode: '1.1.2' })
      .exec();
    if (!record || !record.responsibilities.length) {
      throw new BadRequestException('No hay responsabilidades registradas para enviar a aceptación.');
    }

    const meta = readMeta(record.responsibilities);
    const version = (meta?.currentVersion ?? '1.0').toString();

    const approvalStatus = String(meta?.approvalStatus ?? 'DRAFT');
    if (approvalStatus !== 'APPROVED' && approvalStatus !== 'APPROVED_AND_SIGNED') {
      throw new BadRequestException('La matriz de responsabilidades debe estar aprobada antes de enviar a aceptación.');
    }

    // Workers ya existentes para esta versión (para dedup e identificación real).
    const existingWorkers = await this.campaignService.getWorkersBySource(companyId, RESPONSIBILITIES_SOURCE_MODULE, version);

    // 1) Validación tenant-safe + estado activo (un solo query por lote).
    const validEmployees = await this.employeeModel
      .find({ _id: { $in: uniqueIds.map((id) => new Types.ObjectId(id)) }, companyId, status: 'Activo' })
      .exec();
    const byId = new Map(validEmployees.map((employee) => [employee._id.toString(), employee]));

    const rejected: Array<{ employeeId: string; reason: string }> = [];
    const eligible: Array<{ employeeId: string; employee: EmployeeDocument }> = [];
    for (const employeeId of uniqueIds) {
      const employee = byId.get(employeeId);
      if (!employee) {
        // No existe, no pertenece a la empresa o no está activo.
        rejected.push({ employeeId, reason: 'Empleado no válido (inexistente, inactivo o de otra empresa).' });
        continue;
      }
      if (!employee.document?.trim()) {
        rejected.push({ employeeId, reason: 'Empleado sin documento: no es posible verificar su identidad en el enlace público.' });
        continue;
      }
      eligible.push({ employeeId, employee });
    }

    // 2) Snapshot congelado de las responsabilidades asignadas por documento.
    const documentIds = new Set(
      eligible
        .map(({ employee }) => employee.document?.trim())
        .filter(Boolean),
    );
    const assignedByDocument = new Map<string, ResponsibilityAssignmentEntry[]>();
    for (const entry of record.responsibilities) {
      if (entry.title === '__META__' || entry.active === false) continue;
      const document = (entry as { assignedDocument?: string }).assignedDocument?.trim();
      if (!document || !documentIds.has(document)) continue;
      const list = assignedByDocument.get(document) ?? [];
      list.push({
        title: entry.title,
        category: entry.category,
        role: entry.role,
        active: entry.active,
        requiresSignature: entry.requiresSignature,
        status: entry.status,
        signature: entry.signature,
      });
      assignedByDocument.set(document, list);
    }

    // Fase 3A — nombre de la empresa para la plantilla del correo (fallo
    // de lectura NO bloquea el flujo: companyName opcional).
    let companyName: string | undefined;
    try {
      const company = await this.companyModel.findById(companyId).exec();
      companyName = company?.name;
    } catch {
      this.logger.warn(`No fue posible leer el nombre de la empresa ${companyId.toString()} para la plantilla del correo.`);
    }

    // 3) Crear/reutilizar campaña por trabajador.
    const results: AcceptanceDispatchResult[] = [];
    const createdCampaignIds: string[] = [];
    for (const { employeeId, employee } of eligible) {
      const existingWorker = existingWorkers.get(employee.document.trim());
      if (existingWorker) {
        // Dedup: ya existe worker ACTIVO para (empresa, empleado, versión).
        // Se reutiliza la campaña y se garantiza un enlace/token vigente.
        const signUrl = await this.campaignService.generateLink(companyId, existingWorker._id.toString(), 'system');
        results.push({
          employeeId,
          employeeName: employee.name,
          reused: true,
          campaignId: existingWorker.campaignId.toString(),
          signUrl: signUrl.url,
          token: signUrl.token,
          emailDelivery: { attempted: false, success: false, status: 'SKIPPED_REUSE' },
        });
        continue;
      }

      const responsibilities = assignedByDocument.get(employee.document.trim()) ?? [];
      const content = this.buildWorkerContent(employee, version, responsibilities);
      const campaign = await this.campaignService.create(companyId, {
        name: `Responsabilidades SG-SST v${version} — ${employee.name}`,
        description: 'Aceptación de responsabilidades en Seguridad y Salud en el Trabajo (1.1.2).',
        documentType: 'RESPONSABILIDADES_SST',
        documentVersion: version,
        documentContent: content,
        sourceModule: RESPONSIBILITIES_SOURCE_MODULE,
        sourceEntityId: record._id.toString(),
        requireOtp: false,
        requireSignature: true,
        requirePdfAcceptance: false,
        reminderDays: [30, 15, 5, 1],
      }, 'system');

      const created = await this.campaignService.addWorkers(companyId, campaign._id.toString(), {
        workers: [{
          employeeId: employee._id.toString(),
          name: employee.name,
          identification: employee.document,
          position: employee.position,
          area: employee.area,
          phone: employee.mobilePhone || undefined,
          email: employee.corporateEmail || undefined,
        }],
      }, 'system');

      if (!created.length) {
        throw new NotFoundException(`No fue posible registrar al trabajador en la campaña (${employee.name}).`);
      }

      await this.campaignService.updateStatus(companyId, campaign._id.toString(), { status: CampaignStatus.ACTIVE }, 'system');

      const link = await this.campaignService.generateLink(companyId, created[0]._id.toString(), 'system');

      // Fase 3A — Entrega del enlace por email: operación DISTINTA de la
      // creación de campaña. Solo si el trabajador tiene corporateEmail; un
      // fallo de Resend NO invalida la campaña ni el enlace.
      const emailDelivery = await this.deliverAcceptanceEmail({
        companyId,
        campaignId: campaign._id,
        campaignWorkerId: created[0]._id,
        employeeId: employee._id.toString(),
        recipientEmail: employee.corporateEmail,
        workerName: employee.name,
        companyName,
        signToken: link.token,
        expiresAt: created[0].tokenExpiresAt,
      });

      // Fase 3B-1 — entrega por WhatsApp: OTRO canal del MISMO proceso, con
      // las mismas reglas no bloqueantes. Los canales son independientes:
      // sin teléfono no se intenta (WHATSAPP_RECIPIENT_MISSING) y con fallo
      // de Meta la campaña/link/email siguen intactos.
      const whatsappDelivery = await this.deliverAcceptanceWhatsApp({
        companyId,
        campaignId: campaign._id,
        campaignWorkerId: created[0]._id,
        employeeId: employee._id.toString(),
        recipientPhone: employee.mobilePhone,
        workerName: employee.name,
        signToken: link.token,
      });
      // Éxito en CUALQUIER canal marca LINK_SENT con su canal (el otro canal
      // puede haber fallado: worker state ≠ delivery state, regla 16/17 de 3A).
      if (whatsappDelivery.success) {
        await this.campaignService.markWorkerLinkSent(companyId, created[0]._id.toString(), DeliveryMethod.WHATSAPP);
      }

      results.push({
        employeeId,
        employeeName: employee.name,
        reused: false,
        campaignId: campaign._id.toString(),
        signUrl: link.url,
        token: link.token,
        emailDelivery: {
          attempted: emailDelivery.attempted,
          success: emailDelivery.success,
          status: emailDelivery.status,
          errorCode: emailDelivery.errorCode,
        },
        whatsappDelivery: {
          attempted: whatsappDelivery.attempted,
          success: whatsappDelivery.success,
          status: whatsappDelivery.status,
          errorCode: whatsappDelivery.errorCode,
        },
      });
      createdCampaignIds.push(campaign._id.toString());
    }

    if (createdCampaignIds.length) {
      this.logger.log(
        `1.1.2 aceptación: ${createdCampaignIds.length} campaña(s) creada(s) v${version} para empresa ${companyId.toString()}.`,
      );
    }

    return { version, results, rejected };
  }

  /**
   * Fase 3A — Intento de entrega del correo de aceptación (envío inicial).
   * NUNCA lanza hacia el flujo de campaña: cualquier error se registra y se
   * devuelve como entrega fallida (campaña activa y enlace intactos).
   */
  private async deliverAcceptanceEmail(params: {
    companyId: Types.ObjectId;
    campaignId: Types.ObjectId;
    campaignWorkerId: Types.ObjectId;
    employeeId: string;
    recipientEmail?: string;
    workerName: string;
    companyName?: string;
    signToken: string;
    expiresAt?: Date;
  }): Promise<AcceptanceEmailDeliveryResult> {
    const recipient = params.recipientEmail?.trim();
    if (!recipient) {
      // Sin email NO se intenta enviar ni falla: entrega manual por UI.
      return { attempted: false, success: false, status: NotificationDeliveryStatus.PENDING };
    }
    try {
      await this.campaignService.addEmailDeliveryAudit(params.companyId, params.campaignWorkerId.toString(), 'EMAIL_SEND_REQUESTED', {
        campaignId: params.campaignId,
        token: params.signToken,
        recipientEmail: recipient,
      });
      const result = await this.notificationDeliveryService.sendInitialAcceptanceEmail({
        companyId: params.companyId,
        campaignId: params.campaignId,
        campaignWorkerId: params.campaignWorkerId,
        employeeId: params.employeeId,
        recipientEmail: recipient,
        workerName: params.workerName,
        companyName: params.companyName,
        signToken: params.signToken,
        frontendBaseUrl: this.resolveFrontendBaseUrl(),
        expiresAt: params.expiresAt,
      });
      if (result.success) {
        await this.campaignService.markWorkerLinkSent(params.companyId, params.campaignWorkerId.toString());
        await this.campaignService.addEmailDeliveryAudit(params.companyId, params.campaignWorkerId.toString(), 'EMAIL_SENT', {
          campaignId: params.campaignId,
          token: params.signToken,
          recipientEmail: recipient,
        });
      } else {
        await this.campaignService.addEmailDeliveryAudit(params.companyId, params.campaignWorkerId.toString(), 'EMAIL_FAILED', {
          campaignId: params.campaignId,
          token: params.signToken,
          recipientEmail: recipient,
          errorCode: result.errorCode,
          errorMessage: result.errorMessage,
        });
      }
      return result;
    } catch (error) {
      // Blindaje final: un error inesperado de la entrega jamás invalida la
      // campaña creada (regla 12 del requerimiento).
      const message = error instanceof Error ? error.message : 'Error desconocido de entrega.';
      this.logger.warn(`Entrega de email no bloqueante falló: ${message}`);
      await this.campaignService.addEmailDeliveryAudit(params.companyId, params.campaignWorkerId.toString(), 'EMAIL_FAILED', {
        campaignId: params.campaignId,
        token: params.signToken,
        recipientEmail: recipient,
        errorCode: 'DELIVERY_UNEXPECTED_ERROR',
        errorMessage: message,
      }).catch(() => undefined);
      return {
        attempted: true,
        success: false,
        status: NotificationDeliveryStatus.FAILED,
        errorCode: 'DELIVERY_UNEXPECTED_ERROR',
      };
    }
  }

  /**
   * Fase 3B-1 — Intento de entrega del WhatsApp de aceptación (envío inicial).
   * NUNCA lanza hacia el flujo de campaña (mismo blindaje que email).
   */
  private async deliverAcceptanceWhatsApp(params: {
    companyId: Types.ObjectId;
    campaignId: Types.ObjectId;
    campaignWorkerId: Types.ObjectId;
    employeeId: string;
    recipientPhone?: string;
    workerName: string;
    signToken: string;
  }): Promise<AcceptanceEmailDeliveryResult> {
    if (!params.recipientPhone?.trim()) {
      // Sin teléfono: condición CONTROLADA, sin intento ni delivery.
      return {
        attempted: false,
        success: false,
        status: NotificationDeliveryStatus.PENDING,
        errorCode: 'WHATSAPP_RECIPIENT_MISSING',
      };
    }
    try {
      await this.campaignService.addWhatsAppDeliveryAudit(params.companyId, params.campaignWorkerId.toString(), 'WHATSAPP_SEND_REQUESTED', {
        campaignId: params.campaignId,
        token: params.signToken,
        recipientPhone: params.recipientPhone,
      });
      const result = await this.notificationDeliveryService.sendInitialAcceptanceWhatsApp({
        companyId: params.companyId,
        campaignId: params.campaignId,
        campaignWorkerId: params.campaignWorkerId,
        employeeId: params.employeeId,
        recipientPhone: params.recipientPhone,
        workerName: params.workerName,
        signToken: params.signToken,
        frontendBaseUrl: this.resolveFrontendBaseUrl(),
        defaultCountryCode: (this.configService.get<string>('WHATSAPP_DEFAULT_COUNTRY_CODE') ?? '57').trim(),
      });
      if (result.success) {
        await this.campaignService.addWhatsAppDeliveryAudit(params.companyId, params.campaignWorkerId.toString(), 'WHATSAPP_SENT', {
          campaignId: params.campaignId,
          token: params.signToken,
          recipientPhone: params.recipientPhone,
        });
      } else {
        await this.campaignService.addWhatsAppDeliveryAudit(params.companyId, params.campaignWorkerId.toString(), 'WHATSAPP_FAILED', {
          campaignId: params.campaignId,
          token: params.signToken,
          recipientPhone: params.recipientPhone,
          errorCode: result.errorCode,
          errorMessage: result.errorMessage,
        });
      }
      return result;
    } catch (error) {
      // Blindaje final: un error inesperado de WhatsApp jamás invalida la campaña.
      const message = error instanceof Error ? error.message : 'Error desconocido de entrega WhatsApp.';
      this.logger.warn(`Entrega de WhatsApp no bloqueante falló: ${message}`);
      await this.campaignService.addWhatsAppDeliveryAudit(params.companyId, params.campaignWorkerId.toString(), 'WHATSAPP_FAILED', {
        campaignId: params.campaignId,
        token: params.signToken,
        recipientPhone: params.recipientPhone,
        errorCode: 'WHATSAPP_DELIVERY_UNEXPECTED_ERROR',
        errorMessage: message,
      }).catch(() => undefined);
      return {
        attempted: true,
        success: false,
        status: NotificationDeliveryStatus.FAILED,
        errorCode: 'WHATSAPP_DELIVERY_UNEXPECTED_ERROR',
      };
    }
  }

  /** Dominio frontend desde configuración (NUNCA localhost en producción). */
  private resolveFrontendBaseUrl(): string {
    return (this.configService.get<string>('FRONTEND_URL') ?? '').trim();
  }

  /**
   * Estado de aceptación por empleado para la versión actual (sin crear nada).
   * Consulta los workers de las campañas 1.1.2 de la empresa.
   */
  async getAcceptanceStatus(
    companyId: Types.ObjectId,
  ): Promise<{ version: string; statuses: Array<AcceptanceCampaignStatus & { identification: string; employeeName: string }> }> {
    const record = await this.responsibilitiesModel.findOne({ companyId, itemCode: '1.1.2' }).exec();
    const meta = record ? readMeta((record.responsibilities ?? []) as ResponsibilityAssignmentEntry[]) : null;
    const version = (meta?.currentVersion ?? '1.0').toString();

    const workers = await this.campaignService.getWorkersBySource(companyId, RESPONSIBILITIES_SOURCE_MODULE, version);
    const statuses: Array<AcceptanceCampaignStatus & { identification: string; employeeName: string }> = [];
    for (const [, worker] of workers) {
      // Fase 3A/3B — último intento de entrega por canal del worker (si existe).
      let emailDeliveryStatus: string | undefined;
      let emailSentAt: Date | undefined;
      let emailErrorCode: string | undefined;
      let whatsappDeliveryStatus: string | undefined;
      let whatsappSentAt: Date | undefined;
      let whatsappErrorCode: string | undefined;
      try {
        const lastEmail = await this.notificationDeliveryService.listDeliveriesByWorkerAndChannel(companyId, worker._id as Types.ObjectId, DeliveryChannel.EMAIL, 1);
        const last = lastEmail[0] as unknown as { status?: string; sentAt?: Date; errorCode?: string } | undefined;
        emailDeliveryStatus = last?.status;
        emailSentAt = last?.sentAt;
        emailErrorCode = last?.errorCode;
      } catch {
        // Sin historial de entrega: la consulta de estado sigue funcionando.
      }
      try {
        const lastWa = await this.notificationDeliveryService.listDeliveriesByWorkerAndChannel(companyId, worker._id as Types.ObjectId, DeliveryChannel.WHATSAPP, 1);
        const last = lastWa[0] as unknown as { status?: string; sentAt?: Date; errorCode?: string } | undefined;
        whatsappDeliveryStatus = last?.status;
        whatsappSentAt = last?.sentAt;
        whatsappErrorCode = last?.errorCode;
      } catch {
        // Sin historial WhatsApp: la consulta de estado sigue funcionando.
      }
      statuses.push({
        campaignId: worker.campaignId.toString(),
        documentVersion: version,
        campaignStatus: 'ACTIVE',
        workerStatus: worker.status,
        signUrl: worker.token ? `/sign/${worker.token}` : '',
        identification: worker.identification,
        employeeName: worker.name,
        email: worker.email,
        emailDeliveryStatus,
        emailSentAt,
        emailErrorCode,
        phone: worker.phone,
        whatsappDeliveryStatus,
        whatsappSentAt,
        whatsappErrorCode,
      });
    }
    return { version, statuses };
  }

  /**
   * Snapshot textual e inmutable de las responsabilidades del trabajador para
   * esta versión. Queda congelado en `campaign.documentContent` y es lo único
   * que el trabajador visualiza y firma en /sign/:token.
   */
  private buildWorkerContent(
    employee: Pick<EmployeeDocument, 'name' | 'document' | 'position' | 'area'>,
    version: string,
    responsibilities: ResponsibilityAssignmentEntry[],
  ): string {
    const lines: string[] = [];
    lines.push('RESPONSABILIDADES EN SEGURIDAD Y SALUD EN EL TRABAJO (1.1.2)');
    lines.push(`Trabajador: ${employee.name}`);
    lines.push(`Documento: ${employee.document}`);
    lines.push(`Cargo: ${employee.position || 'N/D'} · Área: ${employee.area || 'N/D'}`);
    lines.push(`Versión de las responsabilidades: v${version}`);
    lines.push('');
    lines.push('Al firmar este documento declaro que conozco, entiendo y acepto las');
    lines.push('responsabilidades asignadas a mi cargo en el marco del SG-SST:');
    lines.push('');
    for (const responsibility of responsibilities) {
      lines.push(`- [${responsibility.requiresSignature ? 'Requiere firma' : 'Informativa'}] ${responsibility.title}`);
      lines.push(`  Categoría: ${responsibility.category || 'N/D'}`);
    }
    if (!responsibilities.length) {
      lines.push('(Sin responsabilidades asignadas registradas para este trabajador en esta versión.)');
    }
    lines.push('');
    lines.push('Este documento se firma digitalmente y su aceptación queda registrada');
    lines.push('con fecha, hash de firma y código de verificación como evidencia.');
    return lines.join('\n');
  }
}
