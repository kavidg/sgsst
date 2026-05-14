import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AlertsModule } from '../alerts/alerts.module';
import { AuthModule } from '../auth/auth.module';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { CompanyUser, CompanyUserSchema } from '../companies/schemas/company-user.schema';
import { RolesGuard } from '../questions/roles.guard';
import { User, UserSchema } from '../users/schemas/user.schema';
import { UsersModule } from '../users/users.module';
import { PhvaAdvancedController } from './phva-advanced.controller';
import { PhvaAdvancedService } from './phva-advanced.service';
import { PhvaAdvancedResponsableSst, PhvaAdvancedResponsableSstSchema } from './schemas/phva-advanced-responsable-sst.schema';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    AlertsModule,
    MongooseModule.forFeature([
      { name: PhvaAdvancedResponsableSst.name, schema: PhvaAdvancedResponsableSstSchema },
      { name: User.name, schema: UserSchema },
      { name: CompanyUser.name, schema: CompanyUserSchema },
    ]),
  ],
  controllers: [PhvaAdvancedController],
  providers: [PhvaAdvancedService, RolesGuard, CompanyAccessGuard],
})
export class PhvaAdvancedModule {}
