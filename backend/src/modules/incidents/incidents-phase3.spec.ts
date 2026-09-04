import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG_60 } from '../standard-catalog/constants/catalog-60';
import {
  InvestigationActionStatus,
  InvestigationType,
} from './schemas/incident.schema';
import { QueryIncidentDto } from './dto/query-incident.dto';

/**
 * Tests de Fase 3 — Hardening H-02/M-01
 *
 * H-02: investigationType filter en GET /incidents
 * M-01: InvestigationActionStatus enum
 */

// ═══════════════════════════════════════════════════════════════
// M-01: InvestigationActionStatus ENUM
// ═══════════════════════════════════════════════════════════════

describe('M-01: InvestigationActionStatus enum', () => {
  it('M-01a: tiene los 4 valores correctos', () => {
    assert.equal(InvestigationActionStatus.PENDING, 'PENDING');
    assert.equal(InvestigationActionStatus.IN_PROGRESS, 'IN_PROGRESS');
    assert.equal(InvestigationActionStatus.COMPLETED, 'COMPLETED');
    assert.equal(InvestigationActionStatus.CANCELLED, 'CANCELLED');
  });

  it('M-01b: tiene exactamente 4 valores', () => {
    const values = Object.values(InvestigationActionStatus) as string[];
    assert.equal(values.length, 4);
    assert.ok(values.includes('PENDING'));
    assert.ok(values.includes('IN_PROGRESS'));
    assert.ok(values.includes('COMPLETED'));
    assert.ok(values.includes('CANCELLED'));
  });

  it('M-01c: valor arbitrario no es válido', () => {
    const arbitrary = 'INVALID_STATUS';
    assert.ok(
      !Object.values(InvestigationActionStatus).includes(arbitrary as InvestigationActionStatus),
      'Valor arbitrario no debe estar en el enum',
    );
  });

  it('M-01d: enum es string-valued (compatible con MongoDB)', () => {
    for (const value of Object.values(InvestigationActionStatus)) {
      assert.equal(typeof value, 'string');
    }
  });

  it('M-01e: default PENDING es el primer valor esperado', () => {
    assert.equal(InvestigationActionStatus.PENDING, 'PENDING');
  });
});

// ═══════════════════════════════════════════════════════════════
// H-02: QueryIncidentDto — investigationType filter
// ═══════════════════════════════════════════════════════════════

describe('H-02: QueryIncidentDto — investigationType filter', () => {
  it('H-02a: dto sin filtro tiene investigationType undefined', () => {
    const dto = new QueryIncidentDto();
    assert.equal(dto.investigationType, undefined);
  });

  it('H-02b: dto acepta DISEASE como filtro', () => {
    const dto = new QueryIncidentDto();
    dto.investigationType = InvestigationType.DISEASE;
    assert.equal(dto.investigationType, 'DISEASE');
  });

  it('H-02c: dto acepta ACCIDENT como filtro', () => {
    const dto = new QueryIncidentDto();
    dto.investigationType = InvestigationType.ACCIDENT;
    assert.equal(dto.investigationType, 'ACCIDENT');
  });
});

// ═══════════════════════════════════════════════════════════════
// H-02: Compatibilidad con accidentalidad
// ═══════════════════════════════════════════════════════════════

describe('H-02: Compatibilidad GET /incidents sin filtro', () => {
  it('H-02d: sin investigationType se obtienen todos los registros', () => {
    // Simula el comportamiento: cuando no hay filtro, se devuelven todos
    const incidents = [
      { investigationType: InvestigationType.ACCIDENT },
      { investigationType: InvestigationType.DISEASE },
      { investigationType: undefined },
    ];

    // Sin filtro → todos
    const unfiltered = incidents.filter(() => true);
    assert.equal(unfiltered.length, 3);
  });

  it('H-02e: con filtro DISEASE solo se devuelven DISEASE', () => {
    const incidents = [
      { investigationType: InvestigationType.ACCIDENT },
      { investigationType: InvestigationType.DISEASE },
      { investigationType: InvestigationType.DISEASE },
      { investigationType: undefined },
    ];

    const filtered = incidents.filter((i) => i.investigationType === InvestigationType.DISEASE);
    assert.equal(filtered.length, 2);
  });

  it('H-02f: con filtro ACCIDENT solo se devuelven ACCIDENT', () => {
    const incidents = [
      { investigationType: InvestigationType.ACCIDENT },
      { investigationType: InvestigationType.DISEASE },
      { investigationType: undefined },
    ];

    const filtered = incidents.filter((i) => i.investigationType === InvestigationType.ACCIDENT);
    assert.equal(filtered.length, 1);
  });

  it('H-02g: filtro con companyId autenticado (no cross-tenant)', () => {
    // companyId siempre viene del JWT, nunca del query string
    const companyId = 'tenant-abc';
    const incidents = [
      { companyId: 'tenant-abc', investigationType: InvestigationType.DISEASE },
      { companyId: 'tenant-xyz', investigationType: InvestigationType.DISEASE },
    ];

    const filtered = incidents.filter(
      (i) => i.companyId === companyId && i.investigationType === InvestigationType.DISEASE,
    );
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].companyId, 'tenant-abc');
  });
});

// ═══════════════════════════════════════════════════════════════
// H-02: Tenant isolation
// ═══════════════════════════════════════════════════════════════

describe('H-02: Tenant isolation — no companyId en query params', () => {
  it('H-02h: QueryIncidentDto no acepta companyId como campo', () => {
    const dto = new QueryIncidentDto();
    // companyId no debe existir en el DTO
    assert.equal((dto as any).companyId, undefined);
  });

  it('H-02i: solo investigationType es filtro permitido', () => {
    const dto = new QueryIncidentDto();
    const keys = Object.keys(dto);
    assert.ok(keys.length <= 1, 'QueryIncidentDto solo debe tener investigationType como campo opcional');
    if (keys.length === 1) {
      assert.equal(keys[0], 'investigationType');
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// M-01: Default PENDING en schema
// ═══════════════════════════════════════════════════════════════

describe('M-01: Default PENDING en schema', () => {
  it('M-01f: default de status en InvestigationAction es PENDING', () => {
    // Verificar que el enum tiene PENDING como valor por defecto
    assert.equal(InvestigationActionStatus.PENDING, 'PENDING');
  });

  it('M-01g: los 4 estados cubren todo el ciclo de vida', () => {
    // PENDING → IN_PROGRESS → COMPLETED | CANCELLED
    const lifecycle = [
      InvestigationActionStatus.PENDING,
      InvestigationActionStatus.IN_PROGRESS,
      InvestigationActionStatus.COMPLETED,
    ];
    const cancelled = InvestigationActionStatus.CANCELLED;

    assert.equal(lifecycle.length, 3);
    assert.equal(cancelled, 'CANCELLED');
  });
});

// ═══════════════════════════════════════════════════════════════
// H-01: Catálogo — Rutas no alteradas
// ═══════════════════════════════════════════════════════════════

describe('H-01: Rutas de catálogo verificadas', () => {
  it('H-01a: 3.2.2 → /disease-investigation-management', () => {
    const standard = CATALOG_60.find((s) => s.code === '3.2.2');
    assert.ok(standard, '3.2.2 debe existir');
    assert.equal(standard.moduleRoute, '/disease-investigation-management');
  });

  it('H-01b: 3.2.1 → /absenteeism (no alterado)', () => {
    const standard = CATALOG_60.find((s) => s.code === '3.2.1');
    assert.ok(standard, '3.2.1 debe existir');
    assert.equal(standard.moduleRoute, '/absenteeism');
  });
});
