import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ImplementationWizardController } from './implementation-wizard.controller';
import { ImplementationWizardService } from './implementation-wizard.service';
import { ImplementationWizard, ImplementationWizardSchema } from './schemas/implementation-wizard.schema';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    MongooseModule.forFeature([
      { name: ImplementationWizard.name, schema: ImplementationWizardSchema },
    ]),
  ],
  controllers: [ImplementationWizardController],
  providers: [ImplementationWizardService],
  exports: [ImplementationWizardService],
})
export class ImplementationWizardModule {}
