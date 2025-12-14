# Security Features

This document outlines the security features implemented in the Defect Tracking Tool.

## Authentication & Authorization

### JWT Authentication
- Access tokens: 30-minute expiration
- Refresh tokens: 6-hour expiration with sliding window
- Session management via Redis with absolute TTL

### Role-Based Access Control (RBAC)
- **ADMIN**: Full access to all endpoints
- **USER**: Limited access (read-only for admin operations)
- Role guards applied to all protected endpoints
- Use `@Roles(Role.ADMIN)` decorator for admin-only endpoints

## Input Validation

### Backend (class-validator)
- All DTOs validated with decorators:
  - `@IsString()`, `@IsNotEmpty()`, `@IsOptional()`
  - `@IsEnum()`, `@IsInt()`, `@Min()`, `@Max()`
  - Custom validators for complex validation

### Frontend (Zod)
- Form validation with Zod schemas
- Client-side validation before API calls
- Type-safe validation

## Rate Limiting

- **Global rate limit**: 100 requests per minute per IP/user
- Configurable via `RATE_LIMIT_TTL` and `RATE_LIMIT_MAX`
- Applied to all endpoints via `RateLimitGuard`
- Uses Redis for distributed rate limiting

## CSRF Protection

- CSRF tokens required for state-changing operations (POST, PUT, PATCH, DELETE)
- Mandatory for file uploads (multipart/form-data)
- Token validation via `CsrfInterceptor`
- Frontend must include `X-CSRF-Token` header

## File Upload Security

### Antivirus Scanning
- AV scan hook integrated (stub implementation)
- Scans files before processing
- Configurable via `ENABLE_AV_SCAN` environment variable
- Checks for:
  - Suspicious file extensions
  - File size limits
  - (Production: Integration with ClamAV, VirusTotal, etc.)

### File Type Validation
- MIME type checking
- File extension validation
- Size limits enforced

## Security Headers

Recommended headers (configure in reverse proxy/load balancer):
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security: max-age=31536000`

## Environment Variables

Never commit secrets to version control. Use `.env` files (see `.env.example`):
- JWT secrets (minimum 32 characters)
- Database credentials
- API keys
- CSRF secrets

## Best Practices

1. **Always use HTTPS in production**
2. **Rotate secrets regularly**
3. **Monitor rate limit violations**
4. **Review audit logs regularly**
5. **Keep dependencies updated**
6. **Use strong passwords for admin accounts**
7. **Enable AV scanning in production**

