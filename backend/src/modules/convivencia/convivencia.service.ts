import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { Model, Types } from 'mongoose';
import { AlertsService } from '../alerts/alerts.service';
import { AutoCommunicationService } from '../communication/auto-communication.service';
import { Employee, EmployeeDocument } from '../employees/schemas/employee.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { AlertSeverity } from '../alerts/schemas/alert.schema';
// F7B-11: infraestructura distribuida compartida (certificada en COPASST).
import { OtpChallengeService } from '../otp-challenge/otp-challenge.service';
import { OtpRateLimitService } from '../otp-rate-limit/otp-rate-limit.service';
import {
  CONVIVENCIA_ITEM_CODE,
  ConvivenciaCaseSequence,
  ConvivenciaCaseSequenceDocument,
  ConvivenciaComplianceStatus,
  ConvivenciaPeriod,
  ConvivenciaPeriodDocument,
} from './schemas/convivencia.schema';

/**
 * Snapshot de cumplimiento 1.1.8 para consumidores externos (Fase 3).
 *
 * `complianceStatus`/`complianceReason` son la fuente de verdad (resuelta por
 * resolveCompliance en el dominio). `percentage` es un progreso 0-100
 * SIEMPRE coherente con el estado: COMPLIES→100, NON_COMPLIANT→0,
 * PENDING→25/50/75 (nunca 100). `metCriteria`/`missingCriteria` son las 4
 * condiciones de dominio evaluadas como progreso (no como regla de estado).
 */
export interface ConvivenciaComplianceSnapshot {
  complianceStatus: ConvivenciaComplianceStatus;
  complianceReason: string;
  /** Progreso 0-100 coherente con complianceStatus (ver doc de la interfaz). */
  percentage: number;
  /** true si la empresa está exenta (requiresConvivencia === false). */
  exempt: boolean;
  /** Condiciones de dominio presentes (etiquetas legibles). */
  metCriteria: string[];
  /** Condiciones de dominio ausentes (etiquetas legibles). */
  missingCriteria: string[];
  /** Estado real del periodo (ACTIVO / PROXIMO_A_VENCER / VENCIDO / ARCHIVADO). */
  periodStatus: string;
  /** Estado real de aprobación del periodo. */
  approvalStatus: string;
  /** Cantidad de evidencias registradas en evidence[]. */
  evidenceCount: number;
}

/**
 * TTL del OTP: 5 minutos (se mantiene el valor previo).
 */
const OTP_TTL_MS = 5 * 60 * 1000;
/** Máximo de intentos fallidos por OTP antes de invalidarlo. */
const MAX_OTP_ATTEMPTS = 5;
/**
 * Prefijo de namespace lógico de las claves OTP/rate-limit de Convivencia
 * (F7B-11). Evita colisiones con las claves de COPASST en las MISMAS
 * colecciones compartidas (copasst_otp_challenges / otp_rate_limit_counters):
 * un electionId de Convivencia y uno de COPASST jamás comparten contador ni
 * desafío, aunque el formato base (id:document:phone) sea el mismo.
 */
const OTP_KEY_NAMESPACE = 'convivencia:';

/**
 * Pepper COMPARTIDO entre instancias (F7B-11): se lee de la configuración
 * (env OTP_PEPPER, hex 64 chars) para que un OTP generado en la instancia A
 * pueda validarse en la instancia B (el hash HMAC debe coincidir). Si no está
 * configurado, se genera aleatoriamente por proceso (comportamiento legacy;
 * en multi-instancia real el operador DEBE fijar OTP_PEPPER idéntico en
 * todas las instancias — mismo requisito certificado de COPASST).
 */
const OTP_HASH_PEPPER = process.env.OTP_PEPPER ?? randomBytes(32).toString('hex');

/** Hasher por defecto: HMAC-SHA256(pepper, código) → hex (64 chars). */
const defaultOtpHasher = (code: string): string =>
  createHmac('sha256', OTP_HASH_PEPPER).update(code).digest('hex');

@Injectable()
export class ConvivenciaService {
  /**
   * Hasher inyectable por pruebas (campo de instancia con default de
   * producción; las pruebas pueden sustituirlo por uno reversible para
   * recuperar el código de validación sin exponerlo por la API).
   */
  private readonly otpHasher: (code: string) => string = defaultOtpHasher;
  /**
   * Año vigente de la secuencia de casos (F7B-6). Campo de instancia
   * sobreescribible por pruebas para forzar el año sin depender del reloj.
   */
  private readonly currentYear: () => number = () => new Date().getFullYear();

  constructor(
    @InjectModel(ConvivenciaPeriod.name) private readonly periodModel: Model<ConvivenciaPeriodDocument>,
    // F7B-6 (1.1.8): secuencia persistente de casos (reemplaza caseCounter).
    @InjectModel(ConvivenciaCaseSequence.name) private readonly caseSequenceModel: Model<ConvivenciaCaseSequenceDocument>,
    @InjectModel(Employee.name) private readonly employeeModel: Model<EmployeeDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly alertsService: AlertsService,
    private readonly autoCommService: AutoCommunicationService,
    // F7B-11: infraestructura distribuida compartida (certificada en COPASST).
    private readonly otpRateLimitService: OtpRateLimitService,
    private readonly otpChallengeService: OtpChallengeService,
  ) {}

  // ─────────────────────────────────────────────
  // AISLAMIENTO MULTI-TENANT (Fase 1 — hardening)
  // ─────────────────────────────────────────────

  /**
   * Recupera un periodo validando SIEMPRE pertenencia por companyId (Fase 1,
   * hardening multi-tenancy 1.1.8).
   *
   * Devuelve NotFoundException tanto si el documento no existe como si
   * pertenece a otra empresa: una entidad de otro tenant se comporta como no
   * encontrada y NO filtra información (no se revela la existencia del
   * periodo en otra empresa).
   *
   * TODO método autenticado que reciba un periodId por request DEBE pasar por
   * aquí (nunca `periodModel.findById(periodId)` suelto).
   */
  private async findPeriodForCompany(
    companyId: Types.ObjectId,
    periodId: Types.ObjectId | string,
  ): Promise<ConvivenciaPeriodDocument> {
    // F7B-11: query SCOPED desde MongoDB ({ _id, companyId }) — patrón
    // certificado de COPASST (findPeriodScoped). El tenant se aplica en el
    // filtro mismo de la consulta, no con un check post-load: un periodo de
    // otra empresa no matchea el filtro → NotFound genérico sin revelar la
    // existencia de la entidad en otro tenant.
    let id: Types.ObjectId;
    try {
      id =
        typeof periodId === 'string'
          ? new Types.ObjectId(periodId)
          : (periodId as Types.ObjectId);
    } catch {
      // Formato inválido → se comporta como no encontrado (sin CastError).
      throw new NotFoundException('Periodo no encontrado');
    }
    const period = await this.periodModel
      .findOne({ _id: id, companyId })
      .exec();
    if (!period) {
      throw new NotFoundException('Periodo no encontrado');
    }
    return period;
  }

  /**
   * Getter de lectura por identificador validando pertenencia por companyId
   * (Fase 1). Devuelve NotFound tanto si el documento no existe como si
   * pertenece a otra empresa (no filtra información entre tenants). Usado por
   * el ConvivenciaAdapter del Approval Workflow Core.
   */
  async findById(companyId: Types.ObjectId, id: Types.ObjectId): Promise<ConvivenciaPeriodDocument> {
    return this.findPeriodForCompany(companyId, id);
  }

  /**
   * Getter de lectura del periodo activo vigente de la empresa (sin crear un
   * periodo por defecto como hace getCurrent). Usado por el adapter cuando
   * getEntity llega sin periodId y por el Implementation Validator.
   */
  async findCurrent(companyId: Types.ObjectId): Promise<ConvivenciaPeriodDocument> {
    const period = await this.periodModel
      .findOne({ companyId, status: { $ne: 'ARCHIVADO' } })
      .sort({ createdAt: -1 })
      .exec();
    if (!period) throw new NotFoundException('No existe un periodo activo para esta empresa');
    return period;
  }

