import { Module } from '@nestjs/common';
import { QCParametersService } from './qc-parameters.service';
import { QCParametersController } from './qc-parameters.controller';
import { AVScannerService } from '../common/services/av-scanner.service';

@Module({
  controllers: [QCParametersController],
  providers: [QCParametersService, AVScannerService],
  exports: [QCParametersService],
})
export class QCParametersModule {}

