import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { AbsenteeismController } from './absenteeism.controller';
import { AbsenteeismService } from './absenteeism.service';
import { Absenteeism, AbsenteeismSchema } from './schemas/absenteeism.schema';

@Module({
  imports: [AuthModule, MongooseModule.forFeature([{ name: Absenteeism.name, schema: AbsenteeismSchema }])],
  controllers: [AbsenteeismController],
  providers: [AbsenteeismService],
})
export class AbsenteeismModule {}
