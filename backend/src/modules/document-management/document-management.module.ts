import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { AlertsModule } from '../alerts/alerts.module';
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

@Module({
  imports: [
    AuthModule,
    UsersModule,
    AlertsModule,
    MongooseModule.forFeature([
      { name: DocumentMaster.name, schema: DocumentMasterSchema },
      { name: DocumentVersion.name, schema: DocumentVersionSchema },
      { name: DocumentHistory.name, schema: DocumentHistorySchema },
      { name: RetentionRule.name, schema: RetentionRuleSchema },
      { name: DocumentApproval.name, schema: DocumentApprovalSchema },
      { name: DocumentSignature.name, schema: DocumentSignatureSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [DocumentManagementController],
  providers: [
    DocumentMasterService,
    DocumentHistoryService,
    DocumentRetentionService,
    DocumentSearchService,
    DocumentAlertService,
    RolesGuard,
    CompanyAccessGuard,
  ],
  exports: [
    DocumentMasterService,
    DocumentHistoryService,
    DocumentRetentionService,
    DocumentSearchService,
    DocumentAlertService,
  ],
})
export class DocumentManagementModule {}
