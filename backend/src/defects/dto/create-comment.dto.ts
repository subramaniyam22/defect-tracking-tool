import { IsString, IsNotEmpty, Length } from 'class-validator';

export class CreateCommentDto {
  @IsString()
  @IsNotEmpty({ message: 'Comment cannot be empty' })
  @Length(1, 2000, { message: 'Comment must be between 1 and 2000 characters' })
  content!: string;
}

