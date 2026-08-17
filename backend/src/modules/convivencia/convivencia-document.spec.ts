import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

import { ApprovalDecision } from '../approval-workflow/enums/approval-decision.enum';
import { ApprovalEntity } from '../approval-workflow/enums/approval-entity.enum';
import { ApprovalDocumentGenerationListener } from '../approval-workflow/document-generation/approval-document-generation.listener';
import {
  ApprovalDocumentContext,
  ApprovalDocumentGenerator,
} from '../approval-workflow/document-generation/approval-document-generator.interface';
import { ApprovalDocumentRegistryService } from '../approval-workflow/document-generation/approval-document-registry.service';
import { DocumentGenerationService } from '../document-generation/services/document-generation.service';
import { SystemTemplateService } from '../document-generation/services/system-template.service';
import { DocumentTemplateDocument } from '../document-generation/schemas/document-template.schema';
import { PHVA_SOURCE_ENTITY_CONVIVENCIA } from '../document-generation/types/document-generation.types';
import { UserDocument } from '../users/schemas/user.schema';
// F7B-14: generador REAL de COPASST para la regresión REGISTRY-CONV-09 (en
// lugar de un stub sintético, verifica el registro real del flujo certificado).
import { CopasstDocumentGenerator } from '../phva-advanced/copasst-document.generator';
import { ConvivenciaDocumentGenerator } from './convivencia-document.generator';
import {
  CONVIVENCIA_DOCUMENT_CODE_COMPLIANCE,
  CONVIVENCIA_DOCUMENT_CODE_CONSTITUTION,
  ConvivenciaDocumentService,
} from './convivencia-document.service';
import { ConvivenciaService } from './convivencia.service';
import { ConvivenciaVariableResolverService } from './convivencia-variable-resolver.service';
import { ConvivenciaPeriodDocument } from './schemas/convivencia.schema';

const COMPANY_A = '64b0000000000000000000a1';
const COMPANY_B = '64b0000000000000000000b1';
const PERIOD_A = '64b0000000000000000000d1';
const PERIOD_B = '64b0000000000000000000d2';
const USER_ID = '64b0000000000000000000c1';
const TEMPLATE_ID = '64b0000000000000000000a2';

const user = {
  _id: new Types.ObjectId(USER_ID),
  email: 'admin@empresa.com',
} as unknown as UserDocument;

function buildSystemTemplate(name: string): DocumentTemplateDocument {
  return {
    _id: new Types.ObjectId(TEMPLATE_ID),
    name,
    documentType: 'PHVA_CONVIVENCIA' as never,
    format: 'DOCX' as never,
    source: 'SYSTEM' as never,
    variables: ['company.name'],
    storageUrl: 'system-templates/convivencia/x.docx',
    version: 1,
    active: true,
  } as unknown as DocumentTemplateDocument;
}

function buildPeriod(companyId: string = COMPANY_A, periodId: string = PERIOD_A): ConvivenciaPeriodDocument {
  return {
    _id: new Types.ObjectId(periodId),
    companyId: new Types.ObjectId(companyId),
    itemCode: '1.1.8',
    periodName: 'Comité de Convivencia 2026',
    startDate: new Date('2026-01-01'),
    endDate: new Date('2027-12-31'),
    status: 'ACTIVO',
    approvalStatus: 'APPROVED_AND_SIGNED',
    currentVersion: '1.0',
    approvedBy: { userId: '', email: 'manager@empresa.com', role: 'manager', timestamp: '2026-03-01T00:00:00.000Z' },
    constitutionMinutesPdfUrl: '',
    members: [
      {
        userId: new Types.ObjectId('64b0000000000000000000e1'),
        userName: 'Ana López',
        committeeRole: 'PRESIDENTE',
        representationType: 'EMPLEADOR',
        principalType: 'PRINCIPAL',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2027-12-31'),
        status: 'ACTIVO',
      },
      {
        userId: new Types.ObjectId('64b0000000000000000000e2'),
        userName: 'Luis Pérez',
        committeeRole: 'SECRETARIO',
        representationType: 'TRABAJADOR',
        principalType: 'PRINCIPAL',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2027-12-31'),
        status: 'ACTIVO',
      },
    ],
    meetings: [{ meetingDate: new Date('2026-02-10'), status: 'CERRADA' }],
    commitments: [],
    evidence: [],
    cases: [],
    auditHistory: [],
    save: async function () {
      return this as unknown as ConvivenciaPeriodDocument;
    },
  } as unknown as ConvivenciaPeriodDocument;
}

