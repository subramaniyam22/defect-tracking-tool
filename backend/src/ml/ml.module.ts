import { Module } from '@nestjs/common';
import { MLService } from './ml.service';
import { MLController } from './ml.controller';

@Module({
  controllers: [MLController],
  providers: [MLService],
  exports: [MLService],
})
export class MLModule {}

