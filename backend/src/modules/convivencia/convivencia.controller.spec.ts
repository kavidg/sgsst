import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

import { RequestWithUser } from '../auth/auth.types';
import { ConvivenciaService } from './convivencia.service';
import { ConvivenciaController } from './convivencia.controller';
import { ConvivenciaDocumentService } from './convivencia-document.service';
import { ApprovalWorkflowService } from '../approval-workflow/approval-workflow.service';

const COMPANY_ID = '64b0000000000000000000a1';

/** Snapshot canónico del dominio (misma forma que getComplianceSnapshot). */
function buildSnapshot(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    complianceStatus: 'PENDING',
    complianceReason: 'Avance parcial: faltan reuniones realizadas (1.1.8).',
    percentage: 50,
    exempt: false,
    metCriteria: ['Periodo activo', 'Comité aprobado', 'Miembros conformados'],
    missingCriteria: ['Reuniones realizadas'],
    periodStatus: 'ACTIVO',
    approvalStatus: 'APPROVED_AND_SIGNED',
    evidenceCount: 0,
    ...overrides,
  };
}

function buildRequest(overrides?: Partial<RequestWithUser>): RequestWithUser {
  return {
    headers: {},
    companyId: new Types.ObjectId(COMPANY_ID),
    ...overrides,
  } as RequestWithUser;
}

/**
 * Construye el controller con stubs mínimos. `getComplianceSnapshot` registra
 * los companyId recibidos para verificar que el endpoint SIEMPRE usa el del
 * contexto autenticado y nunca acepta companyId del cliente.
 */
function buildController(overrides?: {
  snapshot?: Record<string, unknown>;
  snapshotError?: Error;
}) {
  const snapshotCalls: string[] = [];
  const convivenciaService = {
    getComplianceSnapshot: async (companyId: Types.ObjectId) => {
      snapshotCalls.push(companyId.toString());
      if (overrides?.snapshotError) throw overrides.snapshotError;
      return overrides?.snapshot ?? buildSnapshot();
    },
  } as unknown as ConvivenciaService;

  const controller = new ConvivenciaController(
    convivenciaService,
    {} as unknown as ApprovalWorkflowService,
    {} as unknown as ConvivenciaDocumentService,
  );

  return { controller, snapshotCalls };
}

describe('ConvivenciaController.closeVoting (1.1.8, F7B-3)', () => {
  const PERIOD_ID = '64b0000000000000000000aa';

  function buildController(overrides?: {
    closeVotingError?: Error;
    closeVotingResult?: Record<string, unknown>;
  }) {
    const closeCalls: Array<{ companyId: string; periodId: string; email: string }> = [];
    const convivenciaService = {
      closeVoting: async (companyId: Types.ObjectId, periodId: string, email: string) => {
        closeCalls.push({ companyId: companyId.toString(), periodId, email });
        if (overrides?.closeVotingError) throw overrides.closeVotingError;
        return overrides?.closeVotingResult ?? { electionState: 'CLOSED' };
      },
    } as unknown as ConvivenciaService;

    const controller = new ConvivenciaController(
      convivenciaService,
      {} as unknown as ApprovalWorkflowService,
      {} as unknown as ConvivenciaDocumentService,
    );

    return { controller, closeCalls };
  }

  it('cierra la elección delegando en el dominio con el companyId del contexto autenticado', async () => {
    const { controller, closeCalls } = buildController();
    const result = await controller.closeVoting(PERIOD_ID, buildRequest());
    assert.deepEqual(result, { electionState: 'CLOSED' });
    assert.equal(closeCalls.length, 1);
    assert.equal(closeCalls[0].companyId, COMPANY_ID);
    assert.equal(closeCalls[0].periodId, PERIOD_ID);
    assert.equal(closeCalls[0].email, 'system');
  });

  it('propaga el NotFoundException del dominio (periodo inexistente o de otra empresa)', async () => {
    const { controller } = buildController({
      closeVotingError: new NotFoundException('Periodo no encontrado'),
    });
    await assert.rejects(
      () => controller.closeVoting(PERIOD_ID, buildRequest()),
      (error: Error) =>
        error instanceof NotFoundException && error.message.includes('Periodo no encontrado'),
    );
  });

  it('propaga errores de transición inválida del dominio (elección no abierta)', async () => {
    const { controller } = buildController({
      closeVotingError: new BadRequestException('La elección no está abierta'),
    });
    await assert.rejects(
      () => controller.closeVoting(PERIOD_ID, buildRequest()),
      (error: Error) =>
        error instanceof BadRequestException && error.message.includes('La elección no está abierta'),
    );
  });

  it('rechaza sin companyId en el contexto (Forbidden) — nunca acepta companyId del body/query', async () => {
    const { controller, closeCalls } = buildController();
    const req = buildRequest({ companyId: undefined });
    // closeVoting es síncrono y companyIdOf lanza en el mismo call stack:
    // la arrow async convierte el throw síncrono en rechazo (assert.rejects de
    // Node 20 no captura throws síncronos de la factory).
    await assert.rejects(
      async () => controller.closeVoting(PERIOD_ID, req as RequestWithUser),
      (error: Error) => error instanceof ForbiddenException,
    );
    assert.equal(closeCalls.length, 0);
  });
});

