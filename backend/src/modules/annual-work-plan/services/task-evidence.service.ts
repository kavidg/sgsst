import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TaskEvidence, TaskEvidenceDocument } from '../schemas/task-evidence.schema';

@Injectable()
export class TaskEvidenceService {
  constructor(
    @InjectModel(TaskEvidence.name)
    private readonly evidenceModel: Model<TaskEvidenceDocument>,
  ) {}

  async create(
    taskId: Types.ObjectId,
    fileUrl: string,
    fileType: string,
    uploadedBy: Types.ObjectId,
  ): Promise<TaskEvidence> {
    return this.evidenceModel.create({
      taskId,
      fileUrl,
      fileType,
      uploadedBy,
      uploadDate: new Date(),
    });
  }

  async findByTask(taskId: Types.ObjectId): Promise<TaskEvidence[]> {
    return this.evidenceModel.find({ taskId }).sort({ uploadDate: -1 }).exec();
  }

  async findOne(id: Types.ObjectId): Promise<TaskEvidence> {
    const evidence = await this.evidenceModel.findById(id).exec();
    if (!evidence) throw new NotFoundException('Evidence not found');
    return evidence;
  }

  async remove(id: Types.ObjectId): Promise<void> {
    const result = await this.evidenceModel.findByIdAndDelete(id).exec();
    if (!result) throw new NotFoundException('Evidence not found');
  }
}