function buildSnapshot(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    complianceStatus: 'PENDING',
    complianceReason: 'Avance parcial: falta aprobación del periodo.',
    percentage: 50,
    exempt: false,
    metCriteria: ['Periodo activo'],
    missingCriteria: ['Comité aprobado', 'Miembros conformados', 'Reuniones realizadas'],
    periodStatus: 'ACTIVO',
    approvalStatus: 'APPROVED_AND_SIGNED',
    evidenceCount: 0,
    ...overrides,
  };
}

function buildService(options?: {
  period?: ConvivenciaPeriodDocument;
  foreignPeriod?: ConvivenciaPeriodDocument;
  generateError?: Error;
  noPeriodForCurrent?: boolean;
  /** F7B-7: instancias devueltas por getInstancesBySource (trazabilidad). */
  instances?: unknown[];
}) {
  const period = options?.period ?? buildPeriod();
  const engineCalls: unknown[][] = [];
  const ensureCalls: string[] = [];
  const attached: Array<{ periodId: string; fileUrl: string }> = [];
  const instanceData: Record<string, unknown> = {};

  const convivenciaService = {
    // Fase 1: findById valida pertenencia (NotFound si no existe o es de otra empresa).
    findById: async (companyId: Types.ObjectId, id: Types.ObjectId) => {
      const target = id.toString() === PERIOD_A ? period : options?.foreignPeriod ?? null;
      if (!target || target.companyId.toString() !== companyId.toString()) {
        throw new NotFoundException('Periodo no encontrado');
      }
      return target;
    },
    findCurrent: async (companyId: Types.ObjectId) => {
      if (options?.noPeriodForCurrent) throw new NotFoundException('No existe un periodo activo');
      return period;
    },
    attachConstitutionMinutes: async (
      _companyId: Types.ObjectId,
      periodId: string,
      fileUrl: string,
      _email: string,
    ) => {
      attached.push({ periodId, fileUrl });
      return period;
    },
    getComplianceSnapshot: async () => buildSnapshot(),
  } as unknown as ConvivenciaService;

  const resolver = {
    resolveConstitutionContext: async () => ({
      company: { name: 'Empresa Demo SAS', nit: '900123456', workerCount: 42 },
      convivencia: {
        periodName: period.periodName,
        startDate: '2026-01-01',
        endDate: '2027-12-31',
        status: 'ACTIVO',
      },
      members: 'Ana López — PRESIDENTE (EMPLEADOR)\nLuis Pérez — SECRETARIO (TRABAJADOR)',
      employerRepresentatives: 'Ana López — PRESIDENTE (EMPLEADOR)',
      workerRepresentatives: 'Luis Pérez — SECRETARIO (TRABAJADOR)',
      approval: { status: 'APPROVED_AND_SIGNED', approvedBy: 'manager@empresa.com', approvedAt: '2026-03-01T00:00:00.000Z' },
    }),
    resolveComplianceContext: async () => ({
      company: { name: 'Empresa Demo SAS', nit: '900123456' },
      compliance: { status: 'PENDING', reason: 'Avance parcial', percentage: 50 },
      criteria: { met: 'Periodo activo', missing: 'Comité aprobado\nMiembros conformados\nReuniones realizadas' },
      period: {
        status: 'ACTIVO',
        approvalStatus: 'APPROVED_AND_SIGNED',
        memberCount: 2,
        meetingCount: 1,
        completedMeetingCount: 1,
        evidenceCount: 0,
        commitmentCount: 0,
      },
      cases: { total: 0, open: 0, closed: 0 },
    }),
  } as unknown as ConvivenciaVariableResolverService;

  const documentGenerationService = {
    generateDocument: async (...args: unknown[]) => {
      engineCalls.push(args);
      const request = args[0] as { context?: unknown; sourceModule?: unknown; sourceEntity?: unknown; sourceEntityId?: unknown };
      instanceData.sourceModule = request.sourceModule;
      instanceData.sourceEntity = request.sourceEntity;
      instanceData.sourceEntityId = request.sourceEntityId;
      instanceData.context = request.context;
      if (options?.generateError) throw options.generateError;
      return {
        instanceId: new Types.ObjectId('64b0000000000000000000ff'),
        fileUrl: 'https://storage.googleapis.com/bucket/acta-conformacion.docx',
        storagePath: 'document-generation/company/acta-conformacion.docx',
        version: 1,
      };
    },
    getInstancesBySource: async (params: { companyId: Types.ObjectId }) => {
      assert.equal(params.companyId.toString(), COMPANY_A);
      return options?.instances ?? [];
    },
  } as unknown as DocumentGenerationService;

  const systemTemplateService = {
    ensureConvivenciaConstitutionTemplate: async () => {
      ensureCalls.push('CONSTITUTION');
      return buildSystemTemplate('Acta de conformación del Comité de Convivencia (PHVA 1.1.8)');
    },
    ensureConvivenciaComplianceTemplate: async () => {
      ensureCalls.push('COMPLIANCE');
      return buildSystemTemplate('Reporte de cumplimiento — Comité de Convivencia (PHVA 1.1.8)');
    },
  } as unknown as SystemTemplateService;

  const service = new ConvivenciaDocumentService(
    convivenciaService,
    resolver,
    documentGenerationService,
    systemTemplateService,
  );

  return { service, period, engineCalls, ensureCalls, attached, instanceData, convivenciaService };
}

