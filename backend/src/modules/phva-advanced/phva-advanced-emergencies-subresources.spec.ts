import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import 'reflect-metadata';
import { validateSync } from 'class-validator';
import {
  EmergencyBrigadeFunction,
  EmergencyContactType,
  EmergencyResourceStatus,
  EmergencyResourceType,
} from './schemas/phva-advanced-emergencies.schema';
import {
  AddEvacuationCountDto,
  CreateBrigadeMemberDto,
  CreateEmergencyContactDto,
  CreateEmergencyResourceDto,
  UpdateBrigadeMemberDto,
  UpdateEmergencyContactDto,
  UpdateEmergencyResourceDto,
  UpdateEvacuationRouteDto,
  UpdateMeetingPointDto,
} from './dto/update-emergencies.dto';

/**
 * Regresiones de Etapa 2 (5.1.1): contactos de emergencia (cadena de
 * llamadas), recursos tipados (inventario de preparación, NO Maintenance),
 * brigadistas tipados → Employee con snapshot server-side y evacuación
 * (rutas/puntos/conteo). Patrón de validación source-based del repositorio.
 */

function readSource(relativePath: string): string {
  // dist-test/modules/phva-advanced → 3 niveles hasta backend/ (patrón repo).
  return fs.readFileSync(path.resolve(__dirname, `../../../${relativePath}`), 'utf-8');
}

const schemaSource = readSource('src/modules/phva-advanced/schemas/phva-advanced-emergencies.schema.ts');
const serviceSource = readSource('src/modules/phva-advanced/phva-advanced.service.ts');
const controllerSource = readSource('src/modules/phva-advanced/phva-advanced.controller.ts');

describe('EmergencyContact — contactos y cadena de llamadas', () => {
  it('los tipos de contacto cubren los actores de la cadena de llamadas', () => {
    assert.deepEqual([...Object.values(EmergencyContactType)], [
      'ARL', 'BOMBEROS', 'AMBULANCIA', 'POLICIA', 'HOSPITAL',
      'IPS', 'DEFENSA_CIVIL', 'CRUZ_ROJA', 'INTERNO', 'OTRO',
    ]);
  });

  it('el DTO de creación exige tipo/nombre/teléfono y callOrder positivo', () => {
    const errors = validateSync(new CreateEmergencyContactDto(), { whitelist: true, forbidNonWhitelisted: true });
    const rejected = errors.map((e) => e.property);
    assert.ok(rejected.includes('type'), 'type es obligatorio');
    assert.ok(rejected.includes('name'), 'name es obligatorio');
    assert.ok(rejected.includes('phone'), 'phone es obligatorio');

    const invalid = Object.assign(new CreateEmergencyContactDto(), {
      type: 'BOMBEROS', name: 'Bomberos', phone: '123', callOrder: 0,
    });
    const invalidErrors = validateSync(invalid, { whitelist: true, forbidNonWhitelisted: true });
    assert.ok(invalidErrors.some((e) => e.property === 'callOrder'), 'callOrder debe ser ≥ 1');

    const legit = Object.assign(new CreateEmergencyContactDto(), {
      type: 'CRUZ_ROJA', name: 'Cruz Roja seccional', phone: '132',
      secondaryPhone: '+57 601 555 0123', callOrder: 2,
    });
    assert.equal(validateSync(legit, { whitelist: true, forbidNonWhitelisted: true }).length, 0);
  });

  it('el DTO rechaza companyId y valores fuera del enum de contacto', () => {
    const malicious = Object.assign(new UpdateEmergencyContactDto(), {
      companyId: '507f1f77bcf86cd799439099',
      type: 'HACKER',
    });
    const errors = validateSync(malicious, { whitelist: true, forbidNonWhitelisted: true });
    const rejected = errors.map((e) => e.property);
    assert.ok(rejected.includes('companyId'), 'companyId no es aceptable');
    assert.ok(rejected.includes('type'), 'type fuera del enum rechazado');
  });

  it('la creación de contactos genera contactId en el servidor con callOrder por defecto 1', () => {
    const methodStart = serviceSource.indexOf('async createEmergencyContact(');
    assert.ok(methodStart > -1);
    const methodSource = serviceSource.slice(methodStart, methodStart + 900);
    assert.match(methodSource, /contactId: new Types\.ObjectId\(\)\.toString\(\)/);
    assert.match(methodSource, /callOrder: dto\.callOrder \?\? 1/);
  });
});

