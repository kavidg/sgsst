import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { StepId } from '../../implementation-wizard/schemas/implementation-wizard.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { deriveStepStatus } from '../implementation-calculator';
import {
  ProviderValidationResult,
  WizardValidationProvider,
} from '../interfaces/wizard-validation-provider.interface';

/**
 * Valida el paso `users_roles` del Centro de Implementación usando los
 * usuarios reales de la empresa:
 *
 * - Mínimo 1 administrador activo (owner o admin).
 * - Mínimo 1 usuario operativo activo (member o manager).
 */
@Injectable()
export class UsersRolesProvider implements WizardValidationProvider {
  readonly stepId: StepId = 'users_roles';

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async getValidation(companyId: string): Promise<ProviderValidationResult> {
    try {
      const objectId = new Types.ObjectId(companyId);
      const [admins, members] = await Promise.all([
        this.userModel.countDocuments({
          companyId: objectId,
          role: { $in: ['owner', 'admin'] },
          // Tolerancia a datos legacy sin el campo isActive: cuenta activos O
          // indefinidos ($ne: false), nunca excluye por ausencia del campo.
          isActive: { $ne: false },
        }),
        this.userModel.countDocuments({
          companyId: objectId,
          role: { $in: ['member', 'manager'] },
          isActive: { $ne: false },
        }),
      ]);

      let percentage = 0;
      if (admins > 0) percentage += 50;
      if (members > 0) percentage += 50;
      percentage = Math.max(0, Math.min(100, percentage));

      return {
        stepId: this.stepId,
        percentage,
        status: deriveStepStatus(percentage),
        details: `${admins} administrador(es) y ${members} usuario(s) operativo(s) activos`,
        criteria: ['Al menos 1 administrador activo', 'Al menos 1 usuario operativo activo'],
        pendingCriteria: [
          ...(admins > 0 ? [] : ['Crear un administrador activo']),
          ...(members > 0 ? [] : ['Crear un usuario operativo activo']),
        ],
        data: { admins, members },
      };
    } catch {
      return {
        stepId: this.stepId,
        percentage: 0,
        status: 'PENDING',
        details: 'Usuarios no disponibles',
      };
    }
  }
}
