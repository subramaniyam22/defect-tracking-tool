import { Module } from '@nestjs/common';
import { DefectImportController } from './defect-import.controller';
import { DefectImportService } from './defect-import.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DefectImportController],
  providers: [DefectImportService],
  exports: [DefectImportService],
})
export class DefectImportModule {}

