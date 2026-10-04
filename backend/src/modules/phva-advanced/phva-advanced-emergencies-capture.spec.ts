import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import 'reflect-metadata';
import { validateSync } from 'class-validator';
import {
  CreateEmergencyBrigadeDto,
  CreateEmergencyDrillDto,
  CreateEmergencyThreatDto,
  CreateEvacuationRouteDto,
  CreateMeetingPointDto,
  UpdateEmergencyDrillDto,
} from './dto/update-emergencies.dto';

/**
 * Etapa 3 (5.1.1) — BRECHAS DE CAPTURA: brigadas, rutas de evacuación y
 * puntos de encuentro completan su CRUD; simulacros obtienen CRUD completo
 * con vínculo OPCIONAL a PlanActivity (Plan Anual) y el plan admite documento
 * oficial EMERGENCY_PLAN validado. SIN scoring: no se modifica ComplianceEngine.
 *
 * Patrón de validación source-based del repositorio (sin MongoDB en memoria):
 * - DTOs: validateSync con whitelist + forbidNonWhitelisted (igual que el
 *   ValidationPipe global del main.ts).
 * - Service/Controller: aserciones sobre el fuente para garantizar búsquedas
 *   dentro del documento de la empresa autenticada (un id ajeno produce 404),
 *   validaciones server-side e historial.
 */

function readSource(relativePath: string): string {
  // dist-test/modules/phva-advanced → 3 niveles hasta backend/ (patrón repo).
  return fs.readFileSync(path.resolve(__dirname, `../../../${relativePath}`), 'utf-8');
}

const schemaSource = readSource('src/modules/phva-advanced/schemas/phva-advanced-emergencies.schema.ts');
const serviceSource = readSource('src/modules/phva-advanced/phva-advanced.service.ts');
const controllerSource = readSource('src/modules/phva-advanced/phva-advanced.controller.ts');
const pageSource = readSource('../frontend/src/pages/EmergenciesPage.tsx');
const apiSource = readSource('../frontend/src/api.ts');

const VALIDATION_OPTIONS = { whitelist: true, forbidNonWhitelisted: true } as const;

// ─────────────────────────────────────────────────────────────────
// BRIGADAS
// ─────────────────────────────────────────────────────────────────

describe('Brigadas — captura completa (Etapa 3)', () => {
  it('el schema soporta borrado lógico de brigadas (active, default true)', () => {
    const brigadeBlock = schemaSource.slice(
      schemaSource.indexOf('export class Brigade '),
      schemaSource.indexOf('export class EmergencyEvacuationCount'),
    );
    assert.ok(brigadeBlock.includes('active'), 'Brigade debe tener active para borrado lógico');
    assert.ok(brigadeBlock.includes("default: true"), 'active de Brigade debe iniciar activa');
  });

  it('CreateEmergencyBrigadeDto exige name y rechaza campos server-side', () => {
    const errors = validateSync(new CreateEmergencyBrigadeDto(), VALIDATION_OPTIONS);
    assert.ok(errors.some((e) => e.property === 'name'), 'name es obligatorio');

    const forbidden = Object.assign(new CreateEmergencyBrigadeDto(), {
      name: 'Brigada A',
      brigadeId: 'x1', companyId: '507f1f77bcf86cd799439011', itemCode: '5.1.1',
      history: [], typedMembers: [],
    });
    const forbiddenErrors = validateSync(forbidden, VALIDATION_OPTIONS);
    for (const field of ['brigadeId', 'companyId', 'itemCode', 'history', 'typedMembers']) {
      assert.ok(
        forbiddenErrors.some((e) => e.property === field),
        `el DTO no debe aceptar ${field}`,
      );
    }
  });

  it('el service genera brigadeId server-side y registra historial CREATE/UPDATE/DELETE_BRIGADE', () => {
    assert.ok(serviceSource.includes("async createEmergencyBrigade("), 'falta createEmergencyBrigade');
    const createBlock = serviceSource.slice(
      serviceSource.indexOf('async createEmergencyBrigade('),
      serviceSource.indexOf('async updateEmergencyBrigade('),
    );
    assert.ok(createBlock.includes('new Types.ObjectId().toString()'), 'brigadeId debe generarse en el servidor');
    assert.ok(createBlock.includes("'CREATE_BRIGADE'"), 'historial CREATE_BRIGADE');

    assert.ok(serviceSource.includes("'UPDATE_BRIGADE'"), 'historial UPDATE_BRIGADE');
    assert.ok(serviceSource.includes("'DELETE_BRIGADE'"), 'historial DELETE_BRIGADE (borrado lógico)');
    const deactivateBlock = serviceSource.slice(
      serviceSource.indexOf('async deactivateEmergencyBrigade('),
      serviceSource.indexOf('// ── EVACUACIÓN: creación'),
    );
    assert.ok(deactivateBlock.includes('active: false'), 'DELETE de brigada debe ser lógico');
  });

  it('brigada de otra empresa produce 404 (tenant isolation)', () => {
    const updateBlock = serviceSource.slice(
      serviceSource.indexOf('async updateEmergencyBrigade('),
      serviceSource.indexOf('async deactivateEmergencyBrigade('),
    );
    assert.ok(
      updateBlock.includes("record.brigades.find((b) => b.brigadeId === brigadeId)"),
      'la brigada se busca SOLO dentro del documento de la empresa autenticada',
    );
    assert.ok(updateBlock.includes("throw new NotFoundException('Brigade not found')"), 'id ajeno → 404');
  });
});

