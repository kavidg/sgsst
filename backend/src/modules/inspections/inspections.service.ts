import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AlertsService } from '../alerts/alerts.service';
import { AutoCommunicationService } from '../communication/auto-communication.service';
import { AlertSeverity } from '../alerts/schemas/alert.schema';
import { CreateInspectionActivityDto } from './dto/create-inspection-activity.dto';
import { UpdateInspectionActivityDto } from './dto/update-inspection-activity.dto';
import { InspectionActivity, InspectionActivityDocument } from './schemas/inspection-activity.schema';
// NORMALIZACIÓN (auditoría /inspections): el estado canónico vive aquí.
// Leer tolerante (variantes históricas), escribir SIEMPRE canónico.
import {
  INSPECTION_STATUS,
  isInspectionCompleted,
  normalizeInspectionStatus,
  withCanonicalInspectionStatus,
} from './utils/inspection-status.util';

@Injectable()
export class InspectionsService {
  constructor(
    @InjectModel(InspectionActivity.name)
    private readonly inspectionActivityModel: Model<InspectionActivityDocument>,
    private readonly alertsService: AlertsService,
    private readonly autoCommService: AutoCommunicationService,
  ) {}

  async create(companyId: Types.ObjectId, dto: CreateInspectionActivityDto): Promise<InspectionActivity> {
    // NORMALIZACIÓN: 'completed'/'completada'/'ejecutada'/true → 'COMPLETED';
    // 'pendiente'/'pending'/false/ausente → 'PENDING'.
    const created = new this.inspectionActivityModel({
      ...withCanonicalInspectionStatus(dto),
      companyId,
    });
    const saved = await created.save();
    await this.ensureInspectionAlert(saved);
    return saved;
  }

  async findAll(companyId: Types.ObjectId): Promise<InspectionActivity[]> {
    return this.inspectionActivityModel.find({ companyId }).sort({ plannedDate: 1, createdAt: 1 }).exec();
  }

  async findOne(id: string, companyId: Types.ObjectId): Promise<InspectionActivity> {
    const activity = await this.inspectionActivityModel.findOne({ _id: id, companyId }).exec();

    if (!activity) {
      throw new NotFoundException(`Inspection activity with id ${id} not found`);
    }

    return activity;
  }

  async update(
    id: string,
    companyId: Types.ObjectId,
    dto: UpdateInspectionActivityDto,
  ): Promise<InspectionActivity> {
    // NORMALIZACIÓN: el estado canónico se decide en backend, nunca en el
    // cliente. Reglas de transición:
    // - Cualquier variante de completado → 'COMPLETED'.
    // - COMPLETED → PENDING: se limpia completedDate para no dejar el estado
    //   inconsistente "status = PENDING con completedDate antigua".
    // - PENDING → COMPLETED: se respeta el completedDate enviado por el cliente
    //   (comportamiento previo, sin inventar fechas).
    const update: Record<string, unknown> = { ...dto };
    let unset: Record<string, number> | undefined;

    if (dto.status !== undefined) {
      const canonical = normalizeInspectionStatus(dto.status);
      update.status = canonical;
      if (canonical === INSPECTION_STATUS.PENDING) {
        delete update.completedDate;
        unset = { completedDate: 1 };
      }
    }

    const activity = await this.inspectionActivityModel
      .findOneAndUpdate(
        { _id: id, companyId },
        unset ? { $set: update, $unset: unset } : update,
        { new: true, runValidators: true },
      )
      .exec();

    if (!activity) {
      throw new NotFoundException(`Inspection activity with id ${id} not found`);
    }
    await this.ensureInspectionAlert(activity);

    // Auto-generate communication when inspection is completed (audit results)
    if (isInspectionCompleted(activity.status)) {
      await this.autoCommService.generateCommunication({
        companyId,
        title: `Resultados de Inspección: ${activity.title}`,
        body: `Se ha completado la actividad de inspección "${activity.title}". Descripción: ${activity.description || 'Sin descripción'}. Fecha planificada: ${new Date(activity.plannedDate).toISOString().slice(0, 10)}.`,
        communicationType: 'ANNOUNCEMENT',
        priority: 'INFORMATIVE',
        targetAudience: 'ALL_COMPANY',
        requiresSignature: false,
        sourceModule: 'AUDIT_RESULTS',
        sourceEntityId: activity._id.toString(),
      }).catch((err) => {
        console.error('Auto-communication generation failed for inspection:', err.message);
      });
    }

    return activity;
  }


  private async ensureInspectionAlert(activity: InspectionActivity): Promise<void> {
    const isPending = normalizeInspectionStatus(activity.status) === INSPECTION_STATUS.PENDING;
    const isOverdue = isPending && new Date(activity.plannedDate) < new Date();

    if (!isOverdue) {
      return;
    }

    await this.alertsService.createUnique({
      companyId: activity.companyId,
      type: 'INSPECTION',
      message: `La actividad de inspección "${activity.title}" está vencida y sigue pendiente.`,
      severity: AlertSeverity.MEDIUM,
    });
  }

  async remove(id: string, companyId: Types.ObjectId): Promise<void> {
    const deletedActivity = await this.inspectionActivityModel.findOneAndDelete({ _id: id, companyId }).exec();

    if (!deletedActivity) {
      throw new NotFoundException(`Inspection activity with id ${id} not found`);
    }
  }
}
