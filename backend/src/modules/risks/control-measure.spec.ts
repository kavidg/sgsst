import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mongoose, { Types } from 'mongoose';
import { ControlMeasureSchema } from './schemas/control-measure.schema';
import { RiskSchema } from './schemas/risk.schema';
import { RisksService } from './risks.service';
import { CreateRiskDto } from './dto/create-risk.dto';
import { ControlMeasureDto } from './dto/control-measure.dto';

/**
 * Tests ETAPA 1 (PHVA 4.2.2) — ControlMeasure dentro de Risk.
 *
 * Valida:
 * - schema: description required/trim, isActive default true, _id estable
 * - Risk: controls existe con default [], legacy controlMeasures sigue String
 * - bootstrapLegacyControls: 1→1 sin split, idempotente, sin writes en lecturas
 * - service: create con solo controlMeasures / solo controls / ambos
 * - DTO: description con solo espacios queda vacía tras trim del schema
 */

const RiskModel =
  (mongoose.models.Risk as mongoose.Model<any>) ?? mongoose.model<any>('Risk', RiskSchema);

function createMockRiskModel(store: any[] = []) {
  const model: any = function (doc: any) {
    return {
      ...doc,
      save: async () => {
        doc._id = doc._id || new Types.ObjectId();
        doc.createdAt = doc.createdAt ?? new Date();
        doc.updatedAt = doc.updatedAt ?? new Date();
        store.push(doc);
        return doc;
      },
    };
  };
  model.__writes = 0;
  model.findOneAndUpdate = (query: any, update: any) => ({
    exec: async () => {
      model.__writes += 1;
      const idx = store.findIndex(
        (item) =>
          (!query._id || String(item._id) === String(query._id)) &&
          (!query.companyId || String(item.companyId) === String(query.companyId)),
      );
      if (idx === -1) return null;
      const merged = { ...store[idx], ...(update.$set ?? update) };
      store[idx] = merged;
      return merged;
    },
  });
  return model;
}

describe('ETAPA 1 — ControlMeasure (schema)', () => {
  it('case 6: isActive tiene default true', () => {
    const isActiveProp = ControlMeasureSchema.path('isActive') as any;
    assert.equal(isActiveProp.defaultValue, true);
  });

  it('case 4: description es required', () => {
    const descriptionProp = ControlMeasureSchema.path('description') as any;
    assert.equal(descriptionProp.isRequired, true);
  });

  it('case 1: Risk sin controls → default [] al instanciar', () => {
    const doc = new RiskModel({});
    assert.deepEqual((doc.controls ?? []).toObject?.() ?? [], []);
    assert.equal(doc.isNew, true);
  });

  it('case 2: Risk con un control válido conserva identidad estable (_id) y virtual id', () => {
    const doc = new RiskModel({});
    doc.controls = [{ description: 'Barandas en borde de losa' }];
    const sub = doc.controls[0];
    assert.ok(sub._id instanceof Types.ObjectId, 'el subdocumento obtiene _id propio');
    assert.equal(sub.id, String(sub._id), 'virtual id estable = hex del _id');
    assert.equal(sub.description, 'Barandas en borde de losa');
    assert.equal(sub.isActive, true);
  });

  it('case 3: Risk con varios controles los conserva todos con ids únicos', () => {
    const doc = new RiskModel({});
    doc.controls = [
      { description: 'Protección de máquina' },
      { description: 'Guardas fijas' },
      { description: 'EPP facial' },
    ];
    assert.equal(doc.controls.length, 3);
    const ids = new Set(doc.controls.map((c: any) => String(c._id)));
    assert.equal(ids.size, 3, 'cada subdocumento tiene su propio _id');
  });

  it('case 7: IDs estables — el _id del subdoc no cambia entre accesos ni tras markModified', () => {
    const doc = new RiskModel({});
    doc.controls = [{ description: 'Señalización' }];
    const idBefore = String(doc.controls[0]._id);
    doc.markModified('controls');
    assert.equal(String(doc.controls[0]._id), idBefore);
  });

  it('case 8: controlMeasures legacy sigue siendo String en el schema', () => {
    assert.equal(RiskSchema.path('controlMeasures').instance, 'String');
  });

  it('Risk.controls existe en el schema (DocumentArray de ControlMeasureSchema)', () => {
    const controlsPath = RiskSchema.path('controls');
    assert.ok(controlsPath, 'Risk.controls debe existir');
    assert.equal(controlsPath.instance, 'Array');
  });
});

