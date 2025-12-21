import {
  Controller,
  Post,
  Get,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Body,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DefectImportService } from './defect-import.service';
import { ImportSourceType } from './dto/import-defects.dto';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';

@ApiTags('defect-import')
@Controller('defect-import')
@UseGuards(JwtAuthGuard)
export class DefectImportController {
  constructor(private readonly defectImportService: DefectImportService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
      fileFilter: (_req, file, callback) => {
        if (!file.originalname.match(/\.(xlsx|xls)$/)) {
          return callback(
            new BadRequestException('Only Excel files are allowed'),
            false,
          );
        }
        callback(null, true);
      },
    }),
  )
  @ApiOperation({ summary: 'Import defect data from Excel file for AI/ML training' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
        sourceType: {
          type: 'string',
          enum: Object.values(ImportSourceType),
        },
      },
    },
  })
  async uploadDefectData(
    @UploadedFile() file: Express.Multer.File,
    @Body('sourceType') sourceType?: ImportSourceType,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    return this.defectImportService.importExcel(
      file,
      sourceType || ImportSourceType.AUTO_DETECT,
    );
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get training data statistics and pattern summary' })
  async getStats() {
    return this.defectImportService.getTrainingDataStats();
  }

  @Get('patterns')
  @ApiOperation({ summary: 'Get all identified defect patterns' })
  async getPatterns() {
    const stats = await this.defectImportService.getTrainingDataStats();
    return stats.patterns;
  }

  @Get('patterns/:id')
  @ApiOperation({ summary: 'Get detailed insights for a specific pattern' })
  async getPatternDetails(@Param('id') id: string) {
    return this.defectImportService.getPatternInsights(id);
  }

  @Get('suggestions')
  @ApiOperation({ summary: 'Get AI suggestions based on learned patterns' })
  async getSuggestions(@Query('userId') userId?: string) {
    return this.defectImportService.getSuggestionsFromPatterns(userId);
  }

  @Post('analyze')
  @ApiOperation({ summary: 'Trigger pattern analysis on imported data' })
  async analyzePatterns() {
    await this.defectImportService.analyzeAndUpdatePatterns();
    return { message: 'Pattern analysis completed' };
  }

  @Post('clear')
  @ApiOperation({ summary: 'Clear all training data and patterns for fresh import' })
  async clearAllData() {
    return this.defectImportService.clearAllTrainingData();
  }
}

