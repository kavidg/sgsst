import { IsDateString, IsMongoId } from 'class-validator';

export class ManualOcrDateDto {
  @IsMongoId() ocrDataId!: string;
  @IsDateString() modifiedDate!: string;
}
