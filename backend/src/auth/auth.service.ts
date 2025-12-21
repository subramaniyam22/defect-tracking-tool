import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { LoginDto } from './dto/login.dto';

export interface JwtPayload {
  sub: string;
  username: string;
  role: string;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly ACCESS_TOKEN_TTL = 30 * 60; // 30 minutes in seconds
  private readonly REFRESH_TOKEN_TTL = 6 * 60 * 60; // 6 hours in seconds
  private readonly SESSION_TTL = 6 * 60 * 60; // 6 hours absolute session

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private redisService: RedisService,
  ) {}

  async validateUser(username: string, password: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await argon2.verify(user.password, password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const { password: _, ...result } = user;
    return result;
  }

  async login(loginDto: LoginDto): Promise<TokenResponse> {
    const user = await this.validateUser(loginDto.username, loginDto.password);

    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_SECRET'),
      expiresIn: `${this.ACCESS_TOKEN_TTL}s`,
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: `${this.REFRESH_TOKEN_TTL}s`,
    });

    // Store session in Redis with absolute 6-hour TTL
    const sessionKey = `session:${user.id}`;
    await this.redisService.set(sessionKey, refreshToken, this.SESSION_TTL);

    // Store refresh token mapping
    const refreshKey = `refresh:${refreshToken}`;
    await this.redisService.set(refreshKey, user.id, this.REFRESH_TOKEN_TTL);

    return {
      accessToken,
      refreshToken,
    };
  }

  async refresh(refreshToken: string): Promise<TokenResponse> {
    try {
      // Verify refresh token
      const payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });

      // Check if refresh token exists in Redis
      const refreshKey = `refresh:${refreshToken}`;
      const userId = await this.redisService.get(refreshKey);
      
      if (!userId || userId !== payload.sub) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Check if session still exists (absolute 6-hour limit)
      const sessionKey = `session:${payload.sub}`;
      const sessionExists = await this.redisService.exists(sessionKey);
      
      if (!sessionExists) {
        // Session expired, clean up refresh token
        await this.redisService.del(refreshKey);
        throw new UnauthorizedException('Session expired');
      }

      // Get remaining session TTL
      const remainingTTL = await this.redisService.ttl(sessionKey);
      
      // Get user to ensure they still exist
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Generate new tokens
      const newPayload: JwtPayload = {
        sub: user.id,
        username: user.username,
        role: user.role,
      };

      const newAccessToken = this.jwtService.sign(newPayload, {
        secret: this.configService.get<string>('JWT_SECRET'),
        expiresIn: `${this.ACCESS_TOKEN_TTL}s`,
      });

      // Sliding window: extend refresh token and session if more than 1 hour remaining
      const oneHour = 60 * 60;
      let newRefreshToken = refreshToken;
      
      if (remainingTTL > oneHour) {
        // Generate new refresh token with expiration matching remaining session TTL
        newRefreshToken = this.jwtService.sign(newPayload, {
          secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
          expiresIn: `${remainingTTL}s`,
        });

        // Update session with new refresh token (keep same TTL to enforce absolute limit)
        await this.redisService.set(sessionKey, newRefreshToken, remainingTTL);

        // Remove old refresh token mapping
        await this.redisService.del(refreshKey);

        // Store new refresh token mapping with same TTL as session
        const newRefreshKey = `refresh:${newRefreshToken}`;
        await this.redisService.set(newRefreshKey, user.id, remainingTTL);
      }

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(userId: string, refreshToken: string): Promise<void> {
    const sessionKey = `session:${userId}`;
    const refreshKey = `refresh:${refreshToken}`;
    
    await Promise.all([
      this.redisService.del(sessionKey),
      this.redisService.del(refreshKey),
    ]);
  }

  async validateToken(payload: JwtPayload): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Check if user is active
    if (!user.isActive) {
      throw new UnauthorizedException('User account is inactive');
    }

    // Check if session still exists in Redis (if Redis is available)
    // If Redis is not available, we still allow the request if the JWT is valid
    try {
      const sessionKey = `session:${user.id}`;
      const sessionExists = await this.redisService.exists(sessionKey);
      
      if (!sessionExists) {
        // Only enforce session check if Redis is actually connected
        // If Redis is not available, we'll still allow valid JWT tokens
        const redisClient = this.redisService.getClient();
        if (redisClient) {
          throw new UnauthorizedException('Session expired');
        }
        // Redis not available, but JWT is valid, so allow the request
      }
    } catch (error) {
      // If Redis check fails but it's not a connection issue, throw the error
      // Otherwise, allow the request if JWT is valid
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      // Redis connection issue - allow request with valid JWT
    }

    return user;
  }
}

