import { IsString, IsNotEmpty, IsOptional, Length } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty({ message: 'Project name is required' })
  @Length(1, 100, { message: 'Project name must be between 1 and 100 characters' })
  name: string;

  @IsString()
  @IsOptional()
  @Length(0, 1000, { message: 'Description must be less than 1000 characters' })
  description?: string;
}

