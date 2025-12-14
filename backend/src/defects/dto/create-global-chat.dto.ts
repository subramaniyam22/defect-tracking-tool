import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';

export enum GlobalChatType {
  MESSAGE = 'MESSAGE',
  STATUS_UPDATE = 'STATUS_UPDATE',
  NOTIFICATION = 'NOTIFICATION',
}

export class CreateGlobalChatDto {
  @IsString()
  @IsNotEmpty()
  message: string;

  @IsEnum(GlobalChatType)
  @IsOptional()
  messageType?: GlobalChatType;
}

