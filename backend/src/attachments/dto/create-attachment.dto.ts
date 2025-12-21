import { IsString, IsNotEmpty, IsInt, Min } from 'class-validator';

export class CreateAttachmentDto {
  @IsString()
  @IsNotEmpty()
  filename!: string;

  @IsString()
  @IsNotEmpty()
  fileKey!: string;

  @IsInt()
  @Min(0)
  fileSize!: number;

  @IsString()
  @IsNotEmpty()
  mimeType!: string;
}

