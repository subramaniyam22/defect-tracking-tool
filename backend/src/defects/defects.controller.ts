import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { DefectsService } from './defects.service';
import { CreateDefectDto } from './dto/create-defect.dto';
import { UpdateDefectDto } from './dto/update-defect.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CreateGlobalChatDto } from './dto/create-global-chat.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DefectStatus } from '@prisma/client';

@Controller('defects')
@UseGuards(JwtAuthGuard)
export class DefectsController {
  constructor(private readonly defectsService: DefectsService) {}

  // Get PMC suggestions for auto-complete
  @Get('suggestions/pmc')
  getPmcSuggestions(@Query('query') query: string) {
    return this.defectsService.getPmcSuggestions(query);
  }

  // Get Location suggestions for a specific PMC
  @Get('suggestions/location')
  getLocationSuggestions(
    @Query('pmcName') pmcName: string,
    @Query('query') query?: string,
  ) {
    return this.defectsService.getLocationSuggestions(pmcName, query);
  }

  @Post()
  create(@Body() createDefectDto: CreateDefectDto, @Request() req) {
    return this.defectsService.create(createDefectDto, req.user.id, req.user.role);
  }

  @Get()
  findAll(
    @Query('pmcName') pmcName?: string,
    @Query('status') status?: DefectStatus,
    @Query('assignedToId') assignedToId?: string,
    @Query('createdById') createdById?: string,
  ) {
    return this.defectsService.findAll(pmcName, status, assignedToId, createdById);
  }

  // Get user's activity log - must be before :id route
  @Get('my-activity')
  getMyActivity(@Request() req) {
    return this.defectsService.getUserActivity(req.user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.defectsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDefectDto: UpdateDefectDto, @Request() req) {
    return this.defectsService.update(id, updateDefectDto, req.user.id, req.user.role);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.defectsService.remove(id);
  }

  @Post(':id/comments')
  addComment(@Param('id') id: string, @Body() createCommentDto: CreateCommentDto, @Request() req) {
    return this.defectsService.addComment(id, createCommentDto, req.user.id);
  }

  // Global Defect Chat Endpoints
  @Get(':id/global-chat')
  getGlobalChat(@Param('id') id: string) {
    return this.defectsService.getGlobalDefectChat(id);
  }

  @Post(':id/global-chat')
  addGlobalChat(
    @Param('id') id: string,
    @Body() createGlobalChatDto: CreateGlobalChatDto,
    @Request() req,
  ) {
    return this.defectsService.addGlobalDefectChat(
      id,
      req.user.id,
      createGlobalChatDto.message,
      createGlobalChatDto.messageType || 'MESSAGE',
    );
  }

  @Post(':id/global-chat/mark-read')
  markChatAsRead(@Param('id') id: string, @Request() req) {
    return this.defectsService.markChatAsRead(id, req.user.id);
  }

  @Get(':id/global-chat/unread-count')
  getUnreadChatCount(@Param('id') id: string, @Request() req) {
    return this.defectsService.getUnreadChatCount(id, req.user.id);
  }

  @Get(':id/global-completion-status')
  getGlobalDefectCompletionStatus(@Param('id') id: string) {
    return this.defectsService.getGlobalDefectCompletionStatus(id);
  }
}

