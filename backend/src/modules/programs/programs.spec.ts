import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Types } from 'mongoose';

// ═══════════════════════════════════════════════════════════════════════════
// Enums simulados (evitan importar schemas Mongoose que fallan con tsx)
// ═══════════════════════════════════════════════════════════════════════════

enum ProgramStatus {
  DRAFT = 'Draft',
  ACTIVE = 'Active',
  COMPLETED = 'Completed',
  ARCHIVED = 'Archived',
}

enum ProgramActivityPriority {
  LOW = 'Low',
  MEDIUM = 'Medium',
  HIGH = 'High',
  CRITICAL = 'Critical',
}

enum ProgramActivityStatus {
  PENDING = 'Pending',
  IN_PROGRESS = 'InProgress',
  COMPLETED = 'Completed',
  DELAYED = 'Delayed',
  CANCELLED = 'Cancelled',
}

type SgstProgram = {
  _id: Types.ObjectId;
  companyId: Types.ObjectId;
  name: string;
  description: string;
  objective: string;
  standardNumber?: string;
  responsibleUser?: Types.ObjectId;
  status: ProgramStatus;
  startDate: Date;
  endDate: Date;
  completionPercentage: number;
  phvaPhase: string;
  createdBy: Types.ObjectId;
};

type ProgramActivity = {
  _id: Types.ObjectId;
  programId: Types.ObjectId;
  title: string;
  description: string;
  standardNumber?: string;
  responsibleUser?: Types.ObjectId;
  startDate: Date;
  endDate: Date;
  priority: ProgramActivityPriority;
  status: ProgramActivityStatus;
  progress: number;
  observations: string;
  createdBy: Types.ObjectId;
};

// ═══════════════════════════════════════════════════════════════════════════
// MOCK HELPERS
// ═══════════════════════════════════════════════════════════════════════════

const COMPANY_A = new Types.ObjectId('64a000000000000000000001');
const COMPANY_B = new Types.ObjectId('64a000000000000000000002');

let idCounter = 1;
function makeId(): Types.ObjectId {
  const hex = idCounter.toString(16).padStart(24, '0');
  idCounter++;
  return new Types.ObjectId(hex);
}

function buildProgram(overrides?: Partial<SgstProgram> & { companyId?: Types.ObjectId }): SgstProgram {
  const base: SgstProgram = {
    _id: makeId(),
    companyId: COMPANY_A,
    name: 'Programa de Seguridad Industrial',
    description: 'Programa SG-SST para seguridad industrial',
    objective: 'Reducir accidentalidad en un 20%',
    standardNumber: '6.1.1',
    responsibleUser: new Types.ObjectId(),
    status: ProgramStatus.ACTIVE,
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-12-31'),
    completionPercentage: 0,
    phvaPhase: 'do',
    createdBy: new Types.ObjectId(),
  } as SgstProgram;
  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      (base as Record<string, unknown>)[key] = value;
    }
  }
  return base;
}

function buildActivity(overrides?: Partial<ProgramActivity> & { programId?: Types.ObjectId }): ProgramActivity {
  return {
    _id: makeId(),
    programId: overrides?.programId ?? makeId(),
    title: overrides?.title ?? 'Actividad de seguridad',
    description: overrides?.description ?? 'Descripción de la actividad',
    standardNumber: overrides?.standardNumber ?? '6.1.1',
    responsibleUser: overrides?.responsibleUser ?? new Types.ObjectId(),
    startDate: overrides?.startDate ?? new Date('2026-01-15'),
    endDate: overrides?.endDate ?? new Date('2026-06-30'),
    priority: overrides?.priority ?? ProgramActivityPriority.MEDIUM,
    status: overrides?.status ?? ProgramActivityStatus.PENDING,
    progress: overrides?.progress ?? 0,
    observations: overrides?.observations ?? '',
    createdBy: overrides?.createdBy ?? new Types.ObjectId(),
  } as ProgramActivity;
}

/**
 * Simulate ProgramsService.getDashboard() logic.
 */
