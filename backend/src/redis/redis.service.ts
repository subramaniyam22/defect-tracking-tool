import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: RedisClientType;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    // Support both REDIS_URL (Railway) and individual REDIS_HOST/PORT
    const redisUrl = this.configService.get<string>('REDIS_URL');
    
    if (redisUrl) {
      // Use REDIS_URL directly (Railway format: redis://default:password@host:port)
      this.client = createClient({
        url: redisUrl,
      });
    } else {
      // Fallback to individual host/port settings
      const host = this.configService.get<string>('REDIS_HOST', 'localhost');
      const port = this.configService.get<number>('REDIS_PORT', 6379);

      this.client = createClient({
        socket: {
          host,
          port,
        },
      });
    }

    this.client.on('error', (err) => console.error('Redis Client Error', err));
    
    try {
      // Add timeout for connection
      const connectPromise = this.client.connect();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Redis connection timeout')), 10000)
      );
      
      await Promise.race([connectPromise, timeoutPromise]);
      console.log('Redis connected successfully');
    } catch (error) {
      console.error('Redis connection failed:', error.message);
      console.log('App will continue without Redis caching');
      // Don't throw - app can work without Redis for basic functionality
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.disconnect();
    }
  }

  getClient(): RedisClientType {
    return this.client;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.setEx(key, ttlSeconds, value);
    } else {
      await this.client.set(key, value);
    }
  }

  async get(key: string): Promise<string | null> {
    return await this.client.get(key);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  async ttl(key: string): Promise<number> {
    return await this.client.ttl(key);
  }

  async expire(key: string, seconds: number): Promise<void> {
    await this.client.expire(key, seconds);
  }
}

