import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  DocumentTemplate,
  DocumentTemplateDocument,
} from '../schemas/document-template.schema';
import { StorageService } from './storage.service';
import {
  DocumentTemplateSource,
  DocumentTemplateType,
} from '../types/document-generation.types';
import { RendererFormat } from '../types/renderer.types';
import {
  buildResponsibleSgsstTemplateDocx,
  RESPONSIBLE_SG_SST_TEMPLATE_VARIABLES,
} from '../system-templates/responsible-sgsst.template';

/**
 * Versión de CONTENIDO de la plantilla del Responsable del SG-SST (PHVA 1.1.1).
 *
 * Fase 8.3.D — la detección de deriva compara el set de variables almacenado y
 * esta constante de contenido. Si en una fase futura cambia SOLO el cuerpo del
 * DOCX (sin añadir/remover variables), se incrementa esta constante para que la
 * plantilla se regenere en los despliegues existentes.
 */
export const RESPONSIBLE_SG_SST_TEMPLATE_CONTENT_VERSION = 2;
import {
  buildCopasstTemplateDocx,
  COPASST_TEMPLATE_VARIABLES,
} from '../system-templates/copasst.template';
import {
  buildResponsibilitiesTemplateDocx,
  RESPONSIBILITIES_TEMPLATE_VARIABLES,
} from '../system-templates/responsibilities.template';
import {
  buildResourceAssignmentTemplateDocx,
  RESOURCE_ASSIGNMENT_TEMPLATE_VARIABLES,
} from '../system-templates/resource-assignment.template';
import {
  buildSstPolicyTemplateDocx,
  SST_POLICY_TEMPLATE_VARIABLES,
} from '../system-templates/sst-policy.template';
import {
  buildCopasstTrainingAttendanceDocx,
  buildCopasstTrainingCertificateDocx,
  buildCopasstTrainingComplianceDocx,
  buildCopasstTrainingReportDocx,
  COPASST_TRAINING_ATTENDANCE_VARIABLES,
  COPASST_TRAINING_CERTIFICATE_VARIABLES,
  COPASST_TRAINING_COMPLIANCE_VARIABLES,
  COPASST_TRAINING_REPORT_VARIABLES,
} from '../system-templates/copasst-training.templates';
import {
  buildConvivenciaComplianceDocx,
  buildConvivenciaConstitutionDocx,
  CONVIVENCIA_COMPLIANCE_VARIABLES,
  CONVIVENCIA_TEMPLATE_VARIABLES,
} from '../system-templates/convivencia.template';

/**
 * SystemTemplateService: gestiona las plantillas de sistema del Document
 * Generation Engine.
 *
 * Fase 2 — primer documento formal del sistema: el Responsable del SG-SST
 * (PHVA 1.1.1). La plantilla de sistema es GLOBAL (source: SYSTEM, sin
 * companyId) y se crea find-or-create la primera vez que se solicita. El DOCX
 * base se construye en memoria (buildResponsibleSgsstTemplateDocx) y se sube a
 * Firebase Storage con el StorageService centralizado.
 *
 * Las plantillas de sistema NO pertenecen a ninguna empresa: el RendererService
 * las descarga por storageUrl y reemplaza las variables del contexto de la
 * empresa al generar la instancia documental.
 */
