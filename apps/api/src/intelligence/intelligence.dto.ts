import { IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';

export const TASK_STATUSES = ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export class AssignTaskDto {
  @IsUUID('4')
  assigneeId!: string;
}

export class UpdateTaskStatusDto {
  @IsIn(TASK_STATUSES)
  status!: TaskStatus;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  note?: string;
}