// ─────────────────────────────────────────────────────────────────
// RUTAS Y PUNTOS DE ENCUENTRO
// ─────────────────────────────────────────────────────────────────

describe('Rutas y puntos — creación + desactivación (Etapa 3)', () => {
  it('CreateEvacuationRouteDto exige name y rechaza routeId/companyId', () => {
    const errors = validateSync(new CreateEvacuationRouteDto(), VALIDATION_OPTIONS);
    assert.ok(errors.some((e) => e.property === 'name'));

    const forbidden = Object.assign(new CreateEvacuationRouteDto(), {
      name: 'Ruta 1', routeId: 'r1', companyId: '507f1f77bcf86cd799439011',
    });
    const forbiddenErrors = validateSync(forbidden, VALIDATION_OPTIONS);
    assert.ok(forbiddenErrors.some((e) => e.property === 'routeId'));
    assert.ok(forbiddenErrors.some((e) => e.property === 'companyId'));
  });

  it('CreateMeetingPointDto exige name y rechaza pointId', () => {
    const errors = validateSync(new CreateMeetingPointDto(), VALIDATION_OPTIONS);
    assert.ok(errors.some((e) => e.property === 'name'));

    const forbidden = Object.assign(new CreateMeetingPointDto(), {
      name: 'Punto 1', pointId: 'p1', companyId: '507f1f77bcf86cd799439011',
    });
    const forbiddenErrors = validateSync(forbidden, VALIDATION_OPTIONS);
    assert.ok(forbiddenErrors.some((e) => e.property === 'pointId'));
    assert.ok(forbiddenErrors.some((e) => e.property === 'companyId'));
  });

  it('el service crea rutas/puntos con id server-side y desactiva lógicamente', () => {
    const routeBlock = serviceSource.slice(
      serviceSource.indexOf('async createEvacuationRoute('),
      serviceSource.indexOf('async deactivateEvacuationRoute('),
    );
    assert.ok(routeBlock.includes("'CREATE_ROUTE'"), 'historial CREATE_ROUTE');
    assert.ok(routeBlock.includes('new Types.ObjectId().toString()'), 'routeId server-side');

    const pointBlock = serviceSource.slice(
      serviceSource.indexOf('async createMeetingPoint('),
      serviceSource.indexOf('async deactivateMeetingPoint('),
    );
    assert.ok(pointBlock.includes("'CREATE_MEETING_POINT'"), 'historial CREATE_MEETING_POINT');

    assert.ok(serviceSource.includes("'DELETE_ROUTE'"), 'historial DELETE_ROUTE');
    assert.ok(serviceSource.includes("'DELETE_MEETING_POINT'"), 'historial DELETE_MEETING_POINT');
    assert.ok(
      serviceSource.includes("async deactivateEvacuationRoute(") &&
      serviceSource.includes("async deactivateMeetingPoint("),
      'desactivación lógica de rutas y puntos',
    );
  });

  it('rutas y puntos ajenos producen 404 (tenant isolation)', () => {
    assert.ok(serviceSource.includes("record.evacuationRoutes.find((r) => r.routeId === routeId)"));
    assert.ok(serviceSource.includes("record.meetingPoints.find((p) => p.pointId === pointId)"));
    assert.ok(serviceSource.includes("throw new NotFoundException('Evacuation route not found')"));
    assert.ok(serviceSource.includes("throw new NotFoundException('Meeting point not found')"));
  });
});

