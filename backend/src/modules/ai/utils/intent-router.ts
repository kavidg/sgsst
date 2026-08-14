import { AIEngine } from '../interfaces/ai-engine.interface';

/**
 * Regla de enrutamiento: un nombre de engine y las palabras clave que lo activan.
 */
export interface IntentRule {
  engine: string;
  keywords: readonly string[];
}

/**
 * Reglas básicas de routing del AI Orchestrator.
 *
 * Orden deliberado: las reglas más específicas se evalúan primero para evitar
 * ambigüedades (ej: "avance del plan" debe enrutar a indicadores, no a PHVA).
 */
export const INTENT_RULES: readonly IntentRule[] = [
  {
    engine: 'compliance',
    // Fase 7 (1.1.7): 'copasst' cubre las consultas de capacitación/integrantes/
    // cobertura del COPASST y las enruta al engine de cumplimiento, que consume
    // los findings reales de 1.1.7 vía el Compliance Engine (sin engine nuevo).
    keywords: ['estandar', 'estandares', 'cumplimiento sgsst', 'cumplimiento del sg sst', 'compliance', 'autoevaluacion', 'nivel de cumplimiento', 'copasst'],
  },
  {
    engine: 'indicators',
    keywords: ['cumplimiento', 'indicador', 'indicadores', 'avance', 'kpi'],
  },
  {
    engine: 'documents',
    keywords: ['documento', 'documentos', 'evidencia', 'evidencias'],
  },
  {
    engine: 'phva',
    keywords: ['plan', 'actividad', 'actividades', 'phva', 'planear', 'hacer', 'verificar', 'actuar'],
  },
  {
    engine: 'alerts',
    keywords: ['alerta', 'alertas', 'emergencia', 'riesgo'],
  },
];

/**
 * Normaliza la pregunta (minúsculas + sin acentos) para búsqueda de keywords.
 */
function normalize(question: string): string {
  return question
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Resuelve el nombre del engine según las palabras clave de la pregunta.
 * Retorna null si ninguna regla coincide.
 */
export function resolveEngineName(question: string): string | null {
  const normalized = normalize(question);
  for (const rule of INTENT_RULES) {
    if (rule.keywords.some((keyword) => normalized.includes(normalize(keyword)))) {
      return rule.engine;
    }
  }
  return null;
}

/**
 * Enruta la pregunta al engine registrado correspondiente.
 * Retorna null si no hay engine que coincida.
 */
export function routeToEngine(question: string, engines: readonly AIEngine[]): AIEngine | null {
  const engineName = resolveEngineName(question);
  if (!engineName) {
    return null;
  }
  return engines.find((engine) => engine.getName() === engineName) ?? null;
}
