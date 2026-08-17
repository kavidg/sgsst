import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { Model, Types } from 'mongoose';
import { AlertsService } from '../alerts/alerts.service';
import { AutoCommunicationService } from '../communication/auto-communication.service';
import { Employee, EmployeeDocument } from '../employees/schemas/employee.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { AlertSeverity } from '../alerts/schemas/alert.schema';
import { CopasstPeriod, CopasstPeriodDocument } from './schemas/copasst.schema';
import { OtpRateLimitService } from '../otp-rate-limit/otp-rate-limit.service';
import { OtpChallengeService } from '../otp-challenge/otp-challenge.service';

/**
 * OTP seguro del flujo electoral COPASST (F7B-10.1) + STORE COMPARTIDO
 * (F7B-10.6-D).
 *
 * Mismo estándar criptográfico que el OTP de Convivencia (F7B-2): el código
 * NUNCA se almacena en texto plano ni se expone en respuestas. El verificador
 * criptográfico (HMAC-SHA256) junto con expiración e intentos fallidos vive
 * en MongoDB (colección copasst_otp_challenges) y NO en un Map por proceso,
 * por lo que un OTP generado en una instancia puede validarse desde otra.
 */

/** TTL del OTP: 5 minutos (consistente con F7B-2). */
const OTP_TTL_MS = 5 * 60 * 1000;
/** Máximo de intentos fallidos por OTP antes de invalidarlo (consistente con F7B-2). */
const MAX_OTP_ATTEMPTS = 5;
/**
 * Rate-limit del REGISTRO público de candidatos (F7B-10.6-A): máximo de
 * solicitudes por (campaña, documento) dentro de la ventana. Independiente de
 * OTP_RATE_LIMIT_MAX=3 (mecanismo de solicitudes OTP). Valor conservador para
 * un formulario público: permite reintentos legítimos (errores de validación,
 * reenvíos) y bloquea el martilleo de la misma identidad. La unicidad del
 * documento por campaña ya está garantizada por la regla de negocio.
 */
export const REGISTRATION_RATE_LIMIT_MAX = 5;
/** Ventana del rate-limit de registro: 10 minutos (consistente con F7B-10.2). */
export const REGISTRATION_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

/**
 * Estado electoral explícito del flujo COPASST (F7B-10.6-C).
 *
 * NOT_STARTED → OPEN → CLOSED. El estado persistido es la configuración
 * administrativa; las fechas (votingOpenAt/votingClosedAt) son límites
 * temporales evaluados de forma determinista en cada lectura.
 */
type ElectionState = 'NOT_STARTED' | 'OPEN' | 'CLOSED';
/**
 * Pepper HMAC-SHA256 del OTP (F7B-10.1/10.6-D).
 *
 * F7B-10.6-D: el store OTP es COMPARTIDO entre instancias (MongoDB), por lo
 * que el pepper debe ser idéntico en todas ellas para que una instancia pueda
 * validar el hash generado por otra. Se lee de la variable de entorno
 * OTP_PEPPER (hex, 64 chars) cuando está configurada; en su defecto se genera
 * aleatoriamente por proceso (comportamiento de F7B-10.1, adecuado para una
 * sola instancia). Nunca se imprime ni se expone en respuestas.
 */
const OTP_HASH_PEPPER = process.env.OTP_PEPPER ?? randomBytes(32).toString('hex');

/** Hasher por defecto: HMAC-SHA256(pepper, código) → hex (64 chars). */
const defaultOtpHasher = (code: string): string =>
  createHmac('sha256', OTP_HASH_PEPPER).update(code).digest('hex');

@Injectable()
export class CopasstService {
  /**
   * Hasher inyectable por pruebas (campo de instancia con default de
   * producción; las pruebas pueden sustituirlo por uno reversible para
   * recuperar el código de validación sin exponerlo por la API).
   */
  private readonly otpHasher: (code: string) => string = defaultOtpHasher;
  constructor(
    @InjectModel(CopasstPeriod.name) private readonly periodModel: Model<CopasstPeriodDocument>,
    @InjectModel(Employee.name) private readonly employeeModel: Model<EmployeeDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly alertsService: AlertsService,
    private readonly autoCommService: AutoCommunicationService,
    /** Rate-limit distribuido de solicitudes OTP (F7B-10.5-B, MongoDB). */
    private readonly otpRateLimitService: OtpRateLimitService,
    /** Store OTP COMPARTIDO en MongoDB (F7B-10.6-D): reemplaza otpStore Map. */
    private readonly otpChallengeService: OtpChallengeService,
  ) {}

  // ─────────────────────────────────────────────
  // GLOBAL / SUMMARY
  // ─────────────────────────────────────────────
  async getSummary(companyId: Types.ObjectId) {
    const totalEmployees = await this.employeeModel.countDocuments({ companyId, status: 'Activo' }).exec();
    const requiresCopasst = totalEmployees >= 10;
    const current = await this.periodModel.findOne({ companyId, status: { $ne: 'ARCHIVADO' } }).sort({ createdAt: -1 }).exec();
    if (!current) {
      // Create default period if none exists
      const start = new Date();
      const end = new Date(start); end.setFullYear(end.getFullYear() + 2);
      const created = await this.periodModel.create({
        companyId, periodName: 'COPASST Inicial', startDate: start, endDate: end,
        status: requiresCopasst ? 'ACTIVO' : 'ARCHIVADO',
        totalEmployees, requiresCopasst,
      });
      return { period: created, totalEmployees, requiresCopasst };
    }
    current.totalEmployees = totalEmployees;
    current.requiresCopasst = requiresCopasst;
    if (!requiresCopasst) {
      current.status = 'ARCHIVADO';
    }
    await current.save();
    return { period: current, totalEmployees, requiresCopasst };
  }

  // ─────────────────────────────────────────────
  // PERIOD MANAGEMENT
  // ─────────────────────────────────────────────
  /**
   * Getter de lectura por identificador (sin crear registros ni refrescar
   * estado). Usado por el CopasstAdapter del Approval Workflow Core, que
   * verifica la pertenencia por companyId ANTES de operar.
   */
  async findById(id: Types.ObjectId): Promise<CopasstPeriodDocument> {
    const period = await this.periodModel.findById(id).exec();
    if (!period) throw new NotFoundException('Periodo no encontrado');
    return period;
  }

