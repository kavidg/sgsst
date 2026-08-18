import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { UsersModule } from '../users/users.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { CompanyUser, CompanyUserSchema } from '../companies/schemas/company-user.schema';
import { AlertsModule } from '../alerts/alerts.module';
import { AbsenteeismController } from './absenteeism.controller';
import { AbsenteeismService } from './absenteeism.service';
import { Absenteeism, AbsenteeismSchema } from './schemas/absenteeism.schema';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    AlertsModule,
    MongooseModule.forFeature([
      { name: Absenteeism.name, schema: AbsenteeismSchema },
      { name: User.name, schema: UserSchema },
      { name: CompanyUser.name, schema: CompanyUserSchema },
    ]),
  ],
  controllers: [AbsenteeismController],
  providers: [AbsenteeismService, CompanyAccessGuard],
  exports: [AbsenteeismService],
})
export class AbsenteeismModule {}
