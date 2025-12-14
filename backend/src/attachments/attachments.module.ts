import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AttachmentsService } from './attachments.service';
import { AttachmentsController } from './attachments.controller';
import { AVScannerService } from '../common/services/av-scanner.service';

@Module({
  imports: [
    MulterModule.register({
      storage: memoryStorage(),
    }),
  ],
  controllers: [AttachmentsController],
  providers: [AttachmentsService, AVScannerService],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}

