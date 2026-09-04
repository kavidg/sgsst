import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';

/**
 * Prefijos de código de estándar para clasificar evaluaciones por fase PHVA.
 *
 * Utiliza startsWith() para matching. Los códigos exactos (ej: '2.5.1')
 * capturan únicamente ese estándar; los prefijos genéricos (ej: '3.')
 * capturan todos los estándares de ese capítulo.
 *
 * BLOQUE 4F-C: Se agregaron códigos 2.x que el catálogo real clasifica
 * como HACER/VERIFICAR pero que empiezan con '2.' en lugar de '3.'-'5.' o '6.'.
 */
export const PHASE_PREFIXES: Record<CompliancePhaseKey, string[]> = {
  plan: ['1.', '2.'],
  do: [
    // HACER — estándares capítulo 2 (IMPLEMENTED/PARTIAL, BLOQUE 4F-C)
    '2.5.1',  // Conservación documental
    '2.8.1',  // Comunicación
    '2.9.1',  // Adquisiciones
    '2.10.1', // Contratación
    '2.11.1', // Gestión del cambio
    // HACER — capítulos 3, 4, 5 (prefixes originales)
    '3.', '4.', '5.',
  ],
  check: [
    // VERIFICAR — estándares fuera del capítulo 6 (BLOQUE 4F-C)
    '2.6.1',  // Rendición de cuentas
    '3.3.2',  // Medición indicadores salud
    '4.2.2',  // Verificación medidas de control
    // VERIFICAR — capítulo 6 (prefix original)
    '6.',
  ],
  act: ['7.'],
};