  /**
   * Carga el periodo con QUERY TENANT-SCOPED (F7B-10.6-D):
   * `findOne({ _id, companyId })`. El companyId proviene SIEMPRE del contexto
   * autenticado (req.companyId del CompanyAccessGuard) o del motor de
   * aprobaciones (ctx.companyId) — nunca del cliente.
   *
   * Si el periodo no existe O pertenece a otra empresa, devuelve NotFound
   * genérico ('Periodo no encontrado'): no revela que el periodo existe en
   * otro tenant.
   */
  private async findPeriodScoped(
    periodId: string,
    companyId: Types.ObjectId,
  ): Promise<CopasstPeriodDocument> {
    const period = await this.periodModel.findOne({ _id: periodId, companyId }).exec();
    if (!period) throw new NotFoundException('Periodo no encontrado');
    return period;
  }

  /**
   * Getter de lectura del periodo activo vigente de la empresa (sin crear un
   * periodo por defecto como hace getCurrent). Usado por el adapter cuando
   * getEntity llega sin periodId.
   */
  async findCurrent(companyId: Types.ObjectId): Promise<CopasstPeriodDocument> {
    const period = await this.periodModel
      .findOne({ companyId, status: { $ne: 'ARCHIVADO' } })
      .sort({ createdAt: -1 })
      .exec();
    if (!period) throw new NotFoundException('No existe un periodo activo para esta empresa');
    return period;
  }

  async getCurrent(companyId: Types.ObjectId) {
    const current = await this.periodModel.findOne({ companyId, status: { $ne: 'ARCHIVADO' } }).sort({ createdAt: -1 }).exec();
    if (current) return this.refreshStatus(current);
    const totalEmployees = await this.employeeModel.countDocuments({ companyId, status: 'Activo' }).exec();
    const start = new Date();
    const end = new Date(start); end.setFullYear(end.getFullYear() + 2);
    return this.periodModel.create({
      companyId, periodName: 'COPASST Inicial', startDate: start, endDate: end,
      status: totalEmployees >= 10 ? 'ACTIVO' : 'ARCHIVADO',
      totalEmployees, requiresCopasst: totalEmployees >= 10,
    });
  }

  async createPeriod(companyId: Types.ObjectId, dto: { periodName: string; startDate: string }, email: string) {
    await this.periodModel.updateMany({ companyId, status: { $ne: 'ARCHIVADO' } }, { $set: { status: 'ARCHIVADO' } }).exec();
    const start = new Date(dto.startDate);
    const end = new Date(start); end.setFullYear(end.getFullYear() + 2);
    const totalEmployees = await this.employeeModel.countDocuments({ companyId, status: 'Activo' }).exec();
    const created = await this.periodModel.create({
      companyId, periodName: dto.periodName, startDate: start, endDate: end,
      status: totalEmployees >= 10 ? 'ACTIVO' : 'ARCHIVADO',
      totalEmployees, requiresCopasst: totalEmployees >= 10,
      auditHistory: [{ action: 'CREATE_PERIOD', createdBy: email, createdAt: new Date(), data: JSON.stringify(dto) }],
    });
    await this.autoCommService.generateCommunication({
      companyId, title: `Elección COPASST: ${created.periodName}`,
      body: `Se ha iniciado el proceso de elección del COPASST para el periodo "${created.periodName}". Fecha inicio: ${start.toISOString().slice(0, 10)}.`,
      communicationType: 'ANNOUNCEMENT', priority: 'IMPORTANT', targetAudience: 'ALL_COMPANY',
      requiresSignature: false, sourceModule: 'COPASST_ELECTION', sourceEntityId: created._id.toString(),
    }).catch(() => {});
    return created;
  }

  async updatePeriod(companyId: Types.ObjectId, periodId: string, dto: Partial<{
    periodName: string; startDate: string; endDate: string; status: string;
    // F7B-10.6-C: configuración electoral mínima (backward-compatible, opcional).
    electionState: string; votingOpenAt: string; votingClosedAt: string;
  }>) {
    // F7B-10.6-D: query tenant-scoped (_id + companyId).
    const period = await this.findPeriodScoped(periodId, companyId);
    if (dto.periodName) period.periodName = dto.periodName;
    if (dto.startDate) period.startDate = new Date(dto.startDate);
    if (dto.endDate) period.endDate = new Date(dto.endDate);
    if (dto.status) period.status = dto.status;
    // F7B-10.6-C: solo se aceptan valores del enum electoral (configuración
    // administrativa; el estado efectivo se deriva también de las fechas).
    if (dto.electionState) {
      const state = dto.electionState as ElectionState;
      if (!['NOT_STARTED', 'OPEN', 'CLOSED'].includes(state)) {
        throw new BadRequestException('Estado electoral inválido');
      }
      period.electionState = state;
    }
    if (dto.votingOpenAt) period.votingOpenAt = new Date(dto.votingOpenAt);
    if (dto.votingClosedAt) period.votingClosedAt = new Date(dto.votingClosedAt);
    await period.save();
    return period;
  }

  // ─────────────────────────────────────────────
  // MEMBERS
  // ─────────────────────────────────────────────
  async getMembers(companyId: Types.ObjectId, periodId: string) {
    // F7B-10.6-D: query tenant-scoped (_id + companyId).
    const period = await this.findPeriodScoped(periodId, companyId);
    return period.members;
  }

  async addMember(companyId: Types.ObjectId, periodId: string, dto: {
    userId: string; userName: string; committeeRole: string;
    representationType: string; principalType: string; startDate: string;
  }, email: string) {
    // F7B-10.6-D: query tenant-scoped (_id + companyId).
    const period = await this.findPeriodScoped(periodId, companyId);
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
    return period.save();
  }

  async removeMember(companyId: Types.ObjectId, periodId: string, memberIndex: number, email: string) {
    // F7B-10.6-D: query tenant-scoped (_id + companyId).
    const period = await this.findPeriodScoped(periodId, companyId);
    const member = period.members[memberIndex];
    if (!member) throw new NotFoundException('Miembro no encontrado');
    period.members.splice(memberIndex, 1);
    period.auditHistory.push({ action: 'REMOVE_MEMBER', createdBy: email, createdAt: new Date(), data: JSON.stringify(member) });
    return period.save();
  }