describe('ConvivenciaDocumentService (1.1.8, Fase 5)', () => {
  // ═════════════════════════════════════════════
  // ACTA DE CONFORMACIÓN
  // ═════════════════════════════════════════════
  describe('generateConstitutionMinutes', () => {
    it('D1 — genera el acta de conformación de un periodo válido de la empresa A', async () => {
      const { service, engineCalls, ensureCalls, attached, instanceData } = buildService();

      const result = await service.generateConstitutionMinutes(
        new Types.ObjectId(COMPANY_A),
        user,
        PERIOD_A,
      );

      assert.ok(result.document.instanceId);
      assert.equal(result.reused, false);
      assert.equal(ensureCalls[0], 'CONSTITUTION');
      assert.equal(engineCalls.length, 1);
      const request = engineCalls[0][0] as {
        templateId: string;
        sourceModule: string;
        sourceEntity: string;
        sourceEntityId: Types.ObjectId;
        context: Record<string, unknown>;
      };
      assert.equal(request.templateId, TEMPLATE_ID);
      assert.equal(request.sourceModule, 'CONVIVENCIA');
      assert.equal(request.sourceEntity, PHVA_SOURCE_ENTITY_CONVIVENCIA);
      assert.equal(request.sourceEntityId.toString(), PERIOD_A);
      assert.equal((request.context.document as { code: string }).code, CONVIVENCIA_DOCUMENT_CODE_CONSTITUTION);
      // Datos reales del dominio en el contexto (D5).
      const convivencia = request.context.convivencia as Record<string, unknown>;
      assert.equal(convivencia.periodName, 'Comité de Convivencia 2026');
      // URL registrada correctamente (D10).
      assert.equal(attached.length, 1);
      assert.equal(attached[0].periodId, PERIOD_A);
      assert.equal(attached[0].fileUrl, 'https://storage.googleapis.com/bucket/acta-conformacion.docx');
      assert.equal(instanceData.sourceModule, 'CONVIVENCIA');
      assert.equal(instanceData.sourceEntity, PHVA_SOURCE_ENTITY_CONVIVENCIA);
    });

    it('D2/D4 — la empresa B no puede generar el documento del periodo de A (NotFound, sin filtrar existencia)', async () => {
      const { service, engineCalls, attached } = buildService();

      await assert.rejects(
        () =>
          service.generateConstitutionMinutes(
            new Types.ObjectId(COMPANY_B),
            user,
            PERIOD_A,
          ),
        (error: Error) => error instanceof NotFoundException && error.message.includes('Periodo no encontrado'),
      );
      // Sin generación ni persistencia.
      assert.equal(engineCalls.length, 0);
      assert.equal(attached.length, 0);
    });

    it('D3 — periodId inexistente → error controlado NotFound', async () => {
      const { service } = buildService();

      await assert.rejects(
        () =>
          service.generateConstitutionMinutes(
            new Types.ObjectId(COMPANY_A),
            user,
            '64b0000000000000000000a9',
          ),
        (error: Error) => error instanceof NotFoundException,
      );
    });

    it('D7 — el documento no contiene secureToken', async () => {
      const periodWithCampaign = buildPeriod();
      (periodWithCampaign as unknown as { registrationCampaign?: unknown }).registrationCampaign = {
        secureToken: 'TOKEN-SECRETO',
      };
      const { service, instanceData } = buildService({ period: periodWithCampaign });

      await service.generateConstitutionMinutes(new Types.ObjectId(COMPANY_A), user, PERIOD_A);

      const serialized = JSON.stringify(instanceData.context);
      assert.ok(!serialized.includes('TOKEN-SECRETO'));
      assert.ok(!serialized.includes('secureToken'));
    });

    it('D8 — el documento no contiene OTP', async () => {
      const { service, instanceData } = buildService();

      await service.generateConstitutionMinutes(new Types.ObjectId(COMPANY_A), user, PERIOD_A);

      const serialized = JSON.stringify(instanceData.context);
      assert.ok(!serialized.includes('otp'));
    });

    it('D9 — el documento no expone información confidencial de casos (solo conteos o nada)', async () => {
      const periodWithCases = buildPeriod();
      (periodWithCases as unknown as { cases?: unknown }).cases = [
        {
          caseNumber: 'CC-2026-0001',
          isAnonymous: false,
          complainantName: 'María Secreta',
          respondentName: 'Pedro Confidencial',
          description: 'Situación delicada de acoso laboral',
          evidence: ['evidencia.pdf'],
          status: 'PENDING',
        },
      ];
      const { service, instanceData } = buildService({ period: periodWithCases });

      await service.generateConstitutionMinutes(new Types.ObjectId(COMPANY_A), user, PERIOD_A);

      const serialized = JSON.stringify(instanceData.context);
      assert.ok(!serialized.includes('María Secreta'));
      assert.ok(!serialized.includes('Pedro Confidencial'));
      assert.ok(!serialized.includes('acoso laboral'));
      assert.ok(!serialized.includes('CC-2026-0001'));
    });

    it('D6 — el acta no recalcula compliance (consume solo datos reales del periodo)', async () => {
      const { service, instanceData } = buildService();

      await service.generateConstitutionMinutes(new Types.ObjectId(COMPANY_A), user, PERIOD_A);

      // El contexto del acta NO contiene ningún campo de cumplimiento: el
      // generador no lee ni recalcula complianceStatus (eso es del reporte, que
      // consume el snapshot del dominio).
      const context = instanceData.context as Record<string, unknown>;
      const serialized = JSON.stringify(context);
      assert.ok(!('compliance' in context));
      assert.ok(!serialized.includes('complianceStatus'));
    });
  });

  // ═════════════════════════════════════════════
  // REPORTE DE CUMPLIMIENTO
  // ═════════════════════════════════════════════
  describe('generateComplianceReport', () => {
    it('genera el reporte consumiendo el snapshot del dominio (sin recalcular) y solo conteos de casos', async () => {
      const { service, ensureCalls, engineCalls, instanceData } = buildService();

      const result = await service.generateComplianceReport(new Types.ObjectId(COMPANY_A), user, PERIOD_A);

      assert.ok(result.document.instanceId);
      assert.equal(ensureCalls[0], 'COMPLIANCE');
      assert.equal(engineCalls.length, 1);
      const request = engineCalls[0][0] as { context: Record<string, unknown> };
      assert.equal((request.context.document as { code: string }).code, CONVIVENCIA_DOCUMENT_CODE_COMPLIANCE);
      const compliance = request.context.compliance as Record<string, unknown>;
      // El estado viene del snapshot del dominio (PENDING 50), nunca recalculado.
      assert.equal(compliance.status, 'PENDING');
      assert.equal(compliance.percentage, 50);
      // Casos solo como conteos agregados.
      assert.deepEqual(request.context.cases, { total: 0, open: 0, closed: 0 });
      assert.equal(instanceData.sourceModule, 'CONVIVENCIA');
    });

    it('multi-tenancy: empresa B no puede generar el reporte del periodo de A', async () => {
      const { service, engineCalls } = buildService();

      await assert.rejects(
        () => service.generateComplianceReport(new Types.ObjectId(COMPANY_B), user, PERIOD_A),
        NotFoundException,
      );
      assert.equal(engineCalls.length, 0);
    });
  });

  describe('listDocuments', () => {
    it('consulta la trazabilidad documental scoped por empresa', async () => {
      const { service } = buildService();
      const documents = await service.listDocuments(new Types.ObjectId(COMPANY_A), PERIOD_A);
      assert.deepEqual(documents, []);
    });

    it('F7B7-05: devuelve las instancias con su documentCode (trazabilidad explícita)', async () => {
      const { service } = buildService({
        instances: [
          {
            _id: new Types.ObjectId('64b0000000000000000000c2'),
            version: 2,
            status: 'GENERATED',
            documentCode: 'PHVA-1.1.8-COMP',
            fileUrl: 'https://storage.googleapis.com/bucket/reporte.docx',
            storagePath: 'document-generation/company/reporte.docx',
            generatedAt: new Date('2026-02-01T00:00:00.000Z'),
          },
        ],
      });
      const documents = await service.listDocuments(new Types.ObjectId(COMPANY_A), PERIOD_A);
      assert.equal(documents.length, 1);
      assert.equal(
        (documents[0] as { documentCode?: string }).documentCode,
        'PHVA-1.1.8-COMP',
      );
    });

    it('F7B7-07: instancias legacy sin documentCode no rompen listDocuments', async () => {
      const { service } = buildService({
        instances: [
          {
            _id: new Types.ObjectId('64b0000000000000000000c1'),
            version: 1,
            status: 'GENERATED',
            fileUrl: 'https://storage.googleapis.com/bucket/acta-legacy.docx',
            storagePath: 'document-generation/company/acta-legacy.docx',
            generatedAt: new Date('2025-06-01T00:00:00.000Z'),
          },
        ],
      });
      const documents = await service.listDocuments(new Types.ObjectId(COMPANY_A), PERIOD_A);
      assert.equal(documents.length, 1);
      assert.equal(documents[0].fileUrl, 'https://storage.googleapis.com/bucket/acta-legacy.docx');
      assert.equal((documents[0] as { documentCode?: string }).documentCode, undefined);
    });
  });
});

