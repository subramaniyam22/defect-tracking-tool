import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

interface DefectStats {
  total: number;
  bySource: Record<string, number>;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  reopenedCount: number;
  avgResolutionDays: number;
}

@Injectable()
export class AISuggestionsService {
  constructor(private prisma: PrismaService) {}

  // Get defect statistics for a user or globally
  private async getDefectStats(userId?: string): Promise<DefectStats> {
    const where = userId ? { assignedToId: userId } : {};
    
    const defects = await this.prisma.defect.findMany({
      where,
      select: {
        id: true,
        source: true,
        status: true,
        priority: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const bySource: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    let reopenedCount = 0;
    let totalResolutionDays = 0;
    let resolvedCount = 0;

    defects.forEach((defect) => {
      // Count by source
      bySource[defect.source] = (bySource[defect.source] || 0) + 1;
      
      // Count by status
      byStatus[defect.status] = (byStatus[defect.status] || 0) + 1;
      
      // Count by priority
      const priorityLabel = this.getPriorityLabel(defect.priority);
      byPriority[priorityLabel] = (byPriority[priorityLabel] || 0) + 1;

      // Count reopened
      if (defect.status === 'REOPENED') {
        reopenedCount++;
      }

      // Calculate resolution time for resolved/closed defects
      if (['RESOLVED', 'CLOSED', 'FIXED'].includes(defect.status)) {
        const days = (defect.updatedAt.getTime() - defect.createdAt.getTime()) / (1000 * 60 * 60 * 24);
        totalResolutionDays += days;
        resolvedCount++;
      }
    });

    return {
      total: defects.length,
      bySource,
      byStatus,
      byPriority,
      reopenedCount,
      avgResolutionDays: resolvedCount > 0 ? totalResolutionDays / resolvedCount : 0,
    };
  }

  private getPriorityLabel(priority: number): string {
    switch (priority) {
      case 1: return 'Critical';
      case 2: return 'High';
      case 3: return 'Medium';
      case 4: return 'Low';
      default: return 'Unknown';
    }
  }

  // Generate AI suggestions based on defect patterns
  async generateSuggestions(userId?: string, role?: Role): Promise<string[]> {
    const stats = await this.getDefectStats(userId);
    const suggestions: string[] = [];

    if (stats.total === 0) {
      return ['No defects found to analyze. Keep up the good work!'];
    }

    // Analyze source distribution
    const topSource = Object.entries(stats.bySource)
      .sort((a, b) => b[1] - a[1])[0];
    
    if (topSource) {
      const sourceLabel = this.getSourceLabel(topSource[0]);
      const percentage = Math.round((topSource[1] / stats.total) * 100);
      
      if (percentage > 40) {
        suggestions.push(
          `${percentage}% of defects come from ${sourceLabel}. Consider implementing more thorough ${this.getSourceAction(topSource[0])} to reduce defects at this stage.`
        );
      }
    }

    // Analyze priority distribution
    const criticalCount = stats.byPriority['Critical'] || 0;
    const criticalPercentage = Math.round((criticalCount / stats.total) * 100);
    
    if (criticalPercentage > 20) {
      suggestions.push(
        `${criticalPercentage}% of defects are Critical priority. Focus on early detection through code reviews and automated testing to catch critical issues before they reach QC.`
      );
    }

    // Analyze reopen rate
    const reopenRate = Math.round((stats.reopenedCount / stats.total) * 100);
    
    if (reopenRate > 15) {
      suggestions.push(
        `Reopen rate is ${reopenRate}%. Improve fix verification by implementing more comprehensive test cases before marking defects as resolved.`
      );
    }

    // Resolution time suggestions
    if (stats.avgResolutionDays > 7) {
      suggestions.push(
        `Average resolution time is ${stats.avgResolutionDays.toFixed(1)} days. Consider breaking down complex defects into smaller tasks and prioritizing based on impact.`
      );
    }

    // Role-specific suggestions with personalized insights
    if (role === Role.WIS) {
      // Analyze WIS-specific patterns
      const inProgressCount = stats.byStatus['IN_PROGRESS'] || 0;
      const openCount = stats.byStatus['OPEN'] || 0;
      
      suggestions.push(
        'As a WIS team member, ensure you document the root cause and fix details clearly to prevent similar issues.'
      );
      
      if (inProgressCount > 5) {
        suggestions.push(
          `You have ${inProgressCount} defects in progress. Consider focusing on completing existing fixes before taking new assignments.`
        );
      }
      
      if (openCount > 3) {
        suggestions.push(
          `You have ${openCount} open defects. Prioritize critical defects first to reduce backlog.`
        );
      }
      
      if (stats.reopenedCount > 0) {
        suggestions.push(
          `${stats.reopenedCount} of your fixes were reopened. Review the reopen reasons and add more thorough testing before marking as fixed.`
        );
      }
      
      // Add suggestions based on defect sources
      const topSources = Object.entries(stats.bySource)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2);
      
      if (topSources.length > 0) {
        const sourceTypes = topSources.map(([source]) => this.getSourceLabel(source)).join(' and ');
        suggestions.push(
          `Most of your defects come from ${sourceTypes}. Focus on understanding these patterns to prevent recurring issues.`
        );
      }
    }

    if (role === Role.QC) {
      suggestions.push(
        'Focus on creating reproducible test cases that cover edge scenarios.',
        'Document clear steps to reproduce for faster defect resolution.',
        'When assigning to WIS, prioritize based on complexity and WIS workload.'
      );
    }

    if (role === Role.PROJECT_MANAGER) {
      suggestions.push(
        'Schedule regular defect review meetings to identify recurring patterns.',
        'Track defect trends across PMCs to identify systemic issues.',
        'Balance defect assignments between QC and WIS teams for optimal resolution times.'
      );
    }

    // Add general best practices if we have few suggestions
    if (suggestions.length < 3) {
      suggestions.push(
        'Implement peer code reviews to catch issues early in the development cycle.',
        'Maintain updated documentation to reduce misunderstandings and related defects.',
        'Use automated testing to catch regression issues before they become defects.'
      );
    }

    return suggestions.slice(0, 5); // Return top 5 suggestions
  }

  private getSourceLabel(source: string): string {
    const labels: Record<string, string> = {
      'PEER_REVIEW': 'Peer Review',
      'PM_FEEDBACK': 'PM Feedback',
      'STAGING_QC': 'Staging QC',
      'PRE_LIVE_QC': 'Pre-live QC',
      'POST_LIVE_QC': 'Post Live QC',
    };
    return labels[source] || source;
  }

  private getSourceAction(source: string): string {
    const actions: Record<string, string> = {
      'PEER_REVIEW': 'code review processes',
      'PM_FEEDBACK': 'requirements gathering and communication',
      'STAGING_QC': 'unit and integration testing',
      'PRE_LIVE_QC': 'pre-production testing',
      'POST_LIVE_QC': 'production monitoring and alerts',
    };
    return actions[source] || 'quality checks';
  }

  // Get or generate suggestions for admin dashboard
  async getAdminSuggestions(): Promise<string[]> {
    return this.generateSuggestions(undefined, Role.ADMIN);
  }

  // Get or generate suggestions for a specific user
  async getUserSuggestions(userId: string, role: Role): Promise<string[]> {
    return this.generateSuggestions(userId, role);
  }

  // Get defect summary for dashboard
  async getDefectSummary(userId?: string) {
    const stats = await this.getDefectStats(userId);
    return {
      total: stats.total,
      bySource: stats.bySource,
      byStatus: stats.byStatus,
      byPriority: stats.byPriority,
      reopenRate: stats.total > 0 ? Math.round((stats.reopenedCount / stats.total) * 100) : 0,
      avgResolutionDays: Math.round(stats.avgResolutionDays * 10) / 10,
    };
  }
}


