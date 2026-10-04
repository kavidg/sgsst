import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { validateSync } from 'class-validator';
import { CATALOG_60 } from '../standard-catalog/constants/catalog-60';
import {
  SST_EPP_ITEM_CODE,
  SST_EPP_LEGACY_ITEM_CODES,
  isSstEppItemCode,
} from './schemas/phva-advanced-epp.schema';
import { UpdateSstEppCatalogItemDto, UpdateSstEppDto } from './dto/update-sst-epp.dto';

/**
 * Regresiones de seguridad e identidad del módulo EPP (4.2.6 — Alternativa B).
 *
 * 1) updateEpp usa DTO ESTRICTO: el cliente no puede modificar complianceStatus,
 *    itemCode, history ni companyId (antes: Record<string, unknown> + Object.assign).
 * 2) La identidad del módulo ya NO colisiona con el requisito 1.2.3 del catálogo
 *    (Curso 50 horas SG-SST): código canónico '4.2.6' + lectura legacy '1.2.3'.
 */

function readSource(relativePath: string): string {
  // dist-test/modules/phva-advanced → 3 niveles hasta backend/ (patrón repo).
  return fs.readFileSync(path.resolve(__dirname, `../../../${relativePath}`), 'utf-8');
}

const serviceSource = readSource('src/modules/phva-advanced/phva-advanced.service.ts');
const controllerSource = readSource('src/modules/phva-advanced/phva-advanced.controller.ts');

describe('SstEpp — seguridad de updateEpp (4.2.6)', () => {
  it('el service firma updateEpp con UpdateSstEppDto (no Record<string, unknown>)', () => {
    assert.match(serviceSource, /updateEpp\(companyId: Types\.ObjectId, user: UserDocument, dto: UpdateSstEppDto\)/);
    assert.doesNotMatch(serviceSource, /updateEpp\(companyId: Types\.ObjectId, user: UserDocument, dto: Record<string, unknown>\)/);
  });

  it('el controller declara UpdateSstEppDto en el PATCH /epp', () => {
    assert.match(controllerSource, /import \{ UpdateSstEppDto \} from '\.\/dto\/update-sst-epp\.dto';/);
    assert.match(controllerSource, /dto: UpdateSstEppDto/);
  });

  it('updateEpp ya NO asigna complianceStatus al documento', () => {
    const methodStart = serviceSource.indexOf('async updateEpp(');
    assert.ok(methodStart > -1);
    const methodSource = serviceSource.slice(methodStart, methodStart + 2200);
    assert.doesNotMatch(methodSource, /record\.complianceStatus\s*=/);
    assert.doesNotMatch(methodSource, /Object\.assign\(record,\s*dto\)/);
  });

  it('el DTO rechaza campos de scoring/identidad (forbidNonWhitelisted)', () => {
    const malicious = Object.assign(new UpdateSstEppDto(), {
      complianceStatus: 'COMPLIES',
      itemCode: '1.2.3',
      history: [{ action: 'HACK' }],
      companyId: '507f1f77bcf86cd799439099',
      catalog: [{ eppId: 'EPP-1', name: 'Casco', category: 'Cabeza' }],
    });

    const errors = validateSync(malicious, { whitelist: true, forbidNonWhitelisted: true });
    const rejected = errors.map((e) => e.property);
    for (const forbidden of ['complianceStatus', 'itemCode', 'history', 'companyId']) {
      assert.ok(rejected.includes(forbidden), `campo prohibido rechazado: ${forbidden}`);
    }
  });

  it('el DTO acepta campos de gestión legítimos', () => {
    // validateSync no transforma: los ítems anidados deben ser instancias del DTO.
    const catalogItem = Object.assign(new UpdateSstEppCatalogItemDto(), {
      eppId: 'EPP-1',
      name: 'Casco',
      category: 'Cabeza',
      expectedLifespanMonths: 24,
      active: true,
    });
    const legit = Object.assign(new UpdateSstEppDto(), {
      complianceReason: 'Matriz actualizada por seguridad y salud en el trabajo',
      year: 2026,
      catalog: [catalogItem],
    });
    assert.equal(validateSync(legit, { whitelist: true, forbidNonWhitelisted: true }).length, 0);
  });
});

describe('SstEpp — identidad 4.2.6 sin colisión con 1.2.3', () => {
  it('el código canónico del módulo EPP es 4.2.6 (no 1.2.3)', () => {
    assert.equal(SST_EPP_ITEM_CODE, '4.2.6');
    assert.deepEqual([...SST_EPP_LEGACY_ITEM_CODES], ['1.2.3']);
    assert.equal(isSstEppItemCode('4.2.6'), true);
    assert.equal(isSstEppItemCode('1.2.3'), true, 'legacy: documentos históricos siguen legibles');
    assert.equal(isSstEppItemCode('9.9.9'), false);
  });

  it('el schema usa el código canónico como default y conserva el índice único', () => {
    const schemaSource = readSource('src/modules/phva-advanced/schemas/phva-advanced-epp.schema.ts');
    assert.match(schemaSource, /@Prop\(\{ default: SST_EPP_ITEM_CODE \}\) itemCode/);
    assert.match(schemaSource, /SstEppSchema\.index\(\{ companyId: 1, itemCode: 1 \}, \{ unique: true \}\)/);
    assert.doesNotMatch(schemaSource, /default: '1\.2\.3'/);
  });

  it('findOrCreateEpp hace matching legacy-aware e inserta SOLO con el código canónico', () => {
    const methodStart = serviceSource.indexOf('async findOrCreateEpp(');
    const methodSource = serviceSource.slice(methodStart, methodStart + 700);
    assert.match(methodSource, /\$in: \[SST_EPP_ITEM_CODE, \.\.\.SST_EPP_LEGACY_ITEM_CODES\]/);
    assert.match(methodSource, /\$setOnInsert: \{ companyId, itemCode: SST_EPP_ITEM_CODE \}/);
    assert.doesNotMatch(methodSource, /itemCode: '1\.2\.3'/);
  });

  it('el requisito normativo 1.2.3 del catálogo NO fue alterado (Curso 50 horas, PLANEAR)', () => {
    const curso50 = CATALOG_60.find((s) => s.code === '1.2.3');
    assert.ok(curso50, '1.2.3 presente en el catálogo');
    assert.match(curso50.title, /50 horas/);
    assert.equal(curso50.phva, 'PLANEAR');
    assert.equal(curso50.implementationStatus, 'IMPLEMENTED');
  });

  it('4.2.6 existe en el catálogo como EPP (HACER) — identidad semántica del módulo', () => {
    const epp = CATALOG_60.find((s) => s.code === '4.2.6');
    assert.ok(epp, '4.2.6 presente en el catálogo');
    assert.equal(epp.title, 'EPP');
    assert.equal(epp.phva, 'HACER');
  });
});