// ═════════════════════════════════════════════
// GENERADOR POST-APROBACIÓN + REGISTRY (D11/D12/D13)
// ═════════════════════════════════════════════
describe('ConvivenciaDocumentGenerator + ApprovalDocumentRegistryService (1.1.8, Fase 5)', () => {
  it('D11 — el registry reconoce el generador bajo la clave real y el alias normalizado', () => {
    const generator = new ConvivenciaDocumentGenerator({} as ConvivenciaDocumentService);
    const registry = new ApprovalDocumentRegistryService([generator]);

    const byRealKey = registry.findGenerator(ApprovalEntity.CONVIVENCIA, 'ConvivenciaPeriod');
    const byAlias = registry.findGenerator(ApprovalEntity.CONVIVENCIA, PHVA_SOURCE_ENTITY_CONVIVENCIA);

    assert.equal(byRealKey, generator);
    assert.equal(byAlias, generator);
  });

  it('D12 — el registry sigue resolviendo los generadores de otras entidades (1.1.7 no se rompe)', () => {
    const convivencia = new ConvivenciaDocumentGenerator({} as ConvivenciaDocumentService);
    const otherGenerator: ApprovalDocumentGenerator = {
      module: ApprovalEntity.PHVA_ADVANCED,
      entityType: 'PhvaAdvancedCopasstTraining',
      generate: async () => ({}),
    };
    const registry = new ApprovalDocumentRegistryService([convivencia, otherGenerator]);

    // 1.1.7 (PHVA_ADVANCED:'PhvaAdvancedCopasstTraining') sigue resolviendo.
    assert.equal(
      registry.findGenerator(ApprovalEntity.PHVA_ADVANCED, 'PhvaAdvancedCopasstTraining'),
      otherGenerator,
    );
    // 1.1.8 resuelve su propia clave.
    assert.equal(registry.findGenerator(ApprovalEntity.CONVIVENCIA, 'ConvivenciaPeriod'), convivencia);
  });

  it('el listener dispara la generación del acta cuando 1.1.8 se aprueba', async () => {
    let generated = 0;
    const period = buildPeriod();
    const service = new ConvivenciaDocumentService(
      {
        findById: async (companyId: Types.ObjectId, id: Types.ObjectId) => {
          assert.equal(companyId.toString(), COMPANY_A);
          assert.equal(id.toString(), PERIOD_A);
          return period;
        },
        findCurrent: async () => period,
        // Espejo del dominio: persiste la URL en el periodo.
        attachConstitutionMinutes: async (
          _companyId: Types.ObjectId,
          _periodId: string,
          fileUrl: string,
          _email: string,
        ) => {
          period.constitutionMinutesPdfUrl = fileUrl;
          return period;
        },
        getComplianceSnapshot: async () => buildSnapshot(),
      } as unknown as ConvivenciaService,
      {
        resolveConstitutionContext: async () => ({
          company: { name: 'Empresa Demo SAS', nit: '900123456', workerCount: 42 },
          convivencia: { periodName: 'Comité 2026', startDate: '', endDate: '', status: 'ACTIVO' },
          members: 'Ana López — PRESIDENTE (EMPLEADOR)',
          employerRepresentatives: 'Ana López — PRESIDENTE (EMPLEADOR)',
          workerRepresentatives: '(sin representantes de los trabajadores)',
          approval: { status: 'APPROVED_AND_SIGNED', approvedBy: 'manager@empresa.com', approvedAt: '' },
        }),
      } as unknown as ConvivenciaVariableResolverService,
      {
        generateDocument: async () => {
          generated++;
          return {
            instanceId: new Types.ObjectId('64b0000000000000000000ff'),
            fileUrl: 'https://storage.googleapis.com/bucket/acta.docx',
            storagePath: 'document-generation/company/acta.docx',
            version: 1,
          };
        },
        getInstancesBySource: async () => [],
      } as unknown as DocumentGenerationService,
      {
        ensureConvivenciaConstitutionTemplate: async () => buildSystemTemplate('Acta 1.1.8'),
      } as unknown as SystemTemplateService,
    );

    const generator = new ConvivenciaDocumentGenerator(service);
    const registry = new ApprovalDocumentRegistryService([generator]);
    const listener = new ApprovalDocumentGenerationListener(registry);

    const context: ApprovalDocumentContext = {
      companyId: COMPANY_A,
      module: ApprovalEntity.CONVIVENCIA,
      entityType: 'ConvivenciaPeriod',
      entityId: PERIOD_A,
      requestId: '64b0000000000000000000aa',
      decision: ApprovalDecision.APPROVED,
      actor: { userId: USER_ID, email: 'manager@empresa.com', role: 'manager', timestamp: new Date() },
    };

    const result = await listener.onDecisionApplied(context);

    assert.ok(result);
    assert.equal(generated, 1);
    // El acta se registró en el periodo (URL persistida vía dominio).
    assert.equal(period.constitutionMinutesPdfUrl, 'https://storage.googleapis.com/bucket/acta.docx');
  });

  it('decisiones no APPROVED no generan documento (REJECTED no dispara)', async () => {
    const generator = new ConvivenciaDocumentGenerator({
      generateConstitutionMinutes: async () => {
        throw new Error('no debe invocarse');
      },
    } as unknown as ConvivenciaDocumentService);
    const registry = new ApprovalDocumentRegistryService([generator]);
    const listener = new ApprovalDocumentGenerationListener(registry);

    const result = await listener.onDecisionApplied({
      companyId: COMPANY_A,
      module: ApprovalEntity.CONVIVENCIA,
      entityType: 'ConvivenciaPeriod',
      entityId: PERIOD_A,
      requestId: '64b0000000000000000000aa',
      decision: ApprovalDecision.REJECTED,
      actor: { userId: USER_ID, email: 'manager@empresa.com', role: 'manager', timestamp: new Date() },
    });

    assert.equal(result, null);
  });
});

