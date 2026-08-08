/**
 * Actor que participa en un flujo de aprobación (solicitante o revisor).
 *
 * `userId` es el identificador canónico: cuando existe ObjectId del usuario se
 * usa ese; si no, se usa el UID de Firebase. `firebaseUid` se conserva para
 * compatibilidad con registros previos y auditoría.
 */
export interface ApprovalActor {
  /** Identificador del usuario (ObjectId del usuario o UID Firebase). */
  userId: string;
  /** UID de Firebase del actor (opcional cuando userId es un ObjectId). */
  firebaseUid?: string;
  /** Correo del actor. */
  email: string;
  /** Nombre legible del actor (opcional). */
  name?: string;
  /** Rol en el sistema: owner | admin | manager | member. */
  role: string;
  /** Momento en que el actor realizó la acción. */
  timestamp: Date;
}
