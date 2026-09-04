import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { RolesGuard } from '../questions/roles.guard';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { ApprovalWorkflowModule } from '../approval-workflow/approval-workflow.module';
import { AcquisitionsController } from './acquisitions.controller';
import { AcquisitionsService } from './acquisitions.service';
import { Supplier, SupplierSchema } from './schemas/supplier.schema';
import { Acquisition, AcquisitionSchema } from './schemas/acquisition.schema';
import { AcquisitionHistory, AcquisitionHistorySchema } from './schemas/acquisition-history.schema';
import { User, UserSchema } from '../users/schemas/user.schema';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    forwardRef(() => ApprovalWorkflowModule),
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Supplier.name, schema: SupplierSchema },
      { name: Acquisition.name, schema: AcquisitionSchema },
      { name: AcquisitionHistory.name, schema: AcquisitionHistorySchema },
    ]),
  ],
  controllers: [AcquisitionsController],
  providers: [
    AcquisitionsService,
    RolesGuard,
    CompanyAccessGuard,
  ],
  exports: [AcquisitionsService],
})
export class AcquisitionsModule {}
