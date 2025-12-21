import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getRoot() {
    return {
      message: 'Defect Tracking Tool API',
      version: '1.0.0',
      documentation: '/api',
      health: '/health',
    };
  }
}