describe('ConvivenciaController.getCompliance (1.1.8, Fase 6)', () => {
  it('devuelve el snapshot de cumplimiento del dominio tal cual (fuente única de verdad)', async () => {
    const snapshot = buildSnapshot({
      complianceStatus: 'COMPLIES',
      percentage: 100,
      metCriteria: ['Periodo activo', 'Comité aprobado', 'Miembros conformados', 'Reuniones realizadas'],
      missingCriteria: [],
    });
    const { controller } = buildController({ snapshot });

    const result = await controller.getCompliance(buildRequest());

    assert.deepEqual(result, snapshot);
  });

  it('usa SIEMPRE el companyId autenticado (req.companyId) para consultar el dominio', async () => {
    const { controller, snapshotCalls } = buildController();

    await controller.getCompliance(buildRequest());

    assert.deepEqual(snapshotCalls, [COMPANY_ID]);
  });

  it('NO acepta companyId desde query/body como autoridad (solo el contexto autenticado)', async () => {
    const { controller, snapshotCalls } = buildController();

    // El handler no recibe @Query ni @Body: un companyId inyectado por el
    // cliente en query/body no puede influir en la consulta. Aquí se simula
    // un request "manipulado" con companyId ajeno en query/body.
    const request = buildRequest({
      query: { companyId: '64b0000000000000000000b1' },
    } as unknown as Partial<RequestWithUser>);
    (request as unknown as Record<string, unknown>).body = { companyId: '64b0000000000000000000b1' };

    await controller.getCompliance(request);

    // La consulta al dominio se hace exclusivamente con el companyId autenticado.
    assert.deepEqual(snapshotCalls, [COMPANY_ID]);
  });

  it('propaga NotFoundException del dominio cuando no existe periodo vigente', async () => {
    const { controller } = buildController({
      snapshotError: new NotFoundException('No existe un periodo activo para esta empresa'),
    });

    await assert.rejects(
      () => controller.getCompliance(buildRequest()),
      (error: Error) => error instanceof NotFoundException,
    );
  });

  it('es read-only: no invoca ninguna operación de escritura del dominio', async () => {
    const writeCalls: string[] = [];
    const convivenciaService = {
      getComplianceSnapshot: async () => buildSnapshot(),
      saveWithCompliance: async () => {
        writeCalls.push('saveWithCompliance');
        return {};
      },
      attachConstitutionMinutes: async () => {
        writeCalls.push('attachConstitutionMinutes');
        return {};
      },
      addMember: async () => {
        writeCalls.push('addMember');
        return {};
      },
      scheduleMeeting: async () => {
        writeCalls.push('scheduleMeeting');
        return {};
      },
    } as unknown as ConvivenciaService;

    const controller = new ConvivenciaController(
      convivenciaService,
      {} as unknown as ApprovalWorkflowService,
      {} as unknown as ConvivenciaDocumentService,
    );

    await controller.getCompliance(buildRequest());

    assert.deepEqual(writeCalls, []);
  });
});