// ─────────────────────────────────────────────────────────────────
// SIMULACROS + VÍNCULO PLAN ANUAL
// ─────────────────────────────────────────────────────────────────

describe('Simulacros — CRUD completo y vínculo PlanActivity (Etapa 3)', () => {
  it('CreateEmergencyDrillDto exige name/date y valida enums, números y vínculo', () => {
    const errors = validateSync(new CreateEmergencyDrillDto(), VALIDATION_OPTIONS);
    assert.ok(errors.some((e) => e.property === 'name'));
    assert.ok(errors.some((e) => e.property === 'date'));

    const invalid = Object.assign(new CreateEmergencyDrillDto(), {
      name: 'Simulacro', date: '2026-03-01', participants: -5, status: 'EJECUTADO_HP',
    });
    const invalidErrors = validateSync(invalid, VALIDATION_OPTIONS);
    assert.ok(invalidErrors.some((e) => e.property === 'participants'), 'participants no negativo');
    assert.ok(invalidErrors.some((e) => e.property === 'status'), 'status limitado a valores conocidos');

    const badLink = Object.assign(new CreateEmergencyDrillDto(), {
      name: 'Simulacro', date: '2026-03-01', planActivityId: 'no-es-objectid',
    });
    assert.ok(validateSync(badLink, VALIDATION_OPTIONS).some((e) => e.property === 'planActivityId'));
  });

  it('UpdateEmergencyDrillDto acepta planActivityId null (desvincular) y rechaza drillId', () => {
    const dto = Object.assign(new UpdateEmergencyDrillDto(), { planActivityId: null });
    const errors = validateSync(dto, VALIDATION_OPTIONS);
    assert.ok(!errors.some((e) => e.property === 'planActivityId'), 'null = Sin actividad vinculada');

    const forbidden = Object.assign(new UpdateEmergencyDrillDto(), { drillId: 'd1' });
    assert.ok(validateSync(forbidden, VALIDATION_OPTIONS).some((e) => e.property === 'drillId'));
  });

  it('el service valida PlanActivity contra el tenant vía annualPlanId → AnnualWorkPlan', () => {
    const assertBlock = serviceSource.slice(
      serviceSource.indexOf('private async assertPlanActivityBelongsToCompany('),
      serviceSource.indexOf('private async assertEmergencyPlanDocument('),
    );
    assert.ok(assertBlock.includes('.findById('), 'la actividad debe existir');
    assert.ok(assertBlock.includes('annualPlanId'), 'tenant vía annualPlanId');
    assert.ok(assertBlock.includes('companyId'), 'comparación con la empresa autenticada');
    assert.ok(
      assertBlock.includes("throw new NotFoundException('Plan activity not found')"),
      'actividad inexistente o de otra empresa → 404 tenant-safe (nunca 403 que revele existencia)',
    );
  });

  it('crear/actualizar simulacro valida el vínculo ANTES de mutar; desvincular con null', () => {
    const createBlock = serviceSource.slice(
      serviceSource.indexOf('async createEmergencyDrill('),
      serviceSource.indexOf('async updateEmergencyDrill('),
    );
    assert.ok(
      createBlock.indexOf('assertPlanActivityBelongsToCompany') < createBlock.indexOf('record.drills.push'),
      'validación del vínculo antes de push',
    );

    const updateBlock = serviceSource.slice(
      serviceSource.indexOf('async updateEmergencyDrill('),
      serviceSource.indexOf('async deactivateEmergencyDrill('),
    );
    assert.ok(
      updateBlock.includes('dto.planActivityId === null ? undefined :'),
      'planActivityId null desvincula el simulacro',
    );
    assert.ok(updateBlock.includes("'UPDATE_DRILL'"));
    assert.ok(updateBlock.includes("'DELETE_DRILL'"));
  });

  it('sin backfill: el vínculo es opcional y no toca PlanActivity', () => {
    const drillBlock = serviceSource.slice(
      serviceSource.indexOf('// ── SIMULACROS: CRUD completo'),
      serviceSource.indexOf('private async assertUserBelongsToCompany('),
    );
    assert.ok(!drillBlock.includes('planActivityModel.findOneAndUpdate'), 'no se modifican actividades del PAC');
    assert.ok(!drillBlock.includes('planActivityModel.create'), 'no se crean actividades ficticias');
  });
});