  // ─── SUMMARY ───
  async getSummary(companyId: Types.ObjectId) {
    const totalEmployees = await this.employeeModel.countDocuments({ companyId, status: 'Activo' }).exec();
    const requiresConvivencia = totalEmployees >= 1; // All companies with employees need coexistence committee
    const current = await this.periodModel.findOne({ companyId, status: { $ne: 'ARCHIVADO' } }).sort({ createdAt: -1 }).exec();
    if (!current) {
      const start = new Date();
      const end = new Date(start); end.setFullYear(end.getFullYear() + 2);
      const created = await this.periodModel.create({
        companyId, itemCode: CONVIVENCIA_ITEM_CODE, periodName: 'Comité de Convivencia Inicial',
        startDate: start, endDate: end, status: 'ACTIVO', totalEmployees, requiresConvivencia,
      });
      this.resolveCompliance(created);
      await created.save();
      return { period: created, totalEmployees, requiresConvivencia };
    }
    current.totalEmployees = totalEmployees;
    current.requiresConvivencia = requiresConvivencia;
    await this.saveWithCompliance(current);
    return { period: current, totalEmployees, requiresConvivencia };
  }

  async getCurrent(companyId: Types.ObjectId) {
    const current = await this.periodModel.findOne({ companyId, status: { $ne: 'ARCHIVADO' } }).sort({ createdAt: -1 }).exec();
    if (current) return this.refreshStatus(current);
    const start = new Date();
    const end = new Date(start); end.setFullYear(end.getFullYear() + 2);
    const created = await this.periodModel.create({
      companyId, itemCode: CONVIVENCIA_ITEM_CODE, periodName: 'Comité de Convivencia Inicial',
      startDate: start, endDate: end, status: 'ACTIVO', totalEmployees: 0, requiresConvivencia: true,
    });
    this.resolveCompliance(created);
    return created.save();
  }

  async createPeriod(companyId: Types.ObjectId, dto: { periodName: string; startDate: string }, email: string) {
    await this.periodModel.updateMany({ companyId, status: { $ne: 'ARCHIVADO' } }, { $set: { status: 'ARCHIVADO' } }).exec();
    const start = new Date(dto.startDate);
    const end = new Date(start); end.setFullYear(end.getFullYear() + 2);
    const created = await this.periodModel.create({
      companyId, itemCode: CONVIVENCIA_ITEM_CODE, periodName: dto.periodName,
      startDate: start, endDate: end, status: 'ACTIVO',
      auditHistory: [{ action: 'CREATE_PERIOD', createdBy: email, createdAt: new Date(), data: JSON.stringify(dto) }],
    });
    await this.autoCommService.generateCommunication({
      companyId, title: `Elección Comité de Convivencia: ${created.periodName}`,
      body: `Se ha iniciado el proceso de elección del Comité de Convivencia Laboral. Periodo: \"${created.periodName}\".`,
      communicationType: 'ANNOUNCEMENT', priority: 'IMPORTANT', targetAudience: 'ALL_COMPANY',
      requiresSignature: false, sourceModule: 'CONVIVENCIA_ELECTION', sourceEntityId: created._id.toString(),
    }).catch(() => {});
    this.resolveCompliance(created);
    return created.save();
  }

  // ─── MEMBERS ───
  async getMembers(companyId: Types.ObjectId, periodId: string) {
    const period = await this.findPeriodForCompany(companyId, periodId);
    return period.members;
  }

  async addMember(companyId: Types.ObjectId, periodId: string, dto: {
    userId: string; userName: string; committeeRole: string;
    representationType: string; principalType: string; startDate: string;
  }, email: string) {
    const period = await this.findPeriodForCompany(companyId, periodId);
    const start = new Date(dto.startDate);
    const end = new Date(start); end.setFullYear(end.getFullYear() + 2);
    period.members.push({
      userId: new Types.ObjectId(dto.userId), userName: dto.userName,
      committeeRole: dto.committeeRole as any,
      representationType: dto.representationType as any,
      principalType: dto.principalType as any,
      startDate: start, endDate: end, status: 'ACTIVO',
    } as never);
    period.auditHistory.push({ action: 'ADD_MEMBER', createdBy: email, createdAt: new Date(), data: JSON.stringify(dto) });
    return this.saveWithCompliance(period);
  }

  async removeMember(companyId: Types.ObjectId, periodId: string, memberIndex: number, email: string) {
    const period = await this.findPeriodForCompany(companyId, periodId);
    const member = period.members[memberIndex];
    if (!member) throw new NotFoundException('Miembro no encontrado');
    period.members.splice(memberIndex, 1);
    period.auditHistory.push({ action: 'REMOVE_MEMBER', createdBy: email, createdAt: new Date(), data: JSON.stringify(member) });
    return this.saveWithCompliance(period);
  }

  // ─── CAMPAIGN ───
  async startRegistrationCampaign(companyId: Types.ObjectId, periodId: string, dto: {
    openingDate: string; closingDate: string;
    includedDepartments?: string[]; requirements?: string[];
  }, email: string) {
    const period = await this.findPeriodForCompany(companyId, periodId);
    const secureToken = `${new Types.ObjectId().toString()}-${Date.now().toString(36)}`;
    period.registrationCampaign = {
      openingDate: new Date(dto.openingDate), closingDate: new Date(dto.closingDate),
      includedDepartments: dto.includedDepartments ?? [], requirements: dto.requirements ?? [],
      secureToken, isActive: true, adminNotes: '',
    };
    period.auditHistory.push({ action: 'START_CAMPAIGN', createdBy: email, createdAt: new Date(), data: JSON.stringify(dto) });
    await this.saveWithCompliance(period);
    await this.autoCommService.generateCommunication({
      companyId: period.companyId,
      title: `Convocatoria Comité de Convivencia: ${period.periodName}`,
      body: `Se ha abierto la convocatoria para candidatos al Comité de Convivencia. Periodo de inscripción: ${new Date(dto.openingDate).toISOString().slice(0, 10)} al ${new Date(dto.closingDate).toISOString().slice(0, 10)}.`,
      communicationType: 'ANNOUNCEMENT', priority: 'IMPORTANT', targetAudience: 'ALL_COMPANY',
      requiresSignature: false, sourceModule: 'CONVIVENCIA_CAMPAIGN' as any, sourceEntityId: period._id.toString(),
    }).catch(() => {});
    return { period, secureToken, registrationUrl: `/convivencia/register/${secureToken}` };
  }

  /**
   * Endpoint PÚBLICO por diseño: el acceso se controla con el `secureToken`
   * aleatorio de la campaña (no con companyId autenticado). Mantiene el flujo
   * de ConvivenciaCandidateRegister sin cambios (Fase 1).
   */
  async getCampaignInfo(token: string) {
    const period = await this.periodModel.findOne({ 'registrationCampaign.secureToken': token }).exec();
    if (!period || !period.registrationCampaign) throw new NotFoundException('Campaña no encontrada');
    if (!period.registrationCampaign.isActive) throw new BadRequestException('La campaña ya no está activa');
    if (new Date() > period.registrationCampaign.closingDate) throw new BadRequestException('El periodo de inscripción ha finalizado');
    return {
      periodName: period.periodName, openingDate: period.registrationCampaign.openingDate,
      closingDate: period.registrationCampaign.closingDate,
      includedDepartments: period.registrationCampaign.includedDepartments,
      requirements: period.registrationCampaign.requirements, companyId: period.companyId,
    };
  }

  /**
   * Endpoint PÚBLICO por diseño (postulación de trabajadores con token de
   * campaña). Mantiene el flujo existente sin cambios (Fase 1).
   */
  async registerCandidatePublic(token: string, dto: {
    name: string; document: string; phone: string; area: string;
    position: string; motivation: string; acceptedTerms: boolean;
    email?: string; ipAddress?: string; device?: string;
  }) {
    const period = await this.periodModel.findOne({ 'registrationCampaign.secureToken': token }).exec();
    if (!period || !period.registrationCampaign) throw new NotFoundException('Campaña no encontrada');
    if (!period.registrationCampaign.isActive) throw new BadRequestException('La campaña ya no está activa');
    if (new Date() > period.registrationCampaign.closingDate) throw new BadRequestException('El periodo de inscripción ha finalizado');
    if (period.candidateExtended.some((c) => c.document === dto.document)) {
      throw new BadRequestException('Ya existe un candidato registrado con este documento');
    }
    if (!dto.acceptedTerms) throw new BadRequestException('Debe aceptar los términos de la postulación');
    period.candidateExtended.push({ ...dto, adminStatus: 'PENDIENTE', adminComment: '', votes: 0, registeredAt: new Date() });
    // F7B-5: auditoría de la postulación pública. Solo se registra el hecho
    // (actor técnico 'public') con el identificador interno mínimo (índice en
    // candidateExtended; los candidatos no tienen _id propio). NUNCA se
    // almacena document/phone/email/motivation/IP/device del candidato. El
    // push del evento se hace ANTES del save: si el save falla, no persiste
    // nada (ni postulación ni evento de éxito).
    period.auditHistory.push({
      action: 'CANDIDATE_PUBLIC_REGISTRATION',
      createdBy: 'public',
      createdAt: new Date(),
      data: JSON.stringify({ candidateIndex: period.candidateExtended.length - 1 }),
    });
    await this.saveWithCompliance(period);
    return { success: true, message: 'Candidatura registrada exitosamente' };
  }

