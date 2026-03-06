import { IsMongoId } from 'class-validator';

export class CreateTrainingAttendanceDto {
  @IsMongoId()
  employeeId!: string;
}
