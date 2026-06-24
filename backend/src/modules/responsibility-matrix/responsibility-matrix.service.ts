import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createHash } from 'crypto';
import { WorkerSignatureCampaignService } from '../worker-signature-campaign/worker-signature-campaign.service';
import { CampaignStatus } from '../worker-signature-campaign/schemas/worker-signature-campaign.schema';
import { MatrixApprovalStatus, MatrixComplianceStatus, ResponsibilityGroup, ResponsibilityItem, ResponsibilityMatrix, ResponsibilityMatrixDocument } from './schemas/responsibility-matrix.schema';
import { ResponsibilityAcceptance, ResponsibilityAcceptanceDocument, AcceptanceHistoryEntry } from './schemas/responsibility-acceptance.schema';
import { ApproveMatrixDto, GenerateMatrixDto, ReorderItemsDto, ResponsibilityItemDto, UpdateItemDto, VersionSnapshotDto } from './dto/responsibility-matrix.dto';
import { AcceptResponsibilityDto, RejectResponsibilityDto, RequestCorrectionDto, AssignResponsibilityBatchDto, CreateAcceptanceCycleDto } from './dto/responsibility-acceptance.dto';

const DEFAULT_RESPONSIBILITIES: Record<string, Array<{ title: string; description: string; mandatory: boolean }>> = {
  GERENCIA: [
    { title: 'Aprobar política SST', description: 'Revisar y aprobar la política de Seguridad y Salud en el Trabajo de la organización.', mandatory: true },
    { title: 'Aprobar presupuesto SST', description: 'Aprobar el presupuesto anual destinado al Sistema de Gestión de Seguridad y Salud en el Trabajo.', mandatory: true },
    { title: 'Garantizar recursos', description: 'Asignar los recursos financieros, técnicos y humanos necesarios para la implementación y mantenimiento del SG-SST.', mandatory: true },
    { title: 'Designar responsable SST', description: 'Designar formalmente al responsable del Sistema de Gestión de Seguridad y Salud en el Trabajo.', mandatory: true },
    { title: 'Revisar resultados SG-SST', description: 'Revisar periódicamente los resultados del SG-SST y tomar decisiones para la mejora continua.', mandatory: true },
    { title: 'Participar en rendición de cuentas', description: 'Participar activamente en las jornadas de rendición de cuentas del SG-SST.', mandatory: true },
    { title: 'Aprobar planes de mejoramiento', description: 'Aprobar los planes de mejoramiento derivados de las auditorías y evaluaciones del SG-SST.', mandatory: true },
    { title: 'Garantizar cumplimiento legal', description: 'Asegurar el cumplimiento de la normatividad vigente en Seguridad y Salud en el Trabajo.', mandatory: true },
  ],
  RESPONSABLE_SST: [
    { title: 'Implementar SG-SST', description: 'Liderar la implementación y mantenimiento del Sistema de Gestión de Seguridad y Salud en el Trabajo.', mandatory: true },
    { title: 'Mantener documentación', description: 'Gestionar y mantener actualizada la documentación del SG-SST.', mandatory: true },
    { title: 'Coordinar capacitaciones', description: 'Planificar y coordinar las capacitaciones en seguridad y salud en el trabajo.', mandatory: true },
    { title: 'Actualizar matriz legal', description: 'Mantener actualizada la matriz de requisitos legales aplicables al SG-SST.', mandatory: true },
    { title: 'Gestionar indicadores', description: 'Definir, medir y reportar los indicadores de gestión del SG-SST.', mandatory: true },
    { title: 'Gestionar auditorías', description: 'Coordinar las auditorías internas y externas del SG-SST.', mandatory: true },
    { title: 'Coordinar COPASST', description: 'Brindar apoyo técnico al COPASST para el cumplimiento de sus funciones.', mandatory: true },
    { title: 'Coordinar comité convivencia', description: 'Brindar apoyo técnico al Comité de Convivencia Laboral.', mandatory: true },
    { title: 'Gestionar acciones correctivas', description: 'Hacer seguimiento a las acciones correctivas y preventivas del SG-SST.', mandatory: true },
  ],
  TRABAJADORES: [
    { title: 'Cumplir normas SST', description: 'Cumplir con las normas, procedimientos y reglamentos de seguridad y salud en el trabajo.', mandatory: true },
    { title: 'Usar EPP', description: 'Utilizar adecuadamente los Elementos de Protección Personal asignados.', mandatory: true },
    { title: 'Participar en capacitaciones', description: 'Asistir y participar activamente en las capacitaciones programadas en SST.', mandatory: true },
    { title: 'Reportar condiciones inseguras', description: 'Reportar inmediatamente las condiciones inseguras identificadas en el lugar de trabajo.', mandatory: true },
    { title: 'Reportar incidentes', description: 'Reportar todos los incidentes, accidentes y near-misses ocurridos.', mandatory: true },
    { title: 'Participar en simulacros', description: 'Participar activamente en los simulacros de emergencia programados.', mandatory: true },
  ],
  COPASST: [
    { title: 'Participar en reuniones', description: 'Asistir a las reuniones ordinarias y extraordinarias del COPASST.', mandatory: true },
    { title: 'Realizar inspecciones', description: 'Realizar inspecciones periódicas de seguridad en las áreas de trabajo.', mandatory: true },
    { title: 'Investigar incidentes', description: 'Participar en la investigación de incidentes y accidentes de trabajo.', mandatory: true },
    { title: 'Promover SST', description: 'Promover la cultura de prevención y seguridad entre los trabajadores.', mandatory: true },
    { title: 'Hacer seguimiento a acciones', description: 'Hacer seguimiento a las recomendaciones y acciones derivadas del COPASST.', mandatory: true },
  ],
  COMITE_CONVIVENCIA: [
    { title: 'Gestionar casos convivencia', description: 'Recibir, tramitar y resolver los casos relacionados con convivencia laboral.', mandatory: true },
    { title: 'Promover ambiente laboral sano', description: 'Promover un ambiente laboral sano y libre de acoso laboral.', mandatory: true },
    { title: 'Mantener confidencialidad', description: 'Garantizar la confidencialidad de los casos recibidos y tramitados.', mandatory: true },
    { title: 'Realizar seguimiento a casos', description: 'Realizar seguimiento periódico a los casos gestionados por el comité.', mandatory: true },
  ],
  BRIGADA_EMERGENCIAS: [
    { title: 'Participar en simulacros', description: 'Participar activamente en la planificación y ejecución de simulacros de emergencia.', mandatory: true },
    { title: 'Atender emergencias', description: 'Atender y responder ante situaciones de emergencia en la organización.', mandatory: true },
    { title: 'Apoyar evacuaciones', description: 'Apoyar los procesos de evacuación y desplazamiento seguro del personal.', mandatory: true },
    { title: 'Revisar equipos emergencia', description: 'Realizar inspección periódica de los equipos de emergencia disponibles.', mandatory: true },
    { title: 'Participar en entrenamientos', description: 'Asistir a los entrenamientos y capacitaciones programadas para la brigada.', mandatory: true },
  ],
};