@Injectable()
export class SystemTemplateService {
  constructor(
    @InjectModel(DocumentTemplate.name)
    private readonly templateModel: Model<DocumentTemplateDocument>,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Devuelve la plantilla de sistema del Responsable del SG-SST (PHVA 1.1.1),
   * creándola (y subiendo su DOCX base) la primera vez.
   *
   * Fase 8.3.D — el documento oficial se completó (licencia, formación,
   * designación, evidencias y cumplimiento). Para que los despliegues que ya
   * crearon la plantilla con la versión anterior obtengan el contenido nuevo
   * sin migración manual, se detecta la deriva del set de variables: si la
   * plantilla almacenada no coincide con RESPONSIBLE_SG_SST_TEMPLATE_VARIABLES,
   * se regenera el DOCX base, se re-suben los bytes y se sube la versión de la
   * plantilla (misma fila, sin duplicar).
   */
  async ensureResponsibleSgsstTemplate(): Promise<DocumentTemplateDocument> {
    const existing = await this.templateModel
      .findOne({
        documentType: DocumentTemplateType.PHVA_RESPONSIBLE_SG_SST,
        source: DocumentTemplateSource.SYSTEM,
        active: true,
        companyId: { $exists: false },
      })
      .exec();

    if (existing) {
      const stored = JSON.stringify(existing.variables ?? []);
      const expected = JSON.stringify(RESPONSIBLE_SG_SST_TEMPLATE_VARIABLES);
      const contentUpToDate =
        stored === expected &&
        (existing.version ?? 1) >= RESPONSIBLE_SG_SST_TEMPLATE_CONTENT_VERSION;
      if (contentUpToDate) {
        return existing;
      }

      // Deriva de contenido (variables o versión de contenido): regenera el
      // DOCX base y actualiza la misma fila.
      const refreshedDocx = buildResponsibleSgsstTemplateDocx();
      const upload = await this.storageService.upload(
        refreshedDocx,
        'responsable-sgsst-template.docx',
        'system-templates/phva-advanced',
      );
      existing.variables = [...RESPONSIBLE_SG_SST_TEMPLATE_VARIABLES];
      existing.storageUrl = upload.storagePath;
      existing.version = RESPONSIBLE_SG_SST_TEMPLATE_CONTENT_VERSION;
      return existing.save();
    }

    const docxBuffer = buildResponsibleSgsstTemplateDocx();
    const upload = await this.storageService.upload(
      docxBuffer,
      'responsable-sgsst-template.docx',
      'system-templates/phva-advanced',
    );

    return this.templateModel.create({
      name: 'Responsable del SG-SST (PHVA 1.1.1)',
      description:
        'Documento formal del Responsable del SG-SST según Resolución 0312 de 2019.',
      documentType: DocumentTemplateType.PHVA_RESPONSIBLE_SG_SST,
      format: RendererFormat.DOCX,
      source: DocumentTemplateSource.SYSTEM,
      variables: RESPONSIBLE_SG_SST_TEMPLATE_VARIABLES,
      storageUrl: upload.storagePath,
      version: RESPONSIBLE_SG_SST_TEMPLATE_CONTENT_VERSION,
      active: true,
    });
  }

  /**
   * Devuelve la plantilla de sistema del COPASST (Fase 3), creándola (y
   * subiendo su DOCX base) la primera vez. Reutiliza el patrón find-or-create
   * de ensureResponsibleSgsstTemplate.
   */
  async ensureCopasstTemplate(): Promise<DocumentTemplateDocument> {
    const existing = await this.templateModel
      .findOne({
        documentType: DocumentTemplateType.PHVA_COPASST,
        source: DocumentTemplateSource.SYSTEM,
        active: true,
        companyId: { $exists: false },
      })
      .exec();

    if (existing) {
      return existing;
    }

    const docxBuffer = buildCopasstTemplateDocx();
    const upload = await this.storageService.upload(
      docxBuffer,
      'copasst-template.docx',
      'system-templates/phva-advanced',
    );

    return this.templateModel.create({
      name: 'Conformación del COPASST',
      description:
        'Acta de conformación del Comité Paritario de Seguridad y Salud en el Trabajo (COPASST).',
      documentType: DocumentTemplateType.PHVA_COPASST,
      format: RendererFormat.DOCX,
      source: DocumentTemplateSource.SYSTEM,
      variables: COPASST_TEMPLATE_VARIABLES,
      storageUrl: upload.storagePath,
      version: 1,
      active: true,
    });
  }

  /**
   * Devuelve la plantilla de sistema de la Matriz de Responsabilidades del
   * SG-SST (PHVA 1.1.2), creándola (y subiendo su DOCX base) la primera vez.
   * Reutiliza el patrón find-or-create de ensureResponsibleSgsstTemplate.
   */
  async ensureResponsibilitiesTemplate(): Promise<DocumentTemplateDocument> {
    const existing = await this.templateModel
      .findOne({
        documentType: DocumentTemplateType.PHVA_RESPONSIBILITIES,
        source: DocumentTemplateSource.SYSTEM,
        active: true,
        companyId: { $exists: false },
      })
      .exec();

    if (existing) {
      return existing;
    }

    const docxBuffer = buildResponsibilitiesTemplateDocx();
    const upload = await this.storageService.upload(
      docxBuffer,
      'responsibilities-template.docx',
      'system-templates/phva-advanced',
    );

    return this.templateModel.create({
      name: 'Matriz de Responsabilidades del SG-SST (PHVA 1.1.2)',
      description:
        'Matriz de Responsabilidades del SG-SST según Resolución 0312 de 2019.',
      documentType: DocumentTemplateType.PHVA_RESPONSIBILITIES,
      format: RendererFormat.DOCX,
      source: DocumentTemplateSource.SYSTEM,
      variables: RESPONSIBILITIES_TEMPLATE_VARIABLES,
      storageUrl: upload.storagePath,
      version: 1,
      active: true,
    });
  }

  /**
   * Devuelve la plantilla de sistema de la Asignación de Recursos para el
   * SG-SST (PHVA 1.1.3), creándola (y subiendo su DOCX base) la primera vez.
   * Reutiliza el patrón find-or-create de ensureResponsibleSgsstTemplate.
   */
  async ensureResourceAssignmentTemplate(): Promise<DocumentTemplateDocument> {
    const existing = await this.templateModel
      .findOne({
        documentType: DocumentTemplateType.PHVA_RESOURCE_ASSIGNMENT,
        source: DocumentTemplateSource.SYSTEM,
        active: true,
        companyId: { $exists: false },
      })
      .exec();

    if (existing) {
      return existing;
    }

    const docxBuffer = buildResourceAssignmentTemplateDocx();
    const upload = await this.storageService.upload(
      docxBuffer,
      'resource-assignment-template.docx',
      'system-templates/phva-advanced',
    );

    return this.templateModel.create({
      name: 'Asignación de Recursos para el SG-SST (PHVA 1.1.3)',
      description:
        'Asignación de Recursos para el SG-SST según Resolución 0312 de 2019.',
      documentType: DocumentTemplateType.PHVA_RESOURCE_ASSIGNMENT,
      format: RendererFormat.DOCX,
      source: DocumentTemplateSource.SYSTEM,
      variables: RESOURCE_ASSIGNMENT_TEMPLATE_VARIABLES,
      storageUrl: upload.storagePath,
      version: 1,
      active: true,
    });
  }

  /**
   * Devuelve la plantilla de sistema de la Política de Seguridad y Salud en
   * el Trabajo (PHVA 2.1.1), creándola (y subiendo su DOCX base) la primera
   * vez. Reutiliza el patrón find-or-create de ensureResponsibleSgsstTemplate.
   */
  async ensureSstPolicyTemplate(): Promise<DocumentTemplateDocument> {
    const existing = await this.templateModel
      .findOne({
        documentType: DocumentTemplateType.PHVA_SST_POLICY,
        source: DocumentTemplateSource.SYSTEM,
        active: true,
        companyId: { $exists: false },
      })
      .exec();

    if (existing) {
      return existing;
    }

    const docxBuffer = buildSstPolicyTemplateDocx();
    const upload = await this.storageService.upload(
      docxBuffer,
      'sst-policy-template.docx',
      'system-templates/phva-advanced',
    );

    return this.templateModel.create({
      name: 'Política de Seguridad y Salud en el Trabajo (PHVA 2.1.1)',
      description:
        'Política de Seguridad y Salud en el Trabajo según Resolución 0312 de 2019.',
      documentType: DocumentTemplateType.PHVA_SST_POLICY,
      format: RendererFormat.DOCX,
      source: DocumentTemplateSource.SYSTEM,
      variables: SST_POLICY_TEMPLATE_VARIABLES,
      storageUrl: upload.storagePath,
      version: 1,
      active: true,
    });
  }

  /**
   * Devuelve la plantilla de sistema del Certificado de capacitación COPASST
   * (PHVA 1.1.7), creándola (y subiendo su DOCX base) la primera vez.
   * Reutiliza el patrón find-or-create de ensureResponsibleSgsstTemplate.
   */
  async ensureCopasstTrainingCertificateTemplate(): Promise<DocumentTemplateDocument> {
    return this.ensureCopasstTrainingTemplate({
      documentType: DocumentTemplateType.PHVA_COPASST_TRAINING,
      name: 'Certificado de capacitación COPASST (PHVA 1.1.7)',
      description:
        'Certificado de capacitación de un integrante del COPASST según el estándar 1.1.7.',
      variables: COPASST_TRAINING_CERTIFICATE_VARIABLES,
      buildDocx: buildCopasstTrainingCertificateDocx,
      filename: 'copasst-training-certificate-template.docx',
    });
  }

  /**
   * Devuelve la plantilla de sistema de la Lista de asistencia por sesión de
   * la Capacitación COPASST (PHVA 1.1.7), creándola la primera vez.
   */
  async ensureCopasstTrainingAttendanceTemplate(): Promise<DocumentTemplateDocument> {
    return this.ensureCopasstTrainingTemplate({
      documentType: DocumentTemplateType.PHVA_COPASST_TRAINING,
      name: 'Lista de asistencia — Capacitación COPASST (PHVA 1.1.7)',
      description:
        'Lista de asistencia de una sesión de capacitación del COPASST (estándar 1.1.7).',
      variables: COPASST_TRAINING_ATTENDANCE_VARIABLES,
      buildDocx: buildCopasstTrainingAttendanceDocx,
      filename: 'copasst-training-attendance-template.docx',
    });
  }

  /**
   * Devuelve la plantilla de sistema del Informe de capacitación COPASST
   * (PHVA 1.1.7), creándola la primera vez.
   */
  async ensureCopasstTrainingReportTemplate(): Promise<DocumentTemplateDocument> {
    return this.ensureCopasstTrainingTemplate({
      documentType: DocumentTemplateType.PHVA_COPASST_TRAINING,
      name: 'Informe de capacitación COPASST (PHVA 1.1.7)',
      description:
        'Informe documental de la capacitación de los integrantes del COPASST (estándar 1.1.7).',
      variables: COPASST_TRAINING_REPORT_VARIABLES,
      buildDocx: buildCopasstTrainingReportDocx,
      filename: 'copasst-training-report-template.docx',
    });
  }

  /**
   * Devuelve la plantilla de sistema del Reporte de cumplimiento de la
   * Capacitación COPASST (PHVA 1.1.7), creándola la primera vez.
   */
  async ensureCopasstTrainingComplianceTemplate(): Promise<DocumentTemplateDocument> {
    return this.ensureCopasstTrainingTemplate({
      documentType: DocumentTemplateType.PHVA_COPASST_TRAINING,
      name: 'Reporte de cumplimiento — Capacitación COPASST (PHVA 1.1.7)',
      description:
        'Reporte de cumplimiento de la capacitación del COPASST (estándar 1.1.7). Consume el estado actual del dominio.',
      variables: COPASST_TRAINING_COMPLIANCE_VARIABLES,
      buildDocx: buildCopasstTrainingComplianceDocx,
      filename: 'copasst-training-compliance-template.docx',
    });
  }

  /**
   * Devuelve la plantilla de sistema del Acta de conformación del Comité de
   * Convivencia (PHVA 1.1.8, Fase 5), creándola (y subiendo su DOCX base) la
   * primera vez. Reutiliza el patrón find-or-create del motor.
   */
  async ensureConvivenciaConstitutionTemplate(): Promise<DocumentTemplateDocument> {
    return this.ensureConvivenciaTemplate({
      documentType: DocumentTemplateType.PHVA_CONVIVENCIA,
      name: 'Acta de conformación del Comité de Convivencia (PHVA 1.1.8)',
      description:
        'Acta de conformación del Comité de Convivencia Laboral según el estándar 1.1.8.',
      variables: CONVIVENCIA_TEMPLATE_VARIABLES,
      buildDocx: buildConvivenciaConstitutionDocx,
      filename: 'convivencia-constitution-template.docx',
    });
  }

  /**
   * Devuelve la plantilla de sistema del Reporte de cumplimiento del Comité
   * de Convivencia (PHVA 1.1.8, Fase 5), creándola la primera vez.
   */
  async ensureConvivenciaComplianceTemplate(): Promise<DocumentTemplateDocument> {
    return this.ensureConvivenciaTemplate({
      documentType: DocumentTemplateType.PHVA_CONVIVENCIA,
      name: 'Reporte de cumplimiento — Comité de Convivencia (PHVA 1.1.8)',
      description:
        'Reporte de cumplimiento del Comité de Convivencia Laboral (estándar 1.1.8). Consume el snapshot del dominio.',
      variables: CONVIVENCIA_COMPLIANCE_VARIABLES,
      buildDocx: buildConvivenciaComplianceDocx,
      filename: 'convivencia-compliance-template.docx',
    });
  }

  /**
   * Carga una plantilla de sistema por id validando que sea SYSTEM (no se
   * permite resolver plantillas de empresa por este acceso).
   */
  /**
   * Implementación compartida find-or-create de las plantillas de la
   * Capacitación COPASST (PHVA 1.1.7, Fase 4). Todas comparten el mismo
   * documentType PHVA_COPASST_TRAINING, por lo que la distinción real entre
   * certificado / asistencia / informe / cumplimiento se hace por `name`
   * (nombre de plantilla único, usado también como clave de find-or-create).
   */
  private async ensureCopasstTrainingTemplate(params: {
    documentType: DocumentTemplateType;
    name: string;
    description: string;
    variables: string[];
    buildDocx: () => Buffer;
    filename: string;
  }): Promise<DocumentTemplateDocument> {
    const existing = await this.templateModel
      .findOne({
        name: params.name,
        documentType: params.documentType,
        source: DocumentTemplateSource.SYSTEM,
        active: true,
        companyId: { $exists: false },
      })
      .exec();

    if (existing) {
      return existing;
    }

    const docxBuffer = params.buildDocx();
    const upload = await this.storageService.upload(
      docxBuffer,
      params.filename,
      'system-templates/phva-advanced',
    );

    return this.templateModel.create({
      name: params.name,
      description: params.description,
      documentType: params.documentType,
      format: RendererFormat.DOCX,
      source: DocumentTemplateSource.SYSTEM,
      variables: params.variables,
      storageUrl: upload.storagePath,
      version: 1,
      active: true,
    });
  }

  /**
   * Implementación compartida find-or-create de las plantillas del Comité de
   * Convivencia (PHVA 1.1.8, Fase 5). Todas comparten el mismo documentType
   * PHVA_CONVIVENCIA, por lo que la distinción real entre acta y reporte se
   * hace por `name` (nombre de plantilla único, clave de find-or-create).
   */
  private async ensureConvivenciaTemplate(params: {
    documentType: DocumentTemplateType;
    name: string;
    description: string;
    variables: string[];
    buildDocx: () => Buffer;
    filename: string;
  }): Promise<DocumentTemplateDocument> {
    const existing = await this.templateModel
      .findOne({
        name: params.name,
        documentType: params.documentType,
        source: DocumentTemplateSource.SYSTEM,
        active: true,
        companyId: { $exists: false },
      })
      .exec();

    if (existing) {
      return existing;
    }

    const docxBuffer = params.buildDocx();
    const upload = await this.storageService.upload(
      docxBuffer,
      params.filename,
      'system-templates/convivencia',
    );

    return this.templateModel.create({
      name: params.name,
      description: params.description,
      documentType: params.documentType,
      format: RendererFormat.DOCX,
      source: DocumentTemplateSource.SYSTEM,
      variables: params.variables,
      storageUrl: upload.storagePath,
      version: 1,
      active: true,
    });
  }

  /**
   * Carga una plantilla de sistema por id validando que sea SYSTEM (no se
   * permite resolver plantillas de empresa por este acceso).
   */
  async getSystemTemplateById(templateId: string): Promise<DocumentTemplateDocument> {
    const template = await this.templateModel
      .findById(new Types.ObjectId(templateId))
      .exec();

    if (!template || template.source !== DocumentTemplateSource.SYSTEM) {
      throw new NotFoundException('System template not found');
    }

    return template;
  }
}
