import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type TrainingAttendanceDocument = HydratedDocument<TrainingAttendance>;

@Schema({ timestamps: true })
export class TrainingAttendance {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Training' })
  trainingId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Employee' })
  employeeId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;
}

export const TrainingAttendanceSchema = SchemaFactory.createForClass(TrainingAttendance);
TrainingAttendanceSchema.index({ trainingId: 1, employeeId: 1 }, { unique: true });
TrainingAttendanceSchema.index({ companyId: 1, trainingId: 1 });
