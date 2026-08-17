import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OtpRateLimitCounter, OtpRateLimitCounterSchema } from './otp-rate-limit.schema';
import { OtpRateLimitService } from './otp-rate-limit.service';

/**
 * Rate-limit distribuido de solicitudes OTP (F7B-10.5-B).
 *
 * Módulo pequeño y reutilizable: COPASST lo consume hoy; Convivencia podrá
 * adoptarlo en una fase posterior sin cambios en este módulo. La colección
 * `otp_rate_limit_counters` es NUEVA (sin datos legacy) y solo contiene
 * contadores del bucket (key/count/expiresAt) — nunca OTP ni PII.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OtpRateLimitCounter.name, schema: OtpRateLimitCounterSchema },
    ]),
  ],
  providers: [OtpRateLimitService],
  exports: [OtpRateLimitService],
})
export class OtpRateLimitModule {}
