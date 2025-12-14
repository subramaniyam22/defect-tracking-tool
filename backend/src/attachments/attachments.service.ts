import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAttachmentDto } from './dto/create-attachment.dto';
import { AVScannerService } from '../common/services/av-scanner.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class AttachmentsService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private avScanner: AVScannerService,
  ) {}

  async createPresignedUploadUrl(
    defectId: string,
    filename: string,
    mimeType: string,
    fileSize: number,
    userId: string,
  ) {
    // Verify defect exists
    const defect = await this.prisma.defect.findUnique({
      where: { id: defectId },
    });

    if (!defect) {
      throw new NotFoundException(`Defect with ID ${defectId} not found`);
    }

    // Generate a unique file key
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 15);
    const fileExtension = filename.split('.').pop();
    const fileKey = `defects/${defectId}/${timestamp}-${randomStr}.${fileExtension}`;

    // For now, return a simple upload URL structure
    // In production, this would integrate with S3 or similar storage
    const baseUrl = this.configService.get<string>('STORAGE_BASE_URL') || 'http://localhost:3000';
    const uploadUrl = `${baseUrl}/api/attachments/upload/${fileKey}`;

    // Store attachment metadata (file will be uploaded separately)
    const attachment = await this.prisma.attachment.create({
      data: {
        filename,
        fileKey,
        fileSize,
        mimeType,
        defectId,
        uploadedById: userId,
      },
      include: {
        uploadedBy: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    return {
      attachment,
      uploadUrl,
      fileKey,
    };
  }

  async createPresignedDownloadUrl(attachmentId: string) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
    });

    if (!attachment) {
      throw new NotFoundException(`Attachment with ID ${attachmentId} not found`);
    }

    // For now, return a simple download URL
    // In production, this would generate a presigned S3 URL
    const baseUrl = this.configService.get<string>('STORAGE_BASE_URL') || 'http://localhost:3000';
    const downloadUrl = `${baseUrl}/api/attachments/download/${attachment.fileKey}`;

    return {
      attachment,
      downloadUrl,
      expiresIn: 3600, // 1 hour in seconds
    };
  }

  async findAllByDefect(defectId: string) {
    return this.prisma.attachment.findMany({
      where: { defectId },
      include: {
        uploadedBy: {
          select: {
            id: true,
            username: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id },
      include: {
        defect: {
          select: {
            id: true,
            title: true,
          },
        },
        uploadedBy: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    if (!attachment) {
      throw new NotFoundException(`Attachment with ID ${id} not found`);
    }

    return attachment;
  }

  async remove(id: string) {
    try {
      return await this.prisma.attachment.delete({
        where: { id },
      });
    } catch (error) {
      throw new NotFoundException(`Attachment with ID ${id} not found`);
    }
  }

  async confirmUpload(fileKey: string, defectId: string) {
    // This would be called after file upload is complete
    // For now, just verify the attachment exists
    const attachment = await this.prisma.attachment.findFirst({
      where: {
        fileKey,
        defectId,
      },
    });

    if (!attachment) {
      throw new NotFoundException(`Attachment with fileKey ${fileKey} not found`);
    }

    return attachment;
  }

  async uploadFiles(defectId: string, files: Express.Multer.File[], userId: string) {
    // Verify defect exists
    const defect = await this.prisma.defect.findUnique({
      where: { id: defectId },
    });

    if (!defect) {
      throw new NotFoundException(`Defect with ID ${defectId} not found`);
    }

    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided');
    }

    // Create uploads directory if it doesn't exist
    const uploadsDir = path.join(process.cwd(), 'uploads', 'defects', defectId);
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const attachments = [];

    for (const file of files) {
      // Generate unique file key
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 15);
      const fileExtension = file.originalname.split('.').pop();
      const fileKey = `defects/${defectId}/${timestamp}-${randomStr}.${fileExtension}`;

      // Save file to disk
      const filePath = path.join(uploadsDir, `${timestamp}-${randomStr}.${fileExtension}`);
      fs.writeFileSync(filePath, file.buffer);

      // Create attachment record
      const attachment = await this.prisma.attachment.create({
        data: {
          filename: file.originalname,
          fileKey,
          fileSize: file.size,
          mimeType: file.mimetype,
          defectId,
          uploadedById: userId,
        },
        include: {
          uploadedBy: {
            select: {
              id: true,
              username: true,
            },
          },
        },
      });

      attachments.push(attachment);
    }

    return attachments;
  }
}

