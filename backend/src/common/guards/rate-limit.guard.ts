import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // Use IP address and user ID if available for tracking
    const userId = req.user?.id || 'anonymous';
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    return `${ip}:${userId}`;
  }
}