describe('ETAPA 1 — Bootstrap legacy', () => {
  it('case 12: NO divide por comas — crea UN único ControlMeasure con el string completo', async () => {
    const risk: any = {
      _id: new Types.ObjectId(),
      companyId: new Types.ObjectId(),
      controlMeasures: 'Ventilación, EPP, guardas',
      controls: [],
    };
    const service = new RisksService(createMockRiskModel([risk]) as any, {} as any);
    const updated = await service.bootstrapLegacyControls(risk);
    assert.equal(updated.controls!.length, 1, 'un solo control, sin split');
    assert.equal(updated.controls![0].description, 'Ventilación, EPP, guardas');
    assert.equal(updated.controls![0].isActive, true);
  });

  it('no sobrescribe controles estructurados existentes', async () => {
    const service = new RisksService(createMockRiskModel() as any, {} as any);
    const risk: any = {
      _id: new Types.ObjectId(),
      companyId: new Types.ObjectId(),
      controlMeasures: 'Texto legacy',
      controls: [{ _id: new Types.ObjectId(), description: 'Ya estructurado', isActive: true }],
    };
    const updated = await service.bootstrapLegacyControls(risk);
    assert.equal(updated.controls!.length, 1);
    assert.equal(updated.controls![0].description, 'Ya estructurado');
  });

  it('case 13: idempotente — llamadas repetidas no duplican controles', async () => {
    const risk: any = {
      _id: new Types.ObjectId(),
      companyId: new Types.ObjectId(),
      controlMeasures: 'EPP obligatorio',
      controls: [],
    };
    const service = new RisksService(createMockRiskModel([risk]) as any, {} as any);
    const first = await service.bootstrapLegacyControls(risk);
    const second = await service.bootstrapLegacyControls(first);
    assert.equal(second.controls!.length, 1, 'segunda llamada no agrega nada');
  });

  it('datos ya canónicos → sin writes de fondo (lectura pura)', async () => {
    const risk: any = {
      _id: new Types.ObjectId(),
      companyId: new Types.ObjectId(),
      controlMeasures: 'EPP obligatorio',
      controls: [{ description: 'Ya estructurado', isActive: true }],
    };
    const model = createMockRiskModel([risk]);
    const service = new RisksService(model as any, {} as any);
    const updated = await service.bootstrapLegacyControls(risk);
    assert.equal(updated.controls!.length, 1, 'sin cambios en datos canónicos');
    assert.equal(model.__writes, 0, 'no persiste nada cuando ya hay controles');
  });

  it('bootstrap aplicable → exactamente un write explícito y controlado', async () => {
    const risk: any = {
      _id: new Types.ObjectId(),
      companyId: new Types.ObjectId(),
      controlMeasures: 'Texto legacy',
      controls: [],
    };
    const model = createMockRiskModel([risk]);
    const service = new RisksService(model as any, {} as any);
    await service.bootstrapLegacyControls(risk);
    assert.equal(model.__writes, 1, 'un write por bootstrap, verificable');
  });

  it('no hace nada si el string legacy está vacío', async () => {
    const service = new RisksService(createMockRiskModel() as any, {} as any);
    const risk: any = { _id: new Types.ObjectId(), companyId: new Types.ObjectId(), controlMeasures: '', controls: [] };
    const updated = await service.bootstrapLegacyControls(risk);
    assert.equal(updated.controls!.length, 0);
  });
});

describe('ETAPA 1 — Service create (compatibilidad legacy)', () => {
  it('case 9: crear Risk solo con controlMeasures sigue funcionando (flujo legacy)', async () => {
    const service = new RisksService(createMockRiskModel() as any, {} as any);
    const dto: CreateRiskDto = {
      process: 'Producción',
      activity: 'Corte',
      hazard: 'Cuchilla',
      risk: 'Corte de mano',
      probability: 2,
      consequence: 3,
      controlMeasures: 'Guarda de cuchilla',
    };
    const created: any = await service.create(new Types.ObjectId(), dto);
    assert.equal(created.controls?.length ?? 0, 0, 'sin controles estructurados implícitos');
    assert.equal(typeof created.controlMeasures, 'string');
  });

  it('case 10: crear Risk solo con controls funciona (controlMeasures vacío permitido)', async () => {
    const service = new RisksService(createMockRiskModel() as any, {} as any);
    const dto: CreateRiskDto = {
      process: 'Mantenimiento',
      activity: 'Trabajo en alturas',
      hazard: 'Caída',
      risk: 'Caída de altura',
      probability: 3,
      consequence: 5,
      controlMeasures: '',
      controls: [{ description: 'Arnés + línea de vida' }],
    };
    const created: any = await service.create(new Types.ObjectId(), dto);
    assert.equal(created.controls.length, 1);
    assert.equal(created.controls[0].isActive, true);
  });

  it('case 11: crear con ambos campos no rompe consumidores (string intacto + array presente)', async () => {
    const service = new RisksService(createMockRiskModel() as any, {} as any);
    const dto: CreateRiskDto = {
      process: 'Bodega',
      activity: 'Apilamiento',
      hazard: 'Caída de objetos',
      risk: 'Golpeado por objeto',
      probability: 2,
      consequence: 4,
      controlMeasures: 'Señalización y amarre de carga',
      controls: [{ description: 'Red perimetral' }],
    };
    const created: any = await service.create(new Types.ObjectId(), dto);
    assert.equal(created.controlMeasures, 'Señalización y amarre de carga');
    assert.equal(created.controls.length, 1);
  });

  it('el id del DTO es opcional y se respeta si viene (identidad controlada por cliente)', () => {
    const dto = new ControlMeasureDto();
    dto.description = 'Medida con id';
    assert.equal(dto.id, undefined);
    const withId: ControlMeasureDto = { id: '507f191e810c19729de860ea', description: 'X' };
    assert.equal(withId.id, '507f191e810c19729de860ea');
  });
});

describe('ETAPA 1 — Trim de description (case 5)', () => {
  it('description con solo espacios queda vacía tras el cast del schema (trim)', () => {
    const doc = new RiskModel({});
    doc.controls = [{ description: '   ' }];
    assert.equal(doc.controls[0].description, '', 'el schema trimea a string vacío');
  });

  it('description con espacios en los bordes se trimea conservando el contenido', () => {
    const doc = new RiskModel({});
    doc.controls = [{ description: '  Barandas fijas  ' }];
    assert.equal(doc.controls[0].description, 'Barandas fijas');
  });
});