describe('ConvivenciaController.getResults (1.1.8, F7B-4)', () => {
  const PERIOD_ID = '64b0000000000000000000aa';
  const OTHER_COMPANY_ID = '64b0000000000000000000b1';

  const RESULTS = {
    totalVotes: 3,
    totalEmployees: 10,
    participation: 30,
    winners: [{ rank: 1, name: 'Candidato Uno', votes: 5, status: 'APROBADO' }],
    alternates: [],
    ranking: [
      { rank: 1, name: 'Candidato Uno', votes: 5, status: 'APROBADO' },
      { rank: 2, name: 'Candidato Dos', votes: 3, status: 'APROBADO' },
    ],
  };

  function buildController(overrides?: {
    resultsError?: Error;
  }) {
    const resultsCalls: Array<{ companyId: string; periodId: string }> = [];
    const convivenciaService = {
      getVotingResults: async (companyId: Types.ObjectId, periodId: string) => {
        resultsCalls.push({ companyId: companyId.toString(), periodId });
        if (overrides?.resultsError) throw overrides.resultsError;
        return RESULTS;
      },
    } as unknown as ConvivenciaService;

    const controller = new ConvivenciaController(
      convivenciaService,
      {} as unknown as ApprovalWorkflowService,
      {} as unknown as ConvivenciaDocumentService,
    );

    return { controller, resultsCalls };
  }

  it('F7B4-01: consulta los resultados delegando en el dominio con el companyId del contexto autenticado', async () => {
    const { controller, resultsCalls } = buildController();
    const result = await controller.getResults(PERIOD_ID, buildRequest());
    assert.deepEqual(result, RESULTS);
    assert.equal(resultsCalls.length, 1);
    assert.equal(resultsCalls[0].companyId, COMPANY_ID);
    assert.equal(resultsCalls[0].periodId, PERIOD_ID);
  });

  it('F7B4-05: request sin companyId autenticado → Forbidden (nunca acepta companyId del body/query)', async () => {
    const { controller, resultsCalls } = buildController();
    const req = buildRequest({ companyId: undefined });
    await assert.rejects(
      async () => controller.getResults(PERIOD_ID, req as RequestWithUser),
      (error: Error) => error instanceof ForbiddenException,
    );
    assert.equal(resultsCalls.length, 0);
  });

  it('F7B4-06: companyId manipulado en query/body NO altera el tenant (solo se usa el contexto)', async () => {
    const { controller, resultsCalls } = buildController();
    const request = buildRequest();
    (request as unknown as Record<string, unknown>).query = { companyId: OTHER_COMPANY_ID };
    (request as unknown as Record<string, unknown>).body = { companyId: OTHER_COMPANY_ID };

    await controller.getResults(PERIOD_ID, request);

    assert.deepEqual(resultsCalls, [{ companyId: COMPANY_ID, periodId: PERIOD_ID }]);
  });

  it('F7B4-03/17: propaga el NotFound del dominio (periodo de otra empresa o inexistente), sin filtrar existencia', async () => {
    const { controller } = buildController({
      resultsError: new NotFoundException('Periodo no encontrado'),
    });
    await assert.rejects(
      () => controller.getResults(PERIOD_ID, buildRequest()),
      (error: Error) =>
        error instanceof NotFoundException && error.message.includes('Periodo no encontrado'),
    );
  });

  it('F7B4-13/14: propaga el rechazo controlado del dominio (elección no iniciada o abierta)', async () => {
    const { controller } = buildController({
      resultsError: new BadRequestException('La elección está abierta: los resultados se publican al cerrarla'),
    });
    await assert.rejects(
      () => controller.getResults(PERIOD_ID, buildRequest()),
      (error: Error) => error instanceof BadRequestException,
    );
  });

  it('F7B4-07: el endpoint exige rol owner/admin (metadata de RolesGuard)', () => {
    // El RolesGuard de NestJS lee la metadata 'roles' definida por @Roles.
    const roles = Reflect.getMetadata('roles', ConvivenciaController.prototype.getResults);
    assert.deepEqual(roles, ['owner', 'admin']);
  });
});

