import {
  Controller,
  Post,
  Get,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { QCParametersService } from './qc-parameters.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { QCPhase } from '@prisma/client';
import { AVScannerService } from '../common/services/av-scanner.service';

@Controller('qc-parameters')
@UseGuards(JwtAuthGuard)
export class QCParametersController {
  constructor(
    private readonly qcParametersService: QCParametersService,
    private readonly avScanner: AVScannerService,
  ) {}

  @Post('upload')
  @Roles(Role.ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    if (
      !file.mimetype.includes('spreadsheet') &&
      !file.mimetype.includes('excel') &&
      !file.originalname.endsWith('.xlsx')
    ) {
      throw new BadRequestException('File must be an Excel (.xlsx) file');
    }

    // AV scan
    const scanResult = await this.avScanner.scanFile(file);
    if (!scanResult.clean) {
      throw new BadRequestException(`File rejected: ${scanResult.threat}`);
    }

    return this.qcParametersService.uploadExcel(file);
  }

  @Get('phase/:phase')
  async getByPhase(@Param('phase') phase: string) {
    const validPhases = ['Staging', 'PreLive', 'PostLive'];
    if (!validPhases.includes(phase)) {
      throw new BadRequestException(`Invalid phase. Must be one of: ${validPhases.join(', ')}`);
    }

    return this.qcParametersService.getParametersByPhase(phase as QCPhase);
  }

  @Get('defect/:defectId')
  async getDefectValues(@Param('defectId') defectId: string) {
    return this.qcParametersService.getDefectQCValues(defectId);
  }

  @Post('defect/:defectId/values')
  async saveDefectValues(
    @Param('defectId') defectId: string,
    @Body() body: { values: Record<string, any> },
  ) {
    return this.qcParametersService.saveDefectQCValues(defectId, body.values);
  }
}