// ─────────────────────────────────────────────────────────────────
// DOCUMENTO OFICIAL EMERGENCY_PLAN
// ─────────────────────────────────────────────────────────────────

describe('Documento oficial del plan — validación server-side (Etapa 3)', () => {
  it('exige existe + misma empresa + tipo EMERGENCY_PLAN (404 cross-tenant, 400 tipo incorrecto)', () => {
    const assertBlock = serviceSource.slice(
      serviceSource.indexOf('private async assertEmergencyPlanDocument('),
      serviceSource.indexOf('private applyDrillFields('),
    );
    assert.ok(assertBlock.includes('DocumentType.EMERGENCY_PLAN'), 'tipo exigido');
    assert.ok(assertBlock.includes('companyId.toString()'), 'comparación de tenant');
    assert.ok(
      assertBlock.split("throw new NotFoundException('Emergency plan document not found')").length >= 3,
      'inexistente y cross-tenant → mismo 404 (tenant-safe)',
    );
    assert.ok(
      assertBlock.includes("throw new BadRequestException('El documento seleccionado no es de tipo EMERGENCY_PLAN.')"),
      'tipo incorrecto → 400',
    );
  });

  it('applyEmergencyPlanUpdate valida documentId antes de asignarlo', () => {
    const planBlock = serviceSource.slice(
      serviceSource.indexOf('private async applyEmergencyPlanUpdate('),
      serviceSource.indexOf('async createEmergencyThreat('),
    );
    const validationPos = planBlock.indexOf('assertEmergencyPlanDocument');
    const assignmentPos = planBlock.indexOf('plan.documentId = new Types.ObjectId');
    assert.ok(validationPos !== -1 && assignmentPos !== -1, 'validación y asignación presentes');
    assert.ok(validationPos < assignmentPos, 'se valida ANTES de asignar');
  });
});

// ─────────────────────────────────────────────────────────────────
// SEGURIDAD GENERAL DE DTOs Y HISTORIAL
// ─────────────────────────────────────────────────────────────────

