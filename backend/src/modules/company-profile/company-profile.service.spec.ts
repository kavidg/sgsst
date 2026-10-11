import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CompanyProfileService, COMPANY_PROFILE_REQUIRED_FIELDS } from './company-profile.service';

/**
 * Stub de CompanyProfileDoc que emula la hidratación de Mongoose:
 * - findOne() devuelve una COPIA hidratada del snapshot persistido (mutarla
 *   no afecta la "BD" hasta llamar save()).
 * - save() escribe el estado actual del doc de vuelta al store.
 * Esto reproduce exactamente la semántica del bug: si el service guarda antes
 * de calcular, el store conserva el % viejo.
 */
type ProfileSnapshot = Record<string, unknown>;

const EMPTY_PROFILE: ProfileSnapshot = {
  legalName: '', verificationDigit: '', companySize: '', riskLevel: '', companyType: '',
  address: '', city: '', department: '', phone: '', email: '',
  totalEmployees: 0, directEmployees: 0, arlName: '', sstStartDate: '', implementationStatus: '',
  website: '', logoUrl: '', maleEmployees: 0, femaleEmployees: 0,
  contractors: 0, apprentices: 0, temporaryWorkers: 0,
  workCenters: [], contacts: [], companyDocuments: [], responsibleSstUserId: null,
  history: [], completionPercentage: 0,
};

function makeDoc(store: Map<string, ProfileSnapshot>, companyId: string, initial: ProfileSnapshot = {}) {
  // Los arrays de EMPTY_PROFILE se clonan SIEMPRE: un spread shallow compartiría
  // la misma referencia entre documentos y los push/splice se filtrarían entre
  // tests (un doc de Mongoose tiene sus propios arrays).
  const doc: ProfileSnapshot & { save: () => Promise<unknown> } = {
    ...EMPTY_PROFILE,
    ...initial,
    workCenters: [...(initial.workCenters as unknown[] ?? [])],
    contacts: [...(initial.contacts as unknown[] ?? [])],
    companyDocuments: [...(initial.companyDocuments as unknown[] ?? [])],
    history: [...(initial.history as unknown[] ?? [])],
    companyId,
    async save() {
      const { save: _save, ...snapshot } = this;
      store.set(companyId, JSON.parse(JSON.stringify(snapshot)));
      return this;
    },
  };
  return doc;
}

interface Harness {
  service: CompanyProfileService;
  store: Map<string, ProfileSnapshot>;
  companies: Map<string, ProfileSnapshot>;
}

/** Crea un "contexto" de BD en memoria + instancia del service. */
function buildHarness(seedCompanies: Record<string, ProfileSnapshot> = {}): Harness {
  const store = new Map<string, ProfileSnapshot>();
  const companies = new Map<string, ProfileSnapshot>(Object.entries(seedCompanies));

  const profileModel = {
    findOne: (filter: { companyId: unknown }) => ({
      exec: async () => {
        const key = String(filter.companyId);
        const stored = store.get(key);
        return stored ? makeDoc(store, key, stored) : null;
      },
    }),
    create: async (init: { companyId: unknown }) => {
      const key = String(init.companyId);
      const doc = makeDoc(store, key);
      await doc.save();
      return doc;
    },
  };

  const companyModel = {
    findById: (id: unknown) => ({
      lean: () => ({
        exec: async () => companies.get(String(id)) ?? null,
      }),
    }),
  };

  const service = new CompanyProfileService(profileModel as never, companyModel as never);
  return { service, store, companies };
}

const COMPANY_A = '64b0000000000000000000a1';
const COMPANY_B = '64b0000000000000000000b2';

// totalPoints = 18 required + 7 extra + 4 (WC/contacts/docs/SST) = 29
// 3 campos requeridos → 3/29 = 10.34 → 10
// 5 campos requeridos → 5/29 = 17.24 → 17
// 18/29 = 62.06 → 62
// 29/29 → 100

