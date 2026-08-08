import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { ImplementationWizardModule } from '../implementation-wizard/implementation-wizard.module';
import { RolesGuard } from '../questions/roles.guard';
import { User, UserSchema } from '../users/schemas/user.schema';
import { ImplementationPriorityController } from './implementation-priority.controller';
import { ImplementationPriorityService } from './implementation-priority.service';

/**
 * ImplementationPriorityEngine — módulo de SOLO LECTURA.
 *
 * Depende únicamente de ImplementationWizardModule (que exporta
 * ImplementationWizardService) y de AuthModule + schema User para los guards.
 * Sin forwardRef: dependencia unidireccional, sin ciclos.
 */
@Module({
  imports: [
    AuthModule,
    ImplementationWizardModule,
    // Schema de User requerido por RolesGuard para validar permisos.
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  controllers: [ImplementationPriorityController],
  providers: [ImplementationPriorityService, RolesGuard],
  exports: [ImplementationPriorityService],
})
export class ImplementationPriorityModule {}
