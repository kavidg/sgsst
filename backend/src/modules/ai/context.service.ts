import { Injectable } from '@nestjs/common';
import { RequestWithUser } from '../auth/auth.types';
import { AIContext } from './interfaces/ai-context.interface';

/**
 * Servicio de contexto del AI Orchestrator.
 *
 * Construye el AIContext a partir de la petición HTTP autenticada:
 * - userId: UID de Firebase del usuario.
 * - companyId: EXCLUSIVAMENTE de request.companyId, el tenant ya validado por
 *   CompanyAccessGuard (membresía real del usuario autenticado).
 * - timestamp y question.
 *
 * AUDIT-1: se eliminó el fallback a request.headers['x-company-id']. El header
 * es client-controlled y NO debe tener autoridad de tenant: si el guard no
 * autorizó una empresa, no existe tenant (null) y los engines responden sin
 * datos. Ningún DTO/body/query/header puede elegir el tenant.
 */
@Injectable()
export class ContextService {
  buildContext(request: RequestWithUser, question: string): AIContext {
    return {
      userId: request.user?.uid ?? null,
      companyId: request.companyId?.toString() ?? null,
      timestamp: new Date(),
      question,
    };
  }
}