describe('EmergencyEquipment — recursos tipados (NO Maintenance)', () => {
  it('la tipología distingue extintores, botiquines, camillas, alarmas y señalización', () => {
    assert.deepEqual([...Object.values(EmergencyResourceType)], [
      'EXTINTOR', 'BOTIQUIN', 'CAMILLA', 'ALARMA', 'SENALIZACION',
      'KIT_EMERGENCIA', 'EQUIPO_COMUNICACION', 'LINTERNA', 'RADIO', 'OTRO',
    ]);
  });

  it('los estados operativos son OPERATIVE/PARTIAL/INOPERATIVE', () => {
    assert.deepEqual([...Object.values(EmergencyResourceStatus)], ['OPERATIVE', 'PARTIAL', 'INOPERATIVE']);
  });

  it('el schema conserva el campo legacy `type` y `status` para compatibilidad de providers', () => {
    assert.match(schemaSource, /@Prop\(\{ default: 'General' \}\) type!: string;/);
    assert.match(schemaSource, /@Prop\(\{ default: 'OPERATIVO' \}\) status!: string;/);
    assert.match(schemaSource, /@Prop\(\{ enum: Object\.values\(EmergencyResourceType\) \}\) resourceType/);
    assert.match(schemaSource, /@Prop\(\{ enum: Object\.values\(EmergencyResourceStatus\) \}\) operationalStatus/);
  });

  it('la creación espeja resourceType/operationalStatus en los campos legacy (providers siguen leyendo)', () => {
    const methodStart = serviceSource.indexOf('async createEmergencyResource(');
    const methodSource = serviceSource.slice(methodStart, methodStart + 1200);
    assert.match(methodSource, /type: dto\.resourceType/);
    assert.match(methodSource, /status: this\.legacyResourceStatus\(operationalStatus\)/);
  });

  it('el DTO de recursos rechaza companyId y estados fuera del enum', () => {
    const malicious = Object.assign(new CreateEmergencyResourceDto(), {
      resourceType: 'EXTINTOR', name: 'Extintor PQS 20', companyId: '507f1f77bcf86cd799439099',
      operationalStatus: 'EXPLODED', quantity: -5,
    });
    const errors = validateSync(malicious, { whitelist: true, forbidNonWhitelisted: true });
    const rejected = errors.map((e) => e.property);
    assert.ok(rejected.includes('companyId'));
    assert.ok(rejected.includes('operationalStatus'));
    assert.ok(rejected.includes('quantity'), 'cantidad debe ser positiva');
  });
});

describe('BrigadeMember — brigadistas tipados → Employee (5.1.2)', () => {
  it('las funciones de brigada incluyen líder, evacuación, primeros auxilios y contra incendio', () => {
    assert.deepEqual([...Object.values(EmergencyBrigadeFunction)], [
      'LEADER', 'EVACUATION', 'FIRST_AID', 'FIREFIGHTING', 'COMMUNICATION', 'LOGISTICS', 'OTHER',
    ]);
  });

  it('el miembro referencia Employee con snapshot server-side y flag de suplente', () => {
    assert.match(schemaSource, /@Prop\(\{ required: true, type: Types\.ObjectId, ref: 'Employee' \}\)\n  employeeId!/);
    assert.match(schemaSource, /employeeNameSnapshot!: string/);
    assert.match(schemaSource, /isAlternate!: boolean/);
    assert.match(schemaSource, /trainingDate\?: Date/);
  });

  it('el snapshot del nombre NUNCA se acepta del frontend', () => {
    const dto = Object.assign(new CreateBrigadeMemberDto(), {
      employeeId: '507f1f77bcf86cd799439011',
      function: 'FIRST_AID',
      employeeNameSnapshot: 'Nombre Falsificado',
    });
    const errors = validateSync(dto, { whitelist: true, forbidNonWhitelisted: true });
    const rejected = errors.map((e) => e.property);
    assert.ok(rejected.includes('employeeNameSnapshot'), 'employeeNameSnapshot no es parte del contrato');
  });

  it('la creación valida Employee contra la empresa autenticada y genera el snapshot en servidor', () => {
    const methodStart = serviceSource.indexOf('async createBrigadeMember(');
    const methodSource = serviceSource.slice(methodStart, methodStart + 1500);
    assert.match(methodSource, /assertEmployeeBelongsToCompany\(dto\.employeeId, companyId\)/);
    assert.match(methodSource, /employeeNameSnapshot: employee\.name/);
  });

  it('la actualización REGENERÁ el snapshot si cambia el Employee (nunca lo acepta del cliente)', () => {
    const methodStart = serviceSource.indexOf('async updateBrigadeMember(');
    const methodSource = serviceSource.slice(methodStart, methodStart + 1500);
    assert.match(methodSource, /assertEmployeeBelongsToCompany\(dto\.employeeId, companyId\)/);
    assert.match(methodSource, /member\.employeeNameSnapshot = employee\.name/);
  });

  it('un Employee de otra empresa es rechazado con BadRequest (tenant isolation)', () => {
    const methodStart = serviceSource.indexOf('private async assertEmployeeBelongsToCompany(');
    const methodSource = serviceSource.slice(methodStart, methodStart + 600);
    assert.match(methodSource, /findOne\(\{ _id: new Types\.ObjectId\(employeeId\), companyId \}\)/);
    assert.match(methodSource, /El brigadista no pertenece a la empresa\./);
  });

  it('el schema conserva members[] legacy y agrega typedMembers sin migración automática', () => {
    assert.match(schemaSource, /@Prop\(\{ type: \[String\], default: \[\] \}\) members!: string\[\];/);
    assert.match(schemaSource, /@Prop\(\{ type: \[BrigadeMember\], default: \[\] \}\) typedMembers!: BrigadeMember\[\];/);
    assert.match(schemaSource, /LEGACY: miembros como texto libre/);
  });
});