@Injectable()
export class ResponsibilityMatrixService {
  constructor(
    @InjectModel(ResponsibilityMatrix.name)
    private readonly matrixModel: Model<ResponsibilityMatrixDocument>,
    @InjectModel(ResponsibilityAcceptance.name)
    private readonly acceptanceModel: Model<ResponsibilityAcceptanceDocument>,
    private readonly campaignService: WorkerSignatureCampaignService,
  ) {}

  async getOrCreate(companyId: Types.ObjectId): Promise<ResponsibilityMatrixDocument> {
    return this.matrixModel.findOneAndUpdate(
      { companyId, itemCode: '1.1.2' },
      { $setOnInsert: { companyId, itemCode: '1.1.2' } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).exec();
  }

  async generate(companyId: Types.ObjectId, dto: GenerateMatrixDto, userEmail: string): Promise<ResponsibilityMatrixDocument> {
    const record = await this.getOrCreate(companyId);
    const groupsToGenerate = dto.groups?.length ? dto.groups : Object.keys(DEFAULT_RESPONSIBILITIES);
    const generatedItems: ResponsibilityItem[] = [];
    let order = 0;

    for (const group of groupsToGenerate) {
      const defaults = DEFAULT_RESPONSIBILITIES[group];
      if (!defaults) continue;
      for (const item of defaults) {
        generatedItems.push({
          title: item.title,
          description: item.description,
          group,
          order: order++,
          active: true,
          mandatory: item.mandatory,
          status: 'PENDING',
        } as ResponsibilityItem);
      }
    }

    // Merge with existing items that are not in generated groups
    const existingItems = (record.items ?? []).filter((existing) => !groupsToGenerate.includes(existing.group));
    record.items = [...existingItems, ...generatedItems];
    record.auditHistory.push({
      action: 'GENERATE',
      userEmail,
      createdAt: new Date(),
      field: 'items',
      oldValue: `${record.items.length - generatedItems.length} items`,
      newValue: `${record.items.length} items`,
    });
    record.complianceStatus = MatrixComplianceStatus.PENDING;
    record.complianceReason = 'Responsabilidades generadas. Pendiente de aprobación.';
    return record.save();
  }

  async updateItem(companyId: Types.ObjectId, itemId: string, dto: UpdateItemDto, userEmail: string): Promise<ResponsibilityMatrixDocument> {
    const record = await this.getOrCreate(companyId);
    const index = record.items.findIndex((item) => (item as any)._id?.toString() === itemId);
    if (index < 0) throw new BadRequestException('Item no encontrado');

    const oldItem = record.items[index];
    const updates: Record<string, string> = {};
    if (dto.title !== undefined) { updates.title = dto.title; (record.items[index] as any).title = dto.title; }
    if (dto.description !== undefined) { updates.description = dto.description; (record.items[index] as any).description = dto.description; }
    if (dto.active !== undefined) { updates.active = String(dto.active); (record.items[index] as any).active = dto.active; }
    if (dto.mandatory !== undefined) { updates.mandatory = String(dto.mandatory); (record.items[index] as any).mandatory = dto.mandatory; }
    if (dto.order !== undefined) { updates.order = String(dto.order); (record.items[index] as any).order = dto.order; }
    if (dto.status !== undefined) { updates.status = dto.status; (record.items[index] as any).status = dto.status; }
    if (dto.assignedEmployeeId !== undefined) { updates.assignedEmployeeId = dto.assignedEmployeeId; (record.items[index] as any).assignedEmployeeId = new Types.ObjectId(dto.assignedEmployeeId); }
    if (dto.assignedEmployeeName !== undefined) { updates.assignedEmployeeName = dto.assignedEmployeeName; (record.items[index] as any).assignedEmployeeName = dto.assignedEmployeeName; }

    for (const [field, newValue] of Object.entries(updates)) {
      const oldValue = String((oldItem as any)[field] ?? '');
      if (oldValue !== newValue) {
        record.auditHistory.push({
          action: 'EDIT',
          userEmail,
          createdAt: new Date(),
          field: `items.${index}.${field}`,
          oldValue,
          newValue,
        });
      }
    }
    return record.save();
  }

  async addItem(companyId: Types.ObjectId, dto: ResponsibilityItemDto, userEmail: string): Promise<ResponsibilityMatrixDocument> {
    const record = await this.getOrCreate(companyId);
    const maxOrder = record.items.reduce((max, item) => Math.max(max, item.order ?? 0), 0);
    record.items.push({
      title: dto.title,
      description: dto.description ?? '',
      group: dto.group,
      order: dto.order ?? maxOrder + 1,
      active: dto.active ?? true,
      mandatory: dto.mandatory ?? false,
      status: dto.status ?? 'PENDING',
      assignedEmployeeId: dto.assignedEmployeeId ? new Types.ObjectId(dto.assignedEmployeeId) : undefined,
      assignedEmployeeName: dto.assignedEmployeeName,
    } as ResponsibilityItem);
    record.auditHistory.push({
      action: 'CREATE',
      userEmail,
      createdAt: new Date(),
      field: `items.${record.items.length - 1}.title`,
      oldValue: '',
      newValue: dto.title,
    });
    return record.save();
  }

  async deleteItem(companyId: Types.ObjectId, itemId: string, userEmail: string): Promise<ResponsibilityMatrixDocument> {
    const record = await this.getOrCreate(companyId);
    const index = record.items.findIndex((item) => (item as any)._id?.toString() === itemId);
    if (index < 0) throw new BadRequestException('Item no encontrado');
    const deleted = record.items[index];
    record.items.splice(index, 1);
    record.auditHistory.push({
      action: 'DELETE',
      userEmail,
      createdAt: new Date(),
      field: `items.${index}.title`,
      oldValue: deleted.title,
      newValue: '',
    });
    return record.save();
  }

  async duplicateItem(companyId: Types.ObjectId, itemId: string, userEmail: string): Promise<ResponsibilityMatrixDocument> {
    const record = await this.getOrCreate(companyId);
    const index = record.items.findIndex((item) => (item as any)._id?.toString() === itemId);
    if (index < 0) throw new BadRequestException('Item no encontrado');
    const source = record.items[index];
    const maxOrder = record.items.reduce((max, item) => Math.max(max, item.order ?? 0), 0);
    record.items.push({
      title: `${source.title} (copia)`,
      description: source.description,
      group: source.group,
      order: maxOrder + 1,
      active: source.active,
      mandatory: source.mandatory,
      status: 'PENDING',
    } as ResponsibilityItem);
    record.auditHistory.push({
      action: 'DUPLICATE',
      userEmail,
      createdAt: new Date(),
      field: `items.${record.items.length - 1}.title`,
      oldValue: '',
      newValue: `${source.title} (copia)`,
    });
    return record.save();
  }

  async reorderItems(companyId: Types.ObjectId, dto: ReorderItemsDto, userEmail: string): Promise<ResponsibilityMatrixDocument> {
    const record = await this.getOrCreate(companyId);
    for (const { _id, order } of dto.order) {
      const item = record.items.find((i) => (i as any)._id?.toString() === _id);
      if (item) item.order = order;
    }
    record.auditHistory.push({
      action: 'REORDER',
      userEmail,
      createdAt: new Date(),
      field: 'items.order',
      oldValue: '',
      newValue: `${dto.order.length} items reordered`,
    });
    return record.save();
  }

  async submitForApproval(companyId: Types.ObjectId, userEmail: string): Promise<ResponsibilityMatrixDocument> {
    const record = await this.getOrCreate(companyId);
    if (!record.items.length) throw new BadRequestException('No hay responsabilidades para aprobar.');
    record.approvalStatus = MatrixApprovalStatus.PENDING_APPROVAL;
    record.auditHistory.push({
      action: 'SUBMIT_APPROVAL',
      userEmail,
      createdAt: new Date(),
      field: 'approvalStatus',
      oldValue: MatrixApprovalStatus.DRAFT,
      newValue: MatrixApprovalStatus.PENDING_APPROVAL,
    });
    return record.save();
  }

  // ==================== CAMPAIGN INTEGRATION ====================

  private async autoCreateSignatureCampaign(companyId: Types.ObjectId, matrix: ResponsibilityMatrixDocument, userEmail: string) {
    try {
      // Collect all unique assigned employees from all items
      const assignedEmployees = new Map<string, { name: string; employeeId: string }>();
      for (const item of matrix.items) {
        if (item.assignedEmployeeId && item.assignedEmployeeName) {
          const key = item.assignedEmployeeId.toString();
          if (!assignedEmployees.has(key)) {
            assignedEmployees.set(key, {
              employeeId: item.assignedEmployeeId.toString(),
              name: item.assignedEmployeeName,
            });
          }
        }
      }

      if (assignedEmployees.size === 0) {
        matrix.complianceReason = 'Matriz aprobada. Sin empleados asignados para campaña de firmas.';
        return null;
      }

      // Create campaign
      const version = `1.${matrix.versions.length}`;
      const campaign = await this.campaignService.create(companyId, {
        name: `Responsabilidades SG-SST v${version}`,
        description: 'Campaña automática de firma de responsabilidades generada al aprobar la matriz.',
        documentType: 'RESPONSABILIDADES_SST',
        documentVersion: version,
        documentContent: this.generateCampaignDocumentContent(matrix),
        sourceModule: 'RESPONSIBILITY_MATRIX',
        sourceEntityId: matrix._id.toString(),
        requireOtp: false,
        requireSignature: true,
        requirePdfAcceptance: false,
        reminderDays: [30, 15, 5, 1],
      }, userEmail);

      // Add workers from assigned employees
      const workers = Array.from(assignedEmployees.values()).map((emp) => ({
        employeeId: emp.employeeId,
        name: emp.name,
        identification: emp.employeeId, // Use the ID as identification since we don't have document # here
        position: '',
        area: '',
      }));

      if (workers.length > 0) {
        await this.campaignService.addWorkers(companyId, campaign._id.toString(), { workers }, userEmail);

        // Activate the campaign (generates tokens)
        await this.campaignService.updateStatus(companyId, campaign._id.toString(), { status: CampaignStatus.ACTIVE }, userEmail);

        // Update matrix with campaign reference
        matrix.campaignId = campaign._id;
        matrix.complianceReason = `Matriz aprobada. Campaña de firmas creada con ${workers.length} trabajador(es).`;
        await matrix.save();

        return campaign;
      }

      return null;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.error('Error auto-creating signature campaign:', errorMsg);
      matrix.complianceReason = 'Matriz aprobada. Error al crear campaña de firmas: ' + errorMsg;
      await matrix.save();
      return null;
    }
  }

  private generateCampaignDocumentContent(matrix: ResponsibilityMatrixDocument): string {
    let content = 'RESPONSABILIDADES EN SEGURIDAD Y SALUD EN EL TRABAJO\n\n';
    content += `Versión: ${matrix.currentVersionNumber}\n`;
    content += `Aprobada por: ${matrix.approvedByEmail || 'N/A'}\n`;
    content += `Aprobada el: ${matrix.approvedAt ? new Date(matrix.approvedAt).toISOString().slice(0, 10) : 'N/A'}\n\n`;
    content += '================================================================================\n\n';

    const groups: Record<string, ResponsibilityItem[]> = {};
    for (const item of matrix.items) {
      if (!item.active) continue;
      if (!groups[item.group]) groups[item.group] = [];
      groups[item.group].push(item);
    }

    for (const [group, items] of Object.entries(groups)) {
      content += `=== ${group} ===\n`;
      for (const item of items) {
        content += `  • ${item.title}\n`;
        if (item.description) content += `    ${item.description}\n`;
        if (item.assignedEmployeeName) content += `    Asignado a: ${item.assignedEmployeeName}\n`;
        content += '\n';
      }
    }

    return content;
  }

  async approve(companyId: Types.ObjectId, dto: ApproveMatrixDto, userEmail: string): Promise<ResponsibilityMatrixDocument> {
    const record = await this.getOrCreate(companyId);
    if (record.approvalStatus !== MatrixApprovalStatus.PENDING_APPROVAL) {
      throw new BadRequestException('La matriz no está pendiente de aprobación.');
    }
    record.approvalStatus = MatrixApprovalStatus.APPROVED;
    record.approvedByEmail = dto.approvedByEmail;
    record.approvedAt = new Date();
    record.complianceStatus = MatrixComplianceStatus.COMPLIES;
    record.complianceReason = 'Matriz de responsabilidades aprobada.';

    // Create version snapshot
    const versionLabel = `1.${record.versions.length}`;
    record.versions.push({
      version: versionLabel,
      createdAt: new Date(),
      createdByEmail: userEmail,
      approvedByEmail: dto.approvedByEmail,
      approvedAt: new Date(),
      status: 'APPROVED',
      items: [],
    });
    record.currentVersionNumber = record.versions.length;

    // Lock the matrix
    record.lockedAt = new Date();

    record.auditHistory.push({
      action: 'APPROVE',
      userEmail,
      createdAt: new Date(),
      field: 'approvalStatus',
      oldValue: MatrixApprovalStatus.PENDING_APPROVAL,
      newValue: MatrixApprovalStatus.APPROVED,
    });

    // Save first to get the record saved
    const saved = await record.save();

    // Auto-create signature campaign after approval
    await this.autoCreateSignatureCampaign(companyId, saved, userEmail);

    return saved;
  }

  async archive(companyId: Types.ObjectId, userEmail: string): Promise<ResponsibilityMatrixDocument> {
    const record = await this.getOrCreate(companyId);
    record.approvalStatus = MatrixApprovalStatus.ARCHIVED;
    record.auditHistory.push({
      action: 'ARCHIVE',
      userEmail,
      createdAt: new Date(),
      field: 'approvalStatus',
      oldValue: record.approvalStatus,
      newValue: MatrixApprovalStatus.ARCHIVED,
    });
    return record.save();
  }

  async createVersion(companyId: Types.ObjectId, dto: VersionSnapshotDto, userEmail: string): Promise<ResponsibilityMatrixDocument> {
    const record = await this.getOrCreate(companyId);
    const versionLabel = dto.versionLabel ?? `${record.currentVersionNumber + 1}.0`;
    record.versions.push({
      version: versionLabel,
      createdAt: new Date(),
      createdByEmail: userEmail,
      status: 'DRAFT',
      items: [],
    });
    record.currentVersionNumber = record.versions.length;
    record.auditHistory.push({
      action: 'CREATE_VERSION',
      userEmail,
      createdAt: new Date(),
      field: 'versions',
      oldValue: `v${record.versions.length - 1}`,
      newValue: `v${record.versions.length}`,
    });
    return record.save();
  }

  async getHistory(companyId: Types.ObjectId) {
    const record = await this.getOrCreate(companyId);
    return record.auditHistory.slice().reverse();
  }

  // ==================== ACCEPTANCE & SIGNATURE FLOW ====================

  async getPendingAcceptances(companyId: Types.ObjectId, userId?: string) {
    const filter: Record<string, unknown> = { companyId, acceptanceStatus: 'PENDING' };
    if (userId) filter.userId = new Types.ObjectId(userId);
    return this.acceptanceModel.find(filter).populate('assignedItemIds').sort({ createdAt: -1 }).exec();
  }

  async getMyAcceptances(companyId: Types.ObjectId, userId: string) {
    return this.acceptanceModel.find({ companyId, userId: new Types.ObjectId(userId) }).populate('assignedItemIds').sort({ createdAt: -1 }).exec();
  }

  async getAcceptanceStats(companyId: Types.ObjectId) {
    const total = await this.acceptanceModel.countDocuments({ companyId }).exec();
    const pending = await this.acceptanceModel.countDocuments({ companyId, acceptanceStatus: 'PENDING' }).exec();
    const accepted = await this.acceptanceModel.countDocuments({ companyId, acceptanceStatus: 'ACCEPTED' }).exec();
    const rejected = await this.acceptanceModel.countDocuments({ companyId, acceptanceStatus: 'REJECTED' }).exec();
    const reviewed = await this.acceptanceModel.countDocuments({ companyId, acceptanceStatus: 'REVIEWED' }).exec();
    const expired = await this.acceptanceModel.countDocuments({ companyId, acceptanceStatus: 'EXPIRED' }).exec();
    return { total, pending, accepted, rejected, reviewed, expired };
  }

  async assignResponsibilitiesBatch(companyId: Types.ObjectId, dto: AssignResponsibilityBatchDto, userEmail: string) {
    const matrix = await this.getOrCreate(companyId);
    const version = dto.matrixVersion ?? `1.${matrix.versions.length}`;
    const created: ResponsibilityAcceptanceDocument[] = [];

    for (const assignment of dto.assignments) {
      let record = await this.acceptanceModel.findOne({
        companyId,
        userId: new Types.ObjectId(assignment.userId),
        matrixVersion: version,
      }).exec();

      if (record) {
        // Update existing assignment
        const existingIds = record.assignedItemIds.map((id) => id.toString());
        const newIds = assignment.assignedItemIds.filter((id) => !existingIds.includes(id));
        record.assignedItemIds = [...record.assignedItemIds, ...newIds.map((id) => new Types.ObjectId(id))];
        record.auditHistory.push({
          action: 'REASSIGN', userEmail, createdAt: new Date(),
          field: 'assignedItemIds', oldValue: `${existingIds.length} items`, newValue: `${record.assignedItemIds.length} items`,
        } as AcceptanceHistoryEntry);
      } else {
        record = await this.acceptanceModel.create({
          companyId,
          matrixItemCode: '1.1.2',
          matrixVersion: version,
          userId: new Types.ObjectId(assignment.userId),
          userEmail: assignment.userEmail,
          userName: assignment.userName,
          userRole: assignment.userRole,
          assignedItemIds: assignment.assignedItemIds.map((id) => new Types.ObjectId(id)),
          acceptanceStatus: 'PENDING',
          matrixId: matrix._id,
          auditHistory: [{ action: 'ASSIGN', userEmail, createdAt: new Date(), field: 'status', oldValue: '', newValue: 'PENDING' }] as AcceptanceHistoryEntry[],
        });
      }
      created.push(record);
    }
    return created;
  }

  async acceptResponsibilities(companyId: Types.ObjectId, dto: AcceptResponsibilityDto, userEmail: string) {
    const record = await this.acceptanceModel.findOne({
      companyId,
      userId: new Types.ObjectId(dto.userId),
      acceptanceStatus: { $in: ['PENDING', 'REVIEWED'] },
    }).exec();
    if (!record) throw new BadRequestException('No hay asignaciones pendientes para este usuario.');

    const signedAt = new Date();
    const signatureHash = createHash('sha256')
      .update(`${record._id}:${dto.userEmail}:${signedAt.toISOString()}:${dto.hasRead}:${dto.signatureHash || 'manual'}`)
      .digest('hex');

    record.hasRead = dto.hasRead;
    record.acceptanceStatus = 'ACCEPTED';
    record.acceptedAt = signedAt;
    record.signature = {
      signedBy: dto.userName,
      signedByEmail: dto.userEmail,
      signedAt,
      ipAddress: dto.ipAddress,
      device: dto.device,
      signatureHash,
      signatureUrl: dto.signatureUrl,
    };

    // Set renewal date to 12 months from now
    const renewalDate = new Date(signedAt);
    renewalDate.setFullYear(renewalDate.getFullYear() + 1);
    record.renewalRequiredAt = renewalDate;
    record.requiresRenewal = false;

    record.auditHistory.push({
      action: 'ACCEPT', userEmail, createdAt: signedAt,
      field: 'acceptanceStatus', oldValue: record.acceptanceStatus, newValue: 'ACCEPTED',
    } as AcceptanceHistoryEntry);
    return record.save();
  }

  async rejectResponsibilities(companyId: Types.ObjectId, dto: RejectResponsibilityDto, userEmail: string) {
    const record = await this.acceptanceModel.findOne({
      companyId,
      userId: new Types.ObjectId(dto.userId),
      acceptanceStatus: { $in: ['PENDING', 'REVIEWED'] },
    }).exec();
    if (!record) throw new BadRequestException('No hay asignaciones pendientes para este usuario.');

    record.acceptanceStatus = 'REJECTED';
    record.rejectedAt = new Date();
    record.rejectedReason = dto.reason;
    record.auditHistory.push({
      action: 'REJECT', userEmail, createdAt: new Date(),
      field: 'acceptanceStatus', oldValue: record.acceptanceStatus, newValue: 'REJECTED',
    } as AcceptanceHistoryEntry);
    return record.save();
  }

  async requestCorrection(companyId: Types.ObjectId, dto: RequestCorrectionDto, userEmail: string) {
    const record = await this.acceptanceModel.findOne({
      companyId,
      userId: new Types.ObjectId(dto.userId),
      acceptanceStatus: { $in: ['PENDING', 'REVIEWED'] },
    }).exec();
    if (!record) throw new BadRequestException('No hay asignaciones pendientes para este usuario.');

    record.reviewRequests.push({
      type: 'CORRECTION',
      comment: dto.comment,
      requestedAt: new Date(),
      requestedBy: dto.userEmail,
      requestedByEmail: dto.userEmail,
      status: 'PENDING',
    });
    record.acceptanceStatus = 'REJECTED';
    record.rejectedReason = `Solicita corrección: ${dto.comment}`;
    record.auditHistory.push({
      action: 'REQUEST_CORRECTION', userEmail, createdAt: new Date(),
      field: 'acceptanceStatus', oldValue: record.acceptanceStatus, newValue: 'REJECTED',
    } as AcceptanceHistoryEntry);
    return record.save();
  }

  async resolveCorrection(companyId: Types.ObjectId, userId: string, dto: { resolution?: string }, userEmail: string) {
    const record = await this.acceptanceModel.findOne({
      companyId,
      userId: new Types.ObjectId(userId),
      acceptanceStatus: 'REJECTED',
    }).exec();
    if (!record) throw new BadRequestException('No hay solicitudes de corrección pendientes.');

    const pendingRequest = record.reviewRequests.find((r) => r.status === 'PENDING');
    if (pendingRequest) {
      pendingRequest.status = 'RESOLVED';
      pendingRequest.resolvedAt = new Date();
      pendingRequest.resolvedBy = userEmail;
    }
    record.acceptanceStatus = 'PENDING';
    record.rejectedReason = '';
    record.auditHistory.push({
      action: 'CORRECTION_RESOLVED', userEmail, createdAt: new Date(),
      field: 'acceptanceStatus', oldValue: 'REJECTED', newValue: 'PENDING',
    } as AcceptanceHistoryEntry);
    return record.save();
  }

  async createAcceptanceCycle(companyId: Types.ObjectId, dto: CreateAcceptanceCycleDto, userEmail: string) {
    const matrix = await this.getOrCreate(companyId);
    const version = dto.matrixVersion ?? `1.${matrix.versions.length}`;
    const now = new Date();
    const renewalDate = new Date(now);
    renewalDate.setFullYear(renewalDate.getFullYear() + 1);

    // Mark existing pending acceptances as expired
    await this.acceptanceModel.updateMany(
      { companyId, acceptanceStatus: 'PENDING' },
      { $set: { acceptanceStatus: 'EXPIRED', requiresRenewal: true } },
    ).exec();

    return { version, cycleStarted: now, renewalDate };
  }

  async getPendingReminders(companyId: Types.ObjectId) {
    const now = new Date();
    const acceptances = await this.acceptanceModel.find({
      companyId,
      acceptanceStatus: { $in: ['PENDING', 'REVIEWED'] },
    }).exec();

    const reminders: Array<{ acceptance: ResponsibilityAcceptanceDocument; daysOverdue: number }> = [];
    for (const acc of acceptances) {
      const accCreatedAt = (acc as any).createdAt ? new Date((acc as any).createdAt) : null;
      if (accCreatedAt) {
        const daysSinceCreation = Math.floor((now.getTime() - accCreatedAt.getTime()) / 86_400_000);
        if ([30, 15, 5, 1].includes(daysSinceCreation)) {
          reminders.push({ acceptance: acc, daysOverdue: daysSinceCreation });
        }
      }
    }
    return reminders;
  }

  async getAcceptanceHistory(companyId: Types.ObjectId, acceptanceId?: string) {
    if (acceptanceId) {
      const record = await this.acceptanceModel.findById(acceptanceId).exec();
      return record?.auditHistory?.slice().reverse() ?? [];
    }
    return this.acceptanceModel.find({ companyId }).sort({ createdAt: -1 }).populate('assignedItemIds').exec();
  }

  async getComplianceStatus(companyId: Types.ObjectId) {
    const matrix = await this.getOrCreate(companyId);
    const stats = await this.getAcceptanceStats(companyId);

    if (matrix.approvalStatus !== MatrixApprovalStatus.APPROVED) {
      return { status: MatrixComplianceStatus.PENDING, reason: 'La matriz no ha sido aprobada.', stats };
    }

    // Check campaign completion if a campaign exists
    if (matrix.campaignId) {
      try {
        const campaignStats = await this.campaignService.getCampaignStats(matrix.campaignId);
        if (campaignStats.totalWorkers > 0 && campaignStats.signed >= campaignStats.totalWorkers) {
          return {
            status: MatrixComplianceStatus.COMPLIES,
            reason: `Todos los ${campaignStats.totalWorkers} trabajadores han firmado sus responsabilidades.`,
            stats,
            campaignStats,
          };
        }
        if (campaignStats.signed > 0) {
          return {
            status: MatrixComplianceStatus.PENDING,
            reason: `${campaignStats.signed} de ${campaignStats.totalWorkers} trabajadores han firmado. Pendientes: ${campaignStats.pending}.`,
            stats,
            campaignStats,
          };
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        console.error('Error checking campaign stats:', errorMsg);
      }
    }

    if (stats.total === 0) {
      return { status: MatrixComplianceStatus.PENDING, reason: 'No hay responsabilidades asignadas a usuarios.', stats };
    }

    if (stats.pending > 0 || stats.reviewed > 0) {
      return { status: MatrixComplianceStatus.PENDING, reason: `${stats.pending} usuario(s) tienen firmas pendientes.`, stats };
    }

    if (stats.accepted > 0) {
      return { status: MatrixComplianceStatus.COMPLIES, reason: `${stats.accepted} usuario(s) han aceptado y firmado sus responsabilidades.`, stats };
    }

    return { status: MatrixComplianceStatus.PENDING, reason: 'Pendiente de aceptación por los usuarios.', stats };
  }

  // ==================== CAMPAIGN INFO ====================

  async getCampaignInfo(companyId: Types.ObjectId) {
    const matrix = await this.getOrCreate(companyId);
    if (!matrix.campaignId) {
      return { hasCampaign: false, message: 'No hay campaña de firmas activa. Aprobá la matriz para generar una.' };
    }

    try {
      const campaign = await this.campaignService.findById(companyId, matrix.campaignId.toString());
      const workers = await this.campaignService.getWorkers(companyId, matrix.campaignId.toString());
      return {
        hasCampaign: true,
        campaign,
        workers,
        stats: (campaign as any).stats,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      return { hasCampaign: false, message: 'Error al obtener información de la campaña: ' + errorMsg };
    }
  }

  async processRenewals(companyId: Types.ObjectId) {
    const now = new Date();
    const expired = await this.acceptanceModel.find({
      companyId,
      acceptanceStatus: 'ACCEPTED',
      renewalRequiredAt: { $lte: now },
    }).exec();

    for (const record of expired) {
      record.acceptanceStatus = 'EXPIRED';
      record.requiresRenewal = true;
      record.auditHistory.push({
        action: 'RENEWAL_REQUIRED',
        userEmail: record.userEmail,
        createdAt: new Date(),
        field: 'acceptanceStatus',
        oldValue: 'ACCEPTED',
        newValue: 'EXPIRED',
      } as AcceptanceHistoryEntry);
      await record.save();
    }
    return { renewed: expired.length };
  }

  async getAcceptanceForUser(companyId: Types.ObjectId, userId: string) {
    const record = await this.acceptanceModel.findOne({
      companyId,
      userId: new Types.ObjectId(userId),
      acceptanceStatus: { $ne: 'EXPIRED' },
    }).populate('assignedItemIds').sort({ createdAt: -1 }).exec();

    if (!record) return null;

    // Enrich with matrix info
    const matrix = await this.matrixModel.findById(record.matrixId).exec();
    return {
      acceptance: record,
      matrix: matrix ? {
        approvalStatus: matrix.approvalStatus,
        approvedByEmail: matrix.approvedByEmail,
        approvedAt: matrix.approvedAt,
        items: matrix.items.filter((item) => record.assignedItemIds.some((id) => id.toString() === (item as any)._id?.toString())),
      } : null,
    };
  }
}
