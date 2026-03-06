import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateDocumentDto } from './dto/create-document.dto';
import { Document, DocumentDocument } from './schemas/document.schema';

@Injectable()
export class DocumentsService {
  constructor(
    @InjectModel(Document.name)
    private readonly documentModel: Model<DocumentDocument>,
  ) {}

  async create(companyId: Types.ObjectId, uploadedBy: Types.ObjectId, dto: CreateDocumentDto, fileUrl: string) {
    const created = new this.documentModel({
      companyId,
      uploadedBy,
      name: dto.name,
      type: dto.type ?? 'general',
      fileUrl,
    });

    return created.save();
  }

  async findAll(companyId: Types.ObjectId) {
    return this.documentModel
      .find({ companyId })
      .populate('uploadedBy', 'email')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(id: string, companyId: Types.ObjectId) {
    const document = await this.documentModel
      .findOne({ _id: id, companyId })
      .populate('uploadedBy', 'email')
      .exec();

    if (!document) {
      throw new NotFoundException(`Document with id ${id} not found`);
    }

    return document;
  }

  async remove(id: string, companyId: Types.ObjectId): Promise<void> {
    const deletedDocument = await this.documentModel.findOneAndDelete({ _id: id, companyId }).exec();

    if (!deletedDocument) {
      throw new NotFoundException(`Document with id ${id} not found`);
    }
  }
}
