import { IsString, IsOptional, IsInt, Min, Max, IsEnum, IsArray, IsBoolean } from 'class-validator';
import { DefectStatus, DefectSource } from '@prisma/client';

export class UpdateDefectDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(DefectStatus)
  @IsOptional()
  status?: DefectStatus;

  @IsEnum(DefectSource)
  @IsOptional()
  source?: DefectSource;

  @IsInt()
  @Min(1)
  @Max(4)
  @IsOptional()
  priority?: number;

  @IsString()
  @IsOptional()
  assignedToId?: string;

  @IsString()
  @IsOptional()
  pmcName?: string;

  @IsString()
  @IsOptional()
  locationName?: string;

  // Multiple locations for global defects (Admin, PM, QC only)
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  locationNames?: string[];

  // Multiple assignees for global defects
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  assignedToIds?: string[];

  @IsBoolean()
  @IsOptional()
  isGlobal?: boolean;
}

