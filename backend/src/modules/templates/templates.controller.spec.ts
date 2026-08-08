import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Types } from 'mongoose';

import { RequestWithUser } from '../auth/auth.types';
import { FirebaseAdminService } from '../auth/firebase-admin.service';
import { UsersService } from '../users/users.service';
import { DocumentGenerationService } from '../document-generation/services/document-generation.service';
import { StorageService } from '../document-generation/services/storage.service';
import { DocumentSourceModule } from '../document-generation/types/renderer.types';
import { DocumentGenerationRequest } from '../document-generation/types/document-generation.types';
import { GenerateTemplateDto } from './dto/generate-template.dto';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';

const COMPANY_ID = '64b000000000000000000001';
const USER_ID = '64b000000000000000000002';
const TEMPLATE_ID = '64b000000000000000000003';

/** Mock de la respuesta HTTP usada por el endpoint (setHeader + send). */
function buildResponse(): {
  headers: Record<string, string>;
  sent: Buffer | null;
  setHeader(name: string, value: string): void;
  send(body: Buffer): void;
} {
  const headers: Record<string, string> = {};
  let sent: Buffer | null = null;

  return {
    headers,
    get sent() {
      return sent;
    },
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
    send(body: Buffer) {
      sent = body;
    },
  };
}

describe('TemplatesController.generate (migrado al Document Generation Engine)', () => {
  function buildController(overrides?: {
    generated?: { instanceId: Types.ObjectId; fileUrl: string; storagePath: string; version: number };
    buffer?: Buffer;
  }): {
    controller: TemplatesController;
    generateDocumentCalls: DocumentGenerationRequest[];
  } {
    const generateDocumentCalls: DocumentGenerationRequest[] = [];

    const documentGenerationService = {
      generateDocument: async (request: DocumentGenerationRequest) => {
        generateDocumentCalls.push(request);
        return (
          overrides?.generated ?? {
            instanceId: new Types.ObjectId(),
            fileUrl: 'https://storage.googleapis.com/bucket/document-generation/company/doc.docx',
            storagePath: 'document-generation/company/123-doc.docx',
            version: 1,
          }
        );
      },
    } as unknown as DocumentGenerationService;
    const storageService = {
      download: async () => overrides?.buffer ?? Buffer.from('generated-docx'),
    } as unknown as StorageService;
    const usersService = {
      findByFirebaseUid: async () => ({
        _id: new Types.ObjectId(USER_ID),
        companyId: new Types.ObjectId(COMPANY_ID),
      }),
    } as unknown as UsersService;

    const controller = new TemplatesController(
      {} as unknown as TemplatesService,
      usersService,
      {} as unknown as FirebaseAdminService,
      documentGenerationService,
      storageService,
    );

    return { controller, generateDocumentCalls };
  }

  it('delega la generación en DocumentGenerationService con sourceModule TEMPLATES', async () => {
    const { controller, generateDocumentCalls } = buildController();
    const response = buildResponse();
    const request: RequestWithUser = {
      headers: {},
      user: { uid: 'firebase-uid' },
    };
    const body: GenerateTemplateDto = { data: { companyName: 'ABC' } };

    await controller.generate(request, TEMPLATE_ID, body, response);

    assert.equal(generateDocumentCalls.length, 1);
    const call = generateDocumentCalls[0];
    assert.equal(call.companyId.toString(), COMPANY_ID);
    assert.equal(call.templateId, TEMPLATE_ID);
    assert.equal(call.sourceModule, DocumentSourceModule.TEMPLATES);
    assert.deepEqual(call.context, { companyName: 'ABC' });
    assert.equal(call.generatedBy?.toString(), USER_ID);
  });

  it('mantiene la respuesta DOCX (Content-Type, Content-Disposition y buffer)', async () => {
    const { controller } = buildController();
    const response = buildResponse();
    const request: RequestWithUser = {
      headers: {},
      user: { uid: 'firebase-uid' },
    };
    const body: GenerateTemplateDto = { data: {} };

    await controller.generate(request, TEMPLATE_ID, body, response);

    assert.equal(
      response.headers['Content-Type'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    assert.match(response.headers['Content-Disposition'], /^attachment; filename=".*\.docx"$/);
    assert.ok(response.sent);
    assert.equal(response.sent?.toString(), 'generated-docx');
  });
});
