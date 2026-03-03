import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { Company, CompanySchema } from './schemas/company.schema';
import { CompanyUser, CompanyUserSchema } from './schemas/company-user.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { AuthModule } from '../auth/auth.module';
import { CompanyAccessGuard } from '../auth/company-access.guard';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: Company.name, schema: CompanySchema },
      { name: CompanyUser.name, schema: CompanyUserSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [CompaniesController],
  providers: [CompaniesService, CompanyAccessGuard],
})
export class CompaniesModule {}
