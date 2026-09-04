import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AutoCommunicationService } from '../communication/auto-communication.service';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { UpdateIncidentDto } from './dto/update-incident.dto';
import { Incident, IncidentDocument, InvestigationType } from './schemas/incident.schema';

/**
 * Estadísticas agregadas de investigación de enfermedades laborales (3.2.2).
 *
 * Solo contiene datos agregados: conteos, porcentajes, métricas temporales.
 * NO contiene employeeId, nombres, descripciones individuales ni datos clínicos.
 */
export interface DiseaseInvestigationStats {
  /** Cantidad total de investigaciones DISEASE. */
  totalInvestigations: number;

  /** Investigaciones pendientes (sin closureDate y status no cerrado). */
  pendingInvestigations: number;

  /** Investigaciones formalmente cerradas (con closureDate válido). */
  closedInvestigations: number;

  /** Investigaciones con investigationDate definida (investigación formal iniciada). */
  investigationsWithFormalResearch: number;

  /** Investigaciones sin investigationDate definida. */
  investigationsWithoutFormalResearch: number;

  /** Investigaciones con al menos una causa básica registrada. */
  investigationsWithRootCauses: number;

  /** Investigaciones con al menos una causa inmediata registrada. */
  investigationsWithImmediateCauses: number;

  /** Investigaciones con al menos un factor relacionado registrado. */
  investigationsWithRelatedFactors: number;

  /** Investigaciones con al menos una acción correctiva registrada. */
  investigationsWithCorrectiveActions: number;

  /** Investigaciones con al menos una acción preventiva registrada. */
  investigationsWithPreventiveActions: number;

  /** Investigaciones con evidencia documental registrada. */
  investigationsWithEvidence: number;

  /** Investigaciones con responsable asignado. */
  investigationsWithResponsible: number;

  /** Acciones correctivas pendientes (status != COMPLETED). */
  openCorrectiveActions: number;

  /** Acciones correctivas vencidas (dueDate < now y status != COMPLETED). */
  overdueCorrectiveActions: number;

  /** Acciones correctivas completadas. */
  completedCorrectiveActions: number;

  /** Acciones preventivas pendientes (status != COMPLETED). */
  openPreventiveActions: number;

  /** Acciones preventivas vencidas (dueDate < now y status != COMPLETED). */
  overduePreventiveActions: number;

  /** Acciones preventivas completadas. */
  completedPreventiveActions: number;

  /** Tiempo promedio de cierre en días (closureDate - investigationDate). 0 si no hay datos. */
  averageClosureDays: number;

  /** Tendencia mensual de investigaciones [{month: 'YYYY-MM', count}]. */
  monthlyTrend: Array<{ month: string; count: number }>;
}

@Injectable()
export class IncidentsService {
  constructor(
    @InjectModel(Incident.name)
    private readonly incidentModel: Model<IncidentDocument>,
    private readonly autoCommService: AutoCommunicationService,
  ) {}

  async create(companyId: Types.ObjectId, dto: CreateIncidentDto): Promise<Incident> {
    const created = new this.incidentModel({
      ...dto,
      employeeId: new Types.ObjectId(dto.employeeId),
      companyId,
    });

    const saved = await created.save();

    // Auto-generate communication for emergency-type incidents (e.g., emergency drill, serious incident)
    const emergencyTypes = ['EMERGENCIA', 'EMERGENCY', 'INCENDIO', 'FIRE', 'TERREMOTO', 'EARTHQUAKE', 
      'DERRAME', 'SPILL', 'EVACUACION', 'EVACUATION', 'SIMULACRO', 'DRILL', 'ACCIDENTE_GRAVE', 'SERIOUS_ACCIDENT'];
    const incidentType = (dto.type || '').toUpperCase();
    const isEmergency = emergencyTypes.some((et) => incidentType.includes(et));

    if (isEmergency) {
      await this.autoCommService.generateCommunication({
        companyId,
        title: `Aviso de Emergencia: ${dto.type}`,
        body: `Se ha reportado un incidente de tipo "${dto.type}" en la empresa. Descripción: ${dto.description || 'Sin descripción'}. Fecha: ${dto.date || new Date().toISOString().slice(0, 10)}. Por favor tomar las medidas de seguridad correspondientes.`,
        communicationType: 'EMERGENCY_NOTICE',
        priority: 'URGENT',
        targetAudience: 'ALL_COMPANY',
        requiresSignature: false,
        sourceModule: 'EMERGENCY_DRILL',
        sourceEntityId: saved._id.toString(),
      }).catch((err) => {
        console.error('Auto-communication generation failed for emergency:', err.message);
      });
    }

    return saved;
  }

  async findAll(companyId: Types.ObjectId, investigationType?: InvestigationType): Promise<Incident[]> {
    const filter: Record<string, unknown> = { companyId };
    if (investigationType) {
      filter.investigationType = investigationType;
    }
    return this.incidentModel.find(filter).sort({ date: -1, createdAt: -1 }).exec();
  }

  async findOne(id: string, companyId: Types.ObjectId): Promise<Incident> {
    const incident = await this.incidentModel.findOne({ _id: id, companyId }).exec();

    if (!incident) {
      throw new NotFoundException(`Incident with id ${id} not found`);
    }

    return incident;
  }