  // ─────────────────────────────────────────────
  // CANDIDATE REGISTRATION CAMPAIGN
  // ─────────────────────────────────────────────
  async startRegistrationCampaign(companyId: Types.ObjectId, periodId: string, dto: {
    openingDate: string; closingDate: string;
    includedDepartments?: string[]; requirements?: string[];
  }, email: string) {
    // F7B-10.6-D: query tenant-scoped (_id + companyId).
    const period = await this.findPeriodScoped(periodId, companyId);
    // F7B-10.6-A: token criptográficamente aleatorio (32 bytes → 64 hex).
    // Reemplaza el patrón derivable anterior (ObjectId + timestamp). Los
    // tokens legacy existentes siguen siendo válidos (no hay estado de
    // campaña que permita distinguirlos/revocarlos sin F7B-10.6-C; se
    // documenta como pendiente).
    const secureToken = randomBytes(32).toString('hex');
    period.registrationCampaign = {
      openingDate: new Date(dto.openingDate),
      closingDate: new Date(dto.closingDate),
      includedDepartments: dto.includedDepartments ?? [],
      requirements: dto.requirements ?? [],
      secureToken, isActive: true, adminNotes: '',
    };
    period.auditHistory.push({ action: 'START_CAMPAIGN', createdBy: email, createdAt: new Date(), data: JSON.stringify(dto) });
    await period.save();
    // Generate auto-communication
    await this.autoCommService.generateCommunication({
      companyId: period.companyId,
      title: `Inscripción COPASST: ${period.periodName}`,
      body: `Se ha abierto la convocatoria para candidatos al COPASST. Periodo de inscripción: ${new Date(dto.openingDate).toISOString().slice(0, 10)} al ${new Date(dto.closingDate).toISOString().slice(0, 10)}. Los empleados pueden postularse a través del enlace seguro.`,
      communicationType: 'ANNOUNCEMENT', priority: 'IMPORTANT', targetAudience: 'ALL_COMPANY',
      requiresSignature: false,      sourceModule: 'COPASST_CAMPAIGN' as any, sourceEntityId: period._id.toString(),
    }).catch(() => {});
    return { period, secureToken, registrationUrl: `/copasst/register/${secureToken}` };
  }

  async getCampaignInfo(token: string) {
    const period = await this.periodModel.findOne({ 'registrationCampaign.secureToken': token }).exec();
    if (!period || !period.registrationCampaign) throw new NotFoundException('Campaña no encontrada');
    if (!period.registrationCampaign.isActive) throw new BadRequestException('La campaña de inscripción ya no está activa');
    if (new Date() > period.registrationCampaign.closingDate) throw new BadRequestException('El periodo de inscripción ha finalizado');
    // F7B-10.7: contrato PÚBLICO mínimo — solo los datos necesarios para
    // presentar la campaña. Se eliminó `companyId` (identificador interno del
    // tenant) porque ningún consumidor público legítimo lo requiere (el
    // frontend tipa únicamente periodName/openingDate/closingDate/requirements
    // e includedDepartments). El mecanismo de resolución token → periodo no
    // cambia.
    return {
      periodName: period.periodName,
      openingDate: period.registrationCampaign.openingDate,
      closingDate: period.registrationCampaign.closingDate,
      includedDepartments: period.registrationCampaign.includedDepartments,
      requirements: period.registrationCampaign.requirements,
    };
  }

  async registerCandidatePublic(token: string, dto: {
    name: string; document: string; phone: string; area: string;
    position: string; motivation: string; acceptedTerms: boolean;
    email?: string; ipAddress?: string; device?: string;
  }) {
    const period = await this.periodModel.findOne({ 'registrationCampaign.secureToken': token }).exec();
    if (!period || !period.registrationCampaign) throw new NotFoundException('Campaña no encontrada');
    if (!period.registrationCampaign.isActive) throw new BadRequestException('La campaña ya no está activa');
    if (new Date() > period.registrationCampaign.closingDate) throw new BadRequestException('El periodo de inscripción ha finalizado');
    // F7B-10.6-C: una elección CLOSED impide nuevos registros (el cierre es
    // irreversible; la regla mínima exigida por el flujo). En NOT_STARTED/OPEN
    // el registro sigue gobernado por la ventana de la campaña (opening/closing
    // Date), que ya se validó arriba.
    if (this.effectiveElectionState(period) === 'CLOSED') {
      throw new BadRequestException('El periodo de inscripción ha finalizado');
    }
    // Validación barata ANTES del rate-limit: un payload sin términos aceptados
    // se rechaza sin consumir cuota de la identidad (no es abuso, es un error
    // de usuario).
    if (!dto.acceptedTerms) throw new BadRequestException('Debe aceptar los términos de la postulación');
    // F7B-10.6-A: rate-limit DISTRIBUIDO del registro público (reutiliza el
    // mecanismo MongoDB de F7B-10.5-B). Clave por (campaña, documento): el
    // companyId se resuelve server-side desde el periodo (nunca del cliente)
    // y el IP del body no se usa como clave (no es confiable). Fail-closed:
    // si MongoDB falla, el registro se rechaza con mensaje genérico.
    const document = dto.document.trim();
    await this.otpRateLimitService.assertRateLimit(
      `registration:${period._id.toString()}:${document}`,
      REGISTRATION_RATE_LIMIT_MAX,
      REGISTRATION_RATE_LIMIT_WINDOW_MS,
    );
    if (period.candidateExtended.some((c) => c.document === document)) {
      throw new BadRequestException('Ya existe un candidato registrado con este documento');
    }
    period.candidateExtended.push({
      ...dto, document, adminStatus: 'PENDIENTE', adminComment: '', votes: 0,
      registeredAt: new Date(),
    });
    await period.save();
    return { success: true, message: 'Candidatura registrada exitosamente' };
  }

  async reviewCandidate(companyId: Types.ObjectId, periodId: string, candidateIndex: number, dto: {
    adminStatus: 'APROBADO' | 'RECHAZADO' | 'INFO_REQUESTED';
    adminComment?: string;
  }, email: string) {
    // F7B-10.6-D: query tenant-scoped (_id + companyId).
    const period = await this.findPeriodScoped(periodId, companyId);
    const candidate = period.candidateExtended[candidateIndex];
    if (!candidate) throw new NotFoundException('Candidato no encontrado');
    candidate.adminStatus = dto.adminStatus;
    if (dto.adminComment) candidate.adminComment = dto.adminComment;
    period.auditHistory.push({
      action: `CANDIDATE_${dto.adminStatus}`,
      createdBy: email, createdAt: new Date(), data: JSON.stringify({ candidate: candidate.name, status: dto.adminStatus, comment: dto.adminComment }),
    });
    return period.save();
  }

  // ─────────────────────────────────────────────
  // VOTING
  // ─────────────────────────────────────────────

