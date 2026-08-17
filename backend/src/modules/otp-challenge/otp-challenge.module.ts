import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  CopasstOtpChallenge,
  CopasstOtpChallengeSchema,
} from './otp-challenge.schema';
import { OtpChallengeService } from './otp-challenge.service';

/**
 * Módulo mínimo y aislado del store OTP compartido (F7B-10.6-D).
 *
 * Responsabilidad separada del rate-limit (otp-rate-limit): aquí vive el
 * DESAFÍO OTP (hash + expiración + intentos); el rate-limit de solicitudes
 * sigue siendo otp_rate_limit_counters. Reutilizable posteriormente por
 * Convivencia cuando se decida migrar su flujo.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CopasstOtpChallenge.name, schema: CopasstOtpChallengeSchema },
    ]),
  ],
  providers: [OtpChallengeService],
  exports: [OtpChallengeService],
})
export class OtpChallengeModule {}