  async update(id: string, companyId: Types.ObjectId, dto: UpdateIncidentDto): Promise<Incident> {
    const payload = dto.employeeId
      ? { ...dto, employeeId: new Types.ObjectId(dto.employeeId) }
      : dto;

    const incident = await this.incidentModel
      .findOneAndUpdate({ _id: id, companyId }, payload, { new: true, runValidators: true })
      .exec();

    if (!incident) {
      throw new NotFoundException(`Incident with id ${id} not found`);
    }

    return incident;
  }

  async remove(id: string, companyId: Types.ObjectId): Promise<void> {
    const deletedIncident = await this.incidentModel.findOneAndDelete({ _id: id, companyId }).exec();

    if (!deletedIncident) {
      throw new NotFoundException(`Incident with id ${id} not found`);
    }
  }

  // ── Estadísticas de Investigación de Enfermedades Laborales (3.2.2) ──

  /**
   * Calcula estadísticas agregadas de investigaciones de enfermedades laborales.
   *
   * Filtra exclusivamente investigaciones con investigationType = DISEASE.
   * NO acepta companyId arbitrario: siempre utiliza el del tenant autenticado.
   * NO devuelve registros individuales, employeeId, nombres ni datos clínicos.
   */
  async getDiseaseInvestigationStats(companyId: Types.ObjectId): Promise<DiseaseInvestigationStats> {
    const diseases = await this.incidentModel
      .find({
        companyId,
        investigationType: InvestigationType.DISEASE,
      })
      .sort({ date: -1 })
      .exec();

    const now = new Date();
    const CLOSED_STATUS = 'Cerrado';

    // ── Casos investigados ──
    const totalInvestigations = diseases.length;

    // ── Pendientes vs Cerrados ──
    const closedInvestigations = diseases.filter((d) => d.closureDate != null).length;
    const pendingInvestigations = totalInvestigations - closedInvestigations;

    // ── Investigación formal ──
    const investigationsWithFormalResearch = diseases.filter((d) => d.investigationDate != null).length;
    const investigationsWithoutFormalResearch = totalInvestigations - investigationsWithFormalResearch;

    // ── Calidad de investigación (conteos) ──
    const investigationsWithRootCauses = diseases.filter((d) => (d.rootCauses?.length ?? 0) > 0).length;
    const investigationsWithImmediateCauses = diseases.filter((d) => (d.immediateCauses?.length ?? 0) > 0).length;
    const investigationsWithRelatedFactors = diseases.filter((d) => (d.relatedFactors?.length ?? 0) > 0).length;
    const investigationsWithCorrectiveActions = diseases.filter((d) => (d.correctiveActions?.length ?? 0) > 0).length;
    const investigationsWithPreventiveActions = diseases.filter((d) => (d.preventiveActions?.length ?? 0) > 0).length;
    const investigationsWithEvidence = diseases.filter((d) => (d.evidence?.length ?? 0) > 0).length;
    const investigationsWithResponsible = diseases.filter((d) => d.responsible != null && d.responsible !== '').length;

    // ── Acciones correctivas ──
    let openCorrectiveActions = 0;
    let overdueCorrectiveActions = 0;
    let completedCorrectiveActions = 0;
    for (const disease of diseases) {
      for (const action of disease.correctiveActions ?? []) {
        if (action.status === 'COMPLETED') {
          completedCorrectiveActions++;
        } else {
          openCorrectiveActions++;
          if (action.dueDate != null && action.dueDate.getTime() < now.getTime()) {
            overdueCorrectiveActions++;
          }
        }
      }
    }

    // ── Acciones preventivas ──
    let openPreventiveActions = 0;
    let overduePreventiveActions = 0;
    let completedPreventiveActions = 0;
    for (const disease of diseases) {
      for (const action of disease.preventiveActions ?? []) {
        if (action.status === 'COMPLETED') {
          completedPreventiveActions++;
        } else {
          openPreventiveActions++;
          if (action.dueDate != null && action.dueDate.getTime() < now.getTime()) {
            overduePreventiveActions++;
          }
        }
      }
    }

    // ── Tiempo promedio de cierre ──
    let totalClosureDays = 0;
    let closureCount = 0;
    for (const disease of diseases) {
      if (disease.investigationDate != null && disease.closureDate != null) {
        const diffMs = disease.closureDate.getTime() - disease.investigationDate.getTime();
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays >= 0) {
          totalClosureDays += diffDays;
          closureCount++;
        }
      }
    }
    const averageClosureDays = closureCount > 0 ? Math.round(totalClosureDays / closureCount) : 0;

    // ── Tendencia mensual ──
    const monthlyMap = new Map<string, number>();
    for (const disease of diseases) {
      const dateSource = disease.investigationDate ?? disease.date;
      if (dateSource != null) {
        const key = `${dateSource.getFullYear()}-${String(dateSource.getMonth() + 1).padStart(2, '0')}`;
        monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + 1);
      }
    }
    const monthlyTrend = Array.from(monthlyMap.entries())
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month));

    return {
      totalInvestigations,
      pendingInvestigations,
      closedInvestigations,
      investigationsWithFormalResearch,
      investigationsWithoutFormalResearch,
      investigationsWithRootCauses,
      investigationsWithImmediateCauses,
      investigationsWithRelatedFactors,
      investigationsWithCorrectiveActions,
      investigationsWithPreventiveActions,
      investigationsWithEvidence,
      investigationsWithResponsible,
      openCorrectiveActions,
      overdueCorrectiveActions,
      completedCorrectiveActions,
      openPreventiveActions,
      overduePreventiveActions,
      completedPreventiveActions,
      averageClosureDays,
      monthlyTrend,
    };
  }
}
