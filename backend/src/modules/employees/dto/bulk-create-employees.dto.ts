import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';

export class BulkEmployeeItemDto {
  @IsString()
  name!: string;

  @IsString()
  document!: string;

  @IsString()
  position!: string;

  @IsString()
  area!: string;

  @IsString()
  contractType!: string;

  @IsString()
  status!: string;

  /** Opcionales: datos de contacto (plantillas antiguas no los traen). */
  @IsOptional()
  @IsString()
  corporateEmail?: string;

  @IsOptional()
  @IsString()
  mobilePhone?: string;
}

export class BulkCreateEmployeesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BulkEmployeeItemDto)
  employees!: BulkEmployeeItemDto[];
}
