import { IsString, IsNumber, IsObject, IsOptional, IsArray } from 'class-validator';

export class StoreInsightsDto {
  @IsString()
  scope: string;

  @IsString()
  @IsOptional()
  userId?: string;

  @IsString()
  @IsOptional()
  teamId?: string;

  @IsNumber()
  reopen_rate: number;

  @IsNumber()
  mean_time_to_fix: number;

  @IsObject()
  distributions: {
    status: Record<string, number>;
    priority: Record<string, number>;
    project: Record<string, number>;
  };

  @IsObject()
  clustering: {
    clusters: Array<{
      cluster_id: number;
      size: number;
      top_terms: string[];
      defect_ids: string[];
    }>;
    silhouette_score: number;
    n_clusters: number;
  };

  @IsString()
  @IsOptional()
  generated_at?: string;
}

