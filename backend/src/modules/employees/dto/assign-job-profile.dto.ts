import { IsMongoId } from 'class-validator';

/**
 * Asociación explícita Employee → JobProfile (3.1.3, FASE 30D-2).
 * El JobProfile debe pertenecer al MISMO tenant que el empleado (validado en
 * EmployeesService contra la empresa autenticada).
 */
export class AssignJobProfileDto {
  @IsMongoId()
  jobProfileId!: string;
}