  async reviewCandidate(companyId: Types.ObjectId, periodId: string, candidateIndex: number, dto: {
    adminStatus: 'APROBADO' | 'RECHAZADO' | 'INFO_REQUESTED'; adminComment?: string;
  }, email: string) {
    const period = await this.findPeriodForCompany(companyId, periodId);
    const candidate = period.candidateExtended[candidateIndex];
    if (!candidate) throw new NotFoundException('Candidato no encontrado');
    candidate.adminStatus = dto.adminStatus;
    if (dto.adminComment) candidate.adminComment = dto.adminComment;
    period.auditHistory.push({ action: `CANDIDATE_${dto.adminStatus}`, createdBy: email, createdAt: new Date(), data: JSON.stringify({ candidate: candidate.name }) });
    return this.saveWithCompliance(period);
  }

  // ─── VOTING ───
  async initVoting(companyId: Types.ObjectId, periodId: string, email: string) {
    const period = await this.findPeriodForCompany(companyId, periodId);
    const approved = period.candidateExtended.filter((c) => c.adminStatus === 'APROBADO');
    if (approved.length < 2) throw new BadRequestException('Se requieren al menos 2 candidatos aprobados');
    // F7B-3: la elección no se reabre una vez cerrada.
    if (period.electionState === 'CLOSED') {
      throw new BadRequestException('La elección ya está cerrada y no puede reabrirse');
    }
    // F7B-3: idempotente si ya está abierta — no duplica efectos (auditoría/comunicación).
    if (period.electionState === 'OPEN') {
      return { period, approvedCandidates: approved };
    }
    period.electionState = 'OPEN';
    period.votingStartedAt = new Date();
    period.auditHistory.push({ action: 'START_VOTING', createdBy: email, createdAt: new Date(), data: JSON.stringify({ candidates: approved.length }) });
    await this.saveWithCompliance(period);
    await this.autoCommService.generateCommunication({
      companyId: period.companyId, title: `Votación Comité de Convivencia: ${period.periodName}`,
      body: `Se ha iniciado la votación para el Comité de Convivencia Laboral.`,
      communicationType: 'ANNOUNCEMENT', priority: 'IMPORTANT', targetAudience: 'ALL_COMPANY',
      requiresSignature: false, sourceModule: 'CONVIVENCIA_VOTING' as any, sourceEntityId: period._id.toString(),
    }).catch(() => {});
    return { period, approvedCandidates: approved };
  }

  /**
   * Cierra la elección de forma administrativa (F7B-3, 1.1.8): OPEN → CLOSED,
   * fija votingClosedAt y registra auditoría. El dominio valida pertenencia
   * (findPeriodForCompany → NotFound para otra empresa) y estado (solo se
   * cierra una elección abierta). El controller restringe a owner/admin.
   */
  async closeVoting(companyId: Types.ObjectId, periodId: string, email: string) {
    const period = await this.findPeriodForCompany(companyId, periodId);
    if (period.electionState !== 'OPEN') {
      throw new BadRequestException('La elección no está abierta');
    }
    period.electionState = 'CLOSED';
    period.votingClosedAt = new Date();
    period.auditHistory.push({
      action: 'CLOSE_VOTING',
      createdBy: email,
      createdAt: new Date(),
      data: JSON.stringify({ closedAt: period.votingClosedAt }),
    });
    return this.saveWithCompliance(period);
  }

  /**
   * Resuelve la elección del flujo público de votación de forma controlada y
   * ÚNICA (F7B-1, 1.1.8).
   *
   * electionId === ConvivenciaPeriod._id (no existe entidad Election
   * independiente ni se crea en esta fase). El tenant del flujo público se
   * deriva SIEMPRE del propio periodo (companyId = period.companyId): NUNCA se
   * acepta companyId del cliente (body/query) como fuente de confianza.
   *
   * Rechaza de forma controlada elecciones inexistentes o con formato
   * inválido, con la misma semántica de error del flujo previo
   * ('Elección no encontrada') y sin filtrar información entre tenants.
   */
  private async resolvePublicElection(electionId: string): Promise<ConvivenciaPeriodDocument> {
    if (!Types.ObjectId.isValid(electionId)) {
      throw new BadRequestException('Elección no encontrada');
    }
    const period = await this.periodModel.findById(new Types.ObjectId(electionId)).exec();
    if (!period) throw new BadRequestException('Elección no encontrada');
    return period;
  }

  /**
   * Elegibilidad del votante del flujo público (F7B-1, 1.1.8).
   *
   * Regla derivada de los datos reales existentes (sin inventar criterios
   * normativos): el documento del votante debe corresponder a un Employee del
   * MISMO companyId del periodo y con status 'Activo' (mismo valor canónico
   * de estado activo que usa getSummary/EmployeesService).
   *
   * Error GENÉRICO ('Documento no elegible para esta elección') para no
   * filtrar información entre tenants: no revela si el documento no existe,
   * está inactivo o pertenece a otra empresa.
   */
  private async assertVoterEligible(
    period: ConvivenciaPeriodDocument,
    document: string,
  ): Promise<EmployeeDocument> {
    const employee = await this.employeeModel
      .findOne({
        companyId: period.companyId,
        document: document.trim(),
        status: 'Activo',
      })
      .exec();
    if (!employee) {
      throw new BadRequestException('Documento no elegible para esta elección');
    }
    // F7B-5: devuelve el Employee resuelto para que sendOtp pueda registrar el
    // identificador interno (employee._id) en la auditoría, sin exponer PII
    // (nunca el documento de identidad del votante).
    return employee;
  }