describe('CompanyProfileService · completionPercentage (BUGFIX persistencia)', () => {
  it('BUG-1 · escritura con datos incompletos persiste el % calculado (antes guardaba 0)', async () => {
    const { service, store } = buildHarness({
      [COMPANY_A]: { name: 'Empresa A', nit: '900123', economicSector: 'Industria' },
    });

    await service.updateProfile(COMPANY_A as never, { legalName: 'Empresa A S.A.S.', verificationDigit: '1', companySize: 'Pequeña' }, 'uid');

    const persisted = store.get(COMPANY_A)!;
    assert.equal(persisted.completionPercentage, 21); // 3 sync + 3 payload = 6/29 = 20.7 → 21
  });

  it('BUG-2 · actualizar un campo que aumenta el % queda GUARDADO en la BD', async () => {
    const { service, store } = buildHarness({
      [COMPANY_A]: { name: 'Empresa A', nit: '900123', economicSector: 'Industria' },
    });
    await service.updateProfile(COMPANY_A as never, { legalName: 'X', verificationDigit: '1', companySize: 'Pequeña' }, 'uid');
    assert.equal(store.get(COMPANY_A)!.completionPercentage, 21);

    // Añade 2 campos requeridos más → 8/29 = 27.58 → 28
    await service.updateProfile(COMPANY_A as never, { riskLevel: 'III', companyType: 'Privada' }, 'uid');
    assert.equal(store.get(COMPANY_A)!.completionPercentage, 28);
  });

  it('BUG-3 · volver a obtener el perfil devuelve el % persistido correcto', async () => {
    const { service, store } = buildHarness({
      [COMPANY_A]: { name: 'Empresa A', nit: '900123', economicSector: 'Industria' },
    });
    await service.updateProfile(COMPANY_A as never, { legalName: 'X', verificationDigit: '1', companySize: 'Pequeña' }, 'uid');

    const profile = await service.getProfile(COMPANY_A as never);
    assert.equal(profile.completionPercentage, 21);
    assert.equal((store.get(COMPANY_A) as ProfileSnapshot).completionPercentage, 21);
  });

  it('BUG-4 · escenario reportado: guardar → destruir contexto → re-obtener NO vuelve a 0%', async () => {
    const seed = { [COMPANY_A]: { name: 'Empresa A', nit: '900123', economicSector: 'Industria' } };

    // "Sesión 1": el usuario configura su empresa.
    const session1 = buildHarness(seed);
    await session1.service.updateProfile(
      COMPANY_A as never,
      {
        legalName: 'Empresa A S.A.S.', verificationDigit: '1', companySize: 'Pequeña',
        riskLevel: 'III', companyType: 'Privada', address: 'Calle 1', city: 'Bogotá',
        department: 'Cundinamarca', phone: '6011234567', email: 'sst@empresa.com',
        totalEmployees: 25, directEmployees: 20, arlName: 'SURA', sstStartDate: '2026-01-01',
        implementationStatus: 'Initial Stage',
      },
      'uid',
    );
    const expected = (session1.store.get(COMPANY_A) as ProfileSnapshot).completionPercentage;
    assert.ok((expected as number) > 0);

    // "Sesión 2": contexto nuevo (remonte del módulo / restart del server)
    // sobre la misma BD persistida.
    const session2 = buildHarness(seed);
    // Los escritos de la sesión 1 quedaron "persistidos": replicar el store.
    for (const [key, value] of session1.store) session2.store.set(key, value);

    const reloaded = await session2.service.getProfile(COMPANY_A as never);
    assert.equal(reloaded.completionPercentage, expected); // NO vuelve a 0%
  });

  it('BUG-5 · perfil legacy con completionPercentage almacenado en 0 → GET deriva el % real SIN guardar', async () => {
    // Datos reales con 5 campos requeridos llenos, pero % materializado = 0
    // (estado de BD posterior al bug).
    const legacy: ProfileSnapshot = {
      ...EMPTY_PROFILE,
      companyName: 'Empresa A', nit: '900123', economicSector: 'Industria',
      legalName: 'X', verificationDigit: '1',
      completionPercentage: 0,
    };
    const { service, store } = buildHarness();
    store.set(COMPANY_A, legacy);

    const profile = await service.getProfile(COMPANY_A as never);
    assert.equal(profile.completionPercentage, 17); // 5/29 = 17.24 → 17 derivado
    // La lectura NO repara en silencio (GET sin escrituras): el stored sigue 0
    // hasta la próxima escritura, que ya persiste el valor calculado.
    assert.equal((store.get(COMPANY_A) as ProfileSnapshot).completionPercentage, 0);
  });

  it('BUG-6 · calculateCompletion conserva las reglas exactas (campos/pesos sin cambios)', async () => {
    const { service } = buildHarness();
    assert.equal(COMPANY_PROFILE_REQUIRED_FIELDS.length, 18); // contrato de campos obligatorios

    // Solo companyName → 1/29 = 3.45 → 3 (los 0 no cuentan como llenos)
    const doc1 = makeDoc(new Map(), 'x', { companyName: 'A', totalEmployees: 0 });
    await service.calculateCompletion(doc1 as never);
    assert.equal(doc1.completionPercentage, 3);

    // 18 requeridos + extras/vínculos vacíos → 18/29 = 62.06 → 62
    const allRequired = Object.fromEntries(COMPANY_PROFILE_REQUIRED_FIELDS.map((f) => [f, f === 'totalEmployees' || f === 'directEmployees' ? 5 : 'v'])) as ProfileSnapshot;
    const doc2 = makeDoc(new Map(), 'x', allRequired);
    await service.calculateCompletion(doc2 as never);
    assert.equal(doc2.completionPercentage, 62);

    // Todo lleno + WC + contacto + doc + responsable SST → 29/29 → 100
    const doc3 = makeDoc(new Map(), 'x', {
      ...allRequired,
      website: 'x', logoUrl: 'x', maleEmployees: 1, femaleEmployees: 1,
      contractors: 1, apprentices: 1, temporaryWorkers: 1,
      workCenters: [{ name: 'Sede' }], contacts: [{ type: 'HR' }],
      companyDocuments: [{ type: 'RUT' }], responsibleSstUserId: 'u1',
    });
    await service.calculateCompletion(doc3 as never);
    assert.equal(doc3.completionPercentage, 100);
  });

  it('BUG-7 · aislamiento: actualizar la Empresa A no altera el % de la Empresa B', async () => {
    const { service, store } = buildHarness({
      [COMPANY_A]: { name: 'Empresa A', nit: '900123', economicSector: 'Industria' },
      [COMPANY_B]: { name: 'Empresa B', nit: '800456', economicSector: 'Comercio' },
    });
    await service.updateProfile(COMPANY_A as never, { legalName: 'A S.A.S.', verificationDigit: '1', companySize: 'Pequeña' }, 'uid');

    assert.equal(store.get(COMPANY_A)!.completionPercentage, 21);
    assert.equal(store.get(COMPANY_B), undefined); // B aún sin perfil propio

    const profileB = await service.getProfile(COMPANY_B as never);
    assert.equal(profileB.completionPercentage, 10); // solo sus 3 campos sync → 3/29 → 10
    // La creación/lectura de B no escribió el % materializado (GET sin escrituras)
    assert.equal(store.get(COMPANY_B)!.completionPercentage, 0);
  });

  it('BUG-8 · operaciones de vínculos (workCenters/contacts/documents/SST) también persisten el %', async () => {
    const { service, store } = buildHarness({
      [COMPANY_A]: { name: 'Empresa A', nit: '900123', economicSector: 'Industria' },
    });
    await service.addWorkCenter(COMPANY_A as never, { name: 'Sede Norte' }, 'uid');
    assert.equal((store.get(COMPANY_A)!.workCenters as unknown[]).length, 1);
    assert.equal(store.get(COMPANY_A)!.completionPercentage, 14); // 3 sync + 1 WC = 4/29 = 13.79 → 14

    await service.upsertContact(COMPANY_A as never, { type: 'HR', name: 'Ana' }, 'uid');
    assert.equal(store.get(COMPANY_A)!.completionPercentage, 17); // 5/29

    await service.addDocument(COMPANY_A as never, { type: 'RUT', name: 'rut.pdf' }, 'uid');
    assert.equal(store.get(COMPANY_A)!.completionPercentage, 21); // 6/29

    await service.setSstResponsible(COMPANY_A as never, 'u1' as never, 'sst@empresa.com');
    assert.equal(store.get(COMPANY_A)!.completionPercentage, 24); // 7/29
  });
});

