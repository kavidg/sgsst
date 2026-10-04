import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { DocumentManagementModule } from '../document-management/document-management.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import {
  ManagementReviewDirection,
  ManagementReviewDirectionSchema,
} from './schemas/management-review-direction.schema';
import {
  ManagementReviewDirectionHistory,
  ManagementReviewDirectionHistorySchema,
} from './schemas/management-review-direction-history.schema';
import { ManagementReviewDirectionController } from './management-review-direction.controller';
import { ManagementReviewDirectionService } from './management-review-direction.service';

/**
 * E1 (6.1.3) — Módulo del dominio MANAGEMENT-REVIEW-DIRECTION (Revisión por
 * la dirección).
 *
 * - AuthModule: provee FirebaseAdminService/FirebaseAuthGuard (FirebaseAuthGuard
 *   se aplica a nivel de controller y requiere ese provider en el contexto).
 * - UsersModule: resolución server-side del tenant (UsersService.findByFirebaseUid).
 * - DocumentManagementModule: evidencia documental tenant-safe
 *   (DocumentMasterService.findById(id, companyId)).
 * - El modelo User se registra localmente para validar responsable/
 *   participantes tenant-scoped (un solo query $in por operación).
 *
 * NOTA DE ALCANCE (E1): este módulo NO registra provider de ComplianceEngine,
 * NO implementa scoring ni analyzer de IA, y NO tiene página frontend todavía.
 * La retirada de `internal-audit` del scoring de 6.1.3 se realizará en E2
 * junto con el nuevo provider oficial.
 */
@Module({
  imports: [
    AuthModule,
    UsersModule,
    DocumentManagementModule,
    MongooseModule.forFeature([
      { name: ManagementReviewDirection.name, schema: ManagementReviewDirectionSchema },
      { name: ManagementReviewDirectionHistory.name, schema: ManagementReviewDirectionHistorySchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [ManagementReviewDirectionController],
  providers: [ManagementReviewDirectionService],
})
export class ManagementReviewDirectionModule {}