describe('Seguridad de DTOs e historial (Etapa 3)', () => {
  it('riskLevel de amenazas sigue siendo server-side (nunca del cliente)', () => {
    const errors = validateSync(Object.assign(new CreateEmergencyThreatDto(), {
      scenario: 'Incendio', threat: 'Sobrecarga', riskLevel: 'LOW',
    }), VALIDATION_OPTIONS);
    assert.ok(errors.some((e) => e.property === 'riskLevel'), 'el DTO de amenaza no declara riskLevel');
  });

  it('todos los action codes de captura existen en el service', () => {
    for (const action of [
      'CREATE_BRIGADE', 'UPDATE_BRIGADE', 'DELETE_BRIGADE',
      'CREATE_ROUTE', 'UPDATE_ROUTE', 'DELETE_ROUTE',
      'CREATE_MEETING_POINT', 'UPDATE_MEETING_POINT', 'DELETE_MEETING_POINT',
      'CREATE_DRILL', 'UPDATE_DRILL', 'DELETE_DRILL',
    ]) {
      assert.ok(
        serviceSource.includes(`'${action}'`),
        `falta el action de historial ${action}`,
      );
    }
  });

  it('los nuevos endpoints restringen escritura a owner/admin/manager', () => {
    for (const route of [
      "'emergencies/brigades'", "'emergencies/evacuation-routes'",
      "'emergencies/meeting-points'", "'emergencies/drills'",
    ]) {
      assert.ok(controllerSource.includes(route), `falta el endpoint ${route}`);
    }
    const postBrigade = controllerSource.slice(
      controllerSource.indexOf("@Post('emergencies/brigades')"),
      controllerSource.indexOf("@Patch('emergencies/brigades/:brigadeId')"),
    );
    assert.ok(postBrigade.includes("@Roles('owner', 'admin', 'manager')"));
    assert.ok(!postBrigade.includes("'member'"), 'member NO escribe brigadas (read-only)');
  });

  it('los 10 endpoints nuevos existen (POST/PATCH/DELETE)', () => {
    for (const decorator of [
      "@Post('emergencies/brigades')", "@Patch('emergencies/brigades/:brigadeId')", "@Delete('emergencies/brigades/:brigadeId')",
      "@Post('emergencies/evacuation-routes')", "@Delete('emergencies/evacuation-routes/:routeId')",
      "@Post('emergencies/meeting-points')", "@Delete('emergencies/meeting-points/:pointId')",
      "@Post('emergencies/drills')", "@Patch('emergencies/drills/:drillId')", "@Delete('emergencies/drills/:drillId')",
    ]) {
      assert.ok(controllerSource.includes(decorator), `falta ${decorator}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────
// FRONTEND
// ─────────────────────────────────────────────────────────────────

describe('Frontend — captura desde el producto (Etapa 3)', () => {
  it('api.ts expone las funciones de captura nuevas', () => {
    for (const fn of [
      'createEmergenciesBrigade', 'updateEmergenciesBrigade', 'deactivateEmergenciesBrigade',
      'createEmergenciesRoute', 'deactivateEmergenciesRoute',
      'createEmergenciesMeetingPoint', 'deactivateEmergenciesMeetingPoint',
      'createEmergenciesDrill', 'updateEmergenciesDrill', 'deactivateEmergenciesDrill',
    ]) {
      assert.ok(apiSource.includes(`export const ${fn} =`), `falta ${fn} en api.ts`);
    }
  });

  it('la página usa los selectores de PlanActivity y DocumentMaster EMERGENCY_PLAN', () => {
    assert.ok(pageSource.includes('fetchPlanActivities'), 'carga actividades del PAC');
    assert.ok(pageSource.includes('fetchAnnualWorkPlanCurrent'), 'plan vigente del PAC');
    assert.ok(pageSource.includes('fetchDocumentManagementList'), 'listado documental existente');
    assert.ok(pageSource.includes("d.documentType === 'EMERGENCY_PLAN'"), 'filtra solo EMERGENCY_PLAN');
    assert.ok(pageSource.includes('— Sin actividad vinculada —'), 'permite desvincular del PAC');
  });

  it('la página no introduce riesgo ni tenant client-side en los payloads', () => {
    // companyId solo aparece en tipos/lectura (nunca en un payload enviado);
    // riskLevel solo se LEERÍA para mostrar badges, nunca para enviarlo: la
    // matriz de amenazas la calcula el servidor (probabilidad × impacto).
    const payloadSources = [
      ...pageSource.matchAll(/payload\.[A-Za-z]+ =[^;]+;/g),
    ].map((m) => m[0]);
    assert.ok(
      !payloadSources.some((s) => s.includes('companyId') || s.includes('riskLevel')),
      'ningún payload del frontend incluye companyId ni riskLevel',
    );
    assert.ok(
      !pageSource.includes('computeEmergencyRiskLevel'),
      'el frontend no recalcula el nivel de riesgo',
    );
  });
});
