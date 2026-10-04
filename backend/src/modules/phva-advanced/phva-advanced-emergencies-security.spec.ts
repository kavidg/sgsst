import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import 'reflect-metadata';
import { validateSync } from 'class-validator';
import { CATALOG_60 } from '../standard-catalog/constants/catalog-60';
import {
  CANONICAL_EMERGENCY_ITEM_CODE,
  EMERGENCY_LEGACY_ITEM_CODES,
  isSstEmergenciesItemCode,
  EmergencyImpact,
  EmergencyProbability,
  EmergencyRiskLevel,
} from './schemas/phva-advanced-emergencies.schema';
import {
  CreateEmergencyThreatDto,
  EmergencyPlanDto,
  EmergencyPlanSocializationDto,
  UpdateEmergencyThreatDto,
  UpdateSstEmergenciesDto,
} from './dto/update-emergencies.dto';
import { computeEmergencyRiskLevel } from './phva-advanced.service';

/**
 * Regresiones de seguridad, identidad y matriz de amenazas del dominio de
 * Emergencias (Etapa 5.1.1 — Plan de prevención, preparación y respuesta ante
 * emergencias; patrón de la etapa 4.2.6).
 *
 * 1) IDENTIDAD: código canónico '5.1.1' + lectura de documentos legacy
 *    '1.1.10' sin migración destructiva (los registros nuevos SIEMPRE se
 *    crean con el código canónico y no se crean duplicados por empresa).
 * 2) DTO ESTRICTO: el cliente no puede modificar complianceStatus, itemCode,
 *    history, companyId ni inyectar threats por el PATCH general.
 * 3) MATRIZ DE AMENAZAS: endpoints dedicados, riskLevel calculado en el
 *    servidor, borrado lógico y aislamiento por empresa.
 */

function readSource(relativePath: string): string {
  // dist-test/modules/phva-advanced → 3 niveles hasta backend/ (patrón repo).
  return fs.readFileSync(path.resolve(__dirname, `../../../${relativePath}`), 'utf-8');
}

const serviceSource = readSource('src/modules/phva-advanced/phva-advanced.service.ts');
const controllerSource = readSource('src/modules/phva-advanced/phva-advanced.controller.ts');
const schemaSource = readSource('src/modules/phva-advanced/schemas/phva-advanced-emergencies.schema.ts');

describe('SstEmergencies — identidad canónica 5.1.1', () => {
  it('el código canónico del módulo es 5.1.1 y el legacy reconocido es 1.1.10', () => {
    assert.equal(CANONICAL_EMERGENCY_ITEM_CODE, '5.1.1');
    assert.deepEqual([...EMERGENCY_LEGACY_ITEM_CODES], ['1.1.10']);
    assert.equal(isSstEmergenciesItemCode('5.1.1'), true);
    assert.equal(isSstEmergenciesItemCode('1.1.10'), true, 'legacy: documentos históricos siguen legibles');
    assert.equal(isSstEmergenciesItemCode('9.9.9'), false);
  });

  it('el schema usa el código canónico como default y conserva el índice único por empresa', () => {
    assert.match(schemaSource, /@Prop\(\{ default: CANONICAL_EMERGENCY_ITEM_CODE \}\) itemCode/);
    assert.match(schemaSource, /SstEmergenciesSchema\.index\(\{ companyId: 1, itemCode: 1 \}, \{ unique: true \}\)/);
    assert.doesNotMatch(schemaSource, /default: '1\.1\.10'/);
  });

  it('findOrCreateEmergencies hace matching legacy-aware e inserta SOLO con el código canónico (sin duplicar por empresa)', () => {
    const methodStart = serviceSource.indexOf('async findOrCreateEmergencies(');
    assert.ok(methodStart > -1);
    const methodSource = serviceSource.slice(methodStart, methodStart + 700);
    assert.match(methodSource, /\$in: \[CANONICAL_EMERGENCY_ITEM_CODE, \.\.\.EMERGENCY_LEGACY_ITEM_CODES\]/);
    assert.match(methodSource, /\$setOnInsert: \{ companyId, itemCode: CANONICAL_EMERGENCY_ITEM_CODE \}/);
    assert.doesNotMatch(methodSource, /itemCode: '1\.1\.10'/);
  });

  it('findEmergenciesByCompany también resuelve documentos legacy (compatibilidad de lectura)', () => {
    const methodStart = serviceSource.indexOf('async findEmergenciesByCompany(');
    const methodSource = serviceSource.slice(methodStart, methodStart + 500);
    assert.match(methodSource, /\$in: \[CANONICAL_EMERGENCY_ITEM_CODE, \.\.\.EMERGENCY_LEGACY_ITEM_CODES\]/);
  });

  it('el estándar normativo 5.1.1 del catálogo NO fue alterado (Plan de emergencias, HACER, peso 5)', () => {
    const standard = CATALOG_60.find((s) => s.code === '5.1.1');
    assert.ok(standard, '5.1.1 presente en el catálogo');
    assert.equal(standard.title, 'Plan de emergencias');
    assert.equal(standard.phva, 'HACER');
    assert.equal(standard.normativeWeight, 5);
    assert.equal(standard.implementationStatus, 'IMPLEMENTED');
    assert.deepEqual([...(standard.applicableLevels ?? [])], ['60']);
  });

  it('el requisito normativo 1.1.10 del catálogo NO fue alterado (DUPLICATE de 1.1.3)', () => {
    const duplicate = CATALOG_60.find((s) => s.code === '1.1.10');
    assert.ok(duplicate, '1.1.10 presente en el catálogo');
    assert.equal(duplicate.classification, 'DUPLICATE');
    assert.equal(duplicate.duplicateOf, '1.1.3');
  });
});

