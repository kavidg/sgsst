import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Supplier, SupplierDocument, SupplierStatus } from '../../acquisitions/schemas/supplier.schema';
import { Acquisition, AcquisitionDocument, AcquisitionStatus } from '../../acquisitions/schemas/acquisition.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { classifyComplianceLevel } from '../utils/compliance-score';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';

/**
 * Evaluación automática del estándar 2.9.1 "Adquisiciones".
 *
 * Conecta PHVA 2.9.1 con el dominio de Adquisiciones para evaluar:
 * - Existencia de proveedores y adquisiciones
 * - Gestión: proveedores activos, adquisiciones con proveedor, criterios SST
 * - Scoring limitado a datos reales disponibles
 *
 * Scoring:
 * - Nivel 1 — Existencia (30 pts): proveedores, adquisiciones, proveedores activos
 * - Nivel 2 — Gestión (40 pts): ratios de gestión
 * - Total disponible: 70 pts → normalizado a 0-100
 *
 * NO_DATA: sin proveedores Y sin adquisiciones
 * TARGET_MET: percentage >= 90
 * TARGET_NOT_MET: percentage < 90
 */
@Injectable()
export class AcquisitionProvider implements ComplianceProvider {
  /** Meta de cumplimiento — alineada con patrón DocumentEvaluationProvider. */
  private static readonly COMPLIANCE_TARGET = 90;

  /** Puntos máximos disponibles (Nivel 1 + Nivel 2). */
  private static readonly MAX_POINTS = 70;

  constructor(
    @InjectModel(Supplier.name) private supplierModel: Model<SupplierDocument>,
    @InjectModel(Acquisition.name) private acquisitionModel: Model<AcquisitionDocument>,
  ) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const companyObjectId = new Types.ObjectId(companyId);

    // ── Query parallel ──
    const [
      totalSuppliers,
      activeSuppliers,
      totalAcquisitions,
      completedAcquisitions,
      acquisitionsWithSupplier,
      acquisitionsWithSstCriteria,
    ] = await Promise.all([
      this.supplierModel.countDocuments({ companyId: companyObjectId }).exec(),
      this.supplierModel.countDocuments({ companyId: companyObjectId, status: SupplierStatus.ACTIVE }).exec(),
      this.acquisitionModel.countDocuments({ companyId: companyObjectId }).exec(),
      this.acquisitionModel.countDocuments({ companyId: companyObjectId, status: AcquisitionStatus.COMPLETED }).exec(),
      this.acquisitionModel.countDocuments({ companyId: companyObjectId, supplierId: { $exists: true, $ne: null } }).exec(),
      this.acquisitionModel.countDocuments({ companyId: companyObjectId, sstCriteria: { $exists: true, $ne: '' } }).exec(),
    ]);