// ══════════════ DOC-UPLOAD — carga real de documentos (Storage) ══════════════

describe('CompanyProfileService · DOC-UPLOAD (addDocumentFile / removeDocument)', () => {
  const pdfFile = (overrides: Partial<Record<'size' | 'mimetype', unknown>> = {}) => ({
    originalname: 'RUT Empresa.pdf',
    mimetype: 'application/pdf',
    size: 1024,
    buffer: Buffer.from('pdf-bytes'),
    ...overrides,
  }) as never;

  function buildStorageHarness(seed: Record<string, ProfileSnapshot> = {
    [COMPANY_A]: { name: 'Empresa A', nit: '900123', economicSector: 'Industria' },
  }) {
    const harness = buildHarness(seed);
    const deleted: string[] = [];
    const storageService = {
      upload: async (buffer: Buffer, filename: string, folder: string) => ({
        fileUrl: `https://storage.googleapis.com/bucket/${folder}/1700000000000-RUT_Empresa.pdf`,
        storagePath: `${folder}/1700000000000-${filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`,
      }),
      delete: async (path: string) => {
        deleted.push(path);
      },
    };
    const service = new CompanyProfileService(
      (harness.service as unknown as { profileModel: unknown }).profileModel as never,
      (harness.service as unknown as { companyModel: unknown }).companyModel as never,
      storageService as never,
    );
    return { ...harness, service, deleted };
  }

  it('DOC-1 · documento válido → sube a Storage y guarda metadata + storagePath', async () => {
    const { service, store, deleted } = buildStorageHarness();
    await service.addDocumentFile(COMPANY_A as never, pdfFile(), 'RUT', 'uid', 'sst@empresa.com');
    const docs = store.get(COMPANY_A)!.companyDocuments as Array<Record<string, unknown>>;
    assert.equal(docs.length, 1);
    assert.equal(docs[0].type, 'RUT');
    assert.equal(docs[0].name, 'RUT Empresa.pdf'); // nombre derivado del archivo
    assert.ok(String(docs[0].fileUrl).startsWith('https://'));
    assert.match(String(docs[0].storagePath), /companies\/.*\/company-documents\//);
    assert.equal(docs[0].isVerified, false);
    assert.equal(deleted.length, 0);
  });

  it('DOC-2 · sin archivo → BadRequestException', async () => {
    const { service } = buildStorageHarness();
    await assert.rejects(
      () => service.addDocumentFile(COMPANY_A as never, undefined as never, 'RUT', 'uid'),
      /El archivo es obligatorio/,
    );
  });

  it('DOC-3 · sin tipo → BadRequestException', async () => {
    const { service } = buildStorageHarness();
    await assert.rejects(
      () => service.addDocumentFile(COMPANY_A as never, pdfFile(), '', 'uid'),
      /El tipo de documento es obligatorio/,
    );
  });

  it('DOC-4 · archivo demasiado grande → BadRequestException', async () => {
    const { service } = buildStorageHarness();
    await assert.rejects(
      () => service.addDocumentFile(COMPANY_A as never, pdfFile({ size: 21 * 1024 * 1024 }), 'RUT', 'uid'),
      /tamaño máximo/,
    );
  });

  it('DOC-5 · formato no permitido → BadRequestException (sin consumir Storage)', async () => {
    const { service } = buildStorageHarness();
    await assert.rejects(
      () => service.addDocumentFile(COMPANY_A as never, pdfFile({ mimetype: 'application/zip' }), 'RUT', 'uid'),
      /Formato no soportado/,
    );
  });

  it('DOC-6 · eliminar documento con storagePath → borra archivo físico y registro', async () => {
    const { service, store, deleted } = buildStorageHarness();
    await service.addDocumentFile(COMPANY_A as never, pdfFile(), 'RUT', 'uid');
    const storedPath = (store.get(COMPANY_A)!.companyDocuments as Array<Record<string, unknown>>)[0].storagePath;

    await service.removeDocument(COMPANY_A as never, 0, 'uid');
    assert.deepEqual(deleted, [storedPath]);
    assert.equal((store.get(COMPANY_A)!.companyDocuments as unknown[]).length, 0);
  });

  it('DOC-7 · documento histórico sin storagePath → se elimina sin tocar Storage', async () => {
    const { service, store, deleted } = buildStorageHarness();
    store.set(COMPANY_A, {
      ...EMPTY_PROFILE,
      companyName: 'Empresa A', nit: '900123', economicSector: 'Industria',
      companyDocuments: [{ type: 'RUT', name: 'antiguo.pdf', fileUrl: 'https://legacy/rut.pdf', isVerified: true, uploadedAt: '2025-01-01' }],
      completionPercentage: 10,
    });

    await service.removeDocument(COMPANY_A as never, 0, 'uid');
    assert.equal(deleted.length, 0); // sin storagePath → nunca llama Storage.delete
    assert.equal((store.get(COMPANY_A)!.companyDocuments as unknown[]).length, 0);
  });

  it('DOC-8 · la empresa siempre es la del contexto (request.companyId), no otra', async () => {
    const { service, store } = buildStorageHarness({
      [COMPANY_A]: { name: 'Empresa A', nit: '900123', economicSector: 'Industria' },
      [COMPANY_B]: { name: 'Empresa B', nit: '800456', economicSector: 'Comercio' },
    });
    await service.addDocumentFile(COMPANY_A as never, pdfFile(), 'RUT', 'uid');
    assert.equal((store.get(COMPANY_A)!.companyDocuments as unknown[]).length, 1);
    assert.equal(store.get(COMPANY_B), undefined); // B intacta
  });

  // ══════════════ FASE 1 — abstracción de storage + signed URLs ══════════════

  describe('FASE 1 · provider privado (R2) y visualización firmada', () => {
    /** Storage mock en MODO PRIVADO (R2): upload sin fileUrl pública + getSignedUrl. */
    function buildPrivateStorageHarness(signedUrl = 'https://signed.example/objeto?exp=123') {
      const base = buildHarness({
        [COMPANY_A]: { name: 'Empresa A', nit: '900123', economicSector: 'Industria' },
        [COMPANY_B]: { name: 'Empresa B', nit: '800456', economicSector: 'Comercio' },
      });
      const deleted: string[] = [];
      const signedRequests: string[] = [];
      const storageService = {
        // FASE 1 — en providers privados el facade devuelve fileUrl = ''.
        upload: async (buffer: Buffer, filename: string, folder: string) => ({
          fileUrl: '',
          storagePath: `${folder}/1700000000000-${filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`,
        }),
        delete: async (path: string) => {
          deleted.push(path);
        },
        getSignedUrl: async (path: string) => {
          signedRequests.push(path);
          return { signedUrl, expiresIn: 300 };
        },
      };
      const service = new CompanyProfileService(
        (base.service as unknown as { profileModel: unknown }).profileModel as never,
        (base.service as unknown as { companyModel: unknown }).companyModel as never,
        storageService as never,
      );
      return { service, store: base.store, deleted, signedRequests, signedUrl };
    }

    it('F1-1 · upload usa StorageService, guarda storagePath y NO persiste URL pública ni signed URL', async () => {
      const { service, store } = buildPrivateStorageHarness();
      await service.addDocumentFile(COMPANY_A as never, pdfFile(), 'RUT', 'uid');

      const docs = store.get(COMPANY_A)!.companyDocuments as Array<Record<string, unknown>>;
      assert.equal(docs.length, 1);
      assert.match(String(docs[0].storagePath), /^companies\/.*\/company-documents\/\d+-RUT_Empresa\.pdf$/);
      // Provider privado: NINGUNA URL permanente (ni pública ni firmada) en MongoDB.
      assert.equal(docs[0].fileUrl, '');
      assert.ok(!String(docs[0].storagePath).startsWith('https://'));
    });

    it('F1-2 · getDocumentSignedUrl firma el storagePath del documento bajo demanda', async () => {
      const { service, store, signedRequests, signedUrl } = buildPrivateStorageHarness();
      await service.addDocumentFile(COMPANY_A as never, pdfFile(), 'RUT', 'uid');
      const storagePath = (store.get(COMPANY_A)!.companyDocuments as Array<Record<string, unknown>>)[0].storagePath;

      const result = await service.getDocumentSignedUrl(COMPANY_A as never, 0);

      assert.deepEqual(signedRequests, [storagePath]);
      assert.equal(result.signedUrl, signedUrl);
      assert.equal(result.expiresIn, 300);
      // La firma NO se persistió: el store no cambió por pedir la URL.
      assert.equal(
        (store.get(COMPANY_A)!.companyDocuments as Array<Record<string, unknown>>)[0].storagePath,
        storagePath,
      );
    });

    it('F1-3 · aislamiento: un storagePath fuera de la carpeta de la empresa NO se firma', async () => {
      const { service } = buildPrivateStorageHarness();
      // Registro corrupto/foráneo: la empresa activa es A pero el path apunta a B.
      (service as unknown as { profileModel: { findOne: (f: { companyId: unknown }) => { exec: () => Promise<unknown> } } }).profileModel = {
        findOne: (f: { companyId: unknown }) => ({
          exec: async () => ({
            companyDocuments: [{ type: 'RUT', name: 'x.pdf', fileUrl: '', storagePath: `companies/${COMPANY_B}/company-documents/robo.pdf`, isVerified: false }],
          }),
        }),
      } as never;

      await assert.rejects(
        () => service.getDocumentSignedUrl(COMPANY_A as never, 0),
        /no pertenece a la empresa activa/,
      );
    });

    it('F1-4 · índice inexistente → NotFound; histórico sin storagePath → BadRequest controlado', async () => {
      const { service, store } = buildPrivateStorageHarness();
      await assert.rejects(
        () => service.getDocumentSignedUrl(COMPANY_A as never, 7),
        /Document not found/,
      );

      store.set(COMPANY_A, {
        ...EMPTY_PROFILE,
        companyName: 'Empresa A', nit: '900123', economicSector: 'Industria',
        companyDocuments: [{ type: 'RUT', name: 'antiguo.pdf', fileUrl: 'https://storage.googleapis.com/legacy/rut.pdf', isVerified: true }],
      });
      await assert.rejects(
        () => service.getDocumentSignedUrl(COMPANY_A as never, 0),
        /registro histórico/,
      );
    });

    it('F1-5 · removeDocument en provider privado sigue borrando por storagePath', async () => {
      const { service, store, deleted } = buildPrivateStorageHarness();
      await service.addDocumentFile(COMPANY_A as never, pdfFile(), 'RUT', 'uid');
      const storagePath = (store.get(COMPANY_A)!.companyDocuments as Array<Record<string, unknown>>)[0].storagePath as string;

      await service.removeDocument(COMPANY_A as never, 0, 'uid');

      assert.deepEqual(deleted, [storagePath]);
      assert.equal((store.get(COMPANY_A)!.companyDocuments as unknown[]).length, 0);
    });
  });

  it('DOC-9 · removeDocument tolera fallo de Storage y elimina el registro igualmente', async () => {
    const harness = buildHarness({
      [COMPANY_A]: { name: 'Empresa A', nit: '900123', economicSector: 'Industria' },
    });
    const failingStorage = { delete: async () => { throw new Error('storage down'); } };
    const service = new CompanyProfileService(
      (harness.service as unknown as { profileModel: unknown }).profileModel as never,
      (harness.service as unknown as { companyModel: unknown }).companyModel as never,
      failingStorage as never,
    );
    // documento con storagePath preexistente
    harness.store.set(COMPANY_A, {
      ...EMPTY_PROFILE,
      companyDocuments: [{ type: 'RUT', name: 'a.pdf', fileUrl: 'https://x/a.pdf', storagePath: 'companies/x/company-documents/a.pdf', isVerified: false, uploadedAt: '2025-01-01' }],
    });

    // No debe lanzar aunque Storage falle
    await service.removeDocument(COMPANY_A as never, 0, 'uid');
    assert.equal((harness.store.get(COMPANY_A)!.companyDocuments as unknown[]).length, 0);
  });
});