describe('Evacuación — rutas, puntos de encuentro y conteo', () => {
  it('las rutas nuevas registran responsable, capacidad, salida y señalización', () => {
    assert.match(schemaSource, /responsible!: string;\n  \/\*\* Capacidad estimada de la ruta \(personas\)\. \*\//);
    assert.match(schemaSource, /estimatedCapacity!: number;/);
    assert.match(schemaSource, /associatedExit!: string;/);
    assert.match(schemaSource, /signageVerified!: boolean;/);
  });

  it('los puntos de encuentro registran responsable, procedimiento y conteo esperado', () => {
    assert.match(schemaSource, /@Prop\(\{ default: '' \}\) responsible!: string;\n  \/\*\* Procedimiento de conteo del punto\. \*\//);
    assert.match(schemaSource, /countProcedure!: string;/);
    assert.match(schemaSource, /counts!: EmergencyEvacuationCount\[\];/);
  });

  it('el conteo calcula faltantes server-side como max(0, esperado − realizado)', () => {
    const methodStart = serviceSource.indexOf('async addEvacuationCount(');
    const methodSource = serviceSource.slice(methodStart, methodStart + 1100);
    assert.match(methodSource, /missingCount: dto\.missingCount \?\? Math\.max\(0, dto\.expectedCount - dto\.actualCount\)/);
  });

  it('el DTO de ruta rechaza companyId y exige tiempos positivos', () => {
    const malicious = Object.assign(new UpdateEvacuationRouteDto(), {
      companyId: '507f1f77bcf86cd799439099',
      estimatedTimeMinutes: 0,
    });
    const errors = validateSync(malicious, { whitelist: true, forbidNonWhitelisted: true });
    const rejected = errors.map((e) => e.property);
    assert.ok(rejected.includes('companyId'));
    assert.ok(rejected.includes('estimatedTimeMinutes'), 'tiempo debe ser ≥ 1');
  });

  it('el DTO de punto valida coordenadas numéricas y conteo no negativo', () => {
    const invalid = Object.assign(new UpdateMeetingPointDto(), {
      coordinates: ['a', 'b'],
      expectedCount: -1,
    });
    const errors = validateSync(invalid, { whitelist: true, forbidNonWhitelisted: true });
    const rejected = errors.map((e) => e.property);
    assert.ok(rejected.includes('coordinates'), 'coordenadas deben ser numéricas');
    assert.ok(rejected.includes('expectedCount'), 'conteo esperado debe ser ≥ 0');

    const legit = Object.assign(new UpdateMeetingPointDto(), {
      name: 'Punto norte', capacity: 80, coordinates: [4.6097, -74.0817],
      responsible: 'Brigadista jefe', countProcedure: 'Lista nominal por área', expectedCount: 45,
    });
    assert.equal(validateSync(legit, { whitelist: true, forbidNonWhitelisted: true }).length, 0);
  });

  it('el DTO de conteo exige fecha y conteos no negativos', () => {
    const errors = validateSync(new AddEvacuationCountDto(), { whitelist: true, forbidNonWhitelisted: true });
    const rejected = errors.map((e) => e.property);
    assert.ok(rejected.includes('date'));
    assert.ok(rejected.includes('expectedCount'));
    assert.ok(rejected.includes('actualCount'));
  });
});

describe('Endpoints y permisos de los subrecursos (Etapa 2)', () => {
  it('el controller expone contactos, recursos, brigadistas, rutas, puntos y conteo', () => {
    for (const route of [
      "@Post('emergencies/contacts')",
      "@Patch('emergencies/contacts/:contactId')",
      "@Delete('emergencies/contacts/:contactId')",
      "@Post('emergencies/equipment')",
      "@Patch('emergencies/equipment/:equipmentId')",
      "@Delete('emergencies/equipment/:equipmentId')",
      "@Post('emergencies/brigades/:brigadeId/members')",
      "@Patch('emergencies/brigades/:brigadeId/members/:memberId')",
      "@Delete('emergencies/brigades/:brigadeId/members/:memberId')",
      "@Patch('emergencies/evacuation-routes/:routeId')",
      "@Patch('emergencies/meeting-points/:pointId')",
      "@Post('emergencies/meeting-points/:pointId/counts')",
    ]) {
      assert.ok(controllerSource.includes(route), `endpoint ausente: ${route}`);
    }
  });

  it('los subrecursos nuevos respetan la política de escritura owner/admin/manager', () => {
    const contactsStart = controllerSource.indexOf('Contactos de emergencia / cadena de llamadas (5.1.1)');
    const segment = controllerSource.slice(contactsStart, contactsStart + 6000);
    const roleCount = (segment.match(/@Roles\('owner', 'admin', 'manager'\)/g) ?? []).length;
    assert.ok(roleCount >= 12, `se esperaban ≥ 12 declaraciones de Roles en la sección Etapa 2, hay ${roleCount}`);
  });

  it('companyId SIEMPRE viene del contexto autenticado (nunca del body) en los subrecursos', () => {
    const contactsStart = controllerSource.indexOf('Contactos de emergencia / cadena de llamadas (5.1.1)');
    const segment = controllerSource.slice(contactsStart, contactsStart + 6000);
    assert.ok(segment.includes('this.resolveCompanyId(request)'));
    assert.doesNotMatch(segment, /dto\.companyId/);
  });

  it('las búsquedas por id ocurren DENTRO del documento de la empresa (un id ajeno produce 404)', () => {
    for (const [method, needle] of [
      ['async updateEmergencyContact(', "record.contacts.find((c) => c.contactId === contactId)"],
      ['async updateEmergencyResource(', 'record.equipment.find((e) => e.equipmentId === equipmentId)'],
      ['async updateBrigadeMember(', 'brigade.typedMembers.find((m) => m.memberId === memberId)'],
      ['async updateEvacuationRoute(', 'record.evacuationRoutes.find((r) => r.routeId === routeId)'],
      ['async updateMeetingPoint(', 'record.meetingPoints.find((p) => p.pointId === pointId)'],
    ] as const) {
      const methodStart = serviceSource.indexOf(method);
      assert.ok(methodStart > -1, `método ausente: ${method}`);
      const methodSource = serviceSource.slice(methodStart, methodStart + 1200);
      assert.ok(methodSource.includes(needle), `búsqueda in-tenant ausente en ${method}`);
    }
  });

  it('el borrado de contactos/recursos/brigadistas es LÓGICO', () => {
    assert.match(serviceSource, /async deactivateEmergencyContact\([\s\S]{0,200}\{ active: false \}/);
    assert.match(serviceSource, /async deactivateEmergencyResource\([\s\S]{0,200}\{ active: false \}/);
    assert.match(serviceSource, /async deactivateBrigadeMember\([\s\S]{0,200}\{ active: false \}/);
  });
});

describe('Frontera 5.1.1 / 5.1.2 (documentada)', () => {
  it('el schema documenta qué evidencia pertenece a cada estándar sin duplicar la brigada', () => {
    assert.match(schemaSource, /5\.1\.1 = Plan de prevención, preparación y respuesta ante emergencias/);
    assert.match(schemaSource, /5\.1\.2 = Brigada de emergencia/);
    assert.match(schemaSource, /La MISMA brigada puede ser leída por ambos estándares/);
  });
});