  /** Comparación de verificadores resistente a timing attacks. */
  private otpHashesEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'hex');
    const bufB = Buffer.from(b, 'hex');
    return bufA.length === bufB.length && bufA.length > 0 && timingSafeEqual(bufA, bufB);
  }

  /**
   * Endpoint PÚBLICO por diseño (OTP por SMS del trabajador que vota).
   * F7B-1: valida elección + elegibilidad (tenant derivado del periodo).
   * F7B-2: el OTP se genera con crypto.randomInt (6 dígitos), NUNCA se expone
   * en la respuesta y en memoria solo se guarda su verificador criptográfico
   * (HMAC-SHA256), con expiración de 5 minutos, intentos en 0 y rate-limit
   * local (3 solicitudes / 10 min). El provider sigue siendo mock internamente
   * (no existe infraestructura real de SMS/email todavía).
   */
  async sendOtp(dto: { electionId: string; document: string; phone: string }) {
    const period = await this.resolvePublicElection(dto.electionId);
    const employee = await this.assertVoterEligible(period, dto.document);
    // F7B-3: nunca se genera OTP para una elección que no esté abierta
    // (NOT_STARTED o CLOSED → rechazo controlado, sin consumir rate-limit).
    if (period.electionState !== 'OPEN') {
      throw new BadRequestException('La elección no está abierta');
    }
    // F7B-11: clave con namespace lógico de Convivencia (no colisiona con
    // COPASST en las colecciones compartidas).
    const key = `${OTP_KEY_NAMESPACE}${dto.electionId}:${dto.document}:${dto.phone}`;
    // F7B-11: rate-limit DISTRIBUIDO (contador atómico en MongoDB) ANTES de
    // generar el OTP. Reemplaza el Map local otpRequestLog. Fail-closed: si
    // MongoDB falla, sendOtp rechaza con mensaje genérico (nunca se reintroduce
    // memoria). El tenant ya fue resuelto por resolvePublicElection: nunca se
    // usa companyId del cliente.
    await this.otpRateLimitService.assertOtpRateLimit(key);
    const code = String(randomInt(100000, 1000000));
    // F7B-11: el desafío OTP se persiste en MongoDB (compartido entre
    // instancias). El nuevo OTP REPLAZA atómicamente el desafío anterior de la
    // misma clave: el OTP previo deja de ser válido (nuevo hash, nueva
    // expiración, attempts=0). Fail-closed: un error de MongoDB distinto del
    // E11000 manejado por OtpChallengeService se convierte en rechazo genérico
    // (NUNCA se reintroduce el Map en memoria).
    try {
      await this.otpChallengeService.setChallenge(key, this.otpHasher(code), OTP_TTL_MS);
    } catch {
      throw new BadRequestException('No se pudo completar la solicitud');
    }
    // F7B-5: auditoría de la solicitud OTP. Se registra SOLO el hecho
    // (periodId + employeeId interno) cuando la solicitud fue aceptada; NUNCA
    // el código, otpHash, pepper, token, teléfono, documento ni la clave
    // completa del store. Escritura atómica $push best-effort: si falla, el
    // OTP ya generado sigue siendo válido (la auditoría no rompe la elección).
    await this.periodModel
      .updateOne(
        { _id: period._id },
        {
          $push: {
            auditHistory: {
              action: 'OTP_REQUEST',
              createdBy: 'public',
              createdAt: new Date(),
              data: JSON.stringify({
                periodId: period._id.toString(),
                employeeId: employee._id.toString(),
              }),
            },
          },
        },
      )
      .exec()
      .catch(() => {});
    return { sent: true, message: 'OTP enviado', expiresAt: new Date(Date.now() + OTP_TTL_MS) };
  }

  /**
   * Endpoint PÚBLICO por diseño (votación con OTP).
   * F7B-1: elección resuelta por el mecanismo ÚNICO del flujo público (tenant
   * derivado del periodo) y elegibilidad contra Employee ACTIVO del mismo
   * companyId, ANTES del OTP (rechazo determinista sin estado del OTP).
   * F7B-2: el OTP se valida contra el verificador criptográfico: existencia →
   * expiración → intentos agotados → comparación timing-safe; un error
   * incrementa intentos (y agota el OTP al llegar al máximo); un acierto
   * invalida el OTP de inmediato (uso único). Mensaje genérico
   * 'OTP inválido o expirado' (no enumera secretos).
   */
  async vote(dto: {
    electionId: string; document: string; phone: string;
    otpCode: string; candidateDocument: string; ipAddress?: string; device?: string;
  }) {
    const period = await this.resolvePublicElection(dto.electionId);
    await this.assertVoterEligible(period, dto.document);
    // F7B-3: solo se vota en una elección abierta (la condición OPEN se repite
    // en la escritura atómica para cubrir un cierre concurrente).
    if (period.electionState !== 'OPEN') {
      throw new BadRequestException('La elección no está abierta');
    }
    // F7B-11: clave con namespace lógico de Convivencia (no colisiona con
    // COPASST en las colecciones compartidas).
    const key = `${OTP_KEY_NAMESPACE}${dto.electionId}:${dto.document}:${dto.phone}`;
    // F7B-11: validación contra el desafío COMPARTIDO en MongoDB (reemplaza
    // otpStore Map). Fail-closed: cualquier error de MongoDB se convierte en
    // rechazo genérico ('OTP inválido o expirado'); NUNCA se reintroduce el
    // Map en memoria.
    let stored: { otpHash: string; expiresAt: Date; attempts: number } | null = null;
    try {
      stored = await this.otpChallengeService.getChallenge(key);
    } catch {
      throw new BadRequestException('OTP inválido o expirado');
    }
    if (!stored) {
      throw new BadRequestException('OTP inválido o expirado');
    }
    if (stored.expiresAt < new Date()) {
      await this.otpChallengeService.deleteChallenge(key).catch(() => undefined);
      throw new BadRequestException('OTP inválido o expirado');
    }
    if (stored.attempts >= MAX_OTP_ATTEMPTS) {
      await this.otpChallengeService.deleteChallenge(key).catch(() => undefined);
      throw new BadRequestException('OTP inválido o expirado');
    }
    if (!this.otpHashesEqual(stored.otpHash, this.otpHasher(dto.otpCode))) {
      // Intentos fallidos COMPARTIDOS ($inc atómico solo si el desafío sigue
      // siendo el vigente). Al llegar al máximo, se invalida el desafío.
      const attempts = await this.otpChallengeService
        .incrementAttempts(key, stored.otpHash)
        .catch(() => null);
      if (attempts !== null && attempts >= MAX_OTP_ATTEMPTS) {
        await this.otpChallengeService.deleteChallenge(key).catch(() => undefined);
      }
      throw new BadRequestException('OTP inválido o expirado');
    }
    // OTP correcto: consumo ATÓMICO de un solo uso (findOneAndDelete con
    // { key, otpHash }). Dos validaciones concurrentes del mismo OTP: solo la
    // primera elimina el documento y continúa; la segunda recibe false y se
    // rechaza (imposible consumir dos veces, incluso entre instancias).
    const consumed = await this.otpChallengeService
      .consumeIfMatches(key, stored.otpHash)
      .catch(() => false);
    if (!consumed) {
      throw new BadRequestException('OTP inválido o expirado');
    }
    const normalizedDocument = dto.document.trim();
    // Identificador interno del candidato votado (índice en candidateExtended;
    // los candidatos no tienen _id propio). Se usa para la auditoría VOTE_CAST
    // sin exponer el candidateDocument del votante (F7B-5). candidateExtended
    // es append-only (no hay eliminación de candidatos), por lo que el índice
    // es estable en la práctica; ante una hipotética postulación concurrente
    // entre el fetch inicial y el CAS el índice podría desfasar — es SOLO
    // metadata de auditoría, la fuente de verdad del voto sigue siendo
    // votesExtended.candidateDocument.
    const candidateIndex = period.candidateExtended.findIndex(
      (c) => c.document === dto.candidateDocument,
    );
    // F7B-3 — voto único ATÓMICO (patrón compare-and-swap por documento):
    // findOneAndUpdate evalúa la condición y aplica los $push como UNA sola
    // operación atómica por documento (garantía de MongoDB). Dos requests
    // concurrentes se serializan: la segunda ya no cumple
    // `votesExtended.document: {$ne}` → devuelve null y no registra el voto.
    // La condición incluye `electionState: 'OPEN'` para que un cierre
    // concurrente tampoco permita votar, y `candidateExtended.document` para
    // exigir que el candidato exista. NO se usa un mutex local (no sirve entre
    // instancias) ni un índice único multikey (semántica version-sensitive y
    // riesgo con datos legacy duplicados).
    //
    // F7B-5: el evento VOTE_CAST se registra DENTRO de la MISMA operación
    // atómica que persiste el voto. No existe ventana de consistencia entre
    // "voto persistido" y "auditoría": si el CAS falla (OTP inválido/expirado/
    // agotado, no elegible, elección cerrada, candidato inválido, ya votó,
    // conflicto concurrente), NO se escribe VOTE_CAST; si el CAS tiene éxito,
    // voto y evento se persisten juntos exactamente una vez (un voto
    // concurrente = un solo VOTE_CAST). La auditoría no puede romper la
    // elección: no hay paso posterior que pueda fallar y dejar un voto sin
    // evento ni un evento sin voto.
    //
    // Nota de acoplamiento: este path NO re-persiste compliance (ya no pasa
    // por saveWithCompliance). Es seguro hoy porque los candidatos aprobados
    // ya constituyen contenido funcional (PENDING/COMPLIES) y el voto no
    // altera el estado de cumplimiento; si resolveCompliance llegara a pesar
    // votos en el futuro, este punto debería re-persistir el estado.
    const updated = await this.periodModel
      .findOneAndUpdate(
        {
          _id: period._id,
          electionState: 'OPEN',
          'votesExtended.document': { $ne: normalizedDocument },
          'candidateExtended.document': dto.candidateDocument,
        },
        {
          $push: {
            votesExtended: {
              document: normalizedDocument,
              candidateDocument: dto.candidateDocument,
              otpValidated: true,
              votedAt: new Date(),
              ipAddress: dto.ipAddress,
              device: dto.device,
              token: key,
            },
            // F7B-5: auditoría atómica del voto. Sin PII del votante: ni
            // document, ni phone/email, ni IP/device, ni OTP/hash/token. Solo
            // periodId (implícito) + índice interno del candidato + timestamp.
            auditHistory: {
              action: 'VOTE_CAST',
              createdBy: 'public',
              createdAt: new Date(),
              data: JSON.stringify({ candidateIndex }),
            },
          },
        },
      )
      .exec();
    if (!updated) {
      // Clasificación del motivo (sin filtrar información entre tenants).
      const current = await this.findPeriodForCompany(period.companyId, period._id.toString());
      if ((current.votesExtended ?? []).some((v) => v.document === normalizedDocument)) {
        throw new BadRequestException('El trabajador ya votó');
      }
      if (current.electionState !== 'OPEN') {
        throw new BadRequestException('La elección no está abierta');
      }
      throw new BadRequestException('Candidato no encontrado');
    }
    // Contador denormalizado del candidato (mejora la lectura de resultados;
    // la fuente de verdad del voto único es votesExtended, garantizada por la
    // operación atómica anterior). Best-effort: si el proceso cae entre ambas
    // operaciones el contador puede quedar desfasado (riesgo residual
    // documentado; no afecta la garantía de voto único).
    await this.periodModel
      .updateOne(
        { _id: period._id, 'candidateExtended.document': dto.candidateDocument },
        { $inc: { 'candidateExtended.$.votes': 1 } },
      )
      .exec();
    return { success: true, message: 'Voto registrado exitosamente' };
  }

  /**
   * Resultados electorales administrativos (F7B-4, 1.1.8).
   *
   * Endpoint AHORA protegido: companyId SIEMPRE del contexto autenticado y el
   * periodo se resuelve con findPeriodForCompany (tenant-safe → NotFound para
   * otra empresa sin filtrar existencia). La política de estado (F7B-3) impide
   * resultados parciales: NOT_STARTED y OPEN se rechazan de forma controlada;
   * solo una elección CLOSED devuelve resultados finales.
   *
   * PRIVACIDAD: el response se construye EXPLÍCITAMENTE con un DTO de campos
   * permitidos {rank, name, votes, status}. Nunca devuelve document/phone/email
   * de candidatos, ni votesExtended, ni datos individuales de votantes
   * (OTP/token/IP/device). El contrato impide que esos campos lleguen al
   * cliente (no es una eliminación superficial en el controller).
   *
   * READ-ONLY: solo lee (findPeriodForCompany + countDocuments). No crea votos,
   * no modifica candidatos, no cambia electionState y no escribe auditHistory.
   */
  async getVotingResults(companyId: Types.ObjectId, periodId: string) {
    const period = await this.findPeriodForCompany(companyId, periodId);
    if (period.electionState !== 'CLOSED') {
      throw new BadRequestException(
        period.electionState === 'OPEN'
          ? 'La elección está abierta: los resultados se publican al cerrarla'
          : 'La elección no ha iniciado: no hay resultados disponibles',
      );
    }
    const sorted = [...period.candidateExtended].sort((a, b) => b.votes - a.votes);
    const approved = sorted.filter((c) => c.adminStatus === 'APROBADO');
    const totalVotes = period.votesExtended.length;
    const totalEmployees = await this.employeeModel
      .countDocuments({ companyId: period.companyId, status: 'Activo' })
      .exec();
    // DTO explícito de resultados: solo campos públicos, sin PII de candidatos
    // ni información individual de votantes (F7B-4).
    // Nota: winners/alternates rankean DENTRO del subconjunto aprobado
    // (i+1/i+3), mientras que ranking rankea TODOS los candidatos ordenados;
    // si un candidato no aprobado supera en votos a uno aprobado, los números
    // de rank pueden no coincidir entre ambas vistas (semántica previa
    // preservada; el frontend solo consume name/votes/status/length).
    const toEntry = (candidate: { name: string; votes: number; adminStatus: string }, rank: number) => ({
      rank,
      name: candidate.name,
      votes: candidate.votes,
      status: candidate.adminStatus,
    });
    return {
      totalVotes,
      totalEmployees,
      participation: totalEmployees > 0 ? (totalVotes / totalEmployees) * 100 : 0,
      winners: approved.slice(0, 2).map((c, i) => toEntry(c, i + 1)),
      alternates: approved.slice(2, 4).map((c, i) => toEntry(c, i + 3)),
      ranking: sorted.map((c, i) => toEntry(c, i + 1)),
    };
  }

  async autoCreateCommittee(companyId: Types.ObjectId, periodId: string, numPositions: number, email: string) {
    const period = await this.findPeriodForCompany(companyId, periodId);
    const sorted = [...period.candidateExtended].filter((c) => c.adminStatus === 'APROBADO').sort((a, b) => b.votes - a.votes);
    const primaryCount = Math.min(numPositions, sorted.length);
    period.members = [];
    for (let i = 0; i < primaryCount; i++) {
      const candidate = sorted[i];
      period.members.push({
        userId: new Types.ObjectId(), userName: candidate.name,
        committeeRole: i === 0 ? 'PRESIDENTE' : i === 1 ? 'SECRETARIO' : 'PRINCIPAL',
        representationType: 'TRABAJADOR', principalType: 'PRINCIPAL',
        startDate: new Date(), endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 2)),
        status: 'ACTIVO',
      } as never);
    }
    period.auditHistory.push({ action: 'AUTO_CREATE_COMMITTEE', createdBy: email, createdAt: new Date(), data: JSON.stringify({ primary: primaryCount }) });
    return this.saveWithCompliance(period);
  }

  // ─── MEETINGS ───
  async scheduleMeeting(companyId: Types.ObjectId, periodId: string, dto: { meetingDate: string; agenda: string; topicList?: string[] }, email: string) {
    const period = await this.findPeriodForCompany(companyId, periodId);
    period.meetings.push({ meetingDate: new Date(dto.meetingDate), status: 'PROGRAMADA', agenda: dto.agenda, attendees: [], topicList: dto.topicList ?? [], development: '' } as never);
    period.auditHistory.push({ action: 'SCHEDULE_MEETING', createdBy: email, createdAt: new Date(), data: JSON.stringify(dto) });
    return this.saveWithCompliance(period);
  }

  async autoScheduleMonthlyMeetings(companyId: Types.ObjectId, periodId: string, email: string) {
    const period = await this.findPeriodForCompany(companyId, periodId);
    const now = new Date(); let count = 0;
    for (let i = 1; i <= 12; i++) {
      const meetingDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
      if (meetingDate > period.endDate) break;
      const exists = period.meetings.some((m) => m.meetingDate.getFullYear() === meetingDate.getFullYear() && m.meetingDate.getMonth() === meetingDate.getMonth());
      if (!exists) {
        period.meetings.push({ meetingDate, status: 'PROGRAMADA', agenda: `Reunión mensual Comité de Convivencia - ${meetingDate.toLocaleString('es', { month: 'long', year: 'numeric' })}`, attendees: [], topicList: [], development: '' } as never);
        count++;
      }
    }
    period.auditHistory.push({ action: 'AUTO_SCHEDULE_MEETINGS', createdBy: email, createdAt: new Date(), data: `${count} reuniones programadas` });
    return this.saveWithCompliance(period);
  }

  async completeMeeting(companyId: Types.ObjectId, periodId: string, meetingIndex: number, dto: { development: string; attendees: string[]; topicList?: string[] }, email: string) {
    const period = await this.findPeriodForCompany(companyId, periodId);
    const meeting = period.meetings[meetingIndex];
    if (!meeting) throw new NotFoundException('Reunión no encontrada');
    meeting.development = dto.development;
    meeting.attendees = dto.attendees;
    meeting.status = 'CERRADA';
    if (dto.topicList) meeting.topicList = dto.topicList;
    period.auditHistory.push({ action: 'COMPLETE_MEETING', createdBy: email, createdAt: new Date(), data: JSON.stringify(dto) });
    return this.saveWithCompliance(period);
  }

  async updateMeeting(companyId: Types.ObjectId, periodId: string, meetingIndex: number, dto: Partial<{ meetingDate: string; agenda: string; development: string; status: string; attendees: string[]; topicList: string[] }>, email: string) {
    const period = await this.findPeriodForCompany(companyId, periodId);
    const meeting = period.meetings[meetingIndex];
    if (!meeting) throw new NotFoundException('Reunión no encontrada');
    if (dto.meetingDate) meeting.meetingDate = new Date(dto.meetingDate);
    if (dto.agenda !== undefined) meeting.agenda = dto.agenda;
    if (dto.development !== undefined) meeting.development = dto.development;
    if (dto.status) meeting.status = dto.status;
    if (dto.attendees) meeting.attendees = dto.attendees;
    if (dto.topicList) meeting.topicList = dto.topicList;
    return this.saveWithCompliance(period);
  }

  // ─── COMMITMENTS (Action Plans) ───
  async addCommitment(companyId: Types.ObjectId, periodId: string, dto: { description: string; responsibleParty: string; deadline: string; priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'; meetingId?: string }, email: string) {
    const period = await this.findPeriodForCompany(companyId, periodId);
    period.commitments.push({ _id: new Types.ObjectId(), description: dto.description, responsibleParty: dto.responsibleParty, deadline: new Date(dto.deadline), priority: dto.priority, status: 'OPEN', meetingId: dto.meetingId, createdAt: new Date() } as never);
    period.auditHistory.push({ action: 'ADD_COMMITMENT', createdBy: email, createdAt: new Date(), data: JSON.stringify(dto) });
    return this.saveWithCompliance(period);
  }

  async updateCommitment(companyId: Types.ObjectId, periodId: string, commitmentId: string, dto: Partial<{ description: string; responsibleParty: string; deadline: string; priority: string; status: string; evidenceUrl: string }>, email: string) {
    const period = await this.findPeriodForCompany(companyId, periodId);
    const commitment = (period.commitments as any[]).find((c) => c._id?.toString() === commitmentId);
    if (!commitment) throw new NotFoundException('Compromiso no encontrado');
    if (dto.description !== undefined) commitment.description = dto.description;
    if (dto.responsibleParty !== undefined) commitment.responsibleParty = dto.responsibleParty;
    if (dto.deadline !== undefined) commitment.deadline = new Date(dto.deadline);
    if (dto.priority !== undefined) commitment.priority = dto.priority;
    if (dto.status !== undefined) { commitment.status = dto.status; if (dto.status === 'COMPLETED') commitment.completedAt = new Date(); }
    if (dto.evidenceUrl !== undefined) commitment.evidenceUrl = dto.evidenceUrl;
    commitment.updatedAt = new Date();
    period.auditHistory.push({ action: 'UPDATE_COMMITMENT', createdBy: email, createdAt: new Date(), data: JSON.stringify(dto) });
    return this.saveWithCompliance(period);
  }

  // ─── EVIDENCE ───
  async addEvidence(companyId: Types.ObjectId, periodId: string, dto: { type: string; title: string; fileName: string; fileUrl: string; meetingId?: string }, email: string) {
    const period = await this.findPeriodForCompany(companyId, periodId);
    period.evidence.push({ _id: new Types.ObjectId(), type: dto.type as any, title: dto.title, fileName: dto.fileName, fileUrl: dto.fileUrl, uploadedBy: email, uploadedAt: new Date(), meetingId: dto.meetingId } as never);
    period.auditHistory.push({ action: 'ADD_EVIDENCE', createdBy: email, createdAt: new Date(), data: JSON.stringify(dto) });
    return this.saveWithCompliance(period);
  }

  async removeEvidence(companyId: Types.ObjectId, periodId: string, evidenceIndex: number, email: string) {
    const period = await this.findPeriodForCompany(companyId, periodId);
    const ev = period.evidence[evidenceIndex];
    if (!ev) throw new NotFoundException('Evidencia no encontrada');
    period.evidence.splice(evidenceIndex, 1);
    period.auditHistory.push({ action: 'REMOVE_EVIDENCE', createdBy: email, createdAt: new Date(), data: JSON.stringify(ev) });
    return this.saveWithCompliance(period);
  }

  // ─── CASES (Confidential Case Management) ───
  /**
   * F7B-6: obtiene el siguiente número de secuencia de casos para
   * (companyId, year) de forma ATOMICA y persistente.
   *
   * El primer uso de una (empresa, año) siembra la secuencia desde los casos
   * legacy ya persistidos (CC-YYYY-NNNN en period.cases) para nunca colisionar
   * con números históricos. El incremento usa findOneAndUpdate con upsert
   * respaldado por el índice único { companyId, year }: dos createCase()
   * concurrentes de la misma empresa y año reciben números distintos, y cada
   * empresa mantiene su propia secuencia independiente.
   *
   * Ventana residual documentada (sin transacciones: el repositorio no las usa
   * en este flujo): si la creación del caso falla DESPUÉS de reservar el
   * número, se produce un hueco (p.ej. CC-2026-0001 y CC-2026-0003 sin 0002).
   * El número reservado NUNCA se reutiliza y jamás existen dos casos con el
   * mismo número de la misma empresa y año.
   */
  private async nextCaseSequence(
    companyId: Types.ObjectId,
    year: number,
  ): Promise<number> {
    const existing = await this.caseSequenceModel.findOne({ companyId, year }).exec();
    let legacyMax = 0;
    if (!existing) {
      // Sembrado legacy: solo la primera vez que la empresa usa el año.
      const prefix = `CC-${year}-`;
      const periods = await this.periodModel
        .find({ companyId })
        .select({ 'cases.caseNumber': 1 })
        .exec();
      for (const period of periods) {
        for (const caseItem of period.cases) {
          if (caseItem.caseNumber?.startsWith(prefix)) {
            const num = parseInt(caseItem.caseNumber.slice(prefix.length), 10);
            if (!Number.isNaN(num) && num > legacyMax) legacyMax = num;
          }
        }
      }
    }
    // En un INSERT, MongoDB aplica $setOnInsert antes que $inc → la secuencia
    // arranca en legacyMax + 1 (o 1 si no hay casos previos).
    const update =
      legacyMax > 0
        ? { $inc: { sequence: 1 }, $setOnInsert: { sequence: legacyMax } }
        : { $inc: { sequence: 1 } };
    return this.incrementCaseSequence(companyId, year, update);
  }

  /**
   * F7B-6: incremento atómico del contador con reintento ante E11000.
   *
   * En MongoDB, dos findOneAndUpdate + upsert concurrentes sobre la misma
   * clave única pueden hacer que el perdedor reciba un error de clave
   * duplicada (code 11000) en lugar de actualizar el documento ganador. El
   * reintento re-ejecuta la misma operación, que ahora SÍ encuentra el
   * documento y solo aplica $inc (el $setOnInsert se ignora en un UPDATE).
   */
  private async incrementCaseSequence(
    companyId: Types.ObjectId,
    year: number,
    update: Record<string, unknown>,
  ): Promise<number> {
    const MAX_UPSERT_RETRIES = 3;
    for (let attempt = 0; attempt < MAX_UPSERT_RETRIES; attempt += 1) {
      try {
        const seq = await this.caseSequenceModel
          .findOneAndUpdate(
            { companyId, year },
            update,
            { upsert: true, new: true, setDefaultsOnInsert: true },
          )
          .exec();
        if (!seq) {
          // upsert + new:true nunca devuelve null; guardia defensiva.
          throw new Error('No se pudo asignar el número de caso');
        }
        return seq.sequence;
      } catch (error) {
        const isDuplicateKey =
          typeof error === 'object' &&
          error !== null &&
          (error as { code?: number }).code === 11000;
        if (!isDuplicateKey || attempt === MAX_UPSERT_RETRIES - 1) throw error;
      }
    }
    throw new Error('No se pudo asignar el número de caso');
  }

  async createCase(companyId: Types.ObjectId, periodId: string, dto: {
    complainantName: string; respondentName: string; description: string;
    isAnonymous?: boolean; evidence?: string[];
  }, email: string) {
    const period = await this.findPeriodForCompany(companyId, periodId);
    // F7B-6: número de caso persistente, tenant-scoped y atómico (CC-YYYY-NNNN).
    const year = this.currentYear();
    const sequence = await this.nextCaseSequence(companyId, year);
    const caseNumber = `CC-${year}-${String(sequence).padStart(4, '0')}`;
    period.cases.push({
      caseNumber, isAnonymous: dto.isAnonymous ?? false,
      complainantName: dto.isAnonymous ? 'Anónimo' : dto.complainantName,
      respondentName: dto.respondentName, description: dto.description,
      evidence: dto.evidence ?? [], status: 'PENDING',
      caseAuditHistory: [{ action: 'CASE_CREATED', createdBy: email, createdAt: new Date(), data: JSON.stringify(dto) }],
    } as never);
    period.auditHistory.push({ action: 'CREATE_CASE', createdBy: email, createdAt: new Date(), data: `Caso ${caseNumber} creado` });
    return this.saveWithCompliance(period);
  }

  async updateCase(companyId: Types.ObjectId, periodId: string, caseIndex: number, dto: Partial<{
    status: string; assignedCommitteeMember: string; recommendations: string; evidence: string[];
  }>, email: string) {
    const period = await this.findPeriodForCompany(companyId, periodId);
    const caseItem = period.cases[caseIndex];
    if (!caseItem) throw new NotFoundException('Caso no encontrado');
    if (dto.status) caseItem.status = dto.status;
    if (dto.assignedCommitteeMember !== undefined) caseItem.assignedCommitteeMember = dto.assignedCommitteeMember;
    if (dto.recommendations !== undefined) caseItem.recommendations = dto.recommendations;
    if (dto.evidence) caseItem.evidence = [...caseItem.evidence, ...dto.evidence];
    if (dto.status === 'CLOSED') caseItem.closureDate = new Date();
    caseItem.caseAuditHistory.push({ action: `CASE_UPDATED_${dto.status || 'MODIFIED'}`, createdBy: email, createdAt: new Date(), data: JSON.stringify(dto) });
    period.auditHistory.push({ action: 'UPDATE_CASE', createdBy: email, createdAt: new Date(), data: `Caso ${caseItem.caseNumber} actualizado` });
    return this.saveWithCompliance(period);
  }

  // ─── APPROVAL WORKFLOW ───
  async submitForApproval(companyId: Types.ObjectId, periodId: string, email: string) {
    const period = await this.findPeriodForCompany(companyId, periodId);
    if (period.approvalStatus === 'PENDING_APPROVAL') throw new BadRequestException('Ya está pendiente de aprobación');
    if (period.approvalStatus === 'APPROVED' || period.approvalStatus === 'APPROVED_AND_SIGNED') throw new BadRequestException('Ya está aprobado');
    const currentVer = parseFloat(period.currentVersion || '1.0');
    period.currentVersion = (currentVer + 0.1).toFixed(1);
    period.approvalStatus = 'PENDING_APPROVAL';
    period.locked = true;
    period.submittedAt = new Date();
    const managers = await this.userModel.find({ companyId: period.companyId, role: 'manager', isActive: true }).exec();
    if (managers.length === 0) throw new BadRequestException('No existe un MANAGER asignado a esta empresa');
    await Promise.all(managers.map((mgr) =>
      this.alertsService.create({
        companyId: period.companyId.toString(), type: 'APPROVAL_REQUEST',
        message: `📋 Solicitud de aprobación — Comité de Convivencia (1.1.8). Enviado por: ${email}.`,
        severity: AlertSeverity.HIGH, targetUserId: mgr._id.toString(),
        actionUrl: '/advanced-management/1.1.8?mode=review',
        moduleCode: '1.1.8', moduleName: 'Comité de Convivencia',
        submittedBy: email, submittedAt: new Date().toISOString(),
      }).catch(() => {}),
    ));
    period.auditHistory.push({ action: 'SUBMIT_APPROVAL', createdBy: email, createdAt: new Date(), data: `v${period.currentVersion}` });
    return this.saveWithCompliance(period);
  }

  async approve(companyId: Types.ObjectId, periodId: string, userEmail: string, role: string) {
    const period = await this.findPeriodForCompany(companyId, periodId);
    if (period.approvalStatus !== 'PENDING_APPROVAL') throw new BadRequestException('No está pendiente de aprobación');
    period.approvalStatus = 'APPROVED_AND_SIGNED';
    period.locked = true;
    period.approvedBy = { userId: '', email: userEmail, role, timestamp: new Date().toISOString() };
    period.auditHistory.push({ action: 'APPROVE', createdBy: userEmail, createdAt: new Date(), data: 'APPROVED_AND_SIGNED' });
    const admins = await this.userModel.find({ companyId: period.companyId, role: { $in: ['admin', 'owner'] }, isActive: true }).exec();
    await Promise.all(admins.map((admin) =>
      this.alertsService.create({ companyId: period.companyId.toString(), type: 'CONVIVENCIA_APPROVED', message: `✅ Comité de Convivencia aprobado por ${userEmail}.`, severity: AlertSeverity.HIGH }).catch(() => {}),
    ));
    return this.saveWithCompliance(period);
  }

  async reject(companyId: Types.ObjectId, periodId: string, reason: string, userEmail: string) {
    const period = await this.findPeriodForCompany(companyId, periodId);
    if (period.approvalStatus !== 'PENDING_APPROVAL') throw new BadRequestException('No está pendiente de aprobación');
    period.approvalStatus = 'REJECTED';
    period.locked = false;
    period.rejectionReason = reason;
    period.rejectedBy = { userId: '', email: userEmail, role: '', reason, timestamp: new Date().toISOString() };
    period.auditHistory.push({ action: 'REJECT', createdBy: userEmail, createdAt: new Date(), data: reason });
    const admins = await this.userModel.find({ companyId: period.companyId, role: { $in: ['admin', 'owner'] }, isActive: true }).exec();
    await Promise.all(admins.map((admin) =>
      this.alertsService.create({ companyId: period.companyId.toString(), type: 'CONVIVENCIA_REJECTED', message: `❌ Comité de Convivencia rechazado por ${userEmail}.`, severity: AlertSeverity.HIGH }).catch(() => {}),
    ));
    return this.saveWithCompliance(period);
  }

  // ─────────────────────────────────────────────
  // CUMPLIMIENTO (1.1.8) — Fase 2 · dominio de cumplimiento
  // ─────────────────────────────────────────────

  /**
   * Única fuente de verdad del estado de cumplimiento del estándar 1.1.8
   * (Comité de Convivencia Laboral). Fase 2: los futuros consumidores
   * (Compliance Engine, Initial Evaluation, IA) leerán SOLO
   * `period.complianceStatus` + `period.complianceReason` y NUNCA
   * reimplementarán esta regla.
   *
   * Regla técnica derivada EXCLUSIVAMENTE de reglas ya usadas por el sistema
   * (no inventa requisitos normativos):
   * 1. Exención: `requiresConvivencia === false` → COMPLIES (misma exención
   *    del ConvivenciaProvider del Implementation Validator).
   * 2. Periodo activo: status ACTIVO | PROXIMO_A_VENCER (ConvivenciaProvider).
   * 3. Aprobación: approvalStatus APPROVED | APPROVED_AND_SIGNED
   *    (ConvivenciaProvider).
   * 4. Comité conformado: ≥1 miembro (criterio "miembros conformados" del
   *    ConvivenciaProvider; NO se asume un mínimo normativo específico).
   * 5. Comité operando: ≥1 reunión CERRADA — el único concepto inequívoco de
   *    reunión realizada del dominio (el mismo que usa getDashboard para
   *    `completedMeetings`). Deriva de la descripción del catálogo
   *    "conformado y operando"; NO impone frecuencias obligatorias.
   *
   * La evidencia documental (evidence[]) NO es condición de COMPLIES en esta
   * fase (no puede determinarse qué evidencia es normativamente obligatoria);
   * su presencia sí mueve el estado a PENDING (actividad registrada). Una sola
   * fuente de evidencia: evidence[] (nunca arreglos legacy paralelos).
   *
   * Determinista, sin efectos secundarios y sin consultas a otros tenants:
   * solo lee y muta el periodo recibido en memoria.
   */
  private resolveCompliance(period: ConvivenciaPeriodDocument): void {
    // Exención justificada: la empresa no requiere Comité de Convivencia.
    if (period.requiresConvivencia === false) {
      period.complianceStatus = 'COMPLIES';
      period.complianceReason =
        'Empresa exenta de Comité de Convivencia Laboral (requiresConvivencia = false).';
      return;
    }

    const active =
      period.status === 'ACTIVO' || period.status === 'PROXIMO_A_VENCER';
    const approved =
      period.approvalStatus === 'APPROVED' ||
      period.approvalStatus === 'APPROVED_AND_SIGNED';
    const memberCount = (period.members ?? []).length;
    const heldMeetings = (period.meetings ?? []).filter(
      (meeting) => meeting.status === 'CERRADA',
    ).length;

    if (active && approved && memberCount > 0 && heldMeetings >= 1) {
      period.complianceStatus = 'COMPLIES';
      period.complianceReason =
        `Comité de Convivencia conformado (${memberCount} miembro(s)), aprobado y operando (${heldMeetings} reunión(es) realizada(s)).`;
      return;
    }

    const approvalEngaged =
      period.approvalStatus !== undefined && period.approvalStatus !== 'DRAFT';
    const hasFunctionalContent =
      memberCount > 0 ||
      (period.meetings ?? []).length > 0 ||
      (period.commitments ?? []).length > 0 ||
      (period.evidence ?? []).length > 0 ||
      (period.cases ?? []).length > 0 ||
      (period.candidateExtended ?? []).length > 0 ||
      (period.votesExtended ?? []).length > 0 ||
      Boolean(period.registrationCampaign) ||
      approvalEngaged;

    if (hasFunctionalContent) {
      const missing: string[] = [];
      if (!active) missing.push('periodo activo');
      if (!approved) missing.push('aprobación del periodo');
      if (memberCount === 0) missing.push('miembros conformados');
      if (heldMeetings < 1) missing.push('reuniones realizadas');
      period.complianceStatus = 'PENDING';
      period.complianceReason =
        `Avance parcial del Comité de Convivencia: falta ${missing.join(', ')}.`;
      return;
    }

    period.complianceStatus = 'NON_COMPLIANT';
    period.complianceReason =
      'Sin información funcional registrada: el Comité de Convivencia no está conformado ni operando.';
  }

  /**
   * Punto de salida único de escritura del dominio: resuelve el cumplimiento
   * en memoria y persiste. Todas las mutaciones del servicio pasan por aquí.
   */
  private async saveWithCompliance(
    period: ConvivenciaPeriodDocument,
  ): Promise<ConvivenciaPeriodDocument> {
    this.resolveCompliance(period);
    return period.save();
  }

  /**
   * Recalcula y persiste el estado de cumplimiento de un periodo (Fase 2).
   * Punto de entrada público para consumidores externos (Compliance Engine,
   * Initial Evaluation, IA) que necesiten refrescar el estado bajo demanda.
   * Multi-tenancy: valida pertenencia vía findPeriodForCompany (NotFound si el
   * periodo no existe o pertenece a otra empresa — no filtra información).
   */
  async recalculateCompliance(
    companyId: Types.ObjectId,
    periodId: string,
  ): Promise<ConvivenciaPeriodDocument> {
    const period = await this.findPeriodForCompany(companyId, periodId);
    this.resolveCompliance(period);
    return period.save();
  }

  /**
   * Snapshot de cumplimiento del Comité de Convivencia (1.1.8) para
   * consumidores (Fase 3: Compliance Provider y Implementation Validator).
   *
   * NO es la fuente de verdad del estado de cumplimiento: esa es
   * `complianceStatus`/`complianceReason`, resuelta por resolveCompliance() en
   * cada mutación del dominio. Este snapshot SOLO la refleja y agrega un
   * progreso 0-100 COHERENTE con el estado (nunca contradictorio):
   *
   *   COMPLIES       → 100
   *   NON_COMPLIANT  → 0
   *   PENDING        → 25/50/75 según cuántas de las 4 condiciones de dominio
   *                    (periodo activo, aprobación, miembros, reunión CERRADA)
   *                    estén presentes. NUNCA 100.
   *
   * Los criterios (met/missing) son el mismo conjunto de 4 condiciones que usa
   * resolveCompliance, pero evaluado SOLO como progreso: la regla de estado
   * sigue viviendo en resolveCompliance (única fuente de verdad).
   *
   * Lectura pura: sin escrituras, sin creación de entidades, sin efectos
   * colaterales. Multi-tenancy: usa findCurrent (scoped por companyId); una
   * empresa sin periodo recibe NotFoundException.
   */
  async getComplianceSnapshot(
    companyId: Types.ObjectId,
  ): Promise<ConvivenciaComplianceSnapshot> {
    const period = await this.findCurrent(companyId);
    return this.buildComplianceSnapshot(period);
  }

  private buildComplianceSnapshot(
    period: ConvivenciaPeriodDocument,
  ): ConvivenciaComplianceSnapshot {
    // Exención justificada: cumplimiento completo sin findings (regla del
    // ConvivenciaProvider del Implementation Validator).
    if (period.requiresConvivencia === false) {
      return {
        complianceStatus: 'COMPLIES',
        complianceReason:
          period.complianceReason ||
          'Empresa exenta de Comité de Convivencia Laboral (requiresConvivencia = false).',
        percentage: 100,
        exempt: true,
        metCriteria: ['Empresa exenta'],
        missingCriteria: [],
        periodStatus: period.status,
        approvalStatus: period.approvalStatus,
        evidenceCount: (period.evidence ?? []).length,
      };
    }

    const active =
      period.status === 'ACTIVO' || period.status === 'PROXIMO_A_VENCER';
    const approved =
      period.approvalStatus === 'APPROVED' ||
      period.approvalStatus === 'APPROVED_AND_SIGNED';
    const memberCount = (period.members ?? []).length;
    const heldMeetings = (period.meetings ?? []).filter(
      (meeting) => meeting.status === 'CERRADA',
    ).length;

    const criteria: { label: string; met: boolean }[] = [
      { label: 'Periodo activo', met: active },
      { label: 'Comité aprobado', met: approved },
      { label: 'Miembros conformados', met: memberCount > 0 },
      { label: 'Reuniones realizadas', met: heldMeetings >= 1 },
    ];
    const metCriteria = criteria.filter((c) => c.met).map((c) => c.label);
    const missingCriteria = criteria.filter((c) => !c.met).map((c) => c.label);

    const status = period.complianceStatus ?? 'PENDING';
    // PENDING nunca llega a 100, incluso si el número de criterios del progreso
    // llegara a desincronizarse de las condiciones de resolveCompliance en una
    // fase futura (invariante auto-defendida: PENDING ≠ cumplimiento completo).
    const percentage =
      status === 'COMPLIES'
        ? 100
        : status === 'NON_COMPLIANT'
          ? 0
          : Math.min(75, Math.round((metCriteria.length / criteria.length) * 100));

    return {
      complianceStatus: status,
      complianceReason: period.complianceReason ?? '',
      percentage,
      exempt: false,
      metCriteria,
      missingCriteria,
      periodStatus: period.status,
      approvalStatus: period.approvalStatus,
      evidenceCount: (period.evidence ?? []).length,
    };
  }

  /**
   * Persiste la URL del acta de conformación generada (Fase 5, 1.1.8).
   *
   * Único punto del dominio que escribe `constitutionMinutesPdfUrl`: valida
   * pertenencia (findPeriodForCompany), registra auditoría y persiste a través
   * de saveWithCompliance (única ruta de escritura del dominio, sin duplicar
   * reglas de compliance). Lectura de la URL: solo la devuelve el service de
   * documentos al frontend (fileUrl de la DocumentInstance).
   */
  async attachConstitutionMinutes(
    companyId: Types.ObjectId,
    periodId: string,
    fileUrl: string,
    email: string,
  ): Promise<ConvivenciaPeriodDocument> {
    const period = await this.findPeriodForCompany(companyId, periodId);
    period.constitutionMinutesPdfUrl = fileUrl;
    period.auditHistory.push({
      action: 'ATTACH_CONSTITUTION_MINUTES',
      createdBy: email,
      createdAt: new Date(),
      data: fileUrl,
    });
    return this.saveWithCompliance(period);
  }

  // ─── AUDIT ───
  async getAuditHistory(companyId: Types.ObjectId, periodId: string) {
    const period = await this.findPeriodForCompany(companyId, periodId);
    return (period.auditHistory ?? []).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  // ─── DASHBOARD ───
  async getDashboard(companyId: Types.ObjectId) {
    const period = await this.periodModel.findOne({ companyId, status: { $ne: 'ARCHIVADO' } }).sort({ createdAt: -1 }).exec();
    if (!period) return null;
    const totalMeetings = period.meetings.length;
    const completedMeetings = period.meetings.filter((m) => m.status === 'CERRADA').length;
    const openCommitments = (period.commitments as any[]).filter((c) => c.status === 'OPEN' || c.status === 'IN_PROGRESS').length;
    const closedCommitments = (period.commitments as any[]).filter((c) => c.status === 'COMPLETED').length;
    const totalVotes = period.votesExtended.length;
    const totalEmployees = period.totalEmployees;
    const openCases = period.cases.filter((c) => c.status !== 'CLOSED').length;
    const totalCases = period.cases.length;
    const nextMeeting = period.meetings.filter((m) => m.status === 'PROGRAMADA').sort((a, b) => a.meetingDate.getTime() - b.meetingDate.getTime())[0];
    return {
      committeeStatus: period.status, approvalStatus: period.approvalStatus,
      meetingCompletion: totalMeetings > 0 ? Math.round((completedMeetings / totalMeetings) * 100) : 0,
      pendingCommitments: openCommitments, closedCommitments,
      participationRate: totalEmployees > 0 ? Math.round((totalVotes / totalEmployees) * 100) : 0,
      openCases, totalCases,
      nextMeeting: nextMeeting ? { date: nextMeeting.meetingDate, agenda: nextMeeting.agenda } : null,
      totalMembers: period.members.length, periodName: period.periodName,
    };
  }

  private async refreshStatus(period: ConvivenciaPeriodDocument) {
    const now = new Date();
    const thirty = new Date(now); thirty.setDate(thirty.getDate() + 30);
    if (period.endDate < now) period.status = 'VENCIDO';
    else if (period.endDate < thirty) period.status = 'PROXIMO_A_VENCER';
    else period.status = 'ACTIVO';
    if (period.status !== 'ACTIVO') {
      await this.alertsService.create({ companyId: period.companyId.toString(), type: 'CONVIVENCIA_EXPIRATION', message: `Comité de Convivencia ${period.status.toLowerCase()}`, severity: AlertSeverity.MEDIUM }).catch(() => {});
    }
    await this.saveWithCompliance(period);
    return period;
  }
}