  /**
   * Estado electoral EFECTIVO (F7B-10.6-C).
   *
   * Función DETERMINISTA de (estado persistido + fechas): nunca escribe, un
   * GET no cambia el estado. Precedencia:
   *
   * 1. CLOSED persistido → siempre CLOSED (el cierre es irreversible, nunca
   *    se reabre automáticamente, ni aunque votingOpenAt ya haya llegado).
   * 2. votingClosedAt vencido → CLOSED (límite temporal de cierre alcanzado,
   *    para cualquier estado persistido no-CLOSED).
   * 3. NOT_STARTED con votingOpenAt llegado → OPEN (transición automática).
   * 4. En cualquier otro caso → estado persistido.
   *
   * Configuraciones contradictorias (p. ej. CLOSED + votingOpenAt futuro) se
   * resuelven de forma conservadora: el cierre explícito y el límite temporal
   * vencido ganan siempre (no se corrigen silenciosamente; se documenta).
   */
  private effectiveElectionState(period: CopasstPeriodDocument): ElectionState {
    const now = new Date();
    const persisted = (period.electionState ?? 'NOT_STARTED') as ElectionState;
    if (persisted === 'CLOSED') return 'CLOSED';
    if (period.votingClosedAt && period.votingClosedAt.getTime() <= now.getTime()) {
      return 'CLOSED';
    }
    if (persisted === 'OPEN') return 'OPEN';
    // Fail-closed: NOT_STARTED (y cualquier valor fuera del enum, p. ej. datos
    // legacy/integridad) solo abre cuando votingOpenAt ya llegó. Un valor
    // desconocido NUNCA resuelve a OPEN por defecto (estado permisivo).
    if (period.votingOpenAt && period.votingOpenAt.getTime() <= now.getTime()) {
      return 'OPEN';
    }
    return 'NOT_STARTED';
  }

  /** Gate electoral: exige OPEN (OTP y voto). Mensaje genérico sin revelar estado. */
  private assertElectionOpen(period: CopasstPeriodDocument): void {
    if (this.effectiveElectionState(period) !== 'OPEN') {
      throw new BadRequestException('La votación no está disponible.');
    }
  }

  /** Gate electoral: exige CLOSED (resultados). Mensaje genérico sin revelar estado. */
  private assertElectionClosed(period: CopasstPeriodDocument): void {
    if (this.effectiveElectionState(period) !== 'CLOSED') {
      throw new BadRequestException('Los resultados no están disponibles.');
    }
  }

  async initVoting(companyId: Types.ObjectId, periodId: string, email: string) {
    // F7B-10.6-D: query tenant-scoped (_id + companyId).
    const period = await this.findPeriodScoped(periodId, companyId);
    const approved = period.candidateExtended.filter((c) => c.adminStatus === 'APROBADO');
    if (approved.length < 2) throw new BadRequestException('Se requieren al menos 2 candidatos aprobados para iniciar la votación');
    // F7B-10.6-C: la transición administrativa NOT_STARTED → OPEN fija también
    // la apertura temporal y borra un cierre previo (la elección se abre ahora).
    // Si existiera un votingClosedAt futuro, sigue siendo el límite de cierre.
    period.electionState = 'OPEN';
    period.votingOpenAt = new Date();
    period.votingClosedAt = undefined;
    period.auditHistory.push({ action: 'START_VOTING', createdBy: email, createdAt: new Date(), data: JSON.stringify({ candidates: approved.length }) });
    await period.save();
    // Generate auto-communication
    await this.autoCommService.generateCommunication({
      companyId: period.companyId, title: `Votación COPASST: ${period.periodName}`,
      body: `Se ha iniciado la votación para la elección de representantes al COPASST. Los empleados pueden votar a través del enlace seguro.`,
      communicationType: 'ANNOUNCEMENT', priority: 'IMPORTANT', targetAudience: 'ALL_COMPANY',
      requiresSignature: false,      sourceModule: 'COPASST_VOTING' as any, sourceEntityId: period._id.toString(),
    }).catch(() => {});
    return { period, approvedCandidates: approved };
  }

  /**
   * Endpoint PÚBLICO por diseño (OTP por SMS del trabajador que vota).
   *
   * F7B-10.1: el OTP se genera con crypto.randomInt (6 dígitos), NUNCA se
   * expone en la respuesta y en memoria solo se guarda su verificador
   * criptográfico (HMAC-SHA256), con expiración de 5 minutos e intentos en 0.
   * Un nuevo OTP para la misma clave (elección/documento/teléfono) invalida
   * el anterior de inmediato (nuevo hash, nueva expiración, attempts=0). El
   * provider sigue siendo mock internamente (no existe infraestructura real
   * de SMS/email todavía).
   */
  async sendOtp(dto: { electionId: string; document: string; phone: string }) {
    const key = `${dto.electionId}:${dto.document}:${dto.phone}`;
    // F7B-10.6-C: se localiza la elección y se exige estado electoral OPEN
    // ANTES del rate-limit y de generar el OTP. NOT_STARTED y CLOSED rechazan
    // con mensaje genérico ('La votación no está disponible.') sin revelar
    // el estado. Una elección cerrada no consume cuota de rate-limit.
    const election = await this.periodModel.findById(dto.electionId).exec();
    if (!election) throw new BadRequestException('Elección no encontrada');
    this.assertElectionOpen(election);
    // F7B-10.5-B: rate-limit DISTRIBUIDO (contador atómico en MongoDB) ANTES
    // de generar el OTP. Fail-closed: si MongoDB falla, sendOtp rechaza con el
    // mismo mensaje genérico (no hay fallback en memoria). No consume cuota
    // de intentos ni genera coste por solicitudes abusivas.
    await this.otpRateLimitService.assertOtpRateLimit(key);
    const code = String(randomInt(100000, 1000000));
    // F7B-10.6-D: el desafío se persiste en MongoDB (compartido entre
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
    // Contrato seguro: sin otp/otpPreview/code/secret/otpHash (F7B-10.1).
    return { sent: true, provider: 'mock', expiresAt: new Date(Date.now() + OTP_TTL_MS) };
  }

