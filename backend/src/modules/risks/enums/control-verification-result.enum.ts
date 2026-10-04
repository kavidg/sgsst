/**
 * Resultado de una verificación de medida de control — PHVA 4.2.2.
 *
 * COMPLIANT     — La medida se aplica efectivamente.
 * PARTIAL       — La medida se aplica de forma incompleta o deficiente.
 * NON_COMPLIANT — La medida no se está aplicando.
 *
 * Ponderación aprobada en auditoría de diseño (1 / 0.5 / 0), precedente
 * epp-compliance.provider. La fórmula del provider queda congelada para
 * una etapa posterior; este enum solo define los valores de evidencia.
 */
export enum ControlVerificationResult {
  COMPLIANT = 'COMPLIANT',
  PARTIAL = 'PARTIAL',
  NON_COMPLIANT = 'NON_COMPLIANT',
}
