import { Injectable, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import {
  ConvivenciaComplianceSnapshot,
  ConvivenciaService,
} from '../../convivencia/convivencia.service';
import { FindingDto } from '../dto/finding.dto';
import { FindingPriority } from '../enums/finding-priority.enum';
import { classifyComplianceLevel } from '../utils/compliance-score';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';

/**
 * Cumplimiento del estándar 1.1.8 — Comité de Convivencia Laboral (Fase 3).
 *
 * FUENTE ÚNICA DE VERDAD: el dominio de convivencia (Fase 2). Este provider NO
 * reimplementa la regla de cumplimiento (resolveCompliance): consume el estado
 * real vía ConvivenciaService.getComplianceSnapshot() y lo traduce al contrato
 * del Compliance Intelligence Engine.
 *
 * - `complianceStatus` COMPLIES → percentage 100.
 * - `complianceStatus` NON_COMPLIANT → percentage 0.
 * - `complianceStatus` PENDING → percentage 25/50/75 según las condiciones de
 *   dominio presentes (nunca 100: garantiza que PENDING jamás aparezca como
 *   cumplimiento completo).
 * - `requiresConvivencia === false` (exención) → COMPLIES/100 sin findings.
 *
 * Los findings se derivan de los datos REALES del snapshot (condiciones
 * ausentes, estado de aprobación, estado del periodo, evidencias), sin inventar
 * requisitos normativos. Las recomendaciones las genera el Recommendation
 * Engine centralizado (módulo 'convivencia'), no este provider.
 *
 * Multi-tenancy: TODA consulta pasa por el service de dominio (scoped por
 * companyId). Una empresa sin periodo recibe NotFoundException del dominio →
 * resultado 0 controlado con hallazgo descriptivo (sin filtrar existencia).
 *
 * Lectura pura: NO crea entidades ni persiste nada durante la consulta.
 */
@Injectable()
export class ConvivenciaProvider implements ComplianceProvider {
  constructor(private readonly convivenciaService: ConvivenciaService) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    // El provider NUNCA lanza (contrato): cualquier estado sin datos produce
    // un resultado de cumplimiento 0 con hallazgos descriptivos.
    try {
      const objectId = new Types.ObjectId(companyId);
      const snapshot = await this.convivenciaService.getComplianceSnapshot(objectId);
      return this.buildResult(snapshot);
    } catch (error) {
      // Periodo inexistente (o de otra empresa, que el dominio trata igual):
      // 0 controlado sin revelar existencia entre tenants.
      if (error instanceof NotFoundException) {
        return {
          module: 'convivencia',
          percentage: 0,
          status: classifyComplianceLevel(0),
          findings: [
            this.finding(
              'convivencia-no-period',
              'Periodo del Comité de Convivencia no encontrado',
              'No existe un periodo del Comité de Convivencia Laboral vigente registrado para la empresa (1.1.8).',
              FindingPriority.HIGH,
            ),
          ],
          pending: 1,
          completed: 0,
        };
      }
      // Error de infraestructura (conexión, timeout): resultado 0 controlado
      // que lo deja explícito, sin romper el overview agregado.
      const message = error instanceof Error ? error.message : String(error);
      return {
        module: 'convivencia',
        percentage: 0,
        status: classifyComplianceLevel(0),
        findings: [
          this.finding(
            'convivencia-error',
            'No se pudo calcular el Comité de Convivencia',
            `El módulo 1.1.8 no pudo resolverse para la empresa: ${message}`,
            FindingPriority.HIGH,
          ),
        ],
        pending: 1,
        completed: 0,
      };
    }
  }

  private buildResult(snapshot: ConvivenciaComplianceSnapshot): ProviderComplianceResult {
    const exempt = snapshot.exempt;
    return {
      module: 'convivencia',
      percentage: snapshot.percentage,
      status: classifyComplianceLevel(snapshot.percentage),
      findings: exempt ? [] : this.buildFindings(snapshot),
      // Ítems pendientes/completados: criterios de dominio ausentes/presentes
      // (4 condiciones). Coherente con el porcentaje de progreso.
      pending: exempt ? 0 : snapshot.missingCriteria.length,
      completed: exempt ? 4 : snapshot.metCriteria.length,
    };
  }

  /**
   * Findings reales derivados del snapshot del dominio. Solo describe lo que
   * el estado indica; no inventa obligaciones normativas.
   */
  private buildFindings(snapshot: ConvivenciaComplianceSnapshot): FindingDto[] {
    const findings: FindingDto[] = [];
    const { complianceStatus, periodStatus, approvalStatus, evidenceCount } = snapshot;
    const now = new Date().toISOString();

    if (complianceStatus === 'NON_COMPLIANT') {
      findings.push(
        this.finding(
          'convivencia-not-conformed',
          'Comité de Convivencia no conformado',
          'No existe información funcional registrada del Comité de Convivencia Laboral: no está conformado ni operando (1.1.8).',
          FindingPriority.HIGH,
          now,
        ),
      );
    }

    if (snapshot.missingCriteria.includes('Periodo activo')) {
      findings.push(
        this.finding(
          'convivencia-inactive-period',
          'Periodo del Comité de Convivencia no vigente',
          `El periodo del Comité de Convivencia Laboral no está vigente (estado actual: ${periodStatus}). Renovar o reactivar el periodo (1.1.8).`,
          FindingPriority.HIGH,
          now,
        ),
      );
    }

    if (snapshot.missingCriteria.includes('Comité aprobado')) {
      const rejected = approvalStatus === 'REJECTED';
      findings.push(
        this.finding(
          rejected ? 'convivencia-rejected' : 'convivencia-not-approved',
          rejected
            ? 'Periodo del Comité de Convivencia rechazado'
            : 'Comité de Convivencia pendiente de aprobación',
          rejected
            ? 'La solicitud de aprobación del periodo del Comité de Convivencia fue rechazada. Revisar y corregir antes de reenviar (1.1.8).'
            : 'El periodo del Comité de Convivencia Laboral no está aprobado. Completar el flujo de aprobación (1.1.8).',
          rejected ? FindingPriority.HIGH : FindingPriority.MEDIUM,
          now,
        ),
      );
    }

    if (snapshot.missingCriteria.includes('Miembros conformados')) {
      findings.push(
        this.finding(
          'convivencia-no-members',
          'Comité de Convivencia sin miembros',
          'El Comité de Convivencia Laboral no tiene miembros registrados. Conformar el comité (1.1.8).',
          FindingPriority.HIGH,
          now,
        ),
      );
    }

    if (snapshot.missingCriteria.includes('Reuniones realizadas')) {
      findings.push(
        this.finding(
          'convivencia-no-meetings',
          'Comité de Convivencia sin reuniones realizadas',
          'No hay reuniones CERRADA registradas. Realizar y cerrar al menos una reunión del comité (1.1.8).',
          FindingPriority.MEDIUM,
          now,
        ),
      );
    }

    if (evidenceCount > 0 && complianceStatus !== 'COMPLIES') {
      findings.push(
        this.finding(
          'convivencia-evidence-pending',
          'Evidencias registradas con cumplimiento pendiente',
          'Existen evidencias documentales registradas, pero el cumplimiento del estándar continúa pendiente (1.1.8).',
          FindingPriority.LOW,
          now,
        ),
      );
    }

    return findings;
  }

  private finding(
    id: string,
    title: string,
    description: string,
    priority: FindingPriority,
    createdAt: string = new Date().toISOString(),
  ): FindingDto {
    return {
      id,
      module: 'convivencia',
      title,
      description,
      priority,
      status: 'OPEN',
      responsible: '',
      dueDate: '',
      createdAt,
    };
  }
}
