import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDefectDto } from './dto/create-defect.dto';
import { UpdateDefectDto } from './dto/update-defect.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { AuditEventType, DefectStatus, Role } from '@prisma/client';

@Injectable()
export class DefectsService {
  constructor(private prisma: PrismaService) {}

  // Get PMC suggestions based on search query
  async getPmcSuggestions(query: string) {
    if (!query || query.length < 2) return [];
    
    return this.prisma.pMC.findMany({
      where: {
        name: {
          contains: query,
          mode: 'insensitive',
        },
      },
      take: 10,
      orderBy: { name: 'asc' },
    });
  }

  // Get Location suggestions based on PMC name
  async getLocationSuggestions(pmcName: string, query?: string) {
    const pmc = await this.prisma.pMC.findUnique({
      where: { name: pmcName },
    });

    if (!pmc) return [];

    const where: any = { pmcId: pmc.id };
    if (query && query.length >= 2) {
      where.name = { contains: query, mode: 'insensitive' };
    }

    return this.prisma.location.findMany({
      where,
      take: 10,
      orderBy: { name: 'asc' },
    });
  }

  async create(createDefectDto: CreateDefectDto, userId: string, userRole: Role) {
    // Role-based permission check
    if (userRole === Role.WIS) {
      throw new ForbiddenException('WIS users cannot create defects');
    }

    // Validate assignment based on role
    if (createDefectDto.assignedToId) {
      const targetUser = await this.prisma.user.findUnique({
        where: { id: createDefectDto.assignedToId },
        select: { role: true },
      });

      if (targetUser) {
        // QC can only assign to WIS users
        if (userRole === Role.QC && targetUser.role !== Role.WIS) {
          throw new ForbiddenException('QC users can only assign defects to WIS users');
        }
        // PROJECT_MANAGER can assign to QC and WIS
        if (userRole === Role.PROJECT_MANAGER && 
            targetUser.role !== Role.WIS && targetUser.role !== Role.QC) {
          throw new ForbiddenException('Project Managers can only assign defects to QC or WIS users');
        }
      }
    }

    // Create or get PMC
    let pmc = await this.prisma.pMC.findUnique({
      where: { name: createDefectDto.pmcName },
    });

    if (!pmc) {
      pmc = await this.prisma.pMC.create({
        data: { name: createDefectDto.pmcName },
      });
    }

    // Create or get Location if provided
    let location = null;
    if (createDefectDto.locationName) {
      location = await this.prisma.location.findFirst({
        where: {
          name: createDefectDto.locationName,
          pmcId: pmc.id,
        },
      });

      if (!location) {
        location = await this.prisma.location.create({
          data: {
            name: createDefectDto.locationName,
            pmcId: pmc.id,
          },
        });
      }
    }

    // Determine if this is a global defect (multiple locations)
    const hasMultipleLocations = createDefectDto.locationNames && createDefectDto.locationNames.length > 0;
    const hasMultipleAssignees = createDefectDto.assignedToIds && createDefectDto.assignedToIds.length > 0;
    const isGlobal = createDefectDto.isGlobal || hasMultipleLocations || hasMultipleAssignees;

    const defect = await this.prisma.defect.create({
      data: {
        title: createDefectDto.title,
        description: createDefectDto.description,
        status: createDefectDto.status || DefectStatus.OPEN,
        source: createDefectDto.source,
        priority: createDefectDto.priority || 3,
        pmcId: pmc.id,
        pmcName: createDefectDto.pmcName,
        locationId: location?.id,
        locationName: createDefectDto.locationName,
        isGlobal,
        assignedToId: createDefectDto.assignedToId || null,
        createdById: userId,
      },
      include: {
        pmc: true,
        location: true,
        assignedTo: {
          select: {
            id: true,
            username: true,
            fullName: true,
            role: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            username: true,
            fullName: true,
            role: true,
          },
        },
      },
    });

    // Create multiple locations if provided (global defect)
    if (hasMultipleLocations) {
      for (const locName of createDefectDto.locationNames) {
        // Create or get location
        let loc = await this.prisma.location.findFirst({
          where: { name: locName, pmcId: pmc.id },
        });
        if (!loc) {
          loc = await this.prisma.location.create({
            data: { name: locName, pmcId: pmc.id },
          });
        }
        // Create defect-location relationship
        await this.prisma.defectLocation.create({
          data: {
            defectId: defect.id,
            locationName: locName,
            locationId: loc.id,
          },
        });
      }
    }

    // Create multiple assignees if provided (global defect)
    if (hasMultipleAssignees) {
      for (const assigneeId of createDefectDto.assignedToIds) {
        await this.prisma.defectAssignee.create({
          data: {
            defectId: defect.id,
            userId: assigneeId,
          },
        });
      }
    }

    // Create audit event for defect creation
    await this.prisma.auditEvent.create({
      data: {
        type: AuditEventType.DEFECT_CREATED,
        defectId: defect.id,
        userId,
        newValue: JSON.stringify({
          title: defect.title,
          status: defect.status,
          priority: defect.priority,
          pmcName: defect.pmcName,
        }),
      },
    });

    return defect;
  }

