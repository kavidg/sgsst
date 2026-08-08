/**
 * Genera el resumen legible de una ejecución del Compliance Execution Engine.
 *
 * Ejemplo:
 * "La automatización fue ejecutada. Se completaron 4 pasos. 2 pasos fueron
 * omitidos porque el servicio aún no está implementado. No se detectaron
 * errores críticos."
 */
export function buildExecutionSummary(params: {
  completed: number;
  skipped: number;
  failed: number;
}): string {
  const parts: string[] = ['La automatización fue ejecutada.'];
  parts.push(`Se completaron ${params.completed} pasos.`);

  if (params.skipped > 0) {
    parts.push(`${params.skipped} pasos fueron omitidos porque el servicio aún no está implementado.`);
  }

  if (params.failed > 0) {
    parts.push(`${params.failed} pasos fallaron durante la ejecución.`);
  } else {
    parts.push('No se detectaron errores críticos.');
  }

  return parts.join(' ');
}
