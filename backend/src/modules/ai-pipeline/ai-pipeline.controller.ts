import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { RequestWithUser } from '../auth/auth.types';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { Roles } from '../questions/roles.decorator';
import { RolesGuard } from '../questions/roles.guard';
import { UsersService } from '../users/users.service';
import { UserDocument } from '../users/schemas/user.schema';
import { AiAnalysisActorType } from './enums/pipeline-module.enum';
import { AiPipelineService, AnalysisActor } from './ai-pipeline.service';
import { LinkEvidenceDto } from './dto/link-evidence.dto';

/**
 * Endpoints del pipeline PHVA → IA → findings → acciones → plan → tareas →
 * evidencias → verificación (AUDIT-3).
 *
 * Tenant isolation certificada: FirebaseAuthGuard → RolesGuard →
 * CompanyAccessGuard (mismo patrón que annual-work-plan/convivencia).
 * companyId proviene EXCLUSIVAMENTE de request.companyId (fijado por el guard
 * tras validar membresía); nunca del body/params/DTO.
 */
@Controller('ai-pipeline')
@UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
export class AiPipelineController {
  constructor(
    private readonly aiPipelineService: AiPipelineService,
    private readonly usersService: UsersService,
  ) {}

  /** Ejecuta y persiste el análisis de cumplimiento del tenant autorizado. */
  @Post('analysis')
  @Roles('owner', 'admin', 'manager')
  async runAnalysis(@Req() request: RequestWithUser) {
    const companyId = this.companyIdOf(request);
    const record = await this.aiPipelineService.analyzeAndPersist(companyId, this.actorOf(request));
    return this.mapAnalysis(record);
  }

  /** Ejecuta y persiste el análisis PHVA del tenant autorizado. */
  @Post('analysis/phva')
  @Roles('owner', 'admin', 'manager')
  async runPhvaAnalysis(@Req() request: RequestWithUser) {
    const companyId = this.companyIdOf(request);
    const record = await this.aiPipelineService.analyzePhvaAndPersist(
      companyId,
      this.actorOf(request),
    );
    return this.mapAnalysis(record);
  }

  /**
   * Historial de análisis del tenant (sin datos de otros tenants).
   * AUDIT-4: paginación opcional (limit/offset); nunca recalcula el engine.
   */
  @Get('analysis')
  @Roles('owner', 'admin', 'manager', 'viewer')
  async getAnalyses(
    @Req() request: RequestWithUser,
    @Query('limit') limitRaw?: string,
    @Query('offset') offsetRaw?: string,
  ) {
    const companyId = this.companyIdOf(request);
    const limit = this.parsePositiveInt(limitRaw, 50, 200);
    const offset = this.parsePositiveInt(offsetRaw, 0, Number.MAX_SAFE_INTEGER);
    const records = await this.aiPipelineService.getCompanyAnalyses(companyId, {
      limit,
      offset,
    });
    return records.map((record) => this.mapAnalysis(record));
  }

  /** Último análisis persistido del tenant (o null si no existe ninguno). */
  @Get('analysis/latest')
  @Roles('owner', 'admin', 'manager', 'viewer')
  async getLatestAnalysis(@Req() request: RequestWithUser) {
    const companyId = this.companyIdOf(request);
    const record = await this.aiPipelineService.getLatestAnalysis(companyId);
    return record ? this.mapAnalysis(record) : null;
  }

  /**
   * Análisis individual por id (tenant-scoped). Si el id pertenece a otra
   * empresa devuelve NotFound genérico. Lee el snapshot inmutable, no recalcula.
   */
  @Get('analysis/:analysisId')
  @Roles('owner', 'admin', 'manager', 'viewer')
  async getAnalysis(@Req() request: RequestWithUser, @Param('analysisId') analysisId: string) {
    const companyId = this.companyIdOf(request);
    const record = await this.aiPipelineService.getAnalysisScoped(companyId, analysisId);
    return this.mapAnalysis(record);
  }

  /** Comparación determinista entre dos análisis históricos del tenant. */
  @Get('analysis/:analysisId/compare/:previousId')
  @Roles('owner', 'admin', 'manager', 'viewer')
  async compareAnalyses(
    @Req() request: RequestWithUser,
    @Param('analysisId') analysisId: string,
    @Param('previousId') previousId: string,
  ) {
    const companyId = this.companyIdOf(request);
    return this.aiPipelineService.compareAnalyses(companyId, analysisId, previousId);
  }

