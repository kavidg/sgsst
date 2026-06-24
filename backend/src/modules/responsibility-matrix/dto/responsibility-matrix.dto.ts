import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ResponsibilityItemDto {
  @IsString() title!: string;
  @IsOptional() @IsString() description?: string;
  @IsString() group!: string;
  @IsOptional() @IsNumber() order?: number;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsBoolean() mandatory?: boolean;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() assignedEmployeeId?: string;
  @IsOptional() @IsString() assignedEmployeeName?: string;
}

export class UpdateItemDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() group?: string;
  @IsOptional() @IsNumber() order?: number;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsBoolean() mandatory?: boolean;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() assignedEmployeeId?: string;
  @IsOptional() @IsString() assignedEmployeeName?: string;
}

export class GenerateMatrixDto {
  @IsOptional() @IsArray() groups?: string[];
}

export class ApproveMatrixDto {
  @IsString() approvedByEmail!: string;
  @IsOptional() @IsString() comments?: string;
}

export class ReorderItemsDto {
  @IsArray()
  order!: Array<{ _id: string; order: number }>;
}

export class VersionSnapshotDto {
  @IsOptional() @IsString() versionLabel?: string;
}