describe('SstEmergencies — seguridad del PATCH general (5.1.1)', () => {
  it('el service firma updateEmergencies con UpdateSstEmergenciesDto (no Record<string, unknown>)', () => {
    assert.match(serviceSource, /updateEmergencies\(companyId: Types\.ObjectId, user: UserDocument, dto: UpdateSstEmergenciesDto\)/);
    assert.doesNotMatch(serviceSource, /updateEmergencies\(companyId: Types\.ObjectId, user: UserDocument, dto: Record<string, unknown>\)/);
  });

  it('updateEmergencies ya NO hace Object.assign sin whitelist ni asigna complianceStatus/itemCode', () => {
    const methodStart = serviceSource.indexOf('async updateEmergencies(');
    assert.ok(methodStart > -1);
    const methodSource = serviceSource.slice(methodStart, methodStart + 1600);
    assert.doesNotMatch(methodSource, /Object\.assign\(record,\s*dto\)/);
    assert.doesNotMatch(methodSource, /record\.complianceStatus\s*=/);
    assert.doesNotMatch(methodSource, /record\.itemCode\s*=/);
  });

  it('el DTO del PATCH rechaza campos de scoring/identidad/servidor (forbidNonWhitelisted)', () => {
    const plan = Object.assign(new EmergencyPlanDto(), { planName: 'Plan de Emergencias' });
    const malicious = Object.assign(new UpdateSstEmergenciesDto(), {
      complianceStatus: 'COMPLIES',
      itemCode: '1.1.10',
      history: [{ action: 'HACK' }],
      companyId: '507f1f77bcf86cd799439099',
      threats: [{ scenario: 'X', threat: 'Y' }],
      plan,
    });

    const errors = validateSync(malicious, { whitelist: true, forbidNonWhitelisted: true });
    const rejected = errors.map((e) => e.property);
    for (const forbidden of ['complianceStatus', 'itemCode', 'history', 'companyId', 'threats']) {
      assert.ok(rejected.includes(forbidden), `campo prohibido rechazado: ${forbidden}`);
    }
  });

  it('el DTO del plan acepta campos de gestión legítimos y valida contenido', () => {
    const socialization = Object.assign(new EmergencyPlanSocializationDto(), {
      date: '2026-09-01',
      coveragePercentage: 95,
      participants: 'Toda la planta',
      evidence: ['https://evidencia/soporte.pdf'],
    });
    const legit = Object.assign(new UpdateSstEmergenciesDto(), {
      year: 2026,
      complianceReason: 'Plan actualizado',
      plan: Object.assign(new EmergencyPlanDto(), {
        planName: 'Plan de prevención, preparación y respuesta ante emergencias',
        version: '3',
        effectiveDate: '2026-09-01',
        expirationDate: '2027-09-01',
        objectives: ['Proteger la vida de los trabajadores'],
        scope: 'Planta principal y bodega',
        preventiveActions: ['Mantenimiento de extintores'],
        generalResponseProcedure: 'Activar alarma y evacuar',
        updateMechanism: 'Revisión anual y post-simulacro',
        socialization,
      }),
    });
    assert.equal(validateSync(legit, { whitelist: true, forbidNonWhitelisted: true }).length, 0);

    const invalid = Object.assign(new UpdateSstEmergenciesDto(), {
      plan: Object.assign(new EmergencyPlanDto(), {
        effectiveDate: 'no-es-fecha',
        documentId: 'no-es-mongo-id',
        socialization: Object.assign(new EmergencyPlanSocializationDto(), { coveragePercentage: 150 }),
      }),
    });
    const errors = validateSync(invalid, { whitelist: true, forbidNonWhitelisted: true });
    const rejected = errors.map((e) => e.property);
    assert.ok(rejected.includes('plan'), 'plan inválido rechazado');
  });
});

