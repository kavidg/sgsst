import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { Company, CompanySchema } from '../companies/schemas/company.schema';
import { CompanyUser, CompanyUserSchema } from '../companies/schemas/company-user.schema';
import { User, UserSchema } from '../users/schemas/user.schema';

/**
 * Modelos que `CompanyAccessGuard` necesita (User, CompanyUser y, desde la
 * rama owner/Superadmin, Company), registrados y re-exportados GLOBALMENTE.
 *
 * Motivación: el guard se registra como provider en ~20 módulos; no todos
 * tenían `Company.name` en su `forFeature` y el `@InjectModel(Company.name)`
 * rompía el arranque por DI. El re-export explícito (imports + exports del
 * mismo DynamicModule) hace visibles los modelos en toda la app sin tocar
 * cada módulo; los `forFeature` locales existentes siguen funcionando.
 */
const AUTH_MODELS = MongooseModule.forFeature([
  { name: User.name, schema: UserSchema },
  { name: Company.name, schema: CompanySchema },
  { name: CompanyUser.name, schema: CompanyUserSchema },
]);

@Global()
@Module({
  imports: [AUTH_MODELS],
  exports: [AUTH_MODELS],
})
export class AuthModelsModule {}
