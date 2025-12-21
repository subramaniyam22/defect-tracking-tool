import { Controller, Post, Body, Get, UseGuards, Request } from '@nestjs/common';
import { AIService } from './ai.service';
import { AISuggestionsService } from './ai-suggestions.service';
import { RecommendationsRequestDto } from './dto/recommendations-request.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AIController {
  constructor(
    private readonly aiService: AIService,
    private readonly suggestionsService: AISuggestionsService,
  ) {}

  @Post('recommendations')
  async getRecommendations(@Body() dto: RecommendationsRequestDto) {
    return this.aiService.getRecommendations(dto.defectId);
  }

  // Get AI suggestions for the admin/PM dashboard (global view)
  @Get('suggestions/admin')
  @Roles(Role.ADMIN, Role.PROJECT_MANAGER)
  async getAdminSuggestions() {
    const suggestions = await this.suggestionsService.getAdminSuggestions();
    const summary = await this.suggestionsService.getDefectSummary();
    return { suggestions, summary };
  }

  // Get AI suggestions for the current user
  @Get('suggestions/me')
  async getMySuggestions(@Request() req: any) {
    const suggestions = await this.suggestionsService.getUserSuggestions(req.user.id, req.user.role);
    const summary = await this.suggestionsService.getDefectSummary(req.user.id);
    return { suggestions, summary };
  }
}

