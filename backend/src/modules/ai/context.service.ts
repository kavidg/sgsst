import { Injectable } from '@nestjs/common';
import { RequestWithUser } from '../auth/auth.types';
import { AIContext } from './interfaces/ai-context.interface';

/**
 * Servicio de contexto del AI Orchestrator.
 *
 * Construye el AIContext a partir de la petición HTTP autenticada:
 * - userId: UID de Firebase del usuario.
 * - companyId: de request.companyId o del header x-company-id.
 * - timestamp y question.
 */
@Injectable()
export class ContextService {
  buildContext(request: RequestWithUser, question: string): AIContext {
    const companyId =
      request.companyId?.toString() ?? request.headers['x-company-id'] ?? null;

    return {
      userId: request.user?.uid ?? null,
      companyId,
      timestamp: new Date(),
      question,
    };
  }
}
