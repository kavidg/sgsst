import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AlertsModule } from '../alerts/alerts.module';
import { AuthModule } from '../auth/auth.module';
import { CopasstController } from './copasst.controller';
import { CopasstService } from './copasst.service';
import { CopasstPeriod, CopasstPeriodSchema } from './schemas/copasst.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: CopasstPeriod.name, schema: CopasstPeriodSchema }]), AlertsModule, AuthModule],
  controllers: [CopasstController],
  providers: [CopasstService],
})
export class CopasstModule {}
