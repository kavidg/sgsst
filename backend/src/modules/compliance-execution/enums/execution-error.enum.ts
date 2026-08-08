/**
 * Errores semánticos del Compliance Execution Engine.
 *
 * Se usan como códigos estables para los fallos de pasos y para los errores
 * del historial de ejecución, independientes del mensaje humano.
 */
export enum ExecutionError {
  /** El companyId no es un ObjectId válido o la empresa no existe. */
  INVALID_COMPANY = 'INVALID_COMPANY',
  /** El AutomationResult no cumple los requisitos para ejecutarse. */
  INVALID_AUTOMATION = 'INVALID_AUTOMATION',
  /** Faltan campos obligatorios o los datos son inconsistentes. */
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  /** El servicio requerido por el paso no está disponible. */
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  /** El paso falló durante su ejecución. */
  EXECUTION_FAILED = 'EXECUTION_FAILED',
}
