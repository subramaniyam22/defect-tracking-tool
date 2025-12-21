import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StoreInsightsDto } from './dto/store-insights.dto';
import { AuditEventType } from '@prisma/client';

@Injectable()
export class MLService {
  private readonly logger = new Logger(MLService.name);
  
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
    try {
      this.logger.log(`Generating insights for scope: ${scope}, userId: ${userId || 'none'}`);
      
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
          auditEvents: {
            orderBy: { createdAt: 'asc' },
          },
          pmc: true,
          assignedTo: true,
          createdBy: true,
        },
      });

      this.logger.log(`Found ${defects.length} defects for analysis`);

      if (defects.length === 0) {
        // Return empty insights if no defects
        this.logger.log('No defects found, creating empty insights');
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
      if (pmcName) {
        projectDistribution[pmcName] = (projectDistribution[pmcName] || 0) + 1;
      }
    });

    // Calculate reopen rate
    const reopenedDefects = defects.filter((defect) => {
      if (!defect.auditEvents || defect.auditEvents.length === 0) {
        return false;
      }
      return defect.auditEvents.some((event) => {
        if (event.type === AuditEventType.STATUS_CHANGE && event.newValue) {
          try {
            const newVal = JSON.parse(event.newValue);
            return newVal.status === 'REOPENED';
          } catch (e) {
            this.logger.warn(`Failed to parse audit event newValue: ${event.newValue}`);
            return false;
          }
        }
        return false;
      });
    });
    const reopenRate = defects.length > 0 ? (reopenedDefects.length / defects.length) * 100 : 0;

    // Calculate mean time to fix (in hours)
    const fixedDefects = defects.filter((defect) =>
      ['FIXED', 'RESOLVED', 'CLOSED'].includes(defect.status)
    );
    let totalTimeToFix = 0;
    let fixedCount = 0;

    for (const defect of fixedDefects) {
      if (!defect.auditEvents || defect.auditEvents.length === 0) {
        continue;
      }
      
      // Find the first status change to FIXED, RESOLVED, or CLOSED
      const fixEvent = defect.auditEvents.find((event) => {
        if (event.type === AuditEventType.STATUS_CHANGE && event.newValue) {
          try {
            const newVal = JSON.parse(event.newValue);
            return ['FIXED', 'RESOLVED', 'CLOSED'].includes(newVal.status);
          } catch (e) {
            this.logger.warn(`Failed to parse audit event newValue: ${event.newValue}`);
            return false;
          }
        }
        return false;
      });

      if (fixEvent) {
        try {
          const createdAt = new Date(defect.createdAt);
          const fixedAt = new Date(fixEvent.createdAt);
          const hoursToFix = (fixedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
          if (hoursToFix > 0 && isFinite(hoursToFix)) {
            totalTimeToFix += hoursToFix;
            fixedCount++;
          }
        } catch (e) {
          this.logger.warn(`Failed to calculate time to fix for defect ${defect.id}: ${e.message}`);
        }
      }
    }
    const meanTimeToFix = fixedCount > 0 ? totalTimeToFix / fixedCount : 0;

    // Generate simple clustering based on PMC
    const clusters = this.generateClusters(defects);

    // Create and store the insights
    try {
      // Ensure all numeric values are valid
      const safeReopenRate = isFinite(reopenRate) && !isNaN(reopenRate) ? Math.max(0, Math.min(100, reopenRate)) : 0;
      const safeMeanTimeToFix = isFinite(meanTimeToFix) && !isNaN(meanTimeToFix) && meanTimeToFix >= 0 ? meanTimeToFix : 0;
      
      // Ensure clustering is properly structured
      const safeClustering = {
        clusters: Array.isArray(clusters.clusters) ? clusters.clusters : [],
        silhouette_score: isFinite(clusters.silhouette_score) && !isNaN(clusters.silhouette_score) 
          ? Math.max(0, Math.min(1, clusters.silhouette_score)) 
          : 0,
        n_clusters: Number.isInteger(clusters.n_clusters) && clusters.n_clusters >= 0 ? clusters.n_clusters : 0,
      };

      // Ensure distributions are objects
      const safeDistributions = {
        status: statusDistribution && typeof statusDistribution === 'object' ? statusDistribution : {},
        priority: priorityDistribution && typeof priorityDistribution === 'object' ? priorityDistribution : {},
        project: projectDistribution && typeof projectDistribution === 'object' ? projectDistribution : {},
      };

      this.logger.log(`Creating insights with: reopenRate=${safeReopenRate}, meanTimeToFix=${safeMeanTimeToFix}, clusters=${safeClustering.n_clusters}`);
      
      // Log the data structure before creating
      this.logger.debug(`Data structure: ${JSON.stringify({
        scope,
        userId: scope === 'user' ? userId : null,
        reopenRate: safeReopenRate,
        meanTimeToFix: safeMeanTimeToFix,
        distributions: safeDistributions,
        clustering: safeClustering,
      }, null, 2)}`);

      const insights = await this.prisma.mLInsight.create({
        data: {
          scope,
          userId: scope === 'user' ? userId : null,
          reopenRate: safeReopenRate,
          meanTimeToFix: safeMeanTimeToFix,
          distributions: safeDistributions,
          clustering: safeClustering,
          generatedAt: new Date(),
        },
      });

      this.logger.log(`Successfully generated insights for scope: ${scope}`);
      return insights;
    } catch (dbError: any) {
      this.logger.error(`Database error creating insights: ${dbError.message}`, dbError.stack);
      this.logger.error(`Error code: ${dbError.code}, meta: ${JSON.stringify(dbError.meta)}`);
      
      if (dbError.code === 'P2002') {
        this.logger.warn('Unique constraint violation - insights may already exist for this scope/user');
        // Try to get existing insights instead
        try {
          const existing = await this.prisma.mLInsight.findFirst({
            where: {
              scope,
              userId: scope === 'user' ? userId : null,
            },
            orderBy: { generatedAt: 'desc' },
          });
          if (existing) {
            this.logger.log('Returning existing insights');
            return existing;
          }
        } catch (findError) {
          this.logger.error(`Error finding existing insights: ${findError.message}`);
        }
      }
      throw dbError;
    }
    } catch (error) {
      this.logger.error(`Error generating insights: ${error.message}`, error.stack);
      throw error;
    }
  }

  private generateClusters(defects: any[]) {
    try {
      // Group defects by PMC for simple clustering
      const pmcGroups: Record<string, any[]> = {};
      
      defects.forEach((defect) => {
        const pmcName = defect.pmcName || defect.pmc?.name || 'Unknown';
        if (pmcName) {
          if (!pmcGroups[pmcName]) {
            pmcGroups[pmcName] = [];
          }
          pmcGroups[pmcName].push(defect);
        }
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
          top_terms: topTerms.length > 0 ? topTerms : [pmcName || 'Unknown'],
          defect_ids: defectsInCluster.map((d) => String(d.id)).filter(Boolean),
        };
      })
      .sort((a, b) => b.size - a.size);

    // Calculate silhouette score approximation (based on cluster size variance)
    let silhouetteScore = 0;
    if (clusters.length > 0) {
      try {
        const sizes = clusters.map((c) => c.size);
        if (sizes.length > 0) {
          const avgSize = sizes.reduce((a, b) => a + b, 0) / sizes.length;
          if (avgSize > 0 && !isNaN(avgSize) && isFinite(avgSize)) {
            const variance = sizes.reduce((sum, s) => sum + Math.pow(s - avgSize, 2), 0) / sizes.length;
            const denominator = avgSize * avgSize;
            if (denominator > 0 && !isNaN(denominator) && isFinite(denominator)) {
              const normalizedVariance = Math.min(1, variance / denominator);
              silhouetteScore = Math.max(0, Math.min(1, 1 - normalizedVariance));
            }
          }
        }
      } catch (e) {
        this.logger.warn(`Error calculating silhouette score: ${e.message}`);
        silhouetteScore = 0;
      }
    }

      return {
        clusters,
        silhouette_score: silhouetteScore,
        n_clusters: clusters.length,
      };
    } catch (error) {
      this.logger.error(`Error generating clusters: ${error.message}`, error.stack);
      // Return empty clusters on error
      return {
        clusters: [],
        silhouette_score: 0,
        n_clusters: 0,
      };
    }
  }

  private async createEmptyInsights(scope: string, userId?: string) {
    try {
      return await this.prisma.mLInsight.create({
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
    } catch (error) {
      this.logger.error(`Error creating empty insights: ${error.message}`, error.stack);
      throw error;
    }
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

