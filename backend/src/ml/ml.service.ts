import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StoreInsightsDto } from './dto/store-insights.dto';
import { AuditEventType } from '@prisma/client';

@Injectable()
export class MLService {
  constructor(private prisma: PrismaService) {}

  async storeInsights(dto: StoreInsightsDto) {
    return this.prisma.mLInsight.create({
      data: {
        scope: dto.scope,
        userId: dto.userId || null,
        teamId: dto.teamId || null,
        reopenRate: dto.reopen_rate,
        meanTimeToFix: dto.mean_time_to_fix,
        distributions: dto.distributions as any,
        clustering: dto.clustering as any,
        generatedAt: dto.generated_at ? new Date(dto.generated_at) : new Date(),
      },
    });
  }

  /**
   * Generate insights from existing defect data
   */
  async generateInsights(scope: string, userId?: string) {
    // Build query filter based on scope
    const where: any = {};
    if (scope === 'user' && userId) {
      where.OR = [
        { assignedToId: userId },
        { createdById: userId },
      ];
    }

    // Fetch all defects for analysis
    const defects = await this.prisma.defect.findMany({
      where,
      include: {
        auditEvents: true,
        pmc: true,
        assignedTo: true,
        createdBy: true,
      },
    });

    if (defects.length === 0) {
      // Return empty insights if no defects
      return this.createEmptyInsights(scope, userId);
    }

    // Calculate status distribution
    const statusDistribution: Record<string, number> = {};
    defects.forEach((defect) => {
      statusDistribution[defect.status] = (statusDistribution[defect.status] || 0) + 1;
    });

    // Calculate priority distribution
    const priorityDistribution: Record<string, number> = {};
    defects.forEach((defect) => {
      const key = defect.priority.toString();
      priorityDistribution[key] = (priorityDistribution[key] || 0) + 1;
    });

    // Calculate PMC/Project distribution
    const projectDistribution: Record<string, number> = {};
    defects.forEach((defect) => {
      const pmcName = defect.pmcName || defect.pmc?.name || 'Unknown';
      projectDistribution[pmcName] = (projectDistribution[pmcName] || 0) + 1;
    });

    // Calculate reopen rate
    const reopenedDefects = defects.filter((defect) =>
      defect.auditEvents.some((event) => {
        if (event.type === AuditEventType.STATUS_CHANGE && event.newValue) {
          try {
            const newVal = JSON.parse(event.newValue);
            return newVal.status === 'REOPENED';
          } catch {
            return false;
          }
        }
        return false;
      })
    );
    const reopenRate = defects.length > 0 ? (reopenedDefects.length / defects.length) * 100 : 0;

    // Calculate mean time to fix (in hours)
    const fixedDefects = defects.filter((defect) =>
      ['FIXED', 'RESOLVED', 'CLOSED'].includes(defect.status)
    );
    let totalTimeToFix = 0;
    let fixedCount = 0;

    for (const defect of fixedDefects) {
      // Find the first status change to FIXED, RESOLVED, or CLOSED
      const fixEvent = defect.auditEvents.find((event) => {
        if (event.type === AuditEventType.STATUS_CHANGE && event.newValue) {
          try {
            const newVal = JSON.parse(event.newValue);
            return ['FIXED', 'RESOLVED', 'CLOSED'].includes(newVal.status);
          } catch {
            return false;
          }
        }
        return false;
      });

      if (fixEvent) {
        const createdAt = new Date(defect.createdAt);
        const fixedAt = new Date(fixEvent.createdAt);
        const hoursToFix = (fixedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
        if (hoursToFix > 0) {
          totalTimeToFix += hoursToFix;
          fixedCount++;
        }
      }
    }
    const meanTimeToFix = fixedCount > 0 ? totalTimeToFix / fixedCount : 0;

    // Generate simple clustering based on PMC
    const clusters = this.generateClusters(defects);

    // Create and store the insights
    const insights = await this.prisma.mLInsight.create({
      data: {
        scope,
        userId: scope === 'user' ? userId : null,
        reopenRate,
        meanTimeToFix,
        distributions: {
          status: statusDistribution,
          priority: priorityDistribution,
          project: projectDistribution,
        },
        clustering: clusters,
        generatedAt: new Date(),
      },
    });

    return insights;
  }

  private generateClusters(defects: any[]) {
    // Group defects by PMC for simple clustering
    const pmcGroups: Record<string, any[]> = {};
    
    defects.forEach((defect) => {
      const pmcName = defect.pmcName || defect.pmc?.name || 'Unknown';
      if (!pmcGroups[pmcName]) {
        pmcGroups[pmcName] = [];
      }
      pmcGroups[pmcName].push(defect);
    });

    // Convert to cluster format
    const clusters = Object.entries(pmcGroups)
      .map(([pmcName, defectsInCluster], index) => {
        // Extract common terms from titles and descriptions
        const allText = defectsInCluster
          .map((d) => `${d.title} ${d.description || ''}`)
          .join(' ')
          .toLowerCase();
        
        // Simple term extraction (split and count words)
        const words = allText.split(/\W+/).filter((w) => w.length > 3);
        const wordCounts: Record<string, number> = {};
        words.forEach((word) => {
          wordCounts[word] = (wordCounts[word] || 0) + 1;
        });

        // Get top terms
        const topTerms = Object.entries(wordCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([word]) => word);

        return {
          cluster_id: index,
          size: defectsInCluster.length,
          top_terms: topTerms.length > 0 ? topTerms : [pmcName],
          defect_ids: defectsInCluster.map((d) => d.id),
          label: pmcName,
        };
      })
      .sort((a, b) => b.size - a.size);

    // Calculate silhouette score approximation (based on cluster size variance)
    const sizes = clusters.map((c) => c.size);
    const avgSize = sizes.reduce((a, b) => a + b, 0) / sizes.length;
    const variance = sizes.reduce((sum, s) => sum + Math.pow(s - avgSize, 2), 0) / sizes.length;
    const normalizedVariance = Math.min(1, variance / (avgSize * avgSize));
    const silhouetteScore = Math.max(0, 1 - normalizedVariance);

    return {
      clusters,
      silhouette_score: silhouetteScore,
      n_clusters: clusters.length,
    };
  }

  private async createEmptyInsights(scope: string, userId?: string) {
    return this.prisma.mLInsight.create({
      data: {
        scope,
        userId: scope === 'user' ? userId : null,
        reopenRate: 0,
        meanTimeToFix: 0,
        distributions: {
          status: {},
          priority: {},
          project: {},
        },
        clustering: {
          clusters: [],
          silhouette_score: 0,
          n_clusters: 0,
        },
        generatedAt: new Date(),
      },
    });
  }

  async getLatestInsights(scope: string, userId?: string, teamId?: string) {
    const where: any = { scope };
    if (userId) where.userId = userId;
    if (teamId) where.teamId = teamId;

    return this.prisma.mLInsight.findFirst({
      where,
      orderBy: { generatedAt: 'desc' },
    });
  }

  async getInsightsHistory(scope: string, userId?: string, teamId?: string, limit: number = 30) {
    const where: any = { scope };
    if (userId) where.userId = userId;
    if (teamId) where.teamId = teamId;

    return this.prisma.mLInsight.findMany({
      where,
      orderBy: { generatedAt: 'desc' },
      take: limit,
    });
  }
}

