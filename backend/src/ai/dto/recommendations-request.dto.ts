import { IsString, IsNotEmpty } from 'class-validator';

export class RecommendationsRequestDto {
  @IsString()
  @IsNotEmpty()
  defectId!: string;
}

