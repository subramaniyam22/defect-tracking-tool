import { IsOptional, IsString, IsDateString, IsEnum } from 'class-validator';
import { DefectStatus } from '@prisma/client';

export class MetricsQueryDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  pmcName?: string;

  @IsOptional()
  @IsString()
  assignedToId?: string;

  @IsOptional()
  @IsEnum(DefectStatus)
  status?: DefectStatus;

  @IsOptional()
  @IsString()
  type?: string; // Priority level as type: 1, 2, 3, 4
}

