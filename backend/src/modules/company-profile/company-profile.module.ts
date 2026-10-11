import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { RolesGuard } from '../questions/roles.guard';
import { Company, CompanySchema } from '../companies/schemas/company.schema';
import { CompanyUser, CompanyUserSchema } from '../companies/schemas/company-user.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { UsersModule } from '../users/users.module';
// DOC-UPLOAD — StorageService (Firebase Storage) reutilizado del motor documental.
// forwardRef por defensa (la Convención del repo ante ciclos); sin duplicar provider.
import { DocumentGenerationModule } from '../document-generation/document-generation.module';
import { CompanyProfileController } from './company-profile.controller';
import { CompanyProfileService } from './company-profile.service';
import { CompanyProfile, CompanyProfileSchema } from './schemas/company-profile.schema';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    forwardRef(() => DocumentGenerationModule),
    MongooseModule.forFeature([
      { name: CompanyProfile.name, schema: CompanyProfileSchema },
      { name: Company.name, schema: CompanySchema },
      { name: User.name, schema: UserSchema },
      { name: CompanyUser.name, schema: CompanyUserSchema },
    ]),
  ],
  controllers: [CompanyProfileController],
  providers: [CompanyProfileService, RolesGuard, CompanyAccessGuard],
  exports: [CompanyProfileService],
})
export class CompanyProfileModule {}
