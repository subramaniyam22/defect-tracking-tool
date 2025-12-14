import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  BadRequestException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Request } from 'express';

@Injectable()
export class CsrfInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    
    // Skip CSRF check for requests with Bearer token authentication
    // JWT auth provides protection against CSRF attacks
    const authHeader = request.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return next.handle();
    }
    
    // Only check CSRF for state-changing operations without JWT
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
      // Check for multipart/form-data (file uploads)
      const contentType = request.headers['content-type'] || '';
      if (contentType.includes('multipart/form-data')) {
        // Verify CSRF token for uploads
        const csrfToken = request.headers['x-csrf-token'] || request.body?.csrfToken;
        const sessionToken = request.headers['x-session-token'];
        
        if (!csrfToken || !sessionToken || csrfToken !== sessionToken) {
          throw new BadRequestException('Invalid CSRF token');
        }
      }
    }
    
    return next.handle();
  }
}

