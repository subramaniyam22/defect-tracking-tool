import { Controller, Post, Get, Body, Query, UseGuards, Headers, UnauthorizedException, Request } from '@nestjs/common';
import { MLService } from './ml.service';
import { StoreInsightsDto } from './dto/store-insights.dto';
import { GenerateInsightsDto } from './dto/generate-insights.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ConfigService } from '@nestjs/config';

@Controller('ml')
export class MLController {
  constructor(
    private readonly mlService: MLService,
    private readonly configService: ConfigService,
  ) {}

  @Post('insights')
  async storeInsights(
    @Body() dto: StoreInsightsDto,
    @Headers('x-api-key') apiKey: string,
  ) {
    // Verify API key if configured
    const expectedApiKey = this.configService.get<string>('BACKEND_API_KEY');
    if (expectedApiKey && apiKey !== expectedApiKey) {
      throw new UnauthorizedException('Invalid API key');
    }
    return this.mlService.storeInsights(dto);
  }

  @Post('insights/generate')
  @UseGuards(JwtAuthGuard)
  async generateInsights(
    @Body() dto: GenerateInsightsDto,
    @Request() req: any,
  ) {
    try {
      const scope = dto?.scope || 'global';
      const userId = scope === 'user' ? (req.user?.id || undefined) : undefined;
      
      if (scope === 'user' && !userId) {
        throw new Error('User ID is required for user scope insights');
      }
      
      return await this.mlService.generateInsights(scope, userId);
    } catch (error) {
      console.error('Error in generateInsights controller:', error);
      console.error('Stack:', error.stack);
      throw error;
    }
  }

  @Get('insights')
  @UseGuards(JwtAuthGuard)
  async getInsights(
    @Query('scope') scope: string = 'global',
    @Query('userId') userId?: string,
    @Query('teamId') teamId?: string,
  ) {
    return this.mlService.getLatestInsights(scope, userId, teamId);
  }

  @Get('insights/history')
  @UseGuards(JwtAuthGuard)
  async getInsightsHistory(
    @Query('scope') scope: string = 'global',
    @Query('userId') userId?: string,
    @Query('teamId') teamId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.mlService.getInsightsHistory(
      scope,
      userId,
      teamId,
      limit ? parseInt(limit) : 30,
    );
  }
}

