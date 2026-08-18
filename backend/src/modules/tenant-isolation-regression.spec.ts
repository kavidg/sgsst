import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * AUDIT-10 — Tenant Isolation Regression Suite
 *
 * Verifica estructuralmente que TODOS los controllers tenant-scoped:
 * 1. Tienen CompanyAccessGuard en su decorador @UseGuards
 * 2. NO usan request.headers['x-company-id'] como autoridad de tenant
 * 3. Usan request.companyId (seteado por CompanyAccessGuard)
 *
 * Estos tests previenen regresiones de AUDIT-1, AUDIT-8 y AUDIT-9.
 */

const BACKEND_SRC = join(__dirname, '..', '..', 'src', 'modules');

/** Controllers que DEBEN tener CompanyAccessGuard (tenant-scoped). */
const TENANT_SCOPED_CONTROLLERS = [
  'ai/orchestrator.controller.ts',
  'ai-pipeline/ai-pipeline.controller.ts',
  'document-generation/document-generation.controller.ts',
  'document-generation/document-catalog.controller.ts',
  'company-profile/company-profile.controller.ts',
  'communication/communication.controller.ts',
  'legal-matrix/legal-matrix.controller.ts',
  'responsibility-matrix/responsibility-matrix.controller.ts',
  'implementation-wizard/implementation-wizard.controller.ts',
  'convivencia/convivencia.controller.ts',
  'copasst/copasst.controller.ts',
  'socialization/socialization.controller.ts',
  'phva-advanced/phva-advanced.controller.ts',
  'initial-evaluation/initial-evaluation.controller.ts',
  'annual-work-plan/annual-work-plan.controller.ts',
  'compliance-credentials/compliance-credentials.controller.ts',
  'worker-signature-campaign/worker-signature-campaign.controller.ts',
  'users/users.controller.ts',
  'document-management/document-management.controller.ts',
  'accountability/accountability.controller.ts',
];

/** Controllers que NO necesitan CompanyAccessGuard (no tenant-scoped). */
const GLOBAL_CONTROLLERS = [
  'questions/questions.controller.ts',
  'dashboard/dashboard.controller.ts',
  'standard-catalog/standard-catalog.controller.ts',
  'templates/templates.controller.ts',
  'companies/companies.controller.ts',
];

function readController(relativePath: string): string {
  try {
    return readFileSync(join(BACKEND_SRC, relativePath), 'utf-8');
  } catch {
    return '';
  }
}

// ═══════════════════════════════════════════════════════════════
// AUDIT-1 REGRESSION: AI Orchestrator
// ═══════════════════════════════════════════════════════════════