  async findAll(pmcName?: string, status?: DefectStatus, assignedToId?: string, createdById?: string) {
    const where: any = {};
    if (pmcName) where.pmcName = { contains: pmcName, mode: 'insensitive' };
    if (status) where.status = status;
    if (createdById) where.createdById = createdById;
    
    // For assignedToId, also check defectAssignees for global defects
    if (assignedToId) {
      where.OR = [
        { assignedToId },
        { defectAssignees: { some: { userId: assignedToId } } },
      ];
    }

    return this.prisma.defect.findMany({
      where,
      include: {
        pmc: {
          select: {
            id: true,
            name: true,
          },
        },
        location: {
          select: {
            id: true,
            name: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            username: true,
            fullName: true,
            role: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            username: true,
            fullName: true,
            role: true,
          },
        },
        defectLocations: {
          select: {
            id: true,
            locationName: true,
            location: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        defectAssignees: {
          select: {
            id: true,
            user: {
              select: {
                id: true,
                username: true,
                fullName: true,
                role: true,
              },
            },
          },
        },
        _count: {
          select: {
            comments: true,
            attachments: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const defect = await this.prisma.defect.findUnique({
      where: { id },
      include: {
        pmc: true,
        location: true,
        assignedTo: {
          select: {
            id: true,
            username: true,
            fullName: true,
            role: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            username: true,
            fullName: true,
            role: true,
          },
        },
        defectLocations: {
          select: {
            id: true,
            locationName: true,
            location: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        defectAssignees: {
          select: {
            id: true,
            user: {
              select: {
                id: true,
                username: true,
                fullName: true,
                role: true,
              },
            },
          },
        },
        comments: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                fullName: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        attachments: {
          include: {
            uploadedBy: {
              select: {
                id: true,
                username: true,
                fullName: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        auditEvents: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });

    if (!defect) {
      throw new NotFoundException(`Defect with ID ${id} not found`);
    }

    return defect;
  }

  async update(id: string, updateDefectDto: UpdateDefectDto, userId: string, userRole: Role) {
    const existingDefect = await this.prisma.defect.findUnique({
      where: { id },
    });

    if (!existingDefect) {
      throw new NotFoundException(`Defect with ID ${id} not found`);
    }

    // WIS can only update status (In Progress, Fixed, Closed, etc.)
    if (userRole === Role.WIS) {
      // Only allow status updates for WIS users
      const allowedFields = ['status'];
      const updateFields = Object.keys(updateDefectDto);
      const hasDisallowedFields = updateFields.some(
        (field) => !allowedFields.includes(field) && updateDefectDto[field] !== undefined
      );
      
      if (hasDisallowedFields) {
        throw new ForbiddenException('WIS users can only update defect status');
      }

      // For global defects, check if all WIS users have completed before allowing completion status
      const completionStatuses = ['FIXED', 'RESOLVED', 'CLOSED'];
      if (existingDefect.isGlobal && updateDefectDto.status && completionStatuses.includes(updateDefectDto.status)) {
        // Get all assignees for this global defect
        const defectWithAssignees = await this.prisma.defect.findUnique({
          where: { id },
          include: {
            defectAssignees: {
              include: {
                user: { select: { id: true, username: true, fullName: true, role: true } },
              },
            },
          },
        });

        if (defectWithAssignees && defectWithAssignees.defectAssignees.length > 1) {
          // Get all chat messages to check who has marked complete
          const chatMessages = await this.prisma.globalDefectChat.findMany({
            where: {
              defectId: id,
              messageType: 'STATUS_UPDATE',
            },
            orderBy: { createdAt: 'desc' },
          });

          // Check each assignee's latest status
          const assigneeIds = defectWithAssignees.defectAssignees.map(a => a.userId);
          const completedUserIds = new Set<string>();

          for (const assigneeId of assigneeIds) {
            const latestStatus = chatMessages.find(msg => msg.userId === assigneeId);
            if (latestStatus && 
                (latestStatus.refinedMessage.toLowerCase().includes('completed') ||
                 latestStatus.originalMessage.toLowerCase().includes('completed') ||
                 latestStatus.originalMessage.toLowerCase().includes('complete'))) {
              completedUserIds.add(assigneeId);
            }
          }

          // Check if all other users (except current user) have completed
          const otherAssigneeIds = assigneeIds.filter(id => id !== userId);
          const allOthersCompleted = otherAssigneeIds.every(id => completedUserIds.has(id));

          if (!allOthersCompleted) {
            const pendingUsers = defectWithAssignees.defectAssignees
              .filter(a => a.userId !== userId && !completedUserIds.has(a.userId))
              .map(a => a.user.fullName || a.user.username);
            
            throw new ForbiddenException(
              `Cannot mark global defect as ${updateDefectDto.status}. The following team members have not completed their work: ${pendingUsers.join(', ')}. Please use the Team Chat to coordinate with them.`
            );
          }
        }
      }
    }

    // Validate assignment based on role
    if (updateDefectDto.assignedToId && updateDefectDto.assignedToId !== existingDefect.assignedToId) {
      const targetUser = await this.prisma.user.findUnique({
        where: { id: updateDefectDto.assignedToId },
        select: { role: true },
      });

      if (targetUser) {
        // QC can only assign to WIS users
        if (userRole === Role.QC && targetUser.role !== Role.WIS) {
          throw new ForbiddenException('QC users can only assign defects to WIS users');
        }
        // PROJECT_MANAGER can assign to QC and WIS
        if (userRole === Role.PROJECT_MANAGER && 
            targetUser.role !== Role.WIS && targetUser.role !== Role.QC) {
          throw new ForbiddenException('Project Managers can only assign defects to QC or WIS users');
        }
      }
    }

    // Track changes for audit
    const auditEvents: any[] = [];

    if (updateDefectDto.status && updateDefectDto.status !== existingDefect.status) {
      auditEvents.push({
        type: AuditEventType.STATUS_CHANGE,
        defectId: id,
        userId,
        oldValue: JSON.stringify({ status: existingDefect.status }),
        newValue: JSON.stringify({ status: updateDefectDto.status }),
      });
    }

    if (
      updateDefectDto.assignedToId !== undefined &&
      updateDefectDto.assignedToId !== existingDefect.assignedToId
    ) {
      auditEvents.push({
        type: AuditEventType.ASSIGNMENT_CHANGE,
        defectId: id,
        userId,
        oldValue: JSON.stringify({ assignedToId: existingDefect.assignedToId }),
        newValue: JSON.stringify({ assignedToId: updateDefectDto.assignedToId }),
      });
    }

    // Handle PMC and Location updates
    // Remove fields that are not part of the Defect model (they are handled separately)
    const { locationNames, assignedToIds, ...defectFields } = updateDefectDto;
    const updateData: any = { ...defectFields };
    
    if (updateDefectDto.pmcName && updateDefectDto.pmcName !== existingDefect.pmcName) {
      // Create or get PMC
      let pmc = await this.prisma.pMC.findUnique({
        where: { name: updateDefectDto.pmcName },
      });

      if (!pmc) {
        pmc = await this.prisma.pMC.create({
          data: { name: updateDefectDto.pmcName },
        });
      }

      updateData.pmcId = pmc.id;
      updateData.pmcName = updateDefectDto.pmcName;

      // Track audit
      auditEvents.push({
        type: AuditEventType.DEFECT_UPDATED,
        defectId: id,
        userId,
        oldValue: JSON.stringify({ pmcName: existingDefect.pmcName }),
        newValue: JSON.stringify({ pmcName: updateDefectDto.pmcName }),
      });
    }

    if (updateDefectDto.locationName !== undefined && updateDefectDto.locationName !== existingDefect.locationName) {
      if (updateDefectDto.locationName) {
        const pmcName = updateDefectDto.pmcName || existingDefect.pmcName;
        const pmc = await this.prisma.pMC.findUnique({
          where: { name: pmcName },
        });

        if (pmc) {
          let location = await this.prisma.location.findFirst({
            where: {
              name: updateDefectDto.locationName,
              pmcId: pmc.id,
            },
          });

          if (!location) {
            location = await this.prisma.location.create({
              data: {
                name: updateDefectDto.locationName,
                pmcId: pmc.id,
              },
            });
          }

          updateData.locationId = location.id;
        }
      } else {
        updateData.locationId = null;
      }
      updateData.locationName = updateDefectDto.locationName || null;

      // Track audit
      auditEvents.push({
        type: AuditEventType.DEFECT_UPDATED,
        defectId: id,
        userId,
        oldValue: JSON.stringify({ locationName: existingDefect.locationName }),
        newValue: JSON.stringify({ locationName: updateDefectDto.locationName }),
      });
    }

    // Handle multiple locations for global defects
    if (locationNames !== undefined) {
      // Delete existing defect locations
      await this.prisma.defectLocation.deleteMany({
        where: { defectId: id },
      });

      // Create new defect locations
      if (locationNames.length > 0) {
        const pmcName = updateDefectDto.pmcName || existingDefect.pmcName;
        const pmc = await this.prisma.pMC.findUnique({
          where: { name: pmcName },
        });

        if (pmc) {
          for (const locName of locationNames) {
            let location = await this.prisma.location.findFirst({
              where: { name: locName, pmcId: pmc.id },
            });
            if (!location) {
              location = await this.prisma.location.create({
                data: { name: locName, pmcId: pmc.id },
              });
            }
            await this.prisma.defectLocation.create({
              data: {
                defectId: id,
                locationName: locName,
                locationId: location.id,
              },
            });
          }
        }

        updateData.isGlobal = true;

        auditEvents.push({
          type: AuditEventType.DEFECT_UPDATED,
          defectId: id,
          userId,
          oldValue: JSON.stringify({ locations: 'previous' }),
          newValue: JSON.stringify({ locations: locationNames }),
        });
      }
    }

    // Handle multiple assignees for global defects
    if (assignedToIds !== undefined) {
      // Delete existing defect assignees
      await this.prisma.defectAssignee.deleteMany({
        where: { defectId: id },
      });

      // Create new defect assignees
      if (assignedToIds.length > 0) {
        for (const assigneeId of assignedToIds) {
          await this.prisma.defectAssignee.create({
            data: {
              defectId: id,
              userId: assigneeId,
            },
          });
        }

        updateData.isGlobal = true;

        auditEvents.push({
          type: AuditEventType.DEFECT_UPDATED,
          defectId: id,
          userId,
          oldValue: JSON.stringify({ assignees: 'previous' }),
          newValue: JSON.stringify({ assigneeIds: assignedToIds }),
        });
      }
    }

    // Update isGlobal if explicitly set
    if (updateDefectDto.isGlobal !== undefined) {
      updateData.isGlobal = updateDefectDto.isGlobal;
    }

    // Update defect
    const updatedDefect = await this.prisma.defect.update({
      where: { id },
      data: updateData,
      include: {
        pmc: true,
        location: true,
        assignedTo: {
          select: {
            id: true,
            username: true,
            fullName: true,
            role: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            username: true,
            fullName: true,
            role: true,
          },
        },
        defectLocations: {
          select: {
            id: true,
            locationName: true,
          },
        },
        defectAssignees: {
          select: {
            id: true,
            user: {
              select: {
                id: true,
                username: true,
                fullName: true,
                role: true,
              },
            },
          },
        },
      },
    });

    // Track title changes
    if (updateDefectDto.title && updateDefectDto.title !== existingDefect.title) {
      auditEvents.push({
        type: AuditEventType.DEFECT_UPDATED,
        defectId: id,
        userId,
        oldValue: JSON.stringify({ title: existingDefect.title }),
        newValue: JSON.stringify({ title: updateDefectDto.title }),
      });
    }

    // Track description changes
    if (updateDefectDto.description !== undefined && updateDefectDto.description !== existingDefect.description) {
      auditEvents.push({
        type: AuditEventType.DEFECT_UPDATED,
        defectId: id,
        userId,
        oldValue: JSON.stringify({ description: existingDefect.description?.substring(0, 100) }),
        newValue: JSON.stringify({ description: updateDefectDto.description?.substring(0, 100) }),
      });
    }

    // Track priority changes
    if (updateDefectDto.priority && updateDefectDto.priority !== existingDefect.priority) {
      auditEvents.push({
        type: AuditEventType.DEFECT_UPDATED,
        defectId: id,
        userId,
        oldValue: JSON.stringify({ priority: existingDefect.priority }),
        newValue: JSON.stringify({ priority: updateDefectDto.priority }),
      });
    }

    // Create audit events
    if (auditEvents.length > 0) {
      await this.prisma.auditEvent.createMany({
        data: auditEvents,
      });
    }

    return updatedDefect;
  }

  async remove(id: string) {
    try {
      return await this.prisma.defect.delete({
        where: { id },
      });
    } catch (error) {
      throw new NotFoundException(`Defect with ID ${id} not found`);
    }
  }

  async addComment(defectId: string, createCommentDto: CreateCommentDto, userId: string) {
    const defect = await this.prisma.defect.findUnique({
      where: { id: defectId },
    });

    if (!defect) {
      throw new NotFoundException(`Defect with ID ${defectId} not found`);
    }

    const comment = await this.prisma.comment.create({
      data: {
        ...createCommentDto,
        defectId,
        userId,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    // Create audit event for comment
    await this.prisma.auditEvent.create({
      data: {
        type: AuditEventType.COMMENT_ADDED,
        defectId,
        userId,
        newValue: JSON.stringify({ commentId: comment.id }),
        metadata: JSON.stringify({ content: comment.content.substring(0, 100) }),
      },
    });

    return comment;
  }

  async getUserActivity(userId: string) {
    return this.prisma.auditEvent.findMany({
      where: { userId },
      include: {
        defect: {
          select: {
            id: true,
            title: true,
          },
        },
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  // Global Defect Chat Methods
  async getGlobalDefectChat(defectId: string) {
    const defect = await this.prisma.defect.findUnique({
      where: { id: defectId },
      select: { isGlobal: true },
    });

    if (!defect) {
      throw new NotFoundException(`Defect with ID ${defectId} not found`);
    }

    return this.prisma.globalDefectChat.findMany({
      where: { defectId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            fullName: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addGlobalDefectChat(
    defectId: string,
    userId: string,
    message: string,
    messageType: 'MESSAGE' | 'STATUS_UPDATE' | 'NOTIFICATION' = 'MESSAGE',
  ) {
    const defect = await this.prisma.defect.findUnique({
      where: { id: defectId },
      select: { isGlobal: true, title: true },
    });

    if (!defect) {
      throw new NotFoundException(`Defect with ID ${defectId} not found`);
    }

    if (!defect.isGlobal) {
      throw new ForbiddenException('Chat is only available for global defects');
    }

    // Refine message to professional language
    const refinedMessage = this.refineMessageToProfessional(message, messageType);

    const chatMessage = await this.prisma.globalDefectChat.create({
      data: {
        defectId,
        userId,
        originalMessage: message,
        refinedMessage,
        messageType,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            fullName: true,
            role: true,
          },
        },
      },
    });

    return chatMessage;
  }

  async markChatAsRead(defectId: string, userId: string) {
    await this.prisma.globalDefectChat.updateMany({
      where: {
        defectId,
        userId: { not: userId },
        isRead: false,
      },
      data: { isRead: true },
    });

    return { success: true };
  }

  async getUnreadChatCount(defectId: string, userId: string) {
    const count = await this.prisma.globalDefectChat.count({
      where: {
        defectId,
        userId: { not: userId },
        isRead: false,
      },
    });

    return { count };
  }

  // Helper method to refine messages to professional language
  private refineMessageToProfessional(message: string, messageType: string): string {
    let refined = message.trim();

    // Replace informal language patterns first
    const replacements: [RegExp, string][] = [
      [/\bi'm\b/gi, 'I am'],
      [/\bim\b/gi, 'I am'],
      [/\bcan't\b/gi, 'cannot'],
      [/\bcant\b/gi, 'cannot'],
      [/\bwon't\b/gi, 'will not'],
      [/\bwont\b/gi, 'will not'],
      [/\bdon't\b/gi, 'do not'],
      [/\bdont\b/gi, 'do not'],
      [/\bdoesn't\b/gi, 'does not'],
      [/\bdoesnt\b/gi, 'does not'],
      [/\bisn't\b/gi, 'is not'],
      [/\bisnt\b/gi, 'is not'],
      [/\baren't\b/gi, 'are not'],
      [/\barent\b/gi, 'are not'],
      [/\bwasn't\b/gi, 'was not'],
      [/\bwasnt\b/gi, 'was not'],
      [/\bweren't\b/gi, 'were not'],
      [/\bwerent\b/gi, 'were not'],
      [/\blet's\b/gi, 'let us'],
      [/\blets\b/gi, 'let us'],
      [/\bgonna\b/gi, 'going to'],
      [/\bwanna\b/gi, 'want to'],
      [/\bgotta\b/gi, 'have to'],
      [/\byeah\b/gi, 'yes'],
      [/\byep\b/gi, 'yes'],
      [/\bnope\b/gi, 'no'],
      [/\bokay\b/gi, 'acknowledged'],
      [/\bok\b/gi, 'acknowledged'],
      [/\basap\b/gi, 'as soon as possible'],
      [/\bfyi\b/gi, 'for your information'],
      [/\bbtw\b/gi, 'by the way'],
      [/\bpls\b/gi, 'please'],
      [/\bplz\b/gi, 'please'],
      [/\bthx\b/gi, 'thank you'],
      [/\bthanks\b/gi, 'thank you'],
      [/\bu\b/gi, 'you'],
      [/\br\b/gi, 'are'],
      [/\bur\b/gi, 'your'],
      [/\bidk\b/gi, 'I do not know'],
      [/\bimo\b/gi, 'in my opinion'],
      [/\bimho\b/gi, 'in my humble opinion'],
      [/\blol\b/gi, ''],
      [/\bhaha\b/gi, ''],
      [/\bkinda\b/gi, 'kind of'],
      [/\bsorta\b/gi, 'sort of'],
      [/\blemme\b/gi, 'let me'],
      [/\bgimme\b/gi, 'give me'],
      [/\bdunno\b/gi, 'do not know'],
      [/\bcoz\b/gi, 'because'],
      [/\bcuz\b/gi, 'because'],
      [/\bcos\b/gi, 'because'],
      [/\bwassup\b/gi, 'what is the status'],
      [/\bsup\b/gi, 'hello'],
      [/\bhi\b/gi, 'Hello'],
      [/\bhey\b/gi, 'Hello'],
      [/\byup\b/gi, 'yes'],
    ];

    for (const [pattern, replacement] of replacements) {
      refined = refined.replace(pattern, replacement);
    }

    // Capitalize first letter of sentences
    refined = refined.replace(/(^|[.!?]\s+)([a-z])/g, (match, separator, letter) => 
      separator + letter.toUpperCase()
    );

    // Ensure first character is capitalized
    if (refined.length > 0) {
      refined = refined.charAt(0).toUpperCase() + refined.slice(1);
    }

    // Add period if missing at end
    if (refined.length > 0 && !refined.match(/[.!?]$/)) {
      refined += '.';
    }

    // Clean up extra spaces
    refined = refined.replace(/\s+/g, ' ').trim();

    // Status update specific - add professional prefix only for short/informal messages
    if (messageType === 'STATUS_UPDATE') {
      const lowerOriginal = message.toLowerCase();
      // Only add prefix if the message doesn't already have a professional structure
      if (!lowerOriginal.includes('i am') && !lowerOriginal.includes('i have') && 
          !lowerOriginal.includes('starting') && !lowerOriginal.includes('completing')) {
        if (lowerOriginal.includes('start') || lowerOriginal.includes('begin') || lowerOriginal.includes('working')) {
          refined = `Status Update: I am commencing work on this defect. ${refined}`;
        } else if (lowerOriginal.includes('done') || lowerOriginal.includes('finish') || lowerOriginal.includes('complete')) {
          refined = `Status Update: I have completed my assigned tasks. ${refined}`;
        } else if (lowerOriginal.includes('pause') || lowerOriginal.includes('stop') || lowerOriginal.includes('break')) {
          refined = `Status Update: I am temporarily pausing work on this defect. ${refined}`;
        } else if (lowerOriginal.includes('progress') || lowerOriginal.includes('update')) {
          refined = `Progress Update: ${refined}`;
        }
      }
    }

    // Add context for regular messages if they're very short
    if (messageType === 'MESSAGE' && refined.length < 20 && refined.length > 0) {
      // Short messages get a professional wrapper
      if (!refined.toLowerCase().startsWith('hello') && !refined.toLowerCase().startsWith('hi')) {
        refined = `Note: ${refined}`;
      }
    }

    return refined;
  }

  async getGlobalDefectCompletionStatus(defectId: string) {
    const defect = await this.prisma.defect.findUnique({
      where: { id: defectId },
      include: {
        defectAssignees: {
          include: {
            user: {
              select: { id: true, username: true, fullName: true, role: true },
            },
          },
        },
      },
    });

    if (!defect || !defect.isGlobal) {
      return {
        isReadyForCompletion: true,
        assigneeStatuses: [],
        message: 'This is not a global defect.',
      };
    }

    if (defect.defectAssignees.length === 0) {
      return {
        isReadyForCompletion: true,
        assigneeStatuses: [],
        message: 'No assignees for this global defect.',
      };
    }

    // Get all chat messages to check who has marked complete
    const chatMessages = await this.prisma.globalDefectChat.findMany({
      where: {
        defectId,
        messageType: 'STATUS_UPDATE',
      },
      orderBy: { createdAt: 'desc' },
    });

    // Check each assignee's latest status
    const assigneeStatuses = defect.defectAssignees.map(assignee => {
      const latestStatus = chatMessages.find(msg => msg.userId === assignee.userId);
      const hasCompleted = latestStatus && 
        (latestStatus.refinedMessage.toLowerCase().includes('completed') ||
         latestStatus.originalMessage.toLowerCase().includes('completed') ||
         latestStatus.originalMessage.toLowerCase().includes('complete'));
      
      return {
        userId: assignee.userId,
        username: assignee.user.username,
        fullName: assignee.user.fullName,
        role: assignee.user.role,
        hasCompleted: !!hasCompleted,
      };
    });

    const allAssigneesCompleted = assigneeStatuses.every(status => status.hasCompleted);

    return {
      isReadyForCompletion: allAssigneesCompleted,
      assigneeStatuses,
      message: allAssigneesCompleted
        ? 'All assigned team members have completed their work. You can now mark this defect as Fixed/Resolved/Closed.'
        : 'Waiting for all team members to complete their work. Please use the Team Chat to coordinate.',
    };
  }
}

