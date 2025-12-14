# Architecture Overview

## Monorepo Structure

```
.
├── backend/          # NestJS backend application
├── frontend/         # Next.js frontend application
├── docker-compose.yml # Docker services (PostgreSQL + Redis)
└── package.json      # Root workspace configuration
```

## Backend Architecture

### Technology Stack
- **Framework**: NestJS 10.x
- **Database**: PostgreSQL (via Prisma ORM)
- **Cache/Session**: Redis
- **Authentication**: JWT + Argon2 password hashing
- **Validation**: class-validator

### Key Modules

#### Auth Module (`src/auth/`)
- **AuthService**: Handles login, refresh, logout, and token validation
- **AuthController**: Exposes `/auth/login` and `/auth/refresh` endpoints
- **JwtStrategy**: Passport strategy for JWT validation
- **JwtAuthGuard**: Protects routes requiring authentication
- **RolesGuard**: Enforces role-based access control
- **Roles Decorator**: `@Roles(Role.ADMIN)` for route-level RBAC

#### Users Module (`src/users/`)
- **UsersService**: User data operations
- **UsersController**: Exposes `/users/me` endpoint (protected)

#### Prisma Module (`src/prisma/`)
- **PrismaService**: Database client (extends PrismaClient)
- Global module providing database access

#### Redis Module (`src/redis/`)
- **RedisService**: Redis client wrapper
- Handles session storage and refresh token mapping
- Global module providing Redis access

### Authentication Flow

1. **Login** (`POST /auth/login`):
   - Validates username/password with Argon2
   - Generates JWT access token (30 min) and refresh token (6 hours)
   - Stores session in Redis with 6-hour absolute TTL
   - Returns both tokens to client

2. **Token Refresh** (`POST /auth/refresh`):
   - Verifies refresh token signature
   - Checks Redis for token validity and session existence
   - Enforces absolute 6-hour session limit
   - Implements sliding window: extends if >1 hour remains
   - Returns new access token (always) and new refresh token (if extended)

3. **Protected Routes**:
   - JWT token validated via Passport strategy
   - Session checked in Redis on each request
   - User data loaded from database

### Session Management

**Redis Keys:**
- `session:{userId}` - Stores refresh token, 6-hour absolute TTL
- `refresh:{refreshToken}` - Maps refresh token to user ID, matches session TTL

**TTL Strategy:**
- **Absolute Limit**: 6 hours from initial login (enforced via Redis TTL)
- **Sliding Window**: Refresh tokens extended if session has >1 hour remaining
- **Access Tokens**: 30 minutes, refreshed automatically via interceptor

### Database Schema

```prisma
model User {
  id        String   @id @default(cuid())
  username  String   @unique
  password  String   // Argon2 hashed
  role      Role     @default(USER)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

enum Role {
  USER
  ADMIN
}
```

## Frontend Architecture

### Technology Stack
- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **HTTP Client**: Axios with interceptors
- **State**: LocalStorage for tokens

### Key Components

#### Pages
- `/login` - Login form with username/password
- `/dashboard` - Protected dashboard showing user info
- `/` - Redirects to `/login`

#### API Client (`lib/api.ts`)
- Axios instance with base URL configuration
- Request interceptor: Adds JWT access token to headers
- Response interceptor: Handles 401 errors, auto-refreshes tokens
- Automatic redirect to login on auth failure

#### Auth Service (`lib/auth.ts`)
- `login()` - Authenticate and store tokens
- `refresh()` - Refresh access token
- `getMe()` - Fetch current user data
- `logout()` - Clear tokens and redirect

### Authentication Flow

1. User submits login form
2. Tokens stored in localStorage
3. Redirect to `/dashboard`
4. Dashboard fetches user data via `/users/me`
5. Axios interceptor handles token refresh automatically
6. On 401, attempts refresh; on failure, redirects to login

## Docker Services

### PostgreSQL
- Image: `postgres:15-alpine`
- Port: `5432`
- Database: `defect_tracking`
- Credentials: `user`/`password` (change in production!)

### Redis
- Image: `redis:7-alpine`
- Port: `6379`
- Used for session storage and refresh token mapping

## Security Features

1. **Password Hashing**: Argon2 (industry standard)
2. **JWT Tokens**: Separate secrets for access and refresh tokens
3. **Session Management**: Absolute 6-hour limit enforced in Redis
4. **Token Refresh**: Sliding window with automatic extension
5. **RBAC**: Role-based access control with guards
6. **Input Validation**: DTOs with class-validator
7. **CORS**: Configured for frontend origin

## API Endpoints

### Public
- `POST /auth/login` - User authentication
- `POST /auth/refresh` - Token refresh

### Protected (Requires JWT)
- `GET /users/me` - Current user information

### Example Protected Route with RBAC
```typescript
@Get('admin-only')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
async adminOnly() {
  // Only ADMIN role can access
}
```

## Environment Variables

### Backend
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_HOST` - Redis host (default: localhost)
- `REDIS_PORT` - Redis port (default: 6379)
- `JWT_SECRET` - Secret for access tokens
- `JWT_REFRESH_SECRET` - Secret for refresh tokens
- `PORT` - Backend server port (default: 3000)

### Frontend
- `NEXT_PUBLIC_API_URL` - Backend API URL (default: http://localhost:3000)

## Development Workflow

1. Start Docker services: `docker-compose up -d`
2. Run migrations: `cd backend && npx prisma migrate dev`
3. Seed database: `cd backend && npx prisma db seed`
4. Start backend: `npm run dev:backend`
5. Start frontend: `npm run dev:frontend`

Or use: `npm run dev` to start both concurrently.

