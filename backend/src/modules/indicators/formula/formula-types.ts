import { IndicatorMeasurementStatus } from '../enums/indicator-measurement-status.enum';

/**
 * Catálogo cerrado de módulos fuente de datos.
 * Cada módulo corresponde a un servicio existente en el proyecto.
 */
export type DataSourceModule =
  | 'incidents'
  | 'trainings'
  | 'inspections'
  | 'risks'
  | 'evaluations'
  | 'annual-work-plan'
  | 'sst-objectives'
  | 'documents'
  | 'legal-matrix'
  | 'emergencies'
  | 'copasst-training'
  | 'convivencia'
  | 'absenteeism'
  | 'work-data';

/**
 * Campos disponibles por módulo.
 * Cada campo produce un número que puede usarse en fórmulas.
 */
export interface DataSourceFieldMap {
  incidents: {
    count: number;
    closedCount: number;
    openCount: number;
    accidentCount: number;
    daysLost: number;
  };
  trainings: {
    count: number;
    avgCompletion: number;
  };
  inspections: {
    count: number;
    completedCount: number;
    completionRate: number;
  };
  risks: {
    count: number;
    controlledCount: number;
    controlledPercentage: number;
  };
  evaluations: {
    count: number;
    compliantCount: number;
    compliancePercentage: number;
  };
  'annual-work-plan': {
    overallPercentage: number;
  };
  'sst-objectives': {
    count: number;
    achievementPercentage: number;
  };
  documents: {
    count: number;
    activeCount: number;
    activePercentage: number;
  };
  'legal-matrix': {
    compliancePercentage: number;
  };
  emergencies: {
    preparednessScore: number;
  };
  'copasst-training': {
    coveragePercentage: number;
  };
  convivencia: {
    compliancePercentage: number;
  };
  absenteeism: {
    daysAbsent: number;
    count: number;
  };
  'work-data': {
    hoursWorked: number;
  };
}

/**
 * Definición de una fuente de datos dentro de una fórmula.
 * Utiliza únicamente valores del catálogo cerrado.
 */
export interface DataSourceDefinition {
  module: DataSourceModule;
  field: keyof DataSourceFieldMap[DataSourceModule];
}

/**
 * Resultado de resolver una fuente de datos.
 */
export interface DataSourceResult {
  value: number;
  available: boolean;
}

/**
 * Definición declarativa de una fórmula.
 * Tipada estrictamente — no permite código arbitrario.
 */
export type FormulaDefinition =
  | {
      type: 'PERCENTAGE';
      part: DataSourceDefinition;
      whole: DataSourceDefinition;
    }
  | {
      type: 'RATIO';
      numerator: DataSourceDefinition;
      denominator: DataSourceDefinition;
    }
  | {
      type: 'COUNT';
      source: DataSourceDefinition;
    }
  | {
      type: 'AVERAGE';
      source: DataSourceDefinition;
    }
  | {
      type: 'RATIO_SCALED';
      numerator: DataSourceDefinition;
      denominator: DataSourceDefinition;
      scale: number;
    }
  | {
      type: 'MANUAL';
    };

/**
 * Resultado de resolver una fórmula.
 */
export interface FormulaResult {
  numerator: number;
  denominator: number;
  calculatedValue: number;
  status: IndicatorMeasurementStatus;
  source: 'AUTOMATIC';
}

/**
 * Tipo de fórmula válido.
 */
export type FormulaType = FormulaDefinition['type'];

/** Tipos de fórmula válidos */export const VALID_FORMULA_TYPES: FormulaType[] = [
  'PERCENTAGE', 'RATIO', 'COUNT', 'AVERAGE', 'RATIO_SCALED', 'MANUAL',
];

/** Módulos fuente válidos */
export const VALID_DATA_SOURCE_MODULES: DataSourceModule[] = [
  'incidents',
  'trainings',
  'inspections',
  'risks',
  'evaluations',
  'annual-work-plan',
  'sst-objectives',
  'documents',
  'legal-matrix',
  'emergencies',
  'copasst-training',
  'convivencia',
  'absenteeism',
];

/** Campos válidos por módulo */
export const VALID_FIELDS_BY_MODULE: Record<DataSourceModule, string[]> = {
  incidents: ['count', 'closedCount', 'openCount', 'accidentCount', 'daysLost'],
  trainings: ['count', 'avgCompletion', 'effectivenessPercentage', 'participationPercentage'],
  inspections: ['count', 'completedCount', 'completionRate'],
  risks: ['count', 'controlledCount', 'controlledPercentage'],
  evaluations: ['count', 'compliantCount', 'compliancePercentage'],
  'annual-work-plan': ['overallPercentage'],
  'sst-objectives': ['count', 'achievementPercentage'],
  documents: ['count', 'activeCount', 'activePercentage', 'validCount', 'expiredCount', 'expiringSoonCount'],
  'legal-matrix': ['compliancePercentage'],
  emergencies: ['preparednessScore'],
  'copasst-training': ['coveragePercentage'],
  convivencia: ['compliancePercentage'],
  absenteeism: ['daysAbsent', 'count'],
  'work-data': ['hoursWorked'],
};
