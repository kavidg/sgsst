import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { RolesGuard } from '../questions/roles.guard';
import { User, UserSchema } from '../users/schemas/user.schema';
import { UsersModule } from '../users/users.module';
import { ResponsibilityMatrixController } from './responsibility-matrix.controller';
import { ResponsibilityMatrixService } from './responsibility-matrix.service';
import { ResponsibilityMatrix, ResponsibilityMatrixSchema } from './schemas/responsibility-matrix.schema';
import { ResponsibilityAcceptance, ResponsibilityAcceptanceSchema } from './schemas/responsibility-acceptance.schema';
import { WorkerSignatureCampaignModule } from '../worker-signature-campaign/worker-signature-campaign.module';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    WorkerSignatureCampaignModule,
    MongooseModule.forFeature([
      { name: ResponsibilityMatrix.name, schema: ResponsibilityMatrixSchema },
      { name: User.name, schema: UserSchema },
      { name: ResponsibilityAcceptance.name, schema: ResponsibilityAcceptanceSchema },
    ]),
  ],
  controllers: [ResponsibilityMatrixController],
  providers: [ResponsibilityMatrixService, RolesGuard, CompanyAccessGuard],
  exports: [ResponsibilityMatrixService],
})
export class ResponsibilityMatrixModule {}
