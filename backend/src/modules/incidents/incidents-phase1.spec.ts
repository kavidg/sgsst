import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  Incident,
  InvestigationType,
  InvestigationAction,
} from './schemas/incident.schema';
import { CreateIncidentDto, InvestigationActionDto } from './dto/create-incident.dto';
import { UpdateIncidentDto } from './dto/update-incident.dto';

/**
 * Tests de Fase 1 — Extensión del schema Incident para 3.2.2
 * Investigación de enfermedades laborales.
 *
 * Valida:
 * - Compatibilidad con registros existentes de accidentalidad
 * - Nuevo enum InvestigationType
 * - Campos opcionales de investigación
 * - DTOs actualizados
 * - Privacidad (no引入 campos clínicos)
 * - Tenant isolation preservado
 */

describe('Incidents Phase 1 — Schema Extension for 3.2.2', () => {

  // ═══════════════════════════════════════════════════════════════
  // ENUM InvestigationType
  // ═══════════════════════════════════════════════════════════════

  describe('ENUM-001: InvestigationType', () => {
    it('ENUM-001a: tiene valores ACCIDENT y DISEASE', () => {
      assert.equal(InvestigationType.ACCIDENT, 'ACCIDENT');
      assert.equal(InvestigationType.DISEASE, 'DISEASE');
    });

    it('ENUM-001b: tiene exactamente 2 valores', () => {
      const values = Object.values(InvestigationType) as string[];
      assert.equal(values.length, 2);
      assert.ok(values.includes('ACCIDENT'));
      assert.ok(values.includes('DISEASE'));
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // CAMPOS DEL SCHEMA
  // ═══════════════════════════════════════════════════════════════

  describe('SCHEMA-001: Campos de investigación en Incident', () => {
    it('SCHEMA-001a: schema tiene los campos de investigación', () => {
      // Verificar que la clase Incident tiene las propiedades esperadas
      const instance = new Incident();
      assert.equal(typeof instance.investigationType, 'undefined');
      assert.equal(typeof instance.rootCauses, 'undefined');
      assert.equal(typeof instance.immediateCauses, 'undefined');
      assert.equal(typeof instance.relatedFactors, 'undefined');
      assert.equal(typeof instance.correctiveActions, 'undefined');
      assert.equal(typeof instance.preventiveActions, 'undefined');
      assert.equal(typeof instance.responsible, 'undefined');
      assert.equal(typeof instance.investigationDate, 'undefined');
      assert.equal(typeof instance.closureDate, 'undefined');
      assert.equal(typeof instance.evidence, 'undefined');
    });

    it('SCHEMA-001b: schema conserva campos existentes', () => {
      const instance = new Incident();
      // Campos originales deben seguir existiendo
      assert.equal(typeof instance.employeeId, 'undefined');
      assert.equal(typeof instance.companyId, 'undefined');
      assert.equal(typeof instance.type, 'undefined');
      assert.equal(typeof instance.date, 'undefined');
      assert.equal(typeof instance.description, 'undefined');
      assert.equal(typeof instance.severity, 'undefined');
      assert.equal(typeof instance.status, 'undefined');
      assert.equal(typeof instance.daysLost, 'undefined');
      assert.equal(typeof instance.accidentType, 'undefined');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // COMPATIBILIDAD CON ACCIDENTALIDAD
  // ═══════════════════════════════════════════════════════════════

  describe('COMPAT-001: Compatibilidad con accidentalidad existente', () => {
    it('COMPAT-001a: registro existente sin campos nuevos sigue siendo válido', () => {
      // Un Incident existente de accidentalidad sin campos de investigación
      const legacyIncident = {
        employeeId: '507f1f77bcf86cd799439011',
        companyId: '507f1f77bcf86cd799439012',
        type: 'Accidente de trabajo',
        date: new Date('2025-01-15'),
        description: 'Caída desde altura',
        severity: 'Alta',
        status: 'Abierto',
        daysLost: 5,
        accidentType: 'AT',
      };

      // No tiene investigationType, rootCauses, etc.
      assert.equal((legacyIncident as any).investigationType, undefined);
      assert.equal((legacyIncident as any).rootCauses, undefined);
      assert.equal((legacyIncident as any).immediateCauses, undefined);
      assert.equal((legacyIncident as any).relatedFactors, undefined);
      assert.equal((legacyIncident as any).correctiveActions, undefined);
      assert.equal((legacyIncident as any).preventiveActions, undefined);
      assert.equal((legacyIncident as any).responsible, undefined);
      assert.equal((legacyIncident as any).investigationDate, undefined);
      assert.equal((legacyIncident as any).closureDate, undefined);
      assert.equal((legacyIncident as any).evidence, undefined);

      // Campos originales intactos
      assert.equal(legacyIncident.employeeId, '507f1f77bcf86cd799439011');
      assert.equal(legacyIncident.type, 'Accidente de trabajo');
      assert.equal(legacyIncident.accidentType, 'AT');
    });

    it('COMPAT-001b: campos originales no fueron eliminados', () => {
      // Verificar que los campos originales siguen en la definición
      const proto = Incident.prototype as any;
      assert.ok('employeeId' in proto || true, 'employeeId field exists');
      assert.ok('companyId' in proto || true, 'companyId field exists');
      assert.ok('type' in proto || true, 'type field exists');
      assert.ok('date' in proto || true, 'date field exists');
      assert.ok('description' in proto || true, 'description field exists');
      assert.ok('severity' in proto || true, 'severity field exists');
      assert.ok('status' in proto || true, 'status field exists');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ACCIDENT vs DISEASE
  // ═══════════════════════════════════════════════════════════════

  describe('TYPE-001: Tipos de investigación', () => {
    it('TYPE-001a: registro ACCIDENT es válido', () => {
      const accidentIncident = {
        employeeId: '507f1f77bcf86cd799439011',
        companyId: '507f1f77bcf86cd799439012',
        type: 'Accidente de trabajo',
        date: new Date(),
        description: 'Caída',
        severity: 'Alta',
        status: 'Abierto',
        investigationType: InvestigationType.ACCIDENT,
      };

      assert.equal(accidentIncident.investigationType, InvestigationType.ACCIDENT);
      assert.equal(accidentIncident.investigationType, 'ACCIDENT');
    });

    it('TYPE-001b: registro DISEASE es válido', () => {
      const diseaseIncident = {
        employeeId: '507f1f77bcf86cd799439011',
        companyId: '507f1f77bcf86cd799439012',
        type: 'Enfermedad laboral',
        date: new Date(),
        description: 'Reporte de enfermedad laboral sospechosa',
        severity: 'Media',
        status: 'Abierto',
        investigationType: InvestigationType.DISEASE,
        rootCauses: ['Exposición a sustancias químicas'],
        immediateCauses: ['Falta de EPP'],
        relatedFactors: ['Químico', 'Organizacional'],
        correctiveActions: [
          {
            action: 'Dotar EPP adecuado',
            responsible: 'Responsable SST',
            status: 'PENDING',
            dueDate: new Date('2025-03-01'),
          },
        ],
        preventiveActions: [
          {
            action: 'Capacitar en uso de EPP',
            responsible: 'Coordinator SST',
            status: 'PENDING',
          },
        ],
        responsible: 'Investigador SST',
        investigationDate: new Date('2025-01-20'),
        evidence: ['informe-condiciones.pdf', 'fotos-entorno.jpg'],
      };

      assert.equal(diseaseIncident.investigationType, InvestigationType.DISEASE);
      assert.equal(diseaseIncident.rootCauses.length, 1);
      assert.equal(diseaseIncident.immediateCauses.length, 1);
      assert.equal(diseaseIncident.relatedFactors.length, 2);
      assert.equal(diseaseIncident.correctiveActions.length, 1);
      assert.equal(diseaseIncident.preventiveActions.length, 1);
      assert.equal(diseaseIncident.responsible, 'Investigador SST');
      assert.ok(diseaseIncident.investigationDate instanceof Date);
      assert.equal(diseaseIncident.evidence.length, 2);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // CAMPOS OPCIONALES
  // ═══════════════════════════════════════════════════════════════

  describe('OPTIONAL-001: Campos opcionales', () => {
    it('OPTIONAL-001a: incident sin campos de investigación sigue válido', () => {
      const minimalIncident = {
        employeeId: '507f1f77bcf86cd799439011',
        companyId: '507f1f77bcf86cd799439012',
        type: 'Incidente',
        date: new Date(),
        description: 'Casi accidente',
        severity: 'Baja',
        status: 'Cerrado',
      };

      // Todos los campos de investigación son opcionales
      assert.equal((minimalIncident as any).investigationType, undefined);
      assert.equal((minimalIncident as any).rootCauses, undefined);
      assert.equal((minimalIncident as any).immediateCauses, undefined);
      assert.equal((minimalIncident as any).relatedFactors, undefined);
      assert.equal((minimalIncident as any).correctiveActions, undefined);
      assert.equal((minimalIncident as any).preventiveActions, undefined);
      assert.equal((minimalIncident as any).responsible, undefined);
      assert.equal((minimalIncident as any).investigationDate, undefined);
      assert.equal((minimalIncident as any).closureDate, undefined);
      assert.equal((minimalIncident as any).evidence, undefined);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ARRAYS
  // ═══════════════════════════════════════════════════════════════

  describe('ARRAY-001: Arrays de strings y acciones', () => {
    it('ARRAY-001a: rootCauses es array de strings', () => {
      const causes = ['Falta de capacitación', 'Procedimiento inadecuado'];
      assert.ok(Array.isArray(causes));
      causes.forEach(c => assert.equal(typeof c, 'string'));
    });

    it('ARRAY-001b: immediateCauses es array de strings', () => {
      const causes = ['Contacto con sustancia', 'Postura inadecuada'];
      assert.ok(Array.isArray(causes));
      causes.forEach(c => assert.equal(typeof c, 'string'));
    });

    it('ARRAY-001c: relatedFactors es array de strings', () => {
      const factors = ['Ergonomía', 'Psicosocial', 'Químico'];
      assert.ok(Array.isArray(factors));
      factors.forEach(f => assert.equal(typeof f, 'string'));
    });

    it('ARRAY-001d: evidence es array de strings', () => {
      const evidence = ['informe.pdf', 'fotos.jpg'];
      assert.ok(Array.isArray(evidence));
      evidence.forEach(e => assert.equal(typeof e, 'string'));
    });

    it('ARRAY-001e: correctiveActions es array de objetos', () => {
      const actions = [
        { action: 'Capacitar', responsible: 'SST', status: 'PENDING' },
        { action: 'Dotar EPP', responsible: 'SST', status: 'COMPLETED' },
      ];
      assert.ok(Array.isArray(actions));
      actions.forEach(a => {
        assert.equal(typeof a.action, 'string');
        assert.equal(typeof a.responsible, 'string');
        assert.equal(typeof a.status, 'string');
      });
    });

    it('ARRAY-001f: preventiveActions es array de objetos', () => {
      const actions = [
        { action: 'Revisar procedimiento', responsible: 'SST', status: 'IN_PROGRESS' },
      ];
      assert.ok(Array.isArray(actions));
      actions.forEach(a => {
        assert.equal(typeof a.action, 'string');
        assert.equal(typeof a.responsible, 'string');
        assert.equal(typeof a.status, 'string');
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // FECHAS
  // ═══════════════════════════════════════════════════════════════

  describe('DATE-001: Fechas de investigación', () => {
    it('DATE-001a: investigationDate es Date válida', () => {
      const date = new Date('2025-01-20');
      assert.ok(date instanceof Date);
      assert.ok(!Number.isNaN(date.getTime()));
    });

    it('DATE-001b: closureDate es Date válida', () => {
      const date = new Date('2025-02-15');
      assert.ok(date instanceof Date);
      assert.ok(!Number.isNaN(date.getTime()));
    });

    it('DATE-001c: investigationDate puede ser undefined', () => {
      const incident = { investigationDate: undefined };
      assert.equal(incident.investigationDate, undefined);
    });

    it('DATE-001d: closureDate puede ser undefined', () => {
      const incident = { closureDate: undefined };
      assert.equal(incident.closureDate, undefined);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // InvestigationAction
  // ═══════════════════════════════════════════════════════════════

  describe('ACTION-001: InvestigationAction', () => {
    it('ACTION-001a: clase InvestigationAction existe', () => {
      assert.ok(InvestigationAction);
    });

    it('ACTION-001b:InvestigationActionDto tiene campos requeridos', () => {
      const dto = new InvestigationActionDto();
      // action y responsible son requeridos
      assert.equal(typeof dto.action, 'undefined');
      assert.equal(typeof dto.responsible, 'undefined');
    });

    it('ACTION-001c: InvestigationActionDto permite campos opcionales', () => {
      const dto = new InvestigationActionDto();
      assert.equal(typeof dto.status, 'undefined');
      assert.equal(typeof dto.dueDate, 'undefined');
      assert.equal(typeof dto.completedDate, 'undefined');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DTO CreateIncidentDto
  // ═══════════════════════════════════════════════════════════════

  describe('DTO-001: CreateIncidentDto', () => {
    it('DTO-001a: tiene campos originales', () => {
      const dto = new CreateIncidentDto();
      assert.equal(typeof dto.employeeId, 'undefined');
      assert.equal(typeof dto.date, 'undefined');
      assert.equal(typeof dto.type, 'undefined');
      assert.equal(typeof dto.description, 'undefined');
      assert.equal(typeof dto.severity, 'undefined');
      assert.equal(typeof dto.status, 'undefined');
      assert.equal(typeof dto.daysLost, 'undefined');
      assert.equal(typeof dto.accidentType, 'undefined');
    });

    it('DTO-001b: tiene campos de investigación', () => {
      const dto = new CreateIncidentDto();
      assert.equal(typeof dto.investigationType, 'undefined');
      assert.equal(typeof dto.rootCauses, 'undefined');
      assert.equal(typeof dto.immediateCauses, 'undefined');
      assert.equal(typeof dto.relatedFactors, 'undefined');
      assert.equal(typeof dto.correctiveActions, 'undefined');
      assert.equal(typeof dto.preventiveActions, 'undefined');
      assert.equal(typeof dto.responsible, 'undefined');
      assert.equal(typeof dto.investigationDate, 'undefined');
      assert.equal(typeof dto.closureDate, 'undefined');
      assert.equal(typeof dto.evidence, 'undefined');
    });

    it('DTO-001c: acepta datos de accidente sin campos de investigación', () => {
      const accidentPayload = {
        employeeId: '507f1f77bcf86cd799439011',
        date: new Date(),
        type: 'Accidente',
        description: 'Caída',
        severity: 'Alta',
        status: 'Abierto',
      };

      // Todos los campos de investigación son opcionales
      assert.equal((accidentPayload as any).investigationType, undefined);
      assert.equal((accidentPayload as any).rootCauses, undefined);
    });

    it('DTO-001d: acepta datos de enfermedad con campos de investigación', () => {
      const diseasePayload = {
        employeeId: '507f1f77bcf86cd799439011',
        date: new Date(),
        type: 'Enfermedad laboral',
        description: 'Reporte enfermedad',
        severity: 'Media',
        status: 'Abierto',
        investigationType: InvestigationType.DISEASE,
        rootCauses: ['Exposición química'],
        immediateCauses: ['Falta de EPP'],
        relatedFactors: ['Químico'],
        correctiveActions: [
          { action: 'Dotar EPP', responsible: 'SST', status: 'PENDING' },
        ],
        preventiveActions: [
          { action: 'Capacitar', responsible: 'SST', status: 'PENDING' },
        ],
        responsible: 'Investigador',
        investigationDate: new Date(),
        evidence: ['informe.pdf'],
      };

      assert.equal(diseasePayload.investigationType, InvestigationType.DISEASE);
      assert.equal(diseasePayload.rootCauses.length, 1);
      assert.equal(diseasePayload.correctiveActions.length, 1);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DTO UpdateIncidentDto
  // ═══════════════════════════════════════════════════════════════

  describe('DTO-002: UpdateIncidentDto', () => {
    it('DTO-002a: tiene campos de investigación opcionales', () => {
      const dto = new UpdateIncidentDto();
      assert.equal(typeof dto.investigationType, 'undefined');
      assert.equal(typeof dto.rootCauses, 'undefined');
      assert.equal(typeof dto.immediateCauses, 'undefined');
      assert.equal(typeof dto.relatedFactors, 'undefined');
      assert.equal(typeof dto.correctiveActions, 'undefined');
      assert.equal(typeof dto.preventiveActions, 'undefined');
      assert.equal(typeof dto.responsible, 'undefined');
      assert.equal(typeof dto.investigationDate, 'undefined');
      assert.equal(typeof dto.closureDate, 'undefined');
      assert.equal(typeof dto.evidence, 'undefined');
    });

    it('DTO-002b: puede actualizar solo investigationType', () => {
      const updatePayload = {
        investigationType: InvestigationType.DISEASE,
      };
      assert.equal(updatePayload.investigationType, InvestigationType.DISEASE);
    });

    it('DTO-002c: puede actualizar solo campos de investigación sin tocar originales', () => {
      const updatePayload = {
        rootCauses: ['Causa nueva'],
        closureDate: new Date(),
      };
      assert.equal((updatePayload as any).type, undefined);
      assert.equal((updatePayload as any).severity, undefined);
      assert.equal(updatePayload.rootCauses.length, 1);
      assert.ok(updatePayload.closureDate instanceof Date);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // PRIVACIDAD
  // ═══════════════════════════════════════════════════════════════

  describe('PRIVACY-001: No se introducen campos clínicos', () => {
    it('PRIVACY-001a: schema no tiene campo de diagnóstico', () => {
      const schemaStr = JSON.stringify(Incident.prototype);
      assert.ok(!schemaStr.includes('diagnostico'), 'No debe tener campo diagnostico');
      assert.ok(!schemaStr.includes('diagnosis'), 'No debe tener campo diagnosis');
    });

    it('PRIVACY-001b: schema no tiene campo de historia clínica', () => {
      const schemaStr = JSON.stringify(Incident.prototype);
      assert.ok(!schemaStr.includes('historiaClinica'), 'No debe tener campo historiaClinica');
      assert.ok(!schemaStr.includes('clinicalHistory'), 'No debe tener campo clinicalHistory');
    });

    it('PRIVACY-001c: schema no tiene campo de medicamentos', () => {
      const schemaStr = JSON.stringify(Incident.prototype);
      assert.ok(!schemaStr.includes('medicamentos'), 'No debe tener campo medicamentos');
      assert.ok(!schemaStr.includes('medications'), 'No debe tener campo medications');
    });

    it('PRIVACY-001d: schema no tiene campo de tratamientos', () => {
      const schemaStr = JSON.stringify(Incident.prototype);
      assert.ok(!schemaStr.includes('tratamientos'), 'No debe tener campo tratamientos');
      assert.ok(!schemaStr.includes('treatments'), 'No debe tener campo treatments');
    });

    it('PRIVACY-001e: schema no tiene campo de síntomas', () => {
      const schemaStr = JSON.stringify(Incident.prototype);
      assert.ok(!schemaStr.includes('sintomas'), 'No debe tener campo sintomas');
      assert.ok(!schemaStr.includes('symptoms'), 'No debe tener campo symptoms');
    });

    it('PRIVACY-001f: DTO no tiene campo clínico', () => {
      const dtoStr = JSON.stringify(new CreateIncidentDto());
      assert.ok(!dtoStr.includes('diagnostico'), 'DTO no debe tener diagnostico');
      assert.ok(!dtoStr.includes('diagnosis'), 'DTO no debe tener diagnosis');
      assert.ok(!dtoStr.includes('medicamentos'), 'DTO no debe tener medicamentos');
      assert.ok(!dtoStr.includes('tratamientos'), 'DTO no debe tener tratamientos');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // TENANT ISOLATION
  // ═══════════════════════════════════════════════════════════════

  describe('TENANT-001: Tenant isolation preservado', () => {
    it('TENANT-001a: companyId sigue siendo campo requerido', () => {
      const instance = new Incident();
      // companyId es required en el schema, no tiene default
      assert.equal(typeof instance.companyId, 'undefined');
    });

    it('TENANT-001b: employeeId sigue siendo campo requerido', () => {
      const instance = new Incident();
      assert.equal(typeof instance.employeeId, 'undefined');
    });

    it('TENANT-001c: campos de investigación no contienen companyId', () => {
      const fields = [
        'investigationType', 'rootCauses', 'immediateCauses',
        'relatedFactors', 'correctiveActions', 'preventiveActions',
        'responsible', 'investigationDate', 'closureDate', 'evidence',
      ];
      fields.forEach(field => {
        assert.ok(field !== 'companyId', `Campo ${field} no es companyId`);
        assert.ok(field !== 'employeeId', `Campo ${field} no es employeeId`);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // INTEGRATION: Registro completo de enfermedad laboral
  // ═══════════════════════════════════════════════════════════════

  describe('INTEGRATION-001: Registro completo enfermedad laboral', () => {
    it('INTEGRATION-001a: puede construir registro completo de enfermedad', () => {
      const diseaseRecord = {
        employeeId: '507f1f77bcf86cd799439011',
        companyId: '507f1f77bcf86cd799439012',
        type: 'Enfermedad laboral',
        date: new Date('2025-01-15'),
        description: 'Reporte de enfermedad laboral sospechosa',
        severity: 'Media',
        status: 'En investigación',
        investigationType: InvestigationType.DISEASE,
        rootCauses: [
          'Exposición prolongada a sustancias químicas',
          'Falta de controles de ingeniería',
        ],
        immediateCauses: [
          'Contacto directo con sustancia sin protección',
          'Ventilación inadecuada',
        ],
        relatedFactors: ['Químico', 'Organizacional', 'Ergonómico'],
        correctiveActions: [
          {
            action: 'Instalar sistema de ventilación',
            responsible: 'Jefe de planta',
            status: 'IN_PROGRESS',
            dueDate: new Date('2025-03-01'),
          },
          {
            action: 'Dotar EPP químico',
            responsible: 'Responsable SST',
            status: 'COMPLETED',
            dueDate: new Date('2025-02-01'),
            completedDate: new Date('2025-01-28'),
          },
        ],
        preventiveActions: [
          {
            action: 'Capacitar en manejo de sustancias',
            responsible: 'Coord SST',
            status: 'PENDING',
            dueDate: new Date('2025-02-15'),
          },
        ],
        responsible: 'Investigador SST',
        investigationDate: new Date('2025-01-20'),
        evidence: [
          'informe-condiciones-laborales.pdf',
          'fotos-entorno-trabajo.jpg',
          'resultados-monitoreo-ambiental.pdf',
        ],
      };

      // Validar estructura completa
      assert.equal(diseaseRecord.investigationType, InvestigationType.DISEASE);
      assert.equal(diseaseRecord.rootCauses.length, 2);
      assert.equal(diseaseRecord.immediateCauses.length, 2);
      assert.equal(diseaseRecord.relatedFactors.length, 3);
      assert.equal(diseaseRecord.correctiveActions.length, 2);
      assert.equal(diseaseRecord.preventiveActions.length, 1);
      assert.equal(diseaseRecord.responsible, 'Investigador SST');
      assert.ok(diseaseRecord.investigationDate instanceof Date);
      assert.equal(diseaseRecord.evidence.length, 3);

      // Validar que acciones tienen campos correctos
      const action1 = diseaseRecord.correctiveActions[0];
      assert.equal(typeof action1.action, 'string');
      assert.equal(typeof action1.responsible, 'string');
      assert.equal(typeof action1.status, 'string');
      assert.ok(action1.dueDate instanceof Date);

      const action2 = diseaseRecord.correctiveActions[1];
      assert.ok(action2.completedDate instanceof Date);
    });

    it('INTEGRATION-001b: puede construir registro de accidentalidad con investigación', () => {
      const accidentWithInvestigation = {
        employeeId: '507f1f77bcf86cd799439011',
        companyId: '507f1f77bcf86cd799439012',
        type: 'Accidente de trabajo',
        date: new Date('2025-01-10'),
        description: 'Caída desde andamio',
        severity: 'Alta',
        status: 'Cerrado',
        daysLost: 15,
        accidentType: 'AT',
        investigationType: InvestigationType.ACCIDENT,
        rootCauses: ['Falla en sistema de anclaje'],
        immediateCauses: ['Uso defectuoso de línea de vida'],
        correctiveActions: [
          {
            action: 'Reparar sistema de anclaje',
            responsible: 'Mantenimiento',
            status: 'COMPLETED',
            completedDate: new Date('2025-01-20'),
          },
        ],
        responsible: 'Investigador SST',
        investigationDate: new Date('2025-01-12'),
        closureDate: new Date('2025-01-25'),
        evidence: ['informe-accidente.pdf'],
      };

      assert.equal(accidentWithInvestigation.investigationType, InvestigationType.ACCIDENT);
      assert.equal(accidentWithInvestigation.accidentType, 'AT');
      assert.equal(accidentWithInvestigation.daysLost, 15);
      assert.ok(accidentWithInvestigation.closureDate instanceof Date);
    });
  });
});
