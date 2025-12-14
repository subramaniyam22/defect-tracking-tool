import { IsString, IsOptional } from 'class-validator';

export class GenerateInsightsDto {
  @IsString()
  @IsOptional()
  scope?: string;
}

