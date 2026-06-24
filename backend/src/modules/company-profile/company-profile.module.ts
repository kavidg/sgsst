import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { Company, CompanySchema } from '../companies/schemas/company.schema';
import { CompanyProfileController } from './company-profile.controller';
import { CompanyProfileService } from './company-profile.service';
import { CompanyProfile, CompanyProfileSchema } from './schemas/company-profile.schema';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: CompanyProfile.name, schema: CompanyProfileSchema },
      { name: Company.name, schema: CompanySchema },
    ]),
  ],
  controllers: [CompanyProfileController],
  providers: [CompanyProfileService],
  exports: [CompanyProfileService],
})
export class CompanyProfileModule {}