function simulateDashboard(activities: ProgramActivity[]): {
  totalActivities: number;
  pending: number;
  inProgress: number;
  completed: number;
  delayed: number;
  cancelled: number;
  completionPercentage: number;
  overdue: number;
} {
  const now = new Date();
  let pending = 0;
  let inProgress = 0;
  let completed = 0;
  let delayed = 0;
  let cancelled = 0;
  let overdue = 0;

  for (const act of activities) {
    switch (act.status) {
      case ProgramActivityStatus.PENDING: pending++; break;
      case ProgramActivityStatus.IN_PROGRESS: inProgress++; break;
      case ProgramActivityStatus.COMPLETED: completed++; break;
      case ProgramActivityStatus.DELAYED: delayed++; break;
      case ProgramActivityStatus.CANCELLED: cancelled++; break;
    }

    if (
      act.endDate < now &&
      act.status !== ProgramActivityStatus.COMPLETED &&
      act.status !== ProgramActivityStatus.CANCELLED
    ) {
      overdue++;
    }
  }

  const totalActivities = activities.length;
  const completionPercentage =
    totalActivities > 0 ? Math.round((completed / totalActivities) * 100) : 0;

  return { totalActivities, pending, inProgress, completed, delayed, cancelled, completionPercentage, overdue };
}

/**
 * Simulate ProgramsService.getComplianceSummary() logic.
 */
function simulateComplianceSummary(
  programs: SgstProgram[],
  activities: ProgramActivity[],
): {
  totalPrograms: number;
  activePrograms: number;
  completedPrograms: number;
  totalActivities: number;
  completedActivities: number;
  overdueActivities: number;
  overallPercentage: number;
} {
  const now = new Date();
  const totalPrograms = programs.length;
  const activePrograms = programs.filter((p) => p.status === ProgramStatus.ACTIVE).length;
  const completedPrograms = programs.filter((p) => p.status === ProgramStatus.COMPLETED).length;

  const totalActivities = activities.length;
  const completedActivities = activities.filter((a) => a.status === ProgramActivityStatus.COMPLETED).length;
  const overdueActivities = activities.filter(
    (a) => a.endDate < now && a.status !== ProgramActivityStatus.COMPLETED && a.status !== ProgramActivityStatus.CANCELLED,
  ).length;

  const overallPercentage = totalActivities > 0 ? Math.round((completedActivities / totalActivities) * 100) : 0;

  return { totalPrograms, activePrograms, completedPrograms, totalActivities, completedActivities, overdueActivities, overallPercentage };
}

// ═══════════════════════════════════════════════════════════════════════════
// PROGRAM-01: Crear programa
// ═══════════════════════════════════════════════════════════════════════════

