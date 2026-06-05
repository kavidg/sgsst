import { IsString } from 'class-validator';

export class CreateTaskEvidenceDto {
  @IsString()
  fileUrl!: string;

  @IsString()
  fileType!: string;
}
