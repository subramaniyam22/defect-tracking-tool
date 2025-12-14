import { Controller, Get, Post, Put, Delete, Patch, Body, Param, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { UsersService, CreateUserDto, UpdateUserDto } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@Request() req) {
    return this.usersService.getMe(req.user.id);
  }

  // Get active users (for dropdowns) - available to all authenticated users
  @Get('active')
  @UseGuards(JwtAuthGuard)
  async findActiveUsers() {
    return this.usersService.findActiveUsers();
  }

  // Get assignable users based on the requester's role
  @Get('assignable')
  @UseGuards(JwtAuthGuard)
  async getAssignableUsers(@Request() req) {
    return this.usersService.getAssignableUsers(req.user.role);
  }

  // Get all users - admin only
  @Get()
  @UseGuards(JwtAuthGuard)
  @Roles(Role.ADMIN)
  async findAll() {
    return this.usersService.findAll();
  }

  // Get user by ID - admin only
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @Roles(Role.ADMIN)
  async findById(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  // Create new user - admin only
  @Post()
  @UseGuards(JwtAuthGuard)
  @Roles(Role.ADMIN)
  async create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  // Update user - admin only
  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @Roles(Role.ADMIN)
  async update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  // Toggle user active status - admin only
  @Patch(':id/toggle-active')
  @UseGuards(JwtAuthGuard)
  @Roles(Role.ADMIN)
  async toggleActive(@Param('id') id: string) {
    return this.usersService.toggleActive(id);
  }

  // Delete user - admin only
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @Roles(Role.ADMIN)
  async delete(@Param('id') id: string, @Body() body?: { reassignToId?: string }) {
    return this.usersService.delete(id, body?.reassignToId);
  }

  // Get users with same role (for reassignment during delete)
  @Get(':id/same-role-users')
  @UseGuards(JwtAuthGuard)
  @Roles(Role.ADMIN)
  async getSameRoleUsers(@Param('id') id: string) {
    return this.usersService.getSameRoleUsers(id);
  }

  // Get assigned defect count for a user
  @Get(':id/assigned-defects-count')
  @UseGuards(JwtAuthGuard)
  @Roles(Role.ADMIN)
  async getAssignedDefectsCount(@Param('id') id: string) {
    return this.usersService.getAssignedDefectsCount(id);
  }
}