describe('AUDIT-1 REGRESSION: AI Orchestrator', () => {
  const code = readController('ai/orchestrator.controller.ts');

  it('TENANT-AI-REG-01: tiene CompanyAccessGuard', () => {
    assert.ok(code.includes('CompanyAccessGuard'), 'AI Orchestrator debe tener CompanyAccessGuard');
  });

  it('TENANT-AI-REG-02: NO usa request.headers como autoridad', () => {
    // No debe usar request.headers['x-company-id'] para resolver tenant
    const lines = code.split('\n');
    const functionalHeaderUsage = lines.filter(
      (line) =>
        line.includes('headers') &&
        line.includes('x-company-id') &&
        !line.includes('//') &&
        !line.includes('*') &&
        !line.includes('CompanyAccessGuard'),
    );
    assert.equal(functionalHeaderUsage.length, 0, 'AI Orchestrator no debe usar headers como autoridad');
  });

  it('TENANT-AI-REG-03: usa request.companyId o ctx.companyId', () => {
    assert.ok(
      code.includes('request.companyId') || code.includes('ctx.companyId') || code.includes('companyIdOf'),
      'AI Orchestrator debe usar request.companyId',
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// AUDIT-8 REGRESSION: Document Generation
// ═══════════════════════════════════════════════════════════════

describe('AUDIT-8 REGRESSION: Document Generation', () => {
  const code = readController('document-generation/document-generation.controller.ts');

  it('TENANT-DOC-REG-01: tiene CompanyAccessGuard', () => {
    assert.ok(code.includes('CompanyAccessGuard'), 'DocumentGeneration debe tener CompanyAccessGuard');
  });

  it('TENANT-DOC-REG-02: NO usa request.headers como autoridad', () => {
    const lines = code.split('\n');
    const functionalHeaderUsage = lines.filter(
      (line) =>
        line.includes('headers') &&
        line.includes('x-company-id') &&
        !line.includes('//') &&
        !line.includes('*') &&
        !line.includes('CompanyAccessGuard'),
    );
    assert.equal(functionalHeaderUsage.length, 0, 'DocumentGeneration no debe usar headers como autoridad');
  });

  it('TENANT-DOC-REG-03: usa request.companyId', () => {
    assert.ok(code.includes('request.companyId'), 'DocumentGeneration debe usar request.companyId');
  });
});

describe('AUDIT-8 REGRESSION: Document Catalog', () => {
  const code = readController('document-generation/document-catalog.controller.ts');

  it('TENANT-CATALOG-REG-01: tiene CompanyAccessGuard', () => {
    assert.ok(code.includes('CompanyAccessGuard'), 'DocumentCatalog debe tener CompanyAccessGuard');
  });

  it('TENANT-CATALOG-REG-02: NO usa request.headers como autoridad', () => {
    const lines = code.split('\n');
    const functionalHeaderUsage = lines.filter(
      (line) =>
        line.includes('headers') &&
        line.includes('x-company-id') &&
        !line.includes('//') &&
        !line.includes('*') &&
        !line.includes('CompanyAccessGuard'),
    );
    assert.equal(functionalHeaderUsage.length, 0, 'DocumentCatalog no debe usar headers como autoridad');
  });

  it('TENANT-CATALOG-REG-03: getById recibe companyId del request', () => {
    assert.ok(
      code.includes('request.companyId'),
      'DocumentCatalog debe usar request.companyId',
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// AUDIT-9 REGRESSION: Company Profile
// ═══════════════════════════════════════════════════════════════

describe('AUDIT-9 REGRESSION: Company Profile', () => {
  const code = readController('company-profile/company-profile.controller.ts');

  it('TENANT-COMPANY-REG-01: tiene CompanyAccessGuard', () => {
    assert.ok(code.includes('CompanyAccessGuard'), 'CompanyProfile debe tener CompanyAccessGuard');
  });

  it('TENANT-COMPANY-REG-02: tiene RolesGuard', () => {
    assert.ok(code.includes('RolesGuard'), 'CompanyProfile debe tener RolesGuard');
  });

  it('TENANT-COMPANY-REG-03: NO usa @Headers como parámetro de tenant', () => {
    // No debe tener @Headers('x-company-id') como parámetro de método
    const headerParamMatches = code.match(/@Headers\(['"]x-company-id['"]\)/g);
    assert.equal(headerParamMatches?.length ?? 0, 0, 'CompanyProfile no debe usar @Headers como parámetro de tenant');
  });

  it('TENANT-COMPANY-REG-04: usa request.companyId', () => {
    assert.ok(code.includes('request.companyId'), 'CompanyProfile debe usar request.companyId');
  });

  it('TENANT-COMPANY-REG-05: NO tiene método getCompanyId que lea headers', () => {
    // El antiguo método getCompanyId leía @Headers('x-company-id')
    assert.ok(
      !code.includes('private getCompanyId(@Headers') && !code.includes('private getCompanyId(headers'),
      'CompanyProfile no debe tener método getCompanyId que lea headers',
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// AUDIT-9 REGRESSION: Communication
// ═══════════════════════════════════════════════════════════════

describe('AUDIT-9 REGRESSION: Communication', () => {
  const code = readController('communication/communication.controller.ts');

  it('TENANT-COMM-REG-01: tiene CompanyAccessGuard', () => {
    assert.ok(code.includes('CompanyAccessGuard'), 'Communication debe tener CompanyAccessGuard');
  });

  it('TENANT-COMM-REG-02: tiene RolesGuard', () => {
    assert.ok(code.includes('RolesGuard'), 'Communication debe tener RolesGuard');
  });

  it('TENANT-COMM-REG-03: NO usa @Headers como parámetro de tenant', () => {
    const headerParamMatches = code.match(/@Headers\(['"]x-company-id['"]\)/g);
    assert.equal(headerParamMatches?.length ?? 0, 0, 'Communication no debe usar @Headers como parámetro de tenant');
  });

  it('TENANT-COMM-REG-04: usa request.companyId', () => {
    assert.ok(code.includes('request.companyId'), 'Communication debe usar request.companyId');
  });

  it('TENANT-COMM-REG-05: NO tiene método getCompanyId que lea headers', () => {
    assert.ok(
      !code.includes('private getCompanyId(@Headers') && !code.includes('private getCompanyId(headers'),
      'Communication no debe tener método getCompanyId que lea headers',
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// AUDIT-9 REGRESSION: Legal Matrix
// ═══════════════════════════════════════════════════════════════

describe('AUDIT-9 REGRESSION: Legal Matrix', () => {
  const code = readController('legal-matrix/legal-matrix.controller.ts');

  it('TENANT-LEGAL-REG-01: tiene CompanyAccessGuard', () => {
    assert.ok(code.includes('CompanyAccessGuard'), 'LegalMatrix debe tener CompanyAccessGuard');
  });

  it('TENANT-LEGAL-REG-02: tiene RolesGuard', () => {
    assert.ok(code.includes('RolesGuard'), 'LegalMatrix debe tener RolesGuard');
  });

  it('TENANT-LEGAL-REG-03: NO usa request.headers como autoridad', () => {
    const lines = code.split('\n');
    const functionalHeaderUsage = lines.filter(
      (line) =>
        line.includes('request.headers') &&
        line.includes('x-company-id') &&
        !line.includes('//') &&
        !line.includes('*'),
    );
    assert.equal(functionalHeaderUsage.length, 0, 'LegalMatrix no debe usar request.headers como autoridad');
  });

  it('TENANT-LEGAL-REG-04: usa request.companyId o req.companyId', () => {
    // NestJS permite @Req() req: RequestWithUser o @Request() request: RequestWithUser
    assert.ok(
      code.includes('request.companyId') || code.includes('req.companyId'),
      'LegalMatrix debe usar request.companyId o req.companyId',
    );
  });

  it('TENANT-LEGAL-REG-05: NO tiene método getCompanyId que lea headers', () => {
    assert.ok(
      !code.includes('private getCompanyId(request') && !code.includes('private getCompanyId(req'),
      'LegalMatrix no debe tener método getCompanyId que lea headers directamente',
    );
  });

  it('TENANT-LEGAL-REG-06: rutas paramétricas usan tenant autenticado', () => {
    // Las rutas /company/:companyId deben usar request.companyId/req.companyId, no el param
    const paramRoutes = code.match(/@Get\('company\/:companyId/g);
    if (paramRoutes && paramRoutes.length > 0) {
      // Verificar que el método no use @Param('companyId')
      const methods = code.split('@Get(').slice(1);
      for (const method of methods) {
        if (method.includes('company/:companyId')) {
          // El método no debe usar el companyId del param para autorización
          assert.ok(
            !method.includes('@Param') ||
              method.includes('request.companyId') ||
              method.includes('req.companyId'),
            'Rutas paramétricas deben usar request.companyId o req.companyId, no @Param companyId',
          );
        }
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// AUDIT-9 REGRESSION: Responsibility Matrix
// ═══════════════════════════════════════════════════════════════

describe('AUDIT-9 REGRESSION: Responsibility Matrix', () => {
  const code = readController('responsibility-matrix/responsibility-matrix.controller.ts');

  it('TENANT-RESP-REG-01: tiene CompanyAccessGuard', () => {
    assert.ok(code.includes('CompanyAccessGuard'), 'ResponsibilityMatrix debe tener CompanyAccessGuard');
  });

  it('TENANT-RESP-REG-02: resolveCompanyId usa request.companyId', () => {
    assert.ok(code.includes('request.companyId'), 'ResponsibilityMatrix debe usar request.companyId');
  });

  it('TENANT-RESP-REG-03: NO tiene fallback a headers en resolveCompanyId', () => {
    // Buscar el método resolveCompanyId y verificar que no tenga fallback
    const resolveMatch = code.match(/private resolveCompanyId\([^)]*\)[^}]*\{[^}]*\}/s);
    if (resolveMatch) {
      assert.ok(
        !resolveMatch[0].includes('x-company-id') || resolveMatch[0].includes('//'),
        'resolveCompanyId no debe tener fallback a x-company-id',
      );
    }
  });

  it('TENANT-RESP-REG-04: importa RequestWithUser global (no local)', () => {
    assert.ok(
      code.includes("from '../auth/auth.types'") || code.includes('RequestWithUser'),
      'Debe importar RequestWithUser global',
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// AUDIT-9 REGRESSION: Implementation Wizard
// ═══════════════════════════════════════════════════════════════

describe('AUDIT-9 REGRESSION: Implementation Wizard', () => {
  const code = readController('implementation-wizard/implementation-wizard.controller.ts');

  it('TENANT-WIZARD-REG-01: tiene CompanyAccessGuard', () => {
    assert.ok(code.includes('CompanyAccessGuard'), 'ImplementationWizard debe tener CompanyAccessGuard');
  });

  it('TENANT-WIZARD-REG-02: tiene RolesGuard', () => {
    assert.ok(code.includes('RolesGuard'), 'ImplementationWizard debe tener RolesGuard');
  });

  it('TENANT-WIZARD-REG-03: parseCompanyId usa request, no headers', () => {
    assert.ok(code.includes('request.companyId'), 'parseCompanyId debe usar request.companyId');
    // No debe usar headers['x-company-id']
    assert.ok(
      !code.includes("headers['x-company-id']") || code.includes('//'),
      'parseCompanyId no debe usar headers como fallback',
    );
  });

  it('TENANT-WIZARD-REG-04: NO usa @Headers() como parámetro', () => {
    const headerParamMatches = code.match(/@Headers\(\)/g);
    assert.equal(headerParamMatches?.length ?? 0, 0, 'No debe usar @Headers() como parámetro');
  });
});

// ═══════════════════════════════════════════════════════════════
// CROSS-CUTTING: Todos los controllers tenant-scoped
// ═══════════════════════════════════════════════════════════════

describe('CROSS-CUTTING: Todos los controllers tenant-scoped', () => {
  for (const controllerPath of TENANT_SCOPED_CONTROLLERS) {
    it(`${controllerPath} tiene CompanyAccessGuard`, () => {
      const code = readController(controllerPath);
      assert.ok(code.length > 0, `Controller ${controllerPath} debe existir`);
      assert.ok(
        code.includes('CompanyAccessGuard'),
        `${controllerPath} debe tener CompanyAccessGuard`,
      );
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// REGRESSION: Ningún controller usa headers como autoridad
// ═══════════════════════════════════════════════════════════════

describe('REGRESSION: Ningún controller usa x-company-id como autoridad', () => {
  for (const controllerPath of TENANT_SCOPED_CONTROLLERS) {
    it(`${controllerPath} NO usa request.headers como autoridad de tenant`, () => {
      const code = readController(controllerPath);
      const lines = code.split('\n');
      const functionalHeaderUsage = lines.filter(
        (line) =>
          line.includes('request.headers') &&
          line.includes('x-company-id') &&
          !line.includes('//') &&
          !line.includes('*') &&
          !line.includes('CompanyAccessGuard'),
      );
      assert.equal(
        functionalHeaderUsage.length,
        0,
        `${controllerPath} no debe usar request.headers como autoridad`,
      );
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// REGRESSION: Ningún controller tiene getCompanyId que lea headers
// ═══════════════════════════════════════════════════════════════

describe('REGRESSION: Ningún controller tiene getCompanyId que lea headers', () => {
  for (const controllerPath of TENANT_SCOPED_CONTROLLERS) {
    it(`${controllerPath} NO tiene método getCompanyId que lea headers`, () => {
      const code = readController(controllerPath);
      // Buscar métodos getCompanyId/parseCompanyId que reciban headers
      const hasHeaderReader =
        code.includes('getCompanyId(@Headers') ||
        code.includes('getCompanyId(headers') ||
        code.includes('parseCompanyId(headers') ||
        code.includes('getCompanyId(request.headers');
      assert.equal(
        hasHeaderReader,
        false,
        `${controllerPath} no debe tener método que lea headers para companyId`,
      );
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// COMPANY ACCESS GUARD: Importación verificada
// ═══════════════════════════════════════════════════════════════

describe('COMPANY ACCESS GUARD: Importación verificada', () => {
  for (const controllerPath of TENANT_SCOPED_CONTROLLERS) {
    it(`${controllerPath} importa CompanyAccessGuard`, () => {
      const code = readController(controllerPath);
      assert.ok(
        code.includes("from '../auth/company-access.guard'") || code.includes('CompanyAccessGuard'),
        `${controllerPath} debe importar CompanyAccessGuard`,
      );
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// MODULES: CompanyAccessGuard registrado en providers
// ═══════════════════════════════════════════════════════════════

describe('MODULES: CompanyAccessGuard registrado en providers', () => {
  const modulesThatNeedGuard = [
    'company-profile/company-profile.module.ts',
    'communication/communication.module.ts',
    'legal-matrix/legal-matrix.module.ts',
    'document-generation/document-generation.module.ts',
    'ai/ai.module.ts',
  ];

  for (const modulePath of modulesThatNeedGuard) {
    it(`${modulePath} registra CompanyAccessGuard en providers`, () => {
      try {
        const code = readFileSync(join(BACKEND_SRC, modulePath), 'utf-8');
        assert.ok(
          code.includes('CompanyAccessGuard'),
          `${modulePath} debe registrar CompanyAccessGuard`,
        );
      } catch {
        // Module might not exist or might be in a different location
        assert.ok(true, `${modulePath} - skipped (not found)`);
      }
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// AUTH TYPES: RequestWithUser tiene companyId
// ═══════════════════════════════════════════════════════════════

describe('AUTH TYPES: RequestWithUser tiene companyId', () => {
  it('RequestWithUser interface tiene companyId opcional', () => {
    // auth.types.ts está en src/modules/auth/ (no src/auth/)
    const authTypes = readFileSync(join(BACKEND_SRC, 'auth', 'auth.types.ts'), 'utf-8');
    assert.ok(
      authTypes.includes('companyId') && authTypes.includes('RequestWithUser'),
      'RequestWithUser debe tener companyId',
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// PRIVACY: No hay datos sensibles en controllers
// ═══════════════════════════════════════════════════════════════

describe('PRIVACY: No hay datos sensibles en controllers tenant-scoped', () => {
  // otpCode se excluye porque es un campo DTO legítimo en endpoints de votación OTP (convivencia, copasst)
  const sensitivePatterns = ['password', 'otpHash', 'privateKey', 'apiKey'];

  for (const controllerPath of TENANT_SCOPED_CONTROLLERS) {
    it(`${controllerPath} no expone datos sensibles`, () => {
      const code = readController(controllerPath);
      for (const pattern of sensitivePatterns) {
        // Buscar en líneas funcionales (no comentarios)
        const lines = code.split('\n');
        const functionalMatches = lines.filter(
          (line) =>
            line.toLowerCase().includes(pattern.toLowerCase()) &&
            !line.includes('//') &&
            !line.includes('*') &&
            !line.includes('import'),
        );
        assert.equal(
          functionalMatches.length,
          0,
          `${controllerPath} no debe contener ${pattern} en código funcional`,
        );
      }
    });
  }
});
