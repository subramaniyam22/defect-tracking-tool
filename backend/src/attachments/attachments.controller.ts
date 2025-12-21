import {
  Controller,
  Get,
  Post,
  Body,
  Delete,
  Param,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { AttachmentsService } from './attachments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('attachments')
@UseGuards(JwtAuthGuard)
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Post('presigned-upload')
  createPresignedUploadUrl(
    @Body() body: { defectId: string; filename: string; mimeType: string; fileSize: number },
    @Request() req: any,
  ) {
    return this.attachmentsService.createPresignedUploadUrl(
      body.defectId,
      body.filename,
      body.mimeType,
      body.fileSize,
      req.user.id,
    );
  }

  @Get(':id/presigned-download')
  getPresignedDownloadUrl(@Param('id') id: string) {
    return this.attachmentsService.createPresignedDownloadUrl(id);
  }

  @Get('defect/:defectId')
  findAllByDefect(@Param('defectId') defectId: string) {
    return this.attachmentsService.findAllByDefect(defectId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.attachmentsService.findOne(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.attachmentsService.remove(id);
  }

  @Post('confirm-upload')
  confirmUpload(@Body() body: { fileKey: string; defectId: string }) {
    return this.attachmentsService.confirmUpload(body.fileKey, body.defectId);
  }

  @Post('defect/:defectId')
  @UseInterceptors(FilesInterceptor('files', 10, {
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max per file
  }))
  async uploadFiles(
    @Param('defectId') defectId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Request() req: any,
  ) {
    return this.attachmentsService.uploadFiles(defectId, files, req.user.id);
  }
}

