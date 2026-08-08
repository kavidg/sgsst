import { FindingPriority } from '../enums/finding-priority.enum';

/**
 * Hallazgo detectado por el Compliance Intelligence Engine.
 */
export class FindingDto {
  id!: string;
  module!: string;
  title!: string;
  description!: string;
  priority!: FindingPriority;
  status!: string;
  responsible!: string;
  dueDate!: string;
  createdAt!: string;
}