  /** Trazabilidad completa del pipeline del tenant. */
  @Get('trace')
  @Roles('owner', 'admin', 'manager', 'viewer')
  async getTrace(@Req() request: RequestWithUser) {
    const companyId = this.companyIdOf(request);
    const traces = await this.aiPipelineService.getCompanyTrace(companyId);
    return traces.map((trace) => ({
      sourceModule: trace.sourceModule,
      sourceEntityId: trace.sourceEntityId,
      targetModule: trace.targetModule,
      targetEntityId: trace.targetEntityId,
      originType: trace.originType,
      createdAt: trace.createdAt,
    }));
  }

  /** Materializa una recomendación del Action Engine como actividad del plan anual. */
  @Post('actions/:actionId/materialize')
  @Roles('owner', 'admin', 'manager')
  async materializeAction(
    @Req() request: RequestWithUser,
    @Param('actionId') actionId: string,
  ) {
    const companyId = this.companyIdOf(request);
    const user = await this.resolveUserFromRequest(request);
    const activity = await this.aiPipelineService.materializeAction(companyId, actionId, user);
    return {
      id: activity._id.toString(),
      title: activity.title,
      sourceModule: activity.sourceModule,
      status: activity.status,
    };
  }

  /** Vincula una evidencia a una tarea del plan anual del tenant. */
  @Post('tasks/:taskId/evidence')
  @Roles('owner', 'admin', 'manager')
  async linkEvidence(
    @Req() request: RequestWithUser,
    @Param('taskId') taskId: string,
    @Body() dto: LinkEvidenceDto,
  ) {
    const companyId = this.companyIdOf(request);
    const user = await this.resolveUserFromRequest(request);
    if (!Types.ObjectId.isValid(taskId)) throw new BadRequestException('Invalid taskId');
    if (!dto.fileUrl || !dto.fileType) throw new BadRequestException('fileUrl and fileType are required');

    const evidence = await this.aiPipelineService.linkEvidenceToTask(
      companyId,
      new Types.ObjectId(taskId),
      dto.fileUrl,
      dto.fileType,
      user._id,
    );
    return { id: evidence._id.toString(), taskId: evidence.taskId.toString() };
  }

  /** Verifica la evidencia de una tarea y re-calcula el plan (cierre del pipeline). */
  @Post('tasks/:taskId/verify')
  @Roles('owner', 'admin', 'manager')
  async verifyEvidence(@Req() request: RequestWithUser, @Param('taskId') taskId: string) {
    const companyId = this.companyIdOf(request);
    const user = await this.resolveUserFromRequest(request);
    if (!Types.ObjectId.isValid(taskId)) throw new BadRequestException('Invalid taskId');

    const trace = await this.aiPipelineService.verifyEvidence(
      companyId,
      new Types.ObjectId(taskId),
      user,
    );
    return {
      verificationId: trace.targetEntityId,
      status: trace.metadata?.status,
      verifiedAt: trace.metadata?.verifiedAt,
    };
  }

  // -------------------------------------------------------------------------
  // Helpers (patrón certificado de annual-work-plan/convivencia)
  // -------------------------------------------------------------------------

  private companyIdOf(request: RequestWithUser): Types.ObjectId {
    if (!request.companyId) throw new ForbiddenException('Missing active company context');
    return request.companyId;
  }

  /** Actor autorizado del request (AUDIT-4): identidad del usuario, nunca del DTO. */
  private actorOf(request: RequestWithUser): AnalysisActor {
    return {
      requestedBy: request.user?.uid,
      actorType: AiAnalysisActorType.USER,
    };
  }

  /** Proyección del snapshot histórico (inmutable, sin recalcular). */
  private mapAnalysis(record: {
    _id: Types.ObjectId;
    analysisType: string;
    score: number;
    engineVersion: string;
    fingerprint: string;
    findings: unknown[];
    recommendations: unknown[];
    actorType?: string;
    requestedBy?: string;
    createdAt?: Date;
  }) {
    return {
      id: record._id.toString(),
      analysisType: record.analysisType,
      score: record.score,
      engineVersion: record.engineVersion,
      fingerprint: record.fingerprint,
      findings: record.findings,
      recommendations: record.recommendations,
      actorType: record.actorType ?? null,
      requestedBy: record.requestedBy ?? null,
      createdAt: record.createdAt,
    };
  }

  /** Parsea un entero positivo opcional con default y límite superior. */
  private parsePositiveInt(raw: string | undefined, defaultValue: number, max: number): number {
    if (!raw) return defaultValue;
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed) || parsed < 0) throw new BadRequestException('Invalid pagination parameter');
    return Math.min(parsed, max);
  }

  private async resolveUserFromRequest(request: RequestWithUser): Promise<UserDocument> {
    const firebaseUid = request.user?.uid;
    if (!firebaseUid) throw new ForbiddenException('Missing authenticated user');
    const user = await this.usersService.findByFirebaseUid(firebaseUid);
    if (!user) throw new ForbiddenException('Authenticated user is not registered');
    return user;
  }
}