    // ── NO_DATA ──
    if (totalSuppliers === 0 && totalAcquisitions === 0) {
      return {
        module: 'acquisitions',
        percentage: 0,
        status: 'NO_DATA',
        findings: [
          {
            id: 'acq-no-data',
            module: 'acquisitions',
            title: 'Sin datos de adquisiciones ni proveedores',
            description:
              'No existen proveedores ni adquisiciones registradas. Registrar al menos un proveedor y una adquisición para evaluar el cumplimiento de 2.9.1.',
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

    // ── Nivel 1 — Existencia (30 pts) ──
    let existenceScore = 0;

    // 1.1: al menos un proveedor (10 pts)
    if (totalSuppliers > 0) existenceScore += 10;

    // 1.2: al menos una adquisición (10 pts)
    if (totalAcquisitions > 0) existenceScore += 10;

    // 1.3: al menos un proveedor activo (10 pts)
    if (activeSuppliers > 0) existenceScore += 10;

    // ── Nivel 2 — Gestión (40 pts) ──
    let managementScore = 0;

    // 2.1: proveedores activos / total >= 50% (10 pts)
    if (totalSuppliers > 0) {
      const activeRatio = activeSuppliers / totalSuppliers;
      if (activeRatio >= 0.5) managementScore += 10;
    }

    // 2.2: adquisiciones con proveedor / total >= 70% (10 pts)
    if (totalAcquisitions > 0) {
      const supplierRatio = acquisitionsWithSupplier / totalAcquisitions;
      if (supplierRatio >= 0.7) managementScore += 10;
    }

    // 2.3: adquisiciones con criterios SST / total >= 50% (10 pts)
    if (totalAcquisitions > 0) {
      const sstRatio = acquisitionsWithSstCriteria / totalAcquisitions;
      if (sstRatio >= 0.5) managementScore += 10;
    }

    // 2.4: adquisiciones completadas — proporcional (0-10 pts)
    if (totalAcquisitions > 0) {
      const completedRatio = completedAcquisitions / totalAcquisitions;
      managementScore += Math.round(completedRatio * 10);
    }

    // ── Total & normalización ──
    const rawScore = existenceScore + managementScore;
    const percentage = Math.round((rawScore / AcquisitionProvider.MAX_POINTS) * 100);

    // ── Status ──
    const status =
      totalSuppliers === 0 && totalAcquisitions === 0
        ? 'NO_DATA'
        : percentage >= AcquisitionProvider.COMPLIANCE_TARGET
          ? 'TARGET_MET'
          : 'TARGET_NOT_MET';

    // ── Findings ──
    const findings: ProviderComplianceResult['findings'] = [];

    if (totalSuppliers === 0) {
      findings.push({
        id: 'acq-no-suppliers',
        module: 'acquisitions',
        title: 'Sin proveedores registrados',
        description:
          'No existen proveedores en el sistema. Registrar proveedores para habilitar la gestión de adquisiciones con criterios de SST.',
        priority: FindingPriority.HIGH,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    } else if (activeSuppliers === 0) {
      findings.push({
        id: 'acq-no-active-suppliers',
        module: 'acquisitions',
        title: 'Sin proveedores activos',
        description:
          'Todos los proveedores están inactivos. Activar al menos un proveedor para poder asignarlo a adquisiciones.',
        priority: FindingPriority.HIGH,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    if (totalAcquisitions > 0) {
      const acquisitionsWithoutSupplier = totalAcquisitions - acquisitionsWithSupplier;
      if (acquisitionsWithoutSupplier > 0) {
        findings.push({
          id: 'acq-no-supplier',
          module: 'acquisitions',
          title: `${acquisitionsWithoutSupplier} adquisición(es) sin proveedor asignado`,
          description:
            'Estas adquisiciones no tienen proveedor asignado. Asignar un proveedor activo a cada adquisición para cumplir con 2.9.1.',
          priority: FindingPriority.MEDIUM,
          status: 'OPEN',
          responsible: '',
          dueDate: '',
          createdAt: new Date().toISOString(),
        });
      }

      const acquisitionsWithoutSst = totalAcquisitions - acquisitionsWithSstCriteria;
      if (acquisitionsWithoutSst > 0) {
        findings.push({
          id: 'acq-no-sst-criteria',
          module: 'acquisitions',
          title: `${acquisitionsWithoutSst} adquisición(es) sin criterios SST`,
          description:
            'Estas adquisiciones no tienen criterios de Seguridad y Salud en el Trabajo definidos. El estándar 2.9.1 exige integrar criterios de SST en los procesos de adquisición.',
          priority: FindingPriority.HIGH,
          status: 'OPEN',
          responsible: '',
          dueDate: '',
          createdAt: new Date().toISOString(),
        });
      }

      const incompleteAcquisitions = totalAcquisitions - completedAcquisitions;
      if (incompleteAcquisitions > 0 && completedAcquisitions < totalAcquisitions * 0.5) {
        findings.push({
          id: 'acq-incomplete',
          module: 'acquisitions',
          title: `${incompleteAcquisitions} adquisición(es) sin completar`,
          description:
            'Más del 50% de las adquisiciones no han sido completadas. Hacer seguimiento a las adquisiciones pendientes.',
          priority: FindingPriority.LOW,
          status: 'OPEN',
          responsible: '',
          dueDate: '',
          createdAt: new Date().toISOString(),
        });
      }
    }

    // ── Pending / Completed ──
    const pending = totalAcquisitions - completedAcquisitions;
    const completed = completedAcquisitions;

    return {
      module: 'acquisitions',
      percentage,
      status,
      findings,
      pending,
      completed,
      overdue: 0,
      phases: { do: percentage } as Partial<Record<CompliancePhaseKey, number>>,
    };
  }
}
