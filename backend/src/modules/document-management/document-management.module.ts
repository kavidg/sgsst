import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { AlertsModule } from '../alerts/alerts.module';
import { CommunicationModule } from '../communication/communication.module';
import { ApprovalWorkflowModule } from '../approval-workflow/approval-workflow.module';
import { RolesGuard } from '../questions/roles.guard';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { DocumentManagementController } from './document-management.controller';
import { DocumentMasterService } from './services/document-master.service';
import { DocumentHistoryService } from './services/document-history.service';
import { DocumentRetentionService } from './services/document-retention.service';
import { DocumentSearchService } from './services/document-search.service';
import { DocumentAlertService } from './services/document-alert.service';
import { DocumentMaster, DocumentMasterSchema } from './schemas/document-master.schema';
import { DocumentVersion, DocumentVersionSchema } from './schemas/document-version.schema';
import { DocumentHistory, DocumentHistorySchema } from './schemas/document-history.schema';
import { RetentionRule, RetentionRuleSchema } from './schemas/retention-rule.schema';
import { DocumentApproval, DocumentApprovalSchema } from './schemas/document-approval.schema';
import { DocumentSignature, DocumentSignatureSchema } from './schemas/document-signature.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
// Fase 8.2.A — publicación automática Approval → DocumentMaster: el servicio
// vincula la DocumentInstance publicada (documentMasterId / standardCode).
import { DocumentInstance, DocumentInstanceSchema } from '../document-generation/schemas/document-instance.schema';
import { DocumentPublicationService } from './services/document-publication.service';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    AlertsModule,
    CommunicationModule,
    forwardRef(() => ApprovalWorkflowModule),
    MongooseModule.forFeature([
      { name: DocumentMaster.name, schema: DocumentMasterSchema },
      { name: DocumentVersion.name, schema: DocumentVersionSchema },
      { name: DocumentHistory.name, schema: DocumentHistorySchema },
      { name: RetentionRule.name, schema: RetentionRuleSchema },
      { name: DocumentApproval.name, schema: DocumentApprovalSchema },
      { name: DocumentSignature.name, schema: DocumentSignatureSchema },
      { name: User.name, schema: UserSchema },
      { name: DocumentInstance.name, schema: DocumentInstanceSchema },
    ]),
  ],
  controllers: [DocumentManagementController],
  providers: [
    DocumentMasterService,
    DocumentHistoryService,
    DocumentRetentionService,
    DocumentSearchService,
    DocumentAlertService,
    // Fase 8.2.A — publicación automática de documentos aprobados en
    // DocumentMaster (consumido por el DocumentGenerationService).
    DocumentPublicationService,
    RolesGuard,
    CompanyAccessGuard,
  ],
  exports: [
    DocumentMasterService,
    DocumentHistoryService,
    DocumentRetentionService,
    DocumentSearchService,
    DocumentAlertService,
    DocumentPublicationService,
  ],
})
export class DocumentManagementModule {}