  /** Comparación de verificadores resistente a timing attacks (F7B-10.1). */
  private otpHashesEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'hex');
    const bufB = Buffer.from(b, 'hex');
    return bufA.length === bufB.length && bufA.length > 0 && timingSafeEqual(bufA, bufB);
  }

  /**
   * Elegibilidad del votante del flujo público (F7B-10.6-A, mismo patrón que
   * F7B-1 en Convivencia).
   *
   * Regla derivada de los datos reales existentes (sin inventar criterios):
   * el documento del votante debe corresponder a un Employee del MISMO
   * companyId del periodo y con status 'Activo' (mismo valor canónico que usa
   * getSummary). El Employee no tiene campo phone: el identificador canónico
   * es document dentro del tenant (índice único {companyId, document}).
   *
   * Error GENÉRICO ('Documento no elegible para esta elección') para no
   * filtrar información entre tenants: no revela si el documento no existe,
   * está inactivo o pertenece a otra empresa.
   */
  private async assertVoterEligible(
    period: CopasstPeriodDocument,
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
    return employee;
  }

  /**
   * Endpoint PÚBLICO por diseño (votación con OTP).
   *
   * F7B-10.1: el OTP se valida contra el verificador criptográfico
   * (HMAC-SHA256 con comparación timing-safe): existencia → expiración →
   * intentos agotados → comparación. Un error incrementa intentos (y agota el
   * OTP al llegar al máximo); un acierto invalida el OTP de inmediato (uso
   * único). Mensaje genérico 'OTP inválido o expirado' (no enumera si un OTP
   * existe para la clave, no revela expiración ni estado del store).
   */
  async vote(dto: {
    electionId: string; document: string; phone: string;
    otpCode: string; candidateDocument: string;
    ipAddress?: string; device?: string;
  }) {
    const key = `${dto.electionId}:${dto.document}:${dto.phone}`;
    // F7B-10.6-D: validación contra el desafío COMPARTIDO en MongoDB.
    // Fail-closed: cualquier error de MongoDB se convierte en rechazo genérico
    // ('OTP inválido o expirado'); NUNCA se reintroduce el Map en memoria.
    let challenge: { otpHash: string; expiresAt: Date; attempts: number } | null = null;
    try {
      challenge = await this.otpChallengeService.getChallenge(key);
    } catch {
      throw new BadRequestException('OTP inválido o expirado');
    }
    if (!challenge) throw new BadRequestException('OTP inválido o expirado');
    if (challenge.expiresAt.getTime() < Date.now()) {
      await this.otpChallengeService.deleteChallenge(key).catch(() => undefined);
      throw new BadRequestException('OTP inválido o expirado');
    }
    if (challenge.attempts >= MAX_OTP_ATTEMPTS) {
      await this.otpChallengeService.deleteChallenge(key).catch(() => undefined);
      throw new BadRequestException('OTP inválido o expirado');
    }
    if (!this.otpHashesEqual(challenge.otpHash, this.otpHasher(dto.otpCode))) {
      // Intentos fallidos COMPARTIDOS ($inc atómico solo si el desafío sigue
      // siendo el vigente). Al llegar al máximo, se invalida el desafío.
      const attempts = await this.otpChallengeService
        .incrementAttempts(key, challenge.otpHash)
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
      .consumeIfMatches(key, challenge.otpHash)
      .catch(() => false);
    if (!consumed) throw new BadRequestException('OTP inválido o expirado');
    const period = await this.periodModel.findById(dto.electionId).exec();
    if (!period) throw new BadRequestException('Elección no encontrada');
    // F7B-10.6-C: el voto re-valida el estado electoral SIEMPRE, incluso si el
    // OTP fue generado mientras la elección estaba OPEN y luego pasó a CLOSED.
    // electionState prevalece sobre la validez del OTP.
    this.assertElectionOpen(period);
    // F7B-10.6-A: elegibilidad del votante ANTES de aceptar/incrementar el
    // voto. El documento debe corresponder a un Employee del MISMO tenant del
    // periodo y en estado activo. Error genérico (no revela existencia/tenant).
    await this.assertVoterEligible(period, dto.document);
    // Identidad del candidato normalizada (trim) igual que el documento del
    // votante: evita falsos 'Candidato no encontrado' por espacios.
    const normalizedCandidateDocument = dto.candidateDocument.trim();
    const candidate = period.candidateExtended.find(
      (c) => c.document === normalizedCandidateDocument,
    );
    if (!candidate) throw new BadRequestException('Candidato no encontrado');
    // F7B-10.6-A: solo candidatos APROBADOS reciben votos (PENDIENTE,
    // RECHAZADO e INFO_REQUESTED no están habilitados). Sin votos persistidos
    // ni incrementos para candidatos no aprobados.
    if (candidate.adminStatus !== 'APROBADO') {
      throw new BadRequestException('El candidato no está habilitado para la votación');
    }
    const normalizedDocument = dto.document.trim();
    // Identificador interno del candidato (índice en candidateExtended; los
    // candidatos no tienen _id propio). Solo metadata de auditoría.
    const candidateIndex = period.candidateExtended.findIndex(
      (c) => c.document === normalizedCandidateDocument,
    );
    // F7B-10.6-B — voto único ATÓMICO (patrón CAS por documento certificado
    // en F7B-3 para Convivencia): findOneAndUpdate evalúa la condición y
    // aplica los $push como UNA sola operación atómica por documento
    // (garantía de MongoDB). Dos votos concurrentes del mismo votante se
    // serializan: el segundo ya no cumple `votesExtended.document: {$ne}` →
    // devuelve null y no registra el voto. El incremento del contador se hace
    // con $inc posicional atómico (nunca candidate.votes += 1 + save()).
    // Reemplaza la secuencia vulnerable findById → some() → push() → save().
    const updated = await this.periodModel
      .findOneAndUpdate(
        {
          _id: period._id,
          'votesExtended.document': { $ne: normalizedDocument },
          'candidateExtended.document': normalizedCandidateDocument,
        },
        {
          $push: {
            votesExtended: {
              document: normalizedDocument,
              candidateDocument: normalizedCandidateDocument,
              otpValidated: true,
              votedAt: new Date(),
              ipAddress: dto.ipAddress,
              device: dto.device,
              // F7B-10.7: se eliminó `token: key` (contenía
              // `${electionId}:${document}:${phone}` — PII persistida
              // innecesaria). La garantía de voto único NO depende de él: la
              // da `votesExtended.document` con $ne atómico (CAS) y el
              // consumo único del OTP. La clave efímera `key` sigue usándose
              // solo para operar el challenge OTP (nunca se persiste aquí).
            },
            // Auditoría del voto DENTRO de la misma operación atómica (mismo
            // patrón F7B-5): sin PII del votante (ni document ni phone/email).
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
      // Clasificación del motivo sin filtrar información entre tenants: el
      // único caso esperado tras los pre-checks es el voto duplicado. Reutiliza
      // la copia del periodo ya cargada (evita una segunda lectura).
      if ((period.votesExtended ?? []).some((v) => v.document === normalizedDocument)) {
        throw new BadRequestException('El trabajador ya votó');
      }
      throw new BadRequestException('Candidato no encontrado');
    }
    // Contador denormalizado del candidato ($inc atómico; nunca +=1+save).
    // Best-effort como en F7B-3: la fuente de verdad del voto único es
    // votesExtended (garantizada por la operación atómica anterior); si el
    // proceso cae entre ambas operaciones el contador puede quedar desfasado
    // (riesgo residual documentado, no afecta la garantía de voto único).
    await this.periodModel
      .updateOne(
        { _id: period._id, 'candidateExtended.document': normalizedCandidateDocument },
        { $inc: { 'candidateExtended.$.votes': 1 } },
      )
      .exec();
    return { success: true, message: 'Voto registrado exitosamente' };
  }

  /**
   * Resultados electorales COPASST (F7B-10.2).
   *
   * PRIVACIDAD: el response se construye EXPLÍCITAMENTE con un DTO de campos
   * permitidos {rank, name, votes, status} para winners/alternates/ranking.
   * Nunca devuelve document/phone/email/area/position/motivation de
   * candidatos, ni votesExtended, ni datos individuales de votantes
   * (OTP/token/IP/device). El contrato impide que esos campos lleguen al
   * cliente (no es una eliminación superficial).
   *
   * READ-ONLY: solo lee (findById + countDocuments). No crea votos, no
   * modifica candidatos ni periodos.
   */
  async getVotingResults(periodId: string) {
    const period = await this.periodModel.findById(periodId).exec();
    if (!period) throw new NotFoundException('Periodo no encontrado');
    // F7B-10.6-C: los resultados solo se publican cuando la elección está
    // CLOSED (NOT_STARTED y OPEN rechazan; el cierre es irreversible). La
    // comprobación es determinista sobre (estado persistido + fechas) y NO
    // realiza escrituras (un GET sigue siendo READ-ONLY).
    this.assertElectionClosed(period);
    const sorted = [...period.candidateExtended].sort((a, b) => b.votes - a.votes);
    const approved = sorted.filter((c) => c.adminStatus === 'APROBADO');
    const totalVotes = period.votesExtended.length;
    const totalEmployees = await this.employeeModel.countDocuments({ companyId: period.companyId, status: 'Activo' }).exec();
    // DTO explícito de resultados: solo campos públicos, sin PII de
    // candidatos ni información individual de votantes (F7B-10.2).
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
    // F7B-10.6-D: query tenant-scoped (_id + companyId).
    const period = await this.findPeriodScoped(periodId, companyId);
    const sorted = [...period.candidateExtended].filter((c) => c.adminStatus === 'APROBADO').sort((a, b) => b.votes - a.votes);
    const primaryCount = Math.min(numPositions, sorted.length);
    const alternates = sorted.slice(primaryCount, primaryCount + numPositions);
    // Clear existing members and assign new ones
    period.members = [];
    for (let i = 0; i < primaryCount; i++) {
      const candidate = sorted[i];
      period.members.push({
        userId: new Types.ObjectId(), // Generic - no direct user link for external candidates
        userName: candidate.name,
        committeeRole: i === 0 ? 'PRESIDENTE' : i === 1 ? 'SECRETARIO' : 'PRINCIPAL',
        representationType: 'TRABAJADOR',
        principalType: i < primaryCount ? 'PRINCIPAL' : 'SUPLENTE',
        startDate: new Date(),
        endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 2)),
        status: 'ACTIVO',
      } as never);
    }
    for (const alt of alternates) {
      period.members.push({
        userId: new Types.ObjectId(),
        userName: alt.name,
        committeeRole: 'SUPLENTE',
        representationType: 'TRABAJADOR',
        principalType: 'SUPLENTE',
        startDate: new Date(),
        endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 2)),
        status: 'ACTIVO',
      } as never);
    }
    period.auditHistory.push({ action: 'AUTO_CREATE_COMMITTEE', createdBy: email, createdAt: new Date(), data: JSON.stringify({ primary: primaryCount, alternates: alternates.length }) });
    return period.save();
  }

  // ─────────────────────────────────────────────
  // MEETINGS
  // ─────────────────────────────────────────────
  async scheduleMeeting(companyId: Types.ObjectId, periodId: string, dto: {
    meetingDate: string; agenda: string; topicList?: string[];
  }, email: string) {
    // F7B-10.6-D: query tenant-scoped (_id + companyId).
    const period = await this.findPeriodScoped(periodId, companyId);
    period.meetings.push({
      meetingDate: new Date(dto.meetingDate), status: 'PROGRAMADA',
      agenda: dto.agenda, attendees: [], topicList: dto.topicList ?? [],
      development: '',
    } as never);
    period.auditHistory.push({ action: 'SCHEDULE_MEETING', createdBy: email, createdAt: new Date(), data: JSON.stringify(dto) });
    return period.save();
  }

  async autoScheduleMonthlyMeetings(companyId: Types.ObjectId, periodId: string, email: string) {
    // F7B-10.6-D: query tenant-scoped (_id + companyId).
    const period = await this.findPeriodScoped(periodId, companyId);
    const now = new Date();
    let count = 0;
    for (let i = 1; i <= 12; i++) {
      const meetingDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
      if (meetingDate > period.endDate) break;
      const exists = period.meetings.some((m) =>
        m.meetingDate.getFullYear() === meetingDate.getFullYear() &&
        m.meetingDate.getMonth() === meetingDate.getMonth(),
      );
      if (!exists) {
        period.meetings.push({
          meetingDate, status: 'PROGRAMADA',
          agenda: `Reunión mensual COPASST - ${meetingDate.toLocaleString('es', { month: 'long', year: 'numeric' })}`,
          attendees: [], topicList: [],
          development: '',
        } as never);
        count++;
      }
    }
    period.auditHistory.push({ action: 'AUTO_SCHEDULE_MEETINGS', createdBy: email, createdAt: new Date(), data: `${count} reuniones programadas` });
    return period.save();
  }

  async completeMeeting(companyId: Types.ObjectId, periodId: string, meetingIndex: number, dto: {
    development: string; attendees: string[]; topicList?: string[];
  }, email: string) {
    // F7B-10.6-D: query tenant-scoped (_id + companyId).
    const period = await this.findPeriodScoped(periodId, companyId);
    const meeting = period.meetings[meetingIndex];
    if (!meeting) throw new NotFoundException('Reunión no encontrada');
    meeting.development = dto.development;
    meeting.attendees = dto.attendees;
    meeting.status = 'CERRADA';
    if (dto.topicList) meeting.topicList = dto.topicList;
    period.auditHistory.push({ action: 'COMPLETE_MEETING', createdBy: email, createdAt: new Date(), data: JSON.stringify(dto) });
    return period.save();
  }

  async updateMeeting(companyId: Types.ObjectId, periodId: string, meetingIndex: number, dto: Partial<{
    meetingDate: string; agenda: string; development: string; status: string;
    attendees: string[]; topicList: string[];
  }>, email: string) {
    // F7B-10.6-D: query tenant-scoped (_id + companyId).
    const period = await this.findPeriodScoped(periodId, companyId);
    const meeting = period.meetings[meetingIndex];
    if (!meeting) throw new NotFoundException('Reunión no encontrada');
    if (dto.meetingDate) meeting.meetingDate = new Date(dto.meetingDate);
    if (dto.agenda !== undefined) meeting.agenda = dto.agenda;
    if (dto.development !== undefined) meeting.development = dto.development;
    if (dto.status) meeting.status = dto.status;
    if (dto.attendees) meeting.attendees = dto.attendees;
    if (dto.topicList) meeting.topicList = dto.topicList;
    return period.save();
  }

  // ─────────────────────────────────────────────
  // COMMITMENTS
  // ─────────────────────────────────────────────
  async addCommitment(companyId: Types.ObjectId, periodId: string, dto: {
    description: string; responsibleParty: string;
    deadline: string; priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    meetingId?: string;
  }, email: string) {
    // F7B-10.6-D: query tenant-scoped (_id + companyId).
    const period = await this.findPeriodScoped(periodId, companyId);
    period.commitments.push({
      _id: new Types.ObjectId(),
      description: dto.description,
      responsibleParty: dto.responsibleParty,
      deadline: new Date(dto.deadline),
      priority: dto.priority,
      status: 'OPEN',
      meetingId: dto.meetingId,
      createdAt: new Date(),
    } as never);
    period.auditHistory.push({ action: 'ADD_COMMITMENT', createdBy: email, createdAt: new Date(), data: JSON.stringify(dto) });
    return period.save();
  }

  async updateCommitment(companyId: Types.ObjectId, periodId: string, commitmentId: string, dto: Partial<{
    description: string; responsibleParty: string;
    deadline: string; priority: string; status: string;
    evidenceUrl: string;
  }>, email: string) {
    // F7B-10.6-D: query tenant-scoped (_id + companyId).
    const period = await this.findPeriodScoped(periodId, companyId);
    const commitment = (period.commitments as any[]).find((c) => c._id?.toString() === commitmentId);
    if (!commitment) throw new NotFoundException('Compromiso no encontrado');
    if (dto.description !== undefined) commitment.description = dto.description;
    if (dto.responsibleParty !== undefined) commitment.responsibleParty = dto.responsibleParty;
    if (dto.deadline !== undefined) commitment.deadline = new Date(dto.deadline);
    if (dto.priority !== undefined) commitment.priority = dto.priority;
    if (dto.status !== undefined) {
      commitment.status = dto.status;
      if (dto.status === 'COMPLETED') commitment.completedAt = new Date();
    }
    if (dto.evidenceUrl !== undefined) commitment.evidenceUrl = dto.evidenceUrl;
    commitment.updatedAt = new Date();
    period.auditHistory.push({ action: 'UPDATE_COMMITMENT', createdBy: email, createdAt: new Date(), data: JSON.stringify(dto) });
    return period.save();
  }

  // ─────────────────────────────────────────────
  // EVIDENCE
  // ─────────────────────────────────────────────
  async addEvidence(companyId: Types.ObjectId, periodId: string, dto: {
    type: string; title: string; fileName: string; fileUrl: string;
    meetingId?: string;
  }, email: string) {
    // F7B-10.6-D: query tenant-scoped (_id + companyId).
    const period = await this.findPeriodScoped(periodId, companyId);
    period.evidence.push({
      _id: new Types.ObjectId(),
      type: dto.type as any,
      title: dto.title,
      fileName: dto.fileName,
      fileUrl: dto.fileUrl,
      uploadedBy: email,
      uploadedAt: new Date(),
      meetingId: dto.meetingId,
    } as never);
    period.auditHistory.push({ action: 'ADD_EVIDENCE', createdBy: email, createdAt: new Date(), data: JSON.stringify(dto) });
    return period.save();
  }

  async removeEvidence(companyId: Types.ObjectId, periodId: string, evidenceIndex: number, email: string) {
    // F7B-10.6-D: query tenant-scoped (_id + companyId).
    const period = await this.findPeriodScoped(periodId, companyId);
    const ev = period.evidence[evidenceIndex];
    if (!ev) throw new NotFoundException('Evidencia no encontrada');
    period.evidence.splice(evidenceIndex, 1);
    period.auditHistory.push({ action: 'REMOVE_EVIDENCE', createdBy: email, createdAt: new Date(), data: JSON.stringify(ev) });
    return period.save();
  }

  // ─────────────────────────────────────────────
  // APPROVAL WORKFLOW
  // ─────────────────────────────────────────────
  async submitForApproval(companyId: Types.ObjectId, periodId: string, email: string) {
    // F7B-10.6-D: query tenant-scoped (_id + companyId).
    const period = await this.findPeriodScoped(periodId, companyId);
    if (period.approvalStatus === 'PENDING_APPROVAL') {
      throw new BadRequestException('El módulo ya está pendiente de aprobación');
    }
    if (period.approvalStatus === 'APPROVED' || period.approvalStatus === 'APPROVED_AND_SIGNED') {
      throw new BadRequestException('El módulo ya está aprobado');
    }
    const currentVer = parseFloat(period.currentVersion || '1.0');
    period.currentVersion = (currentVer + 0.1).toFixed(1);
    period.approvalStatus = 'PENDING_APPROVAL';
    period.locked = true;
    period.submittedAt = new Date();

    // Notify managers
    const managers = await this.userModel.find({ companyId: period.companyId, role: 'manager', isActive: true }).exec();
    if (managers.length === 0) throw new BadRequestException('No existe un MANAGER asignado a esta empresa');
    await Promise.all(managers.map((mgr) =>
      this.alertsService.create({
        companyId: period.companyId.toString(),
        type: 'APPROVAL_REQUEST',
        message: `📋 Nueva solicitud de aprobación — Módulo: COPASST (1.1.6). Enviado por: ${email}. Fecha: ${new Date().toLocaleDateString()}.`,
        severity: AlertSeverity.HIGH,
        targetUserId: mgr._id.toString(),
        actionUrl: '/advanced-management/1.1.6?mode=review',
        moduleCode: '1.1.6',
        moduleName: 'COPASST Management',
        submittedBy: email,
        submittedAt: new Date().toISOString(),
      }).catch(() => {}),
    ));

    period.auditHistory.push({ action: 'SUBMIT_APPROVAL', createdBy: email, createdAt: new Date(), data: `v${period.currentVersion}` });
    return period.save();
  }

  async approve(companyId: Types.ObjectId, periodId: string, userEmail: string, role: string) {
    // F7B-10.6-D: query tenant-scoped (_id + companyId). El adapter del
    // Approval Workflow pasa ctx.companyId (verificado contra el periodo).
    const period = await this.findPeriodScoped(periodId, companyId);
    if (period.approvalStatus !== 'PENDING_APPROVAL') throw new BadRequestException('No está pendiente de aprobación');
    period.approvalStatus = 'APPROVED_AND_SIGNED';
    period.locked = true;
    period.approvedBy = { userId: '', email: userEmail, role, timestamp: new Date().toISOString() };
    period.auditHistory.push({ action: 'APPROVE', createdBy: userEmail, createdAt: new Date(), data: 'APPROVED_AND_SIGNED' });
    // Generate constitution minutes PDF (placeholder)
    period.constitutionMinutesPdfUrl = this.generateConstitutionMinutes(period);
    // Notify admins
    const admins = await this.userModel.find({ companyId: period.companyId, role: { $in: ['admin', 'owner'] }, isActive: true }).exec();
    await Promise.all(admins.map((admin) =>
      this.alertsService.create({
        companyId: period.companyId.toString(), type: 'COPASST_APPROVED',
        message: `✅ COPASST aprobado y firmado. Aprobado por: ${userEmail}.`,
        severity: AlertSeverity.HIGH,
      }).catch(() => {}),
    ));
    return period.save();
  }

  async reject(companyId: Types.ObjectId, periodId: string, reason: string, userEmail: string) {
    // F7B-10.6-D: query tenant-scoped (_id + companyId).
    const period = await this.findPeriodScoped(periodId, companyId);
    if (period.approvalStatus !== 'PENDING_APPROVAL') throw new BadRequestException('No está pendiente de aprobación');
    period.approvalStatus = 'REJECTED';
    period.locked = false;
    period.rejectionReason = reason;
    period.rejectedBy = { userId: '', email: userEmail, role: '', reason, timestamp: new Date().toISOString() };
    period.auditHistory.push({ action: 'REJECT', createdBy: userEmail, createdAt: new Date(), data: reason });
    // Notify admins
    const admins = await this.userModel.find({ companyId: period.companyId, role: { $in: ['admin', 'owner'] }, isActive: true }).exec();
    await Promise.all(admins.map((admin) =>
      this.alertsService.create({
        companyId: period.companyId.toString(), type: 'COPASST_REJECTED',
        message: `❌ COPASST rechazado. Rechazado por: ${userEmail}. Motivo: ${reason}.`,
        severity: AlertSeverity.HIGH,
      }).catch(() => {}),
    ));
    return period.save();
  }

  private generateConstitutionMinutes(period: CopasstPeriodDocument): string {
    const baseUrl = process.env.APP_BASE_URL ?? 'https://app.sgsst.com';
    return `${baseUrl}/copasst/${period._id}/minutes.pdf`;
  }

  // ─────────────────────────────────────────────
  // AUDIT HISTORY
  // ─────────────────────────────────────────────
  async getAuditHistory(companyId: Types.ObjectId, periodId: string) {
    // F7B-10.6-D: query tenant-scoped (_id + companyId).
    const period = await this.findPeriodScoped(periodId, companyId);
    return (period.auditHistory ?? []).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  // ─────────────────────────────────────────────
  // DASHBOARD / INDICATORS
  // ─────────────────────────────────────────────
  async getDashboard(companyId: Types.ObjectId) {
    const period = await this.periodModel.findOne({ companyId, status: { $ne: 'ARCHIVADO' } }).sort({ createdAt: -1 }).exec();
    if (!period) return null;
    const totalMeetings = period.meetings.length;
    const completedMeetings = period.meetings.filter((m) => m.status === 'CERRADA').length;
    const openCommitments = (period.commitments as any[]).filter((c) => c.status === 'OPEN' || c.status === 'IN_PROGRESS').length;
    const closedCommitments = (period.commitments as any[]).filter((c) => c.status === 'COMPLETED').length;
    const totalCommitments = period.commitments.length;
    const totalVotes = period.votesExtended.length;
    const totalEmployees = period.totalEmployees;
    const nextMeeting = period.meetings
      .filter((m) => m.status === 'PROGRAMADA')
      .sort((a, b) => a.meetingDate.getTime() - b.meetingDate.getTime())[0];
    return {
      committeeStatus: period.status,
      approvalStatus: period.approvalStatus,
      meetingCompletion: totalMeetings > 0 ? Math.round((completedMeetings / totalMeetings) * 100) : 0,
      pendingCommitments: openCommitments,
      closedCommitments,
      totalCommitments,
      participationRate: totalEmployees > 0 ? Math.round((totalVotes / totalEmployees) * 100) : 0,
      nextMeeting: nextMeeting ? { date: nextMeeting.meetingDate, agenda: nextMeeting.agenda } : null,
      totalMembers: period.members.length,
      periodName: period.periodName,
    };
  }

  // ─────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────
  private async refreshStatus(period: CopasstPeriodDocument) {
    const now = new Date();
    const thirty = new Date(now); thirty.setDate(thirty.getDate() + 30);
    if (period.endDate < now) period.status = 'VENCIDO';
    else if (period.endDate < thirty) period.status = 'PROXIMO_A_VENCER';
    else period.status = 'ACTIVO';
    if (period.status !== 'ACTIVO') {
      await this.alertsService.create({
        companyId: period.companyId.toString(), type: 'COPASST_EXPIRATION',
        message: `COPASST ${period.status.toLowerCase()}`,
        severity: AlertSeverity.MEDIUM,
      }).catch(() => {});
    }
    await period.save();
    return period;
  }
}
