import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CATALOG_60 } from '../standard-catalog/constants/catalog-60';

/**
 * FASE 35B — Verificación estructural (source-level) de la infraestructura
 * estadística de enfermedad laboral:
 *
 * - registro del módulo en AppModule;
 * - ausencia de campos clínicos en el schema (Gate 3);
 * - NO conversión automática Incident/Absenteeism → caso (Gates 4/5);
 * - NO integración al ComplianceEngine ni indicadores (Gate 6);
 * - 3.3.4 y 3.3.5 permanecen PLANNED / HACER / sin provider (Gate 7);
 * - NO se infiere población en riesgo desde Risk (Gate 8).
 */

const BACKEND_ROOT = resolve(__dirname, '../../..');

function readSource(relativePath: string): string {
  return readFileSync(resolve(BACKEND_ROOT, relativePath), 'utf-8');
}

describe('FASE 35B — Cableado estructural de la infraestructura estadística', () => {
  it('OccupationalDiseaseStatisticalCaseModule está registrado en AppModule', () => {
    const source = readSource('src/app.module.ts');
    assert.match(source, /OccupationalDiseaseStatisticalCaseModule/);
    assert.match(
      source,
      /occupational-disease-statistical-case\/occupational-disease-statistical-case\.module/,
    );
  });

  it('GATE 3: el schema NO almacena campos clínicos (inspección de nombres de campo)', () => {
    const source = readSource(
      'src/modules/occupational-disease-statistical-case/schemas/occupational-disease-statistical-case.schema.ts',
    );
    // Extraer ÚNICAMENTE los nombres de campo declarados en la clase
    // (líneas "fieldName!: tipo" o "fieldName?: tipo"), ignorando comentarios
    // (los comentarios documentan la PROHIBICIÓN y pueden citar términos).
    const fieldNames = Array.from(
      source.matchAll(/^\s{2}([A-Za-z_][A-Za-z0-9_]*)[!?]:/gm),
    ).map((m) => m[1].toLowerCase());
    assert.ok(fieldNames.length > 0, 'el schema declara campos');

    const forbidden = [
      'diagnostico',
      'cie',
      'historiaClinica',
      'medicalRecord',
      'sintomas',
      'symptoms',
      'tratamiento',
      'treatment',
      'medicamento',
      'medication',
      'incapacidad',
      'clinicalNotes',
    ];
    for (const term of forbidden) {
      const violation = fieldNames.find((f) => f.includes(term.toLowerCase()));
      assert.equal(
        violation,
        undefined,
        `campo clínico prohibido detectado: ${violation} (término: ${term})`,
      );
    }
  });

  it('el schema declara los campos estadísticos mínimos obligatorios', () => {
    const source = readSource(
      'src/modules/occupational-disease-statistical-case/schemas/occupational-disease-statistical-case.schema.ts',
    );
    for (const field of [
      'companyId',
      'statisticalCaseId',
      'employeeId',
      'occupationalQualification',
      'recognitionDate',
      'caseStatus',
      'period',
      'periodYear',
      'periodMonth',
      'firstOccurrence',
      'investigationRef',
      'active',
      'createdBy',
      'updatedBy',
    ]) {
      assert.match(
        source,
        new RegExp(`^\\s{2}${field}[!?]:`, 'm'),
        `campo ${field} presente en el schema`,
      );
    }
  });

  it('GATE: índice único tenant-scoped { companyId, statisticalCaseId }', () => {
    const source = readSource(
      'src/modules/occupational-disease-statistical-case/schemas/occupational-disease-statistical-case.schema.ts',
    );
    assert.match(source, /\{ companyId: 1, statisticalCaseId: 1 \}/);
    assert.match(source, /unique: true/);
  });

  /** Extrae las sentencias import COMPLETAS (incluye imports multilínea). */
  function extractImportStatements(source: string): string {
    return (source.match(/import\s+[^;]+from\s+'[^']+'/gs) ?? []).join('\n');
  }

  it('GATE 4/5: NO existe conversión automática Incident/Absenteeism → caso', () => {
    // El service solo consulta Incident para VALIDAR la referencia manual
    // opcional; no importa ni consulta Absenteeism.
    const service = readSource(
      'src/modules/occupational-disease-statistical-case/occupational-disease-statistical-case.service.ts',
    );
    const importStatements = extractImportStatements(service);
    assert.match(importStatements, /employees\/schemas\/employee\.schema/);
    assert.match(importStatements, /incidents\/schemas\/incident\.schema/);
    assert.doesNotMatch(importStatements, /Absenteeism/);
    assert.doesNotMatch(importStatements, /absenteeism/);
    // No hay método de sincronización desde Incident.
    assert.doesNotMatch(service, /syncFrom|createFromIncident|convertIncident/);
  });

  it('GATE 6 (actualizado FASE 35C-2/35D-2/35E-2): 3.3.4/3.3.5/3.3.6 usan fuentes EXACTAS', () => {
    const engineModule = readSource(
      'src/modules/compliance-engine/compliance-engine.module.ts',
    );
    const engineService = readSource(
      'src/modules/compliance-engine/compliance-engine.service.ts',
    );
    // FASE 35C-2: DiseasePrevalenceProvider (3.3.4) registrado.
    assert.match(engineModule, /DiseasePrevalenceProvider/);
    assert.match(engineService, /diseasePrevalenceProvider/);
    // FASE 35D-2: DiseaseIncidenceProvider (3.3.5) registrado —provider EXACT
    // sobre el registro estadístico, SIN conversión automática Incident→3.3.5.
    assert.match(engineModule, /DiseaseIncidenceProvider/);
    assert.match(engineService, /diseaseIncidenceProvider/);
    // Frontera anti-double-scoring (GATE 20): los providers de prevalencia e
    // incidencia NO consumen fuentes de 3.2.3 (accident-statistics) ni de
    // 3.3.2 (severidad). (FASE 35E-2: medical-absenteeism NO aparece aquí por
    // diseño — Absenteeism ES su fuente normativa; su frontera se valida en
    // compliance-engine-3-3-6.spec.ts con sus propias prohibiciones.)
    for (const providerFile of [
      'src/modules/compliance-engine/providers/disease-prevalence.provider.ts',
      'src/modules/compliance-engine/providers/disease-incidence.provider.ts',
    ]) {
      const providerSource = readSource(providerFile);
      for (const forbidden of ['Incident', 'Absenteeism', 'AccidentStatistics', 'AccidentSeverity', 'DiseaseInvestigation']) {
        assert.doesNotMatch(
          providerSource,
          new RegExp(`from[^;]*${forbidden}`),
          `${providerFile} no debe importar ${forbidden} como fuente`,
        );
      }
    }
  });

  it('GATE 6: NO se integra la fuente en DataSourceResolverRegistry/FormulaRegistry', () => {
    const registry = readSource(
      'src/modules/indicators/formula/data-source-resolver-registry.ts',
    );
    assert.doesNotMatch(registry, /occupational-disease|OccupationalDiseaseStatisticalCase/);
  });

  it('GATE 8: NO se implementa Applicability Engine ni población en riesgo desde Risk', () => {
    const moduleSource = readSource(
      'src/modules/occupational-disease-statistical-case/occupational-disease-statistical-case.module.ts',
    );
    assert.doesNotMatch(moduleSource, /AtRiskPopulation|ApplicabilityEngine/);
    const service = readSource(
      'src/modules/occupational-disease-statistical-case/occupational-disease-statistical-case.service.ts',
    );
    const importStatements = extractImportStatements(service);
    assert.doesNotMatch(importStatements, /risks\/|RiskSchema/);
  });
});

describe('FASE 35B — Invariantes de catálogo 3.3.4 y 3.3.5 (IMPLEMENTED desde 35C-2/35D-2)', () => {
  it('3.3.4 IMPLEMENTED / HACER / peso 1 / provider EXACT disease-prevalence (Gate 7 actualizado 35C-2)', () => {
    const std = CATALOG_60.find((s) => s.code === '3.3.4');
    assert.ok(std, '3.3.4 presente en catálogo');
    assert.equal(std.title, 'Medición de la prevalencia de enfermedad laboral');
    assert.equal(std.implementationStatus, 'IMPLEMENTED', '3.3.4 IMPLEMENTED (FASE 35C-2)');
    assert.equal(std.phva, 'HACER');
    assert.equal(std.normativeWeight, 1);
    assert.deepEqual(std.applicableLevels, ['60']);
    assert.equal(std.moduleRoute, '/occupational-disease-statistical-cases');
    assert.equal(std.validationProvider, 'disease-prevalence.provider');
    assert.ok(std.criteria, 'criteria definido (patrón IMPLEMENTED)');
    assert.ok(std.modeReview, 'modeReview definido (patrón IMPLEMENTED)');
    // La FASE 35A confirmó que 3.3.4 NO es COMPLEMENTARY en el catálogo.
    assert.notEqual(std.classification, 'COMPLEMENTARY');
  });

  it('3.3.5 IMPLEMENTED / HACER / peso 1 / provider EXACT disease-incidence (Gate 7 actualizado 35D-2)', () => {
    const std = CATALOG_60.find((s) => s.code === '3.3.5');
    assert.ok(std, '3.3.5 presente en catálogo');
    assert.equal(std.title, 'Medición de la incidencia de enfermedad laboral');
    assert.equal(std.implementationStatus, 'IMPLEMENTED', '3.3.5 IMPLEMENTED (FASE 35D-2)');
    assert.equal(std.phva, 'HACER');
    assert.equal(std.normativeWeight, 1);
    assert.deepEqual(std.applicableLevels, ['60']);
    assert.equal(std.moduleRoute, '/occupational-disease-statistical-cases');
    assert.equal(std.validationProvider, 'disease-incidence.provider');
    assert.ok(std.criteria, 'criteria definido (patrón IMPLEMENTED)');
    assert.ok(std.modeReview, 'modeReview definido (patrón IMPLEMENTED)');
    assert.notEqual(std.classification, 'COMPLEMENTARY');
  });

  it('ningún estándar DISTINTO de 3.3.4/3.3.5 apunta al módulo de infraestructura (sin scoring accidental)', () => {
    for (const std of CATALOG_60) {
      assert.notEqual(
        std.validationProvider,
        'occupational-disease-statistical-case.provider',
      );
      // FASE 35C-2/35D-2: 3.3.4 y 3.3.5 son los únicos estándares cuyo route
      // de scoring es la página del registro estadístico (fuente única).
      if (std.code === '3.3.4' || std.code === '3.3.5') continue;
      assert.notEqual(
        std.moduleRoute,
        '/occupational-disease-statistical-cases',
        'el módulo de infraestructura no es route de scoring de ningún otro estándar',
      );
    }
    const std3_3_4 = CATALOG_60.find((s) => s.code === '3.3.4');
    const std3_3_5 = CATALOG_60.find((s) => s.code === '3.3.5');
    assert.equal(std3_3_4?.moduleRoute, '/occupational-disease-statistical-cases');
    assert.equal(std3_3_5?.moduleRoute, '/occupational-disease-statistical-cases');
  });
});
