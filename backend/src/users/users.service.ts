import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as argon2 from 'argon2';
import { Role } from '@prisma/client';

export interface CreateUserDto {
  username: string;
  password: string;
  role?: Role;
  email?: string;
  fullName?: string;
  isActive?: boolean;
}

export interface UpdateUserDto {
  username?: string;
  password?: string;
  role?: Role;
  email?: string;
  fullName?: string;
  isActive?: boolean;
}

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        role: true,
        email: true,
        fullName: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return user;
  }

  async findAll() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        username: true,
        role: true,
        email: true,
        fullName: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { username: 'asc' },
    });
  }

  // Get only active users (for dropdown in defect form)
  async findActiveUsers() {
    return this.prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
      },
      orderBy: { username: 'asc' },
    });
  }

  // Get users by role (for role-based assignment)
  async findUsersByRole(roles: Role[]) {
    return this.prisma.user.findMany({
      where: {
        isActive: true,
        role: { in: roles },
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
      },
      orderBy: { username: 'asc' },
    });
  }

  // Get assignable users based on the requester's role
  async getAssignableUsers(requesterRole: Role) {
    let targetRoles: Role[] = [];
    
    switch (requesterRole) {
      case Role.ADMIN:
        // Admin can assign to anyone
        targetRoles = [Role.PROJECT_MANAGER, Role.QC, Role.WIS];
        break;
      case Role.PROJECT_MANAGER:
        // PM can assign to QC and WIS
        targetRoles = [Role.QC, Role.WIS];
        break;
      case Role.QC:
        // QC can only assign to WIS
        targetRoles = [Role.WIS];
        break;
      default:
        // WIS cannot assign
        targetRoles = [];
    }
    
    if (targetRoles.length === 0) return [];
    
    return this.findUsersByRole(targetRoles);
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        role: true,
        email: true,
        fullName: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async create(data: CreateUserDto) {
    // Check if username already exists
    const existing = await this.prisma.user.findUnique({
      where: { username: data.username },
    });

    if (existing) {
      throw new ConflictException('Username already exists');
    }

    // Hash password
    const hashedPassword = await argon2.hash(data.password);

    return this.prisma.user.create({
      data: {
        username: data.username,
        password: hashedPassword,
        role: data.role || Role.WIS,
        email: data.email,
        fullName: data.fullName,
        isActive: data.isActive ?? true,
      },
      select: {
        id: true,
        username: true,
        role: true,
        email: true,
        fullName: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async update(id: string, data: UpdateUserDto) {
    // If updating username, check if it already exists
    if (data.username) {
      const existing = await this.prisma.user.findFirst({
        where: {
          username: data.username,
          NOT: { id },
        },
      });

      if (existing) {
        throw new ConflictException('Username already exists');
      }
    }

    const updateData: any = { ...data };

    // Hash password if provided
    if (data.password) {
      updateData.password = await argon2.hash(data.password);
    }

    return this.prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        username: true,
        role: true,
        email: true,
        fullName: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async delete(id: string, reassignToId?: string | null) {
    const userToDelete = await this.prisma.user.findUnique({ where: { id } });
    
    if (!userToDelete) {
      throw new BadRequestException('User not found');
    }

    // Check all user relationships
    const [assignedDefects, createdDefects, comments, auditEvents, attachments] = await Promise.all([
      this.prisma.defect.count({ where: { assignedToId: id } }),
      this.prisma.defect.count({ where: { createdById: id } }),
      this.prisma.comment.count({ where: { userId: id } }),
      this.prisma.auditEvent.count({ where: { userId: id } }),
      this.prisma.attachment.count({ where: { uploadedById: id } }),
    ]);

    // Handle assigned defects
    if (assignedDefects > 0) {
      if (reassignToId === undefined) {
        throw new BadRequestException(
          `Cannot delete user with ${assignedDefects} assigned defects. Reassign or move to backlog first.`
        );
      }

      if (reassignToId === null || reassignToId === 'BACKLOG') {
        // Move defects to backlog (unassign)
        await this.prisma.defect.updateMany({
          where: { assignedToId: id },
          data: { assignedToId: null },
        });
      } else {
        // Verify the reassign user exists and has the same role
        const reassignUser = await this.prisma.user.findUnique({ where: { id: reassignToId } });

        if (!reassignUser) {
          throw new BadRequestException('Reassignment user not found');
        }

        if (reassignUser.role !== userToDelete.role) {
          throw new BadRequestException('Can only reassign to a user with the same role');
        }

        // Reassign all defects to the new user
        await this.prisma.defect.updateMany({
          where: { assignedToId: id },
          data: { assignedToId: reassignToId },
        });
      }
    }

    // For created defects, comments, audit events, and attachments - 
    // we need to reassign them to preserve data integrity
    // Find an admin user to transfer ownership to
    const adminUser = await this.prisma.user.findFirst({
      where: { 
        role: 'ADMIN',
        id: { not: id },
        isActive: true,
      },
    });

    if (!adminUser && (createdDefects > 0 || comments > 0 || auditEvents > 0 || attachments > 0)) {
      throw new BadRequestException(
        'Cannot delete user with historical records. No admin user available to transfer records to.'
      );
    }

    // Transfer ownership of created defects to admin
    if (createdDefects > 0 && adminUser) {
      await this.prisma.defect.updateMany({
        where: { createdById: id },
        data: { createdById: adminUser.id },
      });
    }

    // Transfer comments to admin
    if (comments > 0 && adminUser) {
      await this.prisma.comment.updateMany({
        where: { userId: id },
        data: { userId: adminUser.id },
      });
    }

    // Transfer audit events to admin
    if (auditEvents > 0 && adminUser) {
      await this.prisma.auditEvent.updateMany({
        where: { userId: id },
        data: { userId: adminUser.id },
      });
    }

    // Transfer attachments to admin
    if (attachments > 0 && adminUser) {
      await this.prisma.attachment.updateMany({
        where: { uploadedById: id },
        data: { uploadedById: adminUser.id },
      });
    }

    return this.prisma.user.delete({
      where: { id },
    });
  }

  async getSameRoleUsers(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    return this.prisma.user.findMany({
      where: {
        role: user.role,
        isActive: true,
        NOT: { id: userId },
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
      },
      orderBy: { username: 'asc' },
    });
  }

  async getAssignedDefectsCount(userId: string) {
    const [assignedCount, createdCount, commentsCount, auditEventsCount, attachmentsCount] = await Promise.all([
      this.prisma.defect.count({ where: { assignedToId: userId } }),
      this.prisma.defect.count({ where: { createdById: userId } }),
      this.prisma.comment.count({ where: { userId } }),
      this.prisma.auditEvent.count({ where: { userId } }),
      this.prisma.attachment.count({ where: { uploadedById: userId } }),
    ]);
    
    return { 
      count: assignedCount,
      assignedDefects: assignedCount,
      createdDefects: createdCount,
      comments: commentsCount,
      auditEvents: auditEventsCount,
      attachments: attachmentsCount,
      hasHistoricalRecords: createdCount > 0 || commentsCount > 0 || auditEventsCount > 0 || attachmentsCount > 0,
    };
  }

  async toggleActive(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    return this.prisma.user.update({
      where: { id },
      data: { isActive: !user.isActive },
      select: {
        id: true,
        username: true,
        role: true,
        email: true,
        fullName: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
}