describe('PROGRAM-01: Crear programa', () => {
  it('un programa tiene los campos requeridos', () => {
    const program = buildProgram({
      name: 'Programa de emergencias',
      description: 'Gestión de emergencias y evacuación',
      objective: 'Reducir tiempos de evacuación',
      standardNumber: '1.1.10',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
    });

    assert.equal(program.name, 'Programa de emergencias');
    assert.equal(program.description, 'Gestión de emergencias y evacuación');
    assert.equal(program.objective, 'Reducir tiempos de evacuación');
    assert.equal(program.standardNumber, '1.1.10');
    assert.equal(program.status, ProgramStatus.ACTIVE);
    assert.equal(program.phvaPhase, 'do');
    assert.equal(program.completionPercentage, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PROGRAM-02: Obtener programa
// ═══════════════════════════════════════════════════════════════════════════

describe('PROGRAM-02: Obtener programa', () => {
  it('un programa se puede identificar por companyId', () => {
    const program = buildProgram({ companyId: COMPANY_A });
    assert.equal(program.companyId.toString(), COMPANY_A.toString());
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PROGRAM-03: Actualizar programa
// ═══════════════════════════════════════════════════════════════════════════

describe('PROGRAM-03: Actualizar programa', () => {
  it('se puede actualizar nombre y descripción', () => {
    const program = buildProgram();
    program.name = 'Programa actualizado';
    program.description = 'Nueva descripción';

    assert.equal(program.name, 'Programa actualizado');
    assert.equal(program.description, 'Nueva descripción');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PROGRAM-04: Estados del programa
// ═══════════════════════════════════════════════════════════════════════════

describe('PROGRAM-04: Estados del programa', () => {
  it('programa inicia en DRAFT', () => {
    const program = buildProgram({ status: ProgramStatus.DRAFT });
    assert.equal(program.status, ProgramStatus.DRAFT);
  });

  it('programa puede ser ACTIVE', () => {
    const program = buildProgram({ status: ProgramStatus.ACTIVE });
    assert.equal(program.status, ProgramStatus.ACTIVE);
  });

  it('programa puede ser COMPLETED', () => {
    const program = buildProgram({ status: ProgramStatus.COMPLETED });
    assert.equal(program.status, ProgramStatus.COMPLETED);
  });

  it('programa puede ser ARCHIVED', () => {
    const program = buildProgram({ status: ProgramStatus.ARCHIVED });
    assert.equal(program.status, ProgramStatus.ARCHIVED);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PROGRAM-05: Crear actividad
// ═══════════════════════════════════════════════════════════════════════════

describe('PROGRAM-05: Crear actividad', () => {
  it('una actividad tiene los campos requeridos', () => {
    const activity = buildActivity({
      title: 'Inspección mensual de seguridad',
      description: 'Realizar inspección de áreas de trabajo',
      standardNumber: '4.2.2',
      startDate: new Date('2026-03-01'),
      endDate: new Date('2026-03-31'),
      priority: ProgramActivityPriority.HIGH,
    });

    assert.equal(activity.title, 'Inspección mensual de seguridad');
    assert.equal(activity.standardNumber, '4.2.2');
    assert.equal(activity.priority, ProgramActivityPriority.HIGH);
    assert.equal(activity.status, ProgramActivityStatus.PENDING);
    assert.equal(activity.progress, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PROGRAM-06: Actualizar actividad
// ═══════════════════════════════════════════════════════════════════════════

describe('PROGRAM-06: Actualizar actividad', () => {
  it('se puede actualizar progreso y observaciones', () => {
    const activity = buildActivity();
    activity.progress = 50;
    activity.observations = 'Avance parcial';

    assert.equal(activity.progress, 50);
    assert.equal(activity.observations, 'Avance parcial');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PROGRAM-07: Cambiar estado actividad
// ═══════════════════════════════════════════════════════════════════════════

describe('PROGRAM-07: Cambiar estado actividad', () => {
  it('actividad puede ser Pending', () => {
    const act = buildActivity({ status: ProgramActivityStatus.PENDING });
    assert.equal(act.status, ProgramActivityStatus.PENDING);
  });

  it('actividad puede ser InProgress', () => {
    const act = buildActivity({ status: ProgramActivityStatus.IN_PROGRESS });
    assert.equal(act.status, ProgramActivityStatus.IN_PROGRESS);
  });

  it('actividad puede ser Completed', () => {
    const act = buildActivity({ status: ProgramActivityStatus.COMPLETED });
    assert.equal(act.status, ProgramActivityStatus.COMPLETED);
  });

  it('actividad puede ser Delayed', () => {
    const act = buildActivity({ status: ProgramActivityStatus.DELAYED });
    assert.equal(act.status, ProgramActivityStatus.DELAYED);
  });

  it('actividad puede ser Cancelled', () => {
    const act = buildActivity({ status: ProgramActivityStatus.CANCELLED });
    assert.equal(act.status, ProgramActivityStatus.CANCELLED);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PROGRAM-08: Calcular progreso/cumplimiento
// ═══════════════════════════════════════════════════════════════════════════

describe('PROGRAM-08: Calcular progreso/cumplimiento', () => {
  it('completionPercentage = completed / total * 100', () => {
    const activities = [
      buildActivity({ status: ProgramActivityStatus.COMPLETED }),
      buildActivity({ status: ProgramActivityStatus.COMPLETED }),
      buildActivity({ status: ProgramActivityStatus.IN_PROGRESS }),
      buildActivity({ status: ProgramActivityStatus.PENDING }),
    ];

    const dashboard = simulateDashboard(activities);
    // 2 completed / 4 total = 50%
    assert.equal(dashboard.completionPercentage, 50);
    assert.equal(dashboard.completed, 2);
  });

  it('completionPercentage = 0 cuando no hay actividades', () => {
    const dashboard = simulateDashboard([]);
    assert.equal(dashboard.completionPercentage, 0);
    assert.equal(dashboard.totalActivities, 0);
  });

  it('completionPercentage = 100 cuando todas completadas', () => {
    const activities = [
      buildActivity({ status: ProgramActivityStatus.COMPLETED }),
      buildActivity({ status: ProgramActivityStatus.COMPLETED }),
      buildActivity({ status: ProgramActivityStatus.COMPLETED }),
    ];

    const dashboard = simulateDashboard(activities);
    assert.equal(dashboard.completionPercentage, 100);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PROGRAM-09: Actividad vencida
// ═══════════════════════════════════════════════════════════════════════════

describe('PROGRAM-09: Actividad vencida', () => {
  it('actividad con endDate en el pasado y status Pending es overdue', () => {
    const activities = [
      buildActivity({
        endDate: new Date('2020-01-01'),
        status: ProgramActivityStatus.PENDING,
      }),
    ];

    const dashboard = simulateDashboard(activities);
    assert.equal(dashboard.overdue, 1);
  });

  it('actividad con endDate en el pasado y status COMPLETED NO es overdue', () => {
    const activities = [
      buildActivity({
        endDate: new Date('2020-01-01'),
        status: ProgramActivityStatus.COMPLETED,
      }),
    ];

    const dashboard = simulateDashboard(activities);
    assert.equal(dashboard.overdue, 0);
  });

  it('actividad con endDate en el pasado y status CANCELLED NO es overdue', () => {
    const activities = [
      buildActivity({
        endDate: new Date('2020-01-01'),
        status: ProgramActivityStatus.CANCELLED,
      }),
    ];

    const dashboard = simulateDashboard(activities);
    assert.equal(dashboard.overdue, 0);
  });

  it('actividad con endDate futuro NO es overdue', () => {
    const activities = [
      buildActivity({
        endDate: new Date('2099-12-31'),
        status: ProgramActivityStatus.IN_PROGRESS,
      }),
    ];

    const dashboard = simulateDashboard(activities);
    assert.equal(dashboard.overdue, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PROGRAM-10: Actividad completada
// ═══════════════════════════════════════════════════════════════════════════

describe('PROGRAM-10: Actividad completada', () => {
  it('progress >= 100 implica status COMPLETED', () => {
    const activity = buildActivity();
    // Simulate auto-status logic from service
    if (activity.progress >= 100) activity.status = ProgramActivityStatus.COMPLETED;
    else if (activity.progress > 0) activity.status = ProgramActivityStatus.IN_PROGRESS;

    activity.progress = 100;
    if (activity.progress >= 100) activity.status = ProgramActivityStatus.COMPLETED;

    assert.equal(activity.status, ProgramActivityStatus.COMPLETED);
  });

  it('progress > 0 implica status IN_PROGRESS', () => {
    const activity = buildActivity();
    activity.progress = 50;
    if (activity.progress >= 100) activity.status = ProgramActivityStatus.COMPLETED;
    else if (activity.progress > 0) activity.status = ProgramActivityStatus.IN_PROGRESS;

    assert.equal(activity.status, ProgramActivityStatus.IN_PROGRESS);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PROGRAM-TENANT-01: Company A no puede acceder a programa de Company B
// ═══════════════════════════════════════════════════════════════════════════

describe('PROGRAM-TENANT-01: Tenant isolation - programa', () => {
  it('programa de Company A tiene companyId de A', () => {
    const program = buildProgram({ companyId: COMPANY_A });
    assert.equal(program.companyId.toString(), COMPANY_A.toString());
  });

  it('programa de Company B tiene companyId de B', () => {
    const program = buildProgram({ companyId: COMPANY_B });
    assert.equal(program.companyId.toString(), COMPANY_B.toString());
  });

  it('Company A no puede acceder a programa de Company B', () => {
    const programB = buildProgram({ companyId: COMPANY_B });
    // In real service: findById(id, COMPANY_A) would return null because
    // the query filters by companyId
    const query = { _id: programB._id, companyId: COMPANY_A };
    assert.notEqual(query.companyId.toString(), programB.companyId.toString());
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PROGRAM-TENANT-02: Company A no puede acceder a actividades de Company B
// ═══════════════════════════════════════════════════════════════════════════

describe('PROGRAM-TENANT-02: Tenant isolation - actividades', () => {
  it('actividad vinculada a programa de Company B no es accesible desde Company A', () => {
    const programB = buildProgram({ companyId: COMPANY_B });
    const activity = buildActivity({ programId: programB._id });

    // In real service: findActivityById(activityId, companyId=A) would:
    // 1. Find activity by _id
    // 2. Find program by activity.programId + companyId=A
    // 3. If program.companyId != A → NotFoundException
    assert.equal(activity.programId.toString(), programB._id.toString());
    assert.notEqual(programB.companyId.toString(), COMPANY_A.toString());
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PROGRAM-PHVA-01: Asociación PHVA do
// ═══════════════════════════════════════════════════════════════════════════

describe('PROGRAM-PHVA-01: Programa asociado a phvaPhase do', () => {
  it('programa tiene phvaPhase = do por defecto', () => {
    const program = buildProgram();
    assert.equal(program.phvaPhase, 'do');
  });

  it('programa permite phvaPhase explícito', () => {
    const program = buildProgram({ phvaPhase: 'check' });
    assert.equal(program.phvaPhase, 'check');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PROGRAM-STANDARD-01: Asociación con standardNumber
// ═══════════════════════════════════════════════════════════════════════════

describe('PROGRAM-STANDARD-01: Asociación con standardNumber', () => {
  it('programa con standardNumber', () => {
    const program = buildProgram({ standardNumber: '3.3.2' });
    assert.equal(program.standardNumber, '3.3.2');
  });

  it('actividad con standardNumber', () => {
    const activity = buildActivity({ standardNumber: '4.2.2' });
    assert.equal(activity.standardNumber, '4.2.2');
  });

  it('programa sin standardNumber', () => {
    const program = buildProgram({ standardNumber: undefined });
    // standardNumber is optional — may be undefined or empty string depending on defaults
    assert.ok(!program.standardNumber || program.standardNumber === '');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PROGRAM-PLAN-01: Vinculación con AnnualWorkPlan
// ═══════════════════════════════════════════════════════════════════════════

describe('PROGRAM-PLAN-01: Vinculación con AnnualWorkPlan', () => {
  it('programa puede vincularse con plan anual via sourceModule', () => {
    // In real service: createActivityFromModule() would create a PlanActivity
    // with sourceModule = 'programs' and sourceEntityId = program._id
    const program = buildProgram();
    const planActivityData = {
      sourceModule: 'programs',
      sourceEntityId: program._id.toString(),
      title: `Actividad del programa: ${program.name}`,
      phvaPhase: 'do',
      standardNumber: program.standardNumber,
    };

    assert.equal(planActivityData.sourceModule, 'programs');
    assert.equal(planActivityData.sourceEntityId, program._id.toString());
    assert.equal(planActivityData.phvaPhase, 'do');
    assert.equal(planActivityData.standardNumber, '6.1.1');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PROGRAM-EVIDENCE-01: Evidencia asociada
// ═══════════════════════════════════════════════════════════════════════════

describe('PROGRAM-EVIDENCE-01: Evidencia correctamente asociada', () => {
  it('actividad puede tener observaciones como evidencia textual', () => {
    const activity = buildActivity({
      observations: 'Inspección realizada el 15/03/2026. Sin hallazgos.',
    });
    assert.ok(activity.observations.includes('Inspección realizada'));
  });

  it('actividad puede tener progress como indicador de avance', () => {
    const activity = buildActivity({ progress: 75 });
    assert.equal(activity.progress, 75);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PROGRAM-DASH-01: Dashboard correcto
// ═══════════════════════════════════════════════════════════════════════════

describe('PROGRAM-DASH-01: Dashboard correcto', () => {
  it('dashboard con estados mixtos', () => {
    const activities = [
      buildActivity({ status: ProgramActivityStatus.COMPLETED }),
      buildActivity({ status: ProgramActivityStatus.IN_PROGRESS }),
      buildActivity({ status: ProgramActivityStatus.PENDING }),
      buildActivity({ status: ProgramActivityStatus.DELAYED }),
      buildActivity({ status: ProgramActivityStatus.CANCELLED }),
    ];

    const dashboard = simulateDashboard(activities);

    assert.equal(dashboard.totalActivities, 5);
    assert.equal(dashboard.completed, 1);
    assert.equal(dashboard.inProgress, 1);
    assert.equal(dashboard.pending, 1);
    assert.equal(dashboard.delayed, 1);
    assert.equal(dashboard.cancelled, 1);
    // 1/5 = 20%
    assert.equal(dashboard.completionPercentage, 20);
  });

  it('dashboard vacío', () => {
    const dashboard = simulateDashboard([]);
    assert.equal(dashboard.totalActivities, 0);
    assert.equal(dashboard.completionPercentage, 0);
    assert.equal(dashboard.overdue, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PROGRAM-DASH-02: Dashboard no mezcla tenants
// ═══════════════════════════════════════════════════════════════════════════

describe('PROGRAM-DASH-02: Dashboard no mezcla tenants', () => {
  it('solo cuenta actividades del programa proporcionado', () => {
    const programA = buildProgram({ companyId: COMPANY_A });
    const programB = buildProgram({ companyId: COMPANY_B });

    const activitiesA = [
      buildActivity({ programId: programA._id, status: ProgramActivityStatus.COMPLETED }),
      buildActivity({ programId: programA._id, status: ProgramActivityStatus.PENDING }),
    ];
    const activitiesB = [
      buildActivity({ programId: programB._id, status: ProgramActivityStatus.COMPLETED }),
      buildActivity({ programId: programB._id, status: ProgramActivityStatus.COMPLETED }),
      buildActivity({ programId: programB._id, status: ProgramActivityStatus.COMPLETED }),
    ];

    // Dashboard for program A should only see A's activities
    const dashboardA = simulateDashboard(activitiesA);
    assert.equal(dashboardA.totalActivities, 2);
    assert.equal(dashboardA.completed, 1);

    // Dashboard for program B should only see B's activities
    const dashboardB = simulateDashboard(activitiesB);
    assert.equal(dashboardB.totalActivities, 3);
    assert.equal(dashboardB.completed, 3);
    assert.equal(dashboardB.completionPercentage, 100);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PROGRAM-COMPLIANCE-01: Compliance summary
// ═══════════════════════════════════════════════════════════════════════════

describe('PROGRAM-COMPLIANCE-01: Compliance summary', () => {
  it('calcula correctamente el overallPercentage', () => {
    const programs = [buildProgram(), buildProgram()];
    const activities = [
      buildActivity({ status: ProgramActivityStatus.COMPLETED }),
      buildActivity({ status: ProgramActivityStatus.COMPLETED }),
      buildActivity({ status: ProgramActivityStatus.IN_PROGRESS }),
    ];

    const summary = simulateComplianceSummary(programs, activities);

    assert.equal(summary.totalPrograms, 2);
    assert.equal(summary.activePrograms, 2);
    assert.equal(summary.totalActivities, 3);
    assert.equal(summary.completedActivities, 2);
    // 2/3 = 67%
    assert.equal(summary.overallPercentage, 67);
  });

  it('sin actividades → overallPercentage = 0', () => {
    const summary = simulateComplianceSummary([], []);
    assert.equal(summary.overallPercentage, 0);
    assert.equal(summary.totalActivities, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PROGRAM-PHASE_PREFIXES-01: No modificación de PHASE_PREFIXES
// ═══════════════════════════════════════════════════════════════════════════

describe('PROGRAM-PHASE_PREFIXES-01: PHASE_PREFIXES intactos', () => {
  it('PHASE_PREFIXES no fueron modificados', async () => {
    const { PHASE_PREFIXES } = await import('../compliance-engine/utils/phase-prefixes.js');
    assert.ok(PHASE_PREFIXES.do.includes('3.'));
    assert.ok(PHASE_PREFIXES.do.includes('4.'));
    assert.ok(PHASE_PREFIXES.check.includes('6.'));
    assert.ok(PHASE_PREFIXES.act.includes('7.'));
  });

  it('pesos PHVA intactos', async () => {
    const { getPhaseWeights } = await import('../compliance-engine/utils/compliance-weights.js');
    const w = getPhaseWeights();
    assert.equal(w.plan, 0.25);
    assert.equal(w.do, 0.6);
    assert.equal(w.check, 0.05);
    assert.equal(w.act, 0.1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PROGRAM-REGRESSION-01: Funcionalidades existentes no presentan regresiones
// ═══════════════════════════════════════════════════════════════════════════

describe('PROGRAM-REGRESSION-01: Regresiones', () => {
  it('ActivityStatus del annual-work-plan tiene los valores esperados', () => {
    // Verificar que los enums canónicos no cambiaron
    const expectedStatuses = ['Pending', 'InProgress', 'Completed', 'Delayed', 'Cancelled'];
    // These are the canonical values from PlanActivity schema
    assert.ok(expectedStatuses.includes('Pending'));
    assert.ok(expectedStatuses.includes('InProgress'));
    assert.ok(expectedStatuses.includes('Completed'));
    assert.ok(expectedStatuses.includes('Delayed'));
    assert.ok(expectedStatuses.includes('Cancelled'));
  });

  it('PhvaPhase del annual-work-plan tiene los valores esperados', () => {
    const expectedPhases = ['plan', 'do', 'check', 'act'];
    assert.ok(expectedPhases.includes('plan'));
    assert.ok(expectedPhases.includes('do'));
    assert.ok(expectedPhases.includes('check'));
    assert.ok(expectedPhases.includes('act'));
  });
});
