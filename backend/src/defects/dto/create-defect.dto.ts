import { IsString, IsNotEmpty, IsOptional, IsInt, Min, Max, IsEnum, Length, IsArray, IsBoolean } from 'class-validator';
import { DefectStatus, DefectSource } from '@prisma/client';

export class CreateDefectDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 200, { message: 'Title must be between 1 and 200 characters' })
  title!: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 5000, { message: 'Description must be between 1 and 5000 characters' })
  description!: string;

  @IsEnum(DefectStatus)
  @IsOptional()
  status?: DefectStatus;

  @IsEnum(DefectSource)
  @IsOptional()
  source?: DefectSource;

  @IsInt()
  @Min(1, { message: 'Priority must be between 1 and 4' })
  @Max(4, { message: 'Priority must be between 1 and 4' })
  @IsOptional()
  priority?: number;

  @IsString()
  @IsNotEmpty({ message: 'PMC name is required' })
  pmcName!: string;

  @IsString()
  @IsOptional()
  locationName?: string;

  // Multiple locations for global defects (Admin, PM, QC only)
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  locationNames?: string[];

  @IsString()
  @IsOptional()
  assignedToId?: string;

  // Multiple assignees for global defects
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  assignedToIds?: string[];

  @IsBoolean()
  @IsOptional()
  isGlobal?: boolean;
}

