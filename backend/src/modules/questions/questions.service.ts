import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { Question, QuestionDocument } from './schemas/question.schema';

@Injectable()
export class QuestionsService {
  constructor(
    @InjectModel(Question.name)
    private readonly questionModel: Model<QuestionDocument>,
  ) {}

  async create(createQuestionDto: CreateQuestionDto): Promise<Question> {
    const createdQuestion = new this.questionModel(createQuestionDto);
    return createdQuestion.save();
  }

  async findAll(): Promise<Question[]> {
    return this.questionModel.find().sort({ order: 1 }).exec();
  }

  async findOne(id: string): Promise<Question> {
    const question = await this.questionModel.findById(id).exec();

    if (!question) {
      throw new NotFoundException(`Question with id ${id} not found`);
    }

    return question;
  }

  async update(id: string, updateQuestionDto: UpdateQuestionDto): Promise<Question> {
    const question = await this.questionModel
      .findByIdAndUpdate(id, updateQuestionDto, { new: true, runValidators: true })
      .exec();

    if (!question) {
      throw new NotFoundException(`Question with id ${id} not found`);
    }

    return question;
  }

  async remove(id: string): Promise<void> {
    const deletedQuestion = await this.questionModel.findByIdAndDelete(id).exec();

    if (!deletedQuestion) {
      throw new NotFoundException(`Question with id ${id} not found`);
    }
  }

  async findByCategory(category: string): Promise<Question[]> {
    return this.questionModel.find({ category, active: true }).sort({ order: 1 }).exec();
  }

  async seedSampleQuestions(): Promise<Question[]> {
    const sampleQuestions: CreateQuestionDto[] = [
      {
        code: '1.1.1',
        question: 'Existe responsable del SG-SST',
        category: 'Planear',
        maxScore: 10,
        order: 1,
      },
      {
        code: '1.1.2',
        question: 'Existe política de Seguridad y Salud en el Trabajo',
        category: 'Planear',
        maxScore: 10,
        order: 2,
      },
    ];

    const operations = sampleQuestions.map((item) => ({
      updateOne: {
        filter: { code: item.code },
        update: { $setOnInsert: { ...item, active: true } },
        upsert: true,
      },
    }));

    await this.questionModel.bulkWrite(operations);

    return this.questionModel.find({ code: { $in: sampleQuestions.map((item) => item.code) } }).sort({ order: 1 }).exec();
  }
}
