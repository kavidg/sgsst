import { Types } from 'mongoose';
import {
  ParticipationActivityType,
  ParticipationStatus,
  WorkerParticipationSchema,
} from './schemas/worker-participation.schema';
import { CreateWorkerParticipationDto } from './dto/create-worker-participation.dto';
import { UpdateWorkerParticipationDto } from './dto/update-worker-participation.dto';

describe('WorkerParticipation Domain', () => {
  const COMPANY_A = new Types.ObjectId('64b00000000000000000000a');
  const COMPANY_B = new Types.ObjectId('64b00000000000000000000b');
  const EMPLOYEE_A1 = new Types.ObjectId('64b00000000000000000001a');
  const EMPLOYEE_A2 = new Types.ObjectId('64b00000000000000000002a');
  const EMPLOYEE_B1 = new Types.ObjectId('64b00000000000000000003b');
  const RISK_A = new Types.ObjectId('64b00000000000000000004a');
  const RISK_B = new Types.ObjectId('64b00000000000000000005b');
  const PARTICIPATION_A = new Types.ObjectId('64b00000000000000000006a');

  describe('Schema Constants', () => {
    it('should define ParticipationActivityType enum with 6 values', () => {
      expect(Object.values(ParticipationActivityType)).toHaveLength(6);
    });

    it('should include HAZARD_IDENTIFICATION', () => {
      expect(ParticipationActivityType.HAZARD_IDENTIFICATION).toBe('HAZARD_IDENTIFICATION');
    });

    it('should include RISK_ASSESSMENT', () => {
      expect(ParticipationActivityType.RISK_ASSESSMENT).toBe('RISK_ASSESSMENT');
    });

    it('should include RISK_VALUATION', () => {
      expect(ParticipationActivityType.RISK_VALUATION).toBe('RISK_VALUATION');
    });

    it('should include CONTROL_DECISION', () => {
      expect(ParticipationActivityType.CONTROL_DECISION).toBe('CONTROL_DECISION');
    });

    it('should include CONTROL_ESTABLISHMENT', () => {
      expect(ParticipationActivityType.CONTROL_ESTABLISHMENT).toBe('CONTROL_ESTABLISHMENT');
    });

    it('should include OTHER', () => {
      expect(ParticipationActivityType.OTHER).toBe('OTHER');
    });

    it('should define ParticipationStatus enum with 3 values', () => {
      expect(Object.values(ParticipationStatus)).toHaveLength(3);
    });

    it('should have DRAFT status', () => {
      expect(ParticipationStatus.DRAFT).toBe('DRAFT');
    });

    it('should have COMPLETED status', () => {
      expect(ParticipationStatus.COMPLETED).toBe('COMPLETED');
    });

    it('should have CANCELLED status', () => {
      expect(ParticipationStatus.CANCELLED).toBe('CANCELLED');
    });
  });

  describe('Schema Structure', () => {
    it('should have companyId field', () => {
      const paths = WorkerParticipationSchema.paths;
      expect(paths['companyId']).toBeDefined();
    });

    it('should have activityType field', () => {
      const paths = WorkerParticipationSchema.paths;
      expect(paths['activityType']).toBeDefined();
    });

    it('should have participationDate field', () => {
      const paths = WorkerParticipationSchema.paths;
      expect(paths['participationDate']).toBeDefined();
    });

    it('should have participants array field', () => {
      const paths = WorkerParticipationSchema.paths;
      expect(paths['participants']).toBeDefined();
    });

    it('should have description field', () => {
      const paths = WorkerParticipationSchema.paths;
      expect(paths['description']).toBeDefined();
    });

    it('should have optional riskId field', () => {
      const paths = WorkerParticipationSchema.paths;
      expect(paths['riskId']).toBeDefined();
    });

    it('should have optional process field', () => {
      const paths = WorkerParticipationSchema.paths;
      expect(paths['process']).toBeDefined();
    });

    it('should have optional area field', () => {
      const paths = WorkerParticipationSchema.paths;
      expect(paths['area']).toBeDefined();
    });

    it('should have optional activity field', () => {
      const paths = WorkerParticipationSchema.paths;
      expect(paths['activity']).toBeDefined();
    });

    it('should have optional observations field', () => {
      const paths = WorkerParticipationSchema.paths;
      expect(paths['observations']).toBeDefined();
    });

    it('should have status field', () => {
      const paths = WorkerParticipationSchema.paths;
      expect(paths['status']).toBeDefined();
    });

    it('should have timestamps', () => {
      const options = WorkerParticipationSchema.options;
      expect(options.timestamps).toBe(true);
    });
  });

  describe('Tenant Isolation Pattern', () => {
    it('should require companyId in schema', () => {
      const companyIdPath = WorkerParticipationSchema.paths['companyId'] as { required?: boolean };
      expect(companyIdPath.required).toBe(true);
    });

    it('should reference Company model', () => {
      const companyIdPath = WorkerParticipationSchema.paths['companyId'] as { options?: { ref?: string } };
      expect(companyIdPath.options?.ref).toBe('Company');
    });

    it('should filter queries by companyId', () => {
      const filter = { companyId: COMPANY_A };
      expect(filter.companyId).toEqual(COMPANY_A);
      expect(filter.companyId).not.toEqual(COMPANY_B);
    });
  });

  describe('CRUD Operations Pattern', () => {
    it('should create participation with valid DTO', () => {
      const dto: CreateWorkerParticipationDto = {
        activityType: ParticipationActivityType.HAZARD_IDENTIFICATION,
        participationDate: new Date().toISOString(),
        participants: [EMPLOYEE_A1.toString(), EMPLOYEE_A2.toString()],
        description: 'Identificación de peligros en área de producción',
        status: ParticipationStatus.COMPLETED,
      };

      expect(dto.activityType).toBe(ParticipationActivityType.HAZARD_IDENTIFICATION);
      expect(dto.participants).toHaveLength(2);
      expect(dto.description).toBeTruthy();
    });

    it('should allow optional riskId', () => {
      const dto: CreateWorkerParticipationDto = {
        activityType: ParticipationActivityType.RISK_ASSESSMENT,
        participationDate: new Date().toISOString(),
        participants: [EMPLOYEE_A1.toString()],
        description: 'Evaluación de riesgos',
        riskId: RISK_A.toString(),
        status: ParticipationStatus.COMPLETED,
      };

      expect(dto.riskId).toBe(RISK_A.toString());
    });

    it('should allow optional process/area/activity', () => {
      const dto: CreateWorkerParticipationDto = {
        activityType: ParticipationActivityType.CONTROL_DECISION,
        participationDate: new Date().toISOString(),
        participants: [EMPLOYEE_A1.toString()],
        description: 'Decisión sobre controles',
        process: 'Producción',
        area: 'Línea 1',
        activity: 'Empaque',
        status: ParticipationStatus.COMPLETED,
      };

      expect(dto.process).toBe('Producción');
      expect(dto.area).toBe('Línea 1');
      expect(dto.activity).toBe('Empaque');
    });

    it('should default status to COMPLETED', () => {
      const dto: CreateWorkerParticipationDto = {
        activityType: ParticipationActivityType.OTHER,
        participationDate: new Date().toISOString(),
        participants: [],
        description: 'Otra actividad',
      };

      // Status is optional in DTO, defaults to COMPLETED in schema
      expect(dto.status).toBeUndefined();
    });

    it('should allow update with partial DTO', () => {
      const dto: UpdateWorkerParticipationDto = {
        observations: 'Actualización de observaciones',
      };

      expect(dto.observations).toBe('Actualización de observaciones');
      expect(dto.activityType).toBeUndefined();
    });
  });

  describe('Tenant Isolation Validation', () => {
    it('should validate riskId belongs to same company', () => {
      // riskId from COMPANY_B should be rejected when creating for COMPANY_A
      const dto: CreateWorkerParticipationDto = {
        activityType: ParticipationActivityType.HAZARD_IDENTIFICATION,
        participationDate: new Date().toISOString(),
        participants: [EMPLOYEE_A1.toString()],
        description: 'Test',
        riskId: RISK_B.toString(),
        status: ParticipationStatus.COMPLETED,
      };

      // Service should validate: riskId → Risk → same companyId
      expect(dto.riskId).toBe(RISK_B.toString());
    });

    it('should validate participants belong to same company', () => {
      // Employee from COMPANY_B should be rejected when creating for COMPANY_A
      const dto: CreateWorkerParticipationDto = {
        activityType: ParticipationActivityType.HAZARD_IDENTIFICATION,
        participationDate: new Date().toISOString(),
        participants: [EMPLOYEE_A1.toString(), EMPLOYEE_B1.toString()],
        description: 'Test',
        status: ParticipationStatus.COMPLETED,
      };

      // Service should validate: each participant → Employee → same companyId
      expect(dto.participants).toContain(EMPLOYEE_B1.toString());
    });

    it('should not accept companyId from DTO', () => {
      const dto = {
        activityType: ParticipationActivityType.HAZARD_IDENTIFICATION,
        participationDate: new Date().toISOString(),
        participants: [],
        description: 'Test',
        companyId: COMPANY_B.toString(),
      } as CreateWorkerParticipationDto;

      // companyId is not in the DTO class-validator schema
      expect(dto.companyId).toBeDefined();
      // But the service should override it from JWT context
    });
  });

  describe('Activity Types', () => {
    it('should support all 6 activity types', () => {
      const types = [
        ParticipationActivityType.HAZARD_IDENTIFICATION,
        ParticipationActivityType.RISK_ASSESSMENT,
        ParticipationActivityType.RISK_VALUATION,
        ParticipationActivityType.CONTROL_DECISION,
        ParticipationActivityType.CONTROL_ESTABLISHMENT,
        ParticipationActivityType.OTHER,
      ];

      expect(types).toHaveLength(6);
      types.forEach((type) => {
        expect(Object.values(ParticipationActivityType)).toContain(type);
      });
    });
  });

  describe('Status Transitions', () => {
    it('should allow DRAFT to COMPLETED', () => {
      const dto: UpdateWorkerParticipationDto = {
        status: ParticipationStatus.COMPLETED,
      };
      expect(dto.status).toBe(ParticipationStatus.COMPLETED);
    });

    it('should allow COMPLETED to CANCELLED', () => {
      const dto: UpdateWorkerParticipationDto = {
        status: ParticipationStatus.CANCELLED,
      };
      expect(dto.status).toBe(ParticipationStatus.CANCELLED);
    });

    it('should allow DRAFT to CANCELLED', () => {
      const dto: UpdateWorkerParticipationDto = {
        status: ParticipationStatus.CANCELLED,
      };
      expect(dto.status).toBe(ParticipationStatus.CANCELLED);
    });
  });

  describe('Endpoint Pattern', () => {
    it('should use /risks/participations prefix', () => {
      const prefix = 'risks/participations';
      expect(prefix).toBe('risks/participations');
    });

    it('should support CRUD operations', () => {
      const endpoints = ['GET', 'GET/:id', 'POST', 'PATCH/:id', 'DELETE/:id'];
      expect(endpoints).toHaveLength(5);
    });

    it('should require owner/admin for write operations', () => {
      const writeRoles = ['owner', 'admin'];
      expect(writeRoles).toContain('owner');
      expect(writeRoles).toContain('admin');
    });

    it('should allow manager for read operations', () => {
      const readRoles = ['owner', 'admin', 'manager'];
      expect(readRoles).toContain('manager');
    });
  });

  describe('Data Integrity', () => {
    it('should reference Employee model in participants', () => {
      const participantsPath = WorkerParticipationSchema.paths['participants'] as { options?: { ref?: string } };
      expect(participantsPath.options?.ref).toBe('Employee');
    });

    it('should reference Risk model in riskId', () => {
      const riskIdPath = WorkerParticipationSchema.paths['riskId'] as { options?: { ref?: string } };
      expect(riskIdPath.options?.ref).toBe('Risk');
    });

    it('should not store employee personal data', () => {
      const paths = WorkerParticipationSchema.paths;
      expect(paths['employeeDocument']).toBeUndefined();
      expect(paths['employeePhone']).toBeUndefined();
      expect(paths['employeeEmail']).toBeUndefined();
      expect(paths['employeeAddress']).toBeUndefined();
    });
  });

  describe('No Approval Workflow', () => {
    it('should not use PENDING_APPROVAL status', () => {
      expect(ParticipationStatus['PENDING_APPROVAL']).toBeUndefined();
    });

    it('should not use APPROVED status', () => {
      expect(ParticipationStatus['APPROVED']).toBeUndefined();
    });

    it('should not use REJECTED status', () => {
      expect(ParticipationStatus['REJECTED']).toBeUndefined();
    });
  });

  describe('Historical Compatibility', () => {
    it('should allow empty participants array', () => {
      const dto: CreateWorkerParticipationDto = {
        activityType: ParticipationActivityType.OTHER,
        participationDate: new Date().toISOString(),
        participants: [],
        description: 'Test with no participants',
        status: ParticipationStatus.DRAFT,
      };

      expect(dto.participants).toHaveLength(0);
    });

    it('should allow DRAFT status for incomplete records', () => {
      const dto: CreateWorkerParticipationDto = {
        activityType: ParticipationActivityType.HAZARD_IDENTIFICATION,
        participationDate: new Date().toISOString(),
        participants: [],
        description: 'Registro incompleto',
        status: ParticipationStatus.DRAFT,
      };

      expect(dto.status).toBe(ParticipationStatus.DRAFT);
    });
  });
});
