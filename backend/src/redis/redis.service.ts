import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: RedisClientType | null = null;
  private isConnected = false;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    
    // If no Redis URL, skip Redis entirely
    if (!redisUrl) {
      console.log('REDIS_URL not set - Redis caching disabled');
      return;
    }
    
    try {
      this.client = createClient({ url: redisUrl });
      this.client.on('error', (err) => {
        console.error('Redis Client Error:', err.message);
        this.isConnected = false;
      });
      
      // Add timeout for connection
      const connectPromise = this.client.connect();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Redis connection timeout')), 5000)
      );
      
      await Promise.race([connectPromise, timeoutPromise]);
      this.isConnected = true;
      console.log('Redis connected successfully');
    } catch (error) {
      console.error('Redis connection failed:', error.message);
      console.log('App will continue without Redis caching');
      this.client = null;
      this.isConnected = false;
    }
  }

  async onModuleDestroy() {
    if (this.client && this.isConnected) {
      try {
        await this.client.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }
    }
  }

  getClient(): RedisClientType | null {
    return this.client;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.client || !this.isConnected) return;
    try {
      if (ttlSeconds) {
        await this.client.setEx(key, ttlSeconds, value);
      } else {
        await this.client.set(key, value);
      }
    } catch (e) {
      console.error('Redis set error:', e.message);
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.client || !this.isConnected) return null;
    try {
      return await this.client.get(key);
    } catch (e) {
      console.error('Redis get error:', e.message);
      return null;
    }
  }

  async del(key: string): Promise<void> {
    if (!this.client || !this.isConnected) return;
    try {
      await this.client.del(key);
    } catch (e) {
      console.error('Redis del error:', e.message);
    }
  }

  async exists(key: string): Promise<boolean> {
    if (!this.client || !this.isConnected) return false;
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (e) {
      console.error('Redis exists error:', e.message);
      return false;
    }
  }

  async ttl(key: string): Promise<number> {
    if (!this.client || !this.isConnected) return -1;
    try {
      return await this.client.ttl(key);
    } catch (e) {
      console.error('Redis ttl error:', e.message);
      return -1;
    }
  }

  async expire(key: string, seconds: number): Promise<void> {
    if (!this.client || !this.isConnected) return;
    try {
      await this.client.expire(key, seconds);
    } catch (e) {
      console.error('Redis expire error:', e.message);
    }
  }
}
