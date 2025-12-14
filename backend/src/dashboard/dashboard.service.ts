import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { MetricsQueryDto } from './dto/metrics-query.dto';
import { DefectStatus } from '@prisma/client';

@Injectable()
export class DashboardService {
  private readonly CACHE_TTL = 300; // 5 minutes

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  private getCacheKey(filters: MetricsQueryDto): string {
    const filterStr = JSON.stringify(filters);
    return `dashboard:metrics:${Buffer.from(filterStr).toString('base64')}`;
  }

  async getMetrics(filters: MetricsQueryDto) {
    const cacheKey = this.getCacheKey(filters);
    
    // Try to get from cache
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Build where clause
    const where: any = {};

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        where.createdAt.lte = new Date(filters.endDate);
      }
    }

    if (filters.projectId) {
      where.pmcId = filters.projectId;
    }

    if (filters.pmcName) {
      where.pmcName = { contains: filters.pmcName, mode: 'insensitive' };
    }

    if (filters.assignedToId) {
      where.assignedToId = filters.assignedToId;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.type) {
      where.priority = parseInt(filters.type);
    }

    // Get all defects matching filters
    const defects = await this.prisma.defect.findMany({
      where,
      include: {
        pmc: {
          select: {
            id: true,
            name: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            username: true,
          },
        },
        auditEvents: {
          where: {
            type: 'STATUS_CHANGE',
          },
          select: {
            oldValue: true,
            newValue: true,
            createdAt: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // Calculate KPIs
    const totalDefects = defects.length;
    const openDefects = defects.filter((d) => d.status === DefectStatus.OPEN).length;
    const inProgressDefects = defects.filter(
      (d) => d.status === DefectStatus.IN_PROGRESS,
    ).length;
    const resolvedDefects = defects.filter(
      (d) => d.status === DefectStatus.RESOLVED,
    ).length;
    const closedDefects = defects.filter((d) => d.status === DefectStatus.CLOSED).length;
    const reopenedDefects = defects.filter((d) => d.status === DefectStatus.REOPENED).length;

    // Count reopened defects (defects that have been reopened at least once)
    const reopenedCount = defects.filter((defect) => {
      const hasReopened = defect.auditEvents.some((event) => {
        try {
          const newValue = event.newValue ? JSON.parse(event.newValue) : null;
          return newValue?.status === DefectStatus.REOPENED;
        } catch {
          return false;
        }
      });
      return hasReopened || defect.status === DefectStatus.REOPENED;
    }).length;

    // By Status (Phase)
    const byStatus = {
      OPEN: defects.filter((d) => d.status === DefectStatus.OPEN).length,
      IN_PROGRESS: defects.filter((d) => d.status === DefectStatus.IN_PROGRESS).length,
      RESOLVED: defects.filter((d) => d.status === DefectStatus.RESOLVED).length,
      CLOSED: defects.filter((d) => d.status === DefectStatus.CLOSED).length,
      REOPENED: defects.filter((d) => d.status === DefectStatus.REOPENED).length,
    };

    // By Type (Priority)
    const byType = {
      Critical: defects.filter((d) => d.priority === 1).length,
      High: defects.filter((d) => d.priority === 2).length,
      Medium: defects.filter((d) => d.priority === 3).length,
      Low: defects.filter((d) => d.priority === 4).length,
    };

    // Daily Trend
    const dailyTrend: Record<string, number> = {};
    defects.forEach((defect) => {
      const date = new Date(defect.createdAt).toISOString().split('T')[0];
      dailyTrend[date] = (dailyTrend[date] || 0) + 1;
    });

    // Sort daily trend by date
    const sortedDates = Object.keys(dailyTrend).sort();
    const dailyTrendData = sortedDates.map((date) => ({
      date,
      count: dailyTrend[date],
    }));

    // Reopened trend (defects reopened per day)
    const reopenedTrend: Record<string, number> = {};
    defects.forEach((defect) => {
      defect.auditEvents.forEach((event) => {
        try {
          const newValue = event.newValue ? JSON.parse(event.newValue) : null;
          if (newValue?.status === DefectStatus.REOPENED) {
            const date = new Date(event.createdAt).toISOString().split('T')[0];
            reopenedTrend[date] = (reopenedTrend[date] || 0) + 1;
          }
        } catch {
          // Ignore parse errors
        }
      });
    });

    const sortedReopenedDates = Object.keys(reopenedTrend).sort();
    const reopenedTrendData = sortedReopenedDates.map((date) => ({
      date,
      count: reopenedTrend[date],
    }));

    const metrics = {
      kpis: {
        total: totalDefects,
        open: openDefects,
        inProgress: inProgressDefects,
        resolved: resolvedDefects,
        closed: closedDefects,
        reopened: reopenedCount,
      },
      charts: {
        byStatus: {
          labels: Object.keys(byStatus),
          data: Object.values(byStatus),
        },
        byType: {
          labels: Object.keys(byType),
          data: Object.values(byType),
        },
        dailyTrend: dailyTrendData,
        reopenedTrend: reopenedTrendData,
      },
    };

    // Cache the result
    await this.redis.set(cacheKey, JSON.stringify(metrics), this.CACHE_TTL);

    return metrics;
  }

  async invalidateCache() {
    // In a production system, you'd want to invalidate specific cache keys
    // For simplicity, we'll just let them expire naturally
    // You could also use a pattern-based deletion if needed
  }
}