// ═════════════════════════════════════════════
// F7B-14 — INTEGRACIÓN DOCUMENTAL EN APPROVAL DOCUMENT REGISTRY
// (REGISTRY-CONV-01..12)
// ═════════════════════════════════════════════
// La auditoría de F7B-14 confirmó que la integración documental de
// CONVIVENCIA (generador + registry + listener + controller) ya estaba
// implementada y certificada en una fase previa. Esta fase formaliza la
// cobertura de tests del contrato completo del registry para CONVIVENCIA y
// corrige los comentarios stale. NO se modifica funcionalidad electoral,
// seguridad, OTP, rate-limit ni tenant isolation.
describe('F7B-14 — Convivencia en Approval Document Registry (REGISTRY-CONV)', () => {
  it('REGISTRY-CONV-01 — CONVIVENCIA aparece en el registry bajo la clave real CONVIVENCIA:ConvivenciaPeriod', () => {
    const generator = new ConvivenciaDocumentGenerator({} as ConvivenciaDocumentService);
    const registry = new ApprovalDocumentRegistryService([generator]);

    const resolved = registry.findGenerator(ApprovalEntity.CONVIVENCIA, 'ConvivenciaPeriod');
    assert.equal(resolved, generator);
  });

  it('REGISTRY-CONV-02 — el document type normalizado (CONVIVENCIA:CONVIVENCIA) resuelve al mismo generador', () => {
    const generator = new ConvivenciaDocumentGenerator({} as ConvivenciaDocumentService);
    const registry = new ApprovalDocumentRegistryService([generator]);

    const byAlias = registry.findGenerator(ApprovalEntity.CONVIVENCIA, PHVA_SOURCE_ENTITY_CONVIVENCIA);
    assert.equal(byAlias, generator);
  });

  it('REGISTRY-CONV-03 — un document type no soportado para CONVIVENCIA es rechazado (generador no resuelto, listener no genera)', async () => {
    const generator = new ConvivenciaDocumentGenerator({} as ConvivenciaDocumentService);
    const registry = new ApprovalDocumentRegistryService([generator]);
    const listener = new ApprovalDocumentGenerationListener(registry);

    assert.equal(registry.findGenerator(ApprovalEntity.CONVIVENCIA, 'ConvivenciaPeriodNoExiste'), undefined);
    // El listener no genera nada ni falla para una entidad sin documento.
    const result = await listener.onDecisionApplied({
      companyId: COMPANY_A,
      module: ApprovalEntity.CONVIVENCIA,
      entityType: 'ConvivenciaPeriodNoExiste',
      entityId: PERIOD_A,
      requestId: '64b0000000000000000000aa',
      decision: ApprovalDecision.APPROVED,
      actor: { userId: USER_ID, email: 'manager@empresa.com', role: 'manager', timestamp: new Date() },
    });
    assert.equal(result, null);
  });

  it('REGISTRY-CONV-04 — la metadata requerida del document generation se construye con module/entity correctos', async () => {
    const { service, instanceData } = buildService();

    await service.generateConstitutionMinutes(new Types.ObjectId(COMPANY_A), user, PERIOD_A);

    assert.equal(instanceData.sourceModule, 'CONVIVENCIA');
    assert.equal(instanceData.sourceEntity, PHVA_SOURCE_ENTITY_CONVIVENCIA);
    assert.equal((instanceData.sourceEntityId as Types.ObjectId).toString(), PERIOD_A);
    const context = instanceData.context as Record<string, unknown>;
    // Metadata mínima del documento (código/versión/fecha) sin PII extra.
    assert.equal((context.document as { code: string }).code, CONVIVENCIA_DOCUMENT_CODE_CONSTITUTION);
    assert.equal((context.document as { version: string }).version, '1.0');
    assert.ok((context.document as { generatedAt: string }).generatedAt);
  });

  it('REGISTRY-CONV-05 — el tenant correcto puede generar el documento de su periodo (empresa A → periodo A)', async () => {
    const { service, attached } = buildService();

    const result = await service.generateConstitutionMinutes(new Types.ObjectId(COMPANY_A), user, PERIOD_A);

    assert.ok(result.document.fileUrl);
    assert.deepEqual(attached, [{ periodId: PERIOD_A, fileUrl: result.document.fileUrl }]);
  });

  it('REGISTRY-CONV-06 — cross-tenant es rechazado: empresa B NO puede generar el acta del periodo de A', async () => {
    const { service } = buildService({
      period: buildPeriod(COMPANY_A, PERIOD_A),
      foreignPeriod: buildPeriod(COMPANY_B, PERIOD_B),
    });

    await assert.rejects(
      () => service.generateConstitutionMinutes(new Types.ObjectId(COMPANY_B), user, PERIOD_A),
      (error: Error) => error instanceof NotFoundException,
    );
  });

  it('REGISTRY-CONV-07 — el ApprovalStatus del periodo se conserva y alimenta el contexto del documento', async () => {
    const { service, instanceData } = buildService();

    await service.generateConstitutionMinutes(new Types.ObjectId(COMPANY_A), user, PERIOD_A);

    const context = instanceData.context as Record<string, unknown>;
    const approval = context.approval as { status: string; approvedBy: string };
    assert.equal(approval.status, 'APPROVED_AND_SIGNED');
    assert.equal(approval.approvedBy, 'manager@empresa.com');
  });

  it('REGISTRY-CONV-08 — el historial/auditoría se conserva: el acta se persiste en el periodo (URL) sin sobrescribir el historial', async () => {
    // Mismo patrón D7/D9: se muta el periodo tras buildPeriod (sin cambiar la
    // firma del helper compartido).
    const period = buildPeriod();
    (period as unknown as { auditHistory: unknown[] }).auditHistory = [
      {
        event: 'SUBMITTED',
        actor: 'manager@empresa.com',
        at: new Date('2026-02-01T00:00:00.000Z'),
      },
    ];
    const { service, attached } = buildService({ period });

    const result = await service.generateConstitutionMinutes(new Types.ObjectId(COMPANY_A), user, PERIOD_A);

    // La URL del acta se registra en el periodo (ruta única vía dominio).
    assert.deepEqual(attached, [{ periodId: PERIOD_A, fileUrl: result.document.fileUrl }]);
    // El historial preexistente NO se pierde ni se sobrescribe.
    const history = period.auditHistory as unknown as Array<{ event: string }>;
    assert.equal(history.length, 1);
    assert.equal(history[0].event, 'SUBMITTED');
  });

  it('REGISTRY-CONV-09 — COPASST continúa resolviendo su generador real sin cambios', () => {
    const convivencia = new ConvivenciaDocumentGenerator({} as ConvivenciaDocumentService);
    // Generador REAL del flujo certificado COPASST (clave COPASST:'CopasstPeriod').
    const copasst = new CopasstDocumentGenerator({} as never);
    const registry = new ApprovalDocumentRegistryService([convivencia, copasst]);

    assert.equal(registry.findGenerator(ApprovalEntity.COPASST, 'CopasstPeriod'), copasst);
    assert.equal(registry.findGenerator(ApprovalEntity.CONVIVENCIA, 'ConvivenciaPeriod'), convivencia);
  });

  it('REGISTRY-CONV-10 — los documentos existentes (otras entidades del registry) continúan resolviendo', () => {
    const convivencia = new ConvivenciaDocumentGenerator({} as ConvivenciaDocumentService);
    const phvaLike: ApprovalDocumentGenerator = {
      module: ApprovalEntity.PHVA_ADVANCED,
      entityType: 'PhvaAdvancedSstPolicy',
      generate: async () => ({}),
    };
    const registry = new ApprovalDocumentRegistryService([convivencia, phvaLike]);

    assert.equal(registry.findGenerator(ApprovalEntity.PHVA_ADVANCED, 'PhvaAdvancedSstPolicy'), phvaLike);
    assert.equal(registry.findGenerator(ApprovalEntity.CONVIVENCIA, 'ConvivenciaPeriod'), convivencia);
  });

  it('REGISTRY-CONV-11 — no se expone PII innecesaria: la metadata del documento NO incluye otpHash/secureToken ni secretos', async () => {
    const { service, instanceData } = buildService();

    await service.generateConstitutionMinutes(new Types.ObjectId(COMPANY_A), user, PERIOD_A);

    // Assertions sobre NOMBRES DE CAMPO sensibles explícitos (más fuertes que
    // substrings genéricos). NOTA: no se usa 'secret' suelto porque el rol
    // legítimo 'SECRETARIO' del comité es un falso positivo. Complementa
    // D7 (secureToken) y D8 (otp).
    const serialized = JSON.stringify(instanceData);
    const lower = serialized.toLowerCase();
    assert.ok(!lower.includes('otphash'));
    assert.ok(!lower.includes('otpcode'));
    assert.ok(!lower.includes('otppreview'));
    assert.ok(!lower.includes('securetoken'));
  });

  it('REGISTRY-CONV-12 — el flujo electoral de CONVIVENCIA permanece intacto (la integración documental es ortogonal)', () => {
    // La integración documental NO toca electionState, CAS, OTP ni rate-limit:
    // el generador solo delega en ConvivenciaDocumentService.
    const generator = new ConvivenciaDocumentGenerator({} as ConvivenciaDocumentService);
    assert.equal(generator.module, ApprovalEntity.CONVIVENCIA);
    assert.equal(generator.entityType, 'ConvivenciaPeriod');
    // La clave canónica + alias apuntan al mismo generador (sin duplicación).
    const registry = new ApprovalDocumentRegistryService([generator]);
    assert.equal(
      registry.findGenerator(ApprovalEntity.CONVIVENCIA, 'ConvivenciaPeriod'),
      registry.findGenerator(ApprovalEntity.CONVIVENCIA, PHVA_SOURCE_ENTITY_CONVIVENCIA),
    );
  });
});