describe('ConvivenciaController.listDocuments (1.1.8, F7B-7 — trazabilidad documental)', () => {
  const PERIOD_ID = '64b0000000000000000000aa';

  function buildController(overrides?: {
    instances?: Array<Record<string, unknown>>;
  }) {
    const docsCalls: Array<{ companyId: string; periodId: string }> = [];
    const documentService = {
      listDocuments: async (companyId: Types.ObjectId, periodId: string) => {
        docsCalls.push({ companyId: companyId.toString(), periodId });
        return overrides?.instances ?? [];
      },
    } as unknown as ConvivenciaDocumentService;

    const controller = new ConvivenciaController(
      {} as unknown as ConvivenciaService,
      {} as unknown as ApprovalWorkflowService,
      documentService,
    );

    return { controller, docsCalls };
  }

  function buildInstance(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      _id: new Types.ObjectId('64b0000000000000000000c1'),
      version: 2,
      status: 'GENERATED',
      fileUrl: 'https://storage.googleapis.com/bucket/acta.docx',
      storagePath: 'document-generation/company/acta.docx',
      generatedAt: new Date('2026-01-15T00:00:00.000Z'),
      ...overrides,
    };
  }

  it('F7B7-05: listDocuments expone el documentCode de cada instancia (scoped por empresa)', async () => {
    const { controller, docsCalls } = buildController({
      instances: [
        buildInstance({
          _id: new Types.ObjectId('64b0000000000000000000c1'),
          documentCode: 'PHVA-1.1.8-ACTA',
        }),
        buildInstance({
          _id: new Types.ObjectId('64b0000000000000000000c2'),
          documentCode: 'PHVA-1.1.8-COMP',
        }),
      ],
    });

    const result = await controller.listDocuments(buildRequest(), PERIOD_ID);

    assert.equal(docsCalls.length, 1);
    assert.equal(docsCalls[0].companyId, COMPANY_ID);
    assert.equal(docsCalls[0].periodId, PERIOD_ID);
    const documents = result.documents as Array<{ documentCode?: string | null }>;
    assert.equal(documents.length, 2);
    assert.equal(documents[0].documentCode, 'PHVA-1.1.8-ACTA');
    assert.equal(documents[1].documentCode, 'PHVA-1.1.8-COMP');
  });

  it('F7B7-06: la serialización JSON del response contiene documentCode', async () => {
    const { controller } = buildController({
      instances: [buildInstance({ documentCode: 'PHVA-1.1.8-ACTA' })],
    });

    const result = await controller.listDocuments(buildRequest(), PERIOD_ID);
    const serialized = JSON.stringify(result);
    assert.ok(serialized.includes('documentCode'));
    assert.ok(serialized.includes('PHVA-1.1.8-ACTA'));
  });

  it('F7B7-07: instancia legacy sin documentCode no rompe listDocuments (null explícito)', async () => {
    const { controller } = buildController({
      instances: [buildInstance({ documentCode: undefined })],
    });

    const result = await controller.listDocuments(buildRequest(), PERIOD_ID);
    const documents = result.documents as Array<{ documentCode?: string | null }>;
    assert.equal(documents.length, 1);
    assert.equal(documents[0].documentCode, null, 'null explícito, nunca se inventa un código');
  });
});