describe('EmergencyThreat — matriz de amenazas y vulnerabilidades', () => {
  it('los enums de valoración son explícitos y tipados (dominio propio de emergencias)', () => {
    assert.deepEqual([...Object.values(EmergencyProbability)], ['LOW', 'MEDIUM', 'HIGH']);
    assert.deepEqual([...Object.values(EmergencyImpact)], ['LOW', 'MEDIUM', 'HIGH']);
    assert.deepEqual([...Object.values(EmergencyRiskLevel)], ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
  });

  it('el nivel de riesgo se calcula en el servidor (probabilidad × impacto)', () => {
    assert.equal(computeEmergencyRiskLevel(EmergencyProbability.LOW, EmergencyImpact.LOW), EmergencyRiskLevel.LOW);
    assert.equal(computeEmergencyRiskLevel(EmergencyProbability.LOW, EmergencyImpact.MEDIUM), EmergencyRiskLevel.MEDIUM);
    assert.equal(computeEmergencyRiskLevel(EmergencyProbability.LOW, EmergencyImpact.HIGH), EmergencyRiskLevel.MEDIUM);
    assert.equal(computeEmergencyRiskLevel(EmergencyProbability.MEDIUM, EmergencyImpact.LOW), EmergencyRiskLevel.MEDIUM);
    assert.equal(computeEmergencyRiskLevel(EmergencyProbability.MEDIUM, EmergencyImpact.MEDIUM), EmergencyRiskLevel.HIGH);
    assert.equal(computeEmergencyRiskLevel(EmergencyProbability.MEDIUM, EmergencyImpact.HIGH), EmergencyRiskLevel.HIGH);
    assert.equal(computeEmergencyRiskLevel(EmergencyProbability.HIGH, EmergencyImpact.LOW), EmergencyRiskLevel.MEDIUM);
    assert.equal(computeEmergencyRiskLevel(EmergencyProbability.HIGH, EmergencyImpact.MEDIUM), EmergencyRiskLevel.HIGH);
    assert.equal(computeEmergencyRiskLevel(EmergencyProbability.HIGH, EmergencyImpact.HIGH), EmergencyRiskLevel.CRITICAL);
  });

  it('el DTO de creación exige escenario y amenaza, y NO acepta riskLevel del cliente', () => {
    const missingRequired = validateSync(new CreateEmergencyThreatDto(), { whitelist: true, forbidNonWhitelisted: true });
    const rejectedRequired = missingRequired.map((e) => e.property);
    assert.ok(rejectedRequired.includes('scenario'), 'scenario es obligatorio');
    assert.ok(rejectedRequired.includes('threat'), 'threat es obligatorio');

    const malicious = Object.assign(new CreateEmergencyThreatDto(), {
      scenario: 'Incendio en planta',
      threat: 'Sobrecarga eléctrica',
      probability: 'EXTREME',
      impact: 'HIGH',
      riskLevel: 'LOW',
      threatId: 'suplantado',
    });
    const errors = validateSync(malicious, { whitelist: true, forbidNonWhitelisted: true });
    const rejected = errors.map((e) => e.property);
    assert.ok(rejected.includes('probability'), 'probability fuera del enum rechazada');
    assert.ok(rejected.includes('riskLevel'), 'riskLevel no es manipulable por el cliente');
    assert.ok(rejected.includes('threatId'), 'threatId es generado por el servidor');
  });

  it('el DTO de edición parcial rechaza riskLevel y valida active como booleano', () => {
    const malicious = Object.assign(new UpdateEmergencyThreatDto(), {
      riskLevel: 'CRITICAL',
      active: 'yes',
    });
    const errors = validateSync(malicious, { whitelist: true, forbidNonWhitelisted: true });
    const rejected = errors.map((e) => e.property);
    assert.ok(rejected.includes('riskLevel'), 'riskLevel no es manipulable por el cliente');
    assert.ok(rejected.includes('active'), 'active debe ser booleano');
  });

  it('la creación de amenazas genera threatId en el servidor y calcula el nivel de riesgo', () => {
    const methodStart = serviceSource.indexOf('async createEmergencyThreat(');
    assert.ok(methodStart > -1);
    const methodSource = serviceSource.slice(methodStart, methodStart + 1400);
    assert.match(methodSource, /threatId: new Types\.ObjectId\(\)\.toString\(\)/);
    assert.match(methodSource, /riskLevel: computeEmergencyRiskLevel\(probability, impact\)/);
  });

  it('las amenazas viven DENTRO de SstEmergencies (dominio propio, sin reutilizar Risk)', () => {
    assert.match(schemaSource, /@Prop\(\{ type: \[EmergencyThreat\], default: \[\] \}\) threats/);
    assert.doesNotMatch(schemaSource, /ref: 'Risk'/);
    assert.doesNotMatch(schemaSource, /ControlVerification/);
  });

  it('el borrado de amenazas es LÓGICO (active=false, conserva historial)', () => {
    const methodStart = serviceSource.indexOf('async deactivateEmergencyThreat(');
    const methodSource = serviceSource.slice(methodStart, methodStart + 400);
    assert.match(methodSource, /\{ active: false \}/);
  });
});

describe('Emergencias — endpoints, permisos y tenant isolation', () => {
  it('el controller expone los endpoints dedicados de la matriz con permisos de escritura', () => {
    assert.match(controllerSource, /@Post\('emergencies\/threats'\)/);
    assert.match(controllerSource, /@Patch\('emergencies\/threats\/:threatId'\)/);
    assert.match(controllerSource, /@Delete\('emergencies\/threats\/:threatId'\)/);
    const threatsStart = controllerSource.indexOf("Matriz de amenazas y vulnerabilidades (5.1.1)");
    const threatsSource = controllerSource.slice(threatsStart, threatsStart + 2200);
    assert.match(threatsSource, /@Roles\('owner', 'admin', 'manager'\)/);
  });

  it('companyId SIEMPRE viene del contexto autenticado (nunca del body)', () => {
    const threatsStart = controllerSource.indexOf("Matriz de amenazas y vulnerabilidades (5.1.1)");
    const threatsSource = controllerSource.slice(threatsStart, threatsStart + 2200);
    assert.match(threatsSource, /this\.resolveCompanyId\(request\)/);
    assert.doesNotMatch(threatsSource, /dto\.companyId/);
  });

  it('un threatId de otra empresa produce 404 (búsqueda dentro del documento de la empresa autenticada)', () => {
    const methodStart = serviceSource.indexOf('async updateEmergencyThreat(');
    const methodSource = serviceSource.slice(methodStart, methodStart + 900);
    assert.match(methodSource, /findOrCreateEmergencies\(companyId\)/);
    assert.match(methodSource, /record\.threats\.find\(\(t\) => t\.threatId === threatId\)/);
    assert.match(methodSource, /NotFoundException\('Emergencia threat not found'\)/);
  });

  it('los userIds del plan se validan contra la empresa autenticada (tenant isolation)', () => {
    const methodStart = serviceSource.indexOf('private async assertUserBelongsToCompany(');
    const methodSource = serviceSource.slice(methodStart, methodStart + 500);
    assert.match(methodSource, /findOne\(\{ _id: new Types\.ObjectId\(userId\), companyId \}\)/);
    assert.match(methodSource, /BadRequestException/);
  });

  it('las operaciones del plan respetan la política de permisos del backend (owner/admin/manager escriben)', () => {
    assert.match(controllerSource, /@Patch\('emergencies'\)[\s\S]{0,80}@Roles\('owner', 'admin', 'manager'\)/);
  });
});

describe('Frontera de scoring 5.1.1 / 5.1.2 (documentada, NO implementada)', () => {
  it('el schema documenta la frontera de scoring con 5.1.2 (brigada comparte colección)', () => {
    assert.match(schemaSource, /FRONTERA DE SCORING/);
    assert.match(schemaSource, /5\.1\.2/);
  });
});
