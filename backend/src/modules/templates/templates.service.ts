import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Template, TemplateDocument } from './schemas/template.schema';

@Injectable()
export class TemplatesService {
  constructor(
    @InjectModel(Template.name)
    private readonly templateModel: Model<TemplateDocument>,
  ) {}

  async create(payload: {
    companyId: Types.ObjectId;
    uploadedBy: Types.ObjectId;
    name: string;
    originalFileName: string;
    fileUrl: string;
    storagePath: string;
    variables: string[];
  }) {
    const created = new this.templateModel(payload);
    return created.save();
  }

  async findByCompany(companyId: Types.ObjectId) {
    return this.templateModel
      .find({ companyId })
      .populate('uploadedBy', 'email')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findByIdForCompany(templateId: string, companyId: Types.ObjectId) {
    const template = await this.templateModel.findOne({ _id: templateId, companyId }).exec();

    if (!template) {
      throw new NotFoundException(`Template with id ${templateId} not found`);
    }

    return template;
  }
}
