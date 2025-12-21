# Deployment Guide - Render

This guide explains how to deploy the Defect Tracking Tool on Render.

## Architecture

- **Backend**: NestJS API (Web Service)
- **Frontend**: Next.js (Web Service)
- **ML Service**: FastAPI (Web Service)
- **Database**: PostgreSQL (Managed by Render)
- **Cache**: Redis (Optional)

## Prerequisites

1. A [Render](https://render.com) account
2. GitHub repository with the code pushed

## Option 1: Blueprint Deployment (Recommended)

The `render.yaml` file in the repository root contains the complete infrastructure definition.

### Steps:

1. **Connect GitHub to Render**
   - Go to [Render Dashboard](https://dashboard.render.com)
   - Click "New" → "Blueprint"
   - Connect your GitHub account and select the repository

2. **Deploy Blueprint**
   - Render will detect the `render.yaml` file
   - Review the services that will be created
   - Click "Apply" to deploy all services

3. **Run Database Seed (First time only)**
   - Go to the Backend service in Render
   - Open the "Shell" tab
   - Run: `npx prisma db seed`

## Option 2: Manual Deployment

### Step 1: Create PostgreSQL Database

1. Click "New" → "PostgreSQL"
2. Configure:
   - Name: `defect-tracking-db`
   - Database: `defect_tracking`
   - User: `defect_user`
   - Region: Oregon (or closest to you)
   - Plan: Free (or Starter for production)
3. Create and note the **Internal Connection String**

### Step 2: Deploy Backend (NestJS)

1. Click "New" → "Web Service"
2. Connect your GitHub repository
3. Configure:
   - Name: `defect-tracking-backend`
   - Root Directory: `backend`
   - Runtime: Node
   - Build Command: `npm install && npx prisma generate && npm run build`
   - Start Command: `npx prisma migrate deploy && npm run start:prod`
   - Plan: Free (or Starter)

4. Add Environment Variables:
   ```
   NODE_ENV=production
   DATABASE_URL=[Internal Connection String from Step 1]
   JWT_SECRET=[Generate a secure 32+ character string]
   FRONTEND_URL=https://[your-frontend-name].onrender.com
   ```

5. Deploy

### Step 3: Deploy ML Service (FastAPI)

1. Click "New" → "Web Service"
2. Connect your GitHub repository
3. Configure:
   - Name: `defect-tracking-ml`
   - Root Directory: `ml-service`
   - Runtime: Python 3
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - Plan: Free (or Starter)

4. Add Environment Variables:
   ```
   BACKEND_URL=https://[your-backend-name].onrender.com
   ```

5. Deploy

### Step 4: Deploy Frontend (Next.js)

1. Click "New" → "Web Service"
2. Connect your GitHub repository
3. Configure:
   - Name: `defect-tracking-frontend`
   - Root Directory: `frontend`
   - Runtime: Node
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`
   - Plan: Free (or Starter)

4. Add Environment Variables:
   ```
   NODE_ENV=production
   NEXT_PUBLIC_API_URL=https://[your-backend-name].onrender.com
   ```

5. Deploy

### Step 5: Update Backend CORS

After deploying the frontend, update the backend's `FRONTEND_URL` environment variable with the actual frontend URL.

### Step 6: Seed Database

1. Go to Backend service → Shell
2. Run: `npx prisma db seed`

## Environment Variables Reference

### Backend
| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `JWT_SECRET` | Secret for JWT tokens (32+ chars) | Yes |
| `FRONTEND_URL` | Frontend URL for CORS | Yes |
| `NODE_ENV` | Set to `production` | Yes |
| `PORT` | Server port (auto-set by Render) | No |
| `REDIS_URL` | Redis connection string | No |
| `ML_SERVICE_URL` | ML service URL | No |
| `OPENAI_API_KEY` | For AI recommendations | No |

### Frontend
| Variable | Description | Required |
|----------|-------------|----------|
| `NEXT_PUBLIC_API_URL` | Backend API URL | Yes |
| `NODE_ENV` | Set to `production` | Yes |

### ML Service
| Variable | Description | Required |
|----------|-------------|----------|
| `BACKEND_URL` | Backend API URL | Yes |
| `BACKEND_API_KEY` | API key for backend calls | No |

## Test Credentials

After seeding the database:
- **Admin**: username: `admin`, password: `password123`
- **User**: username: `user`, password: `password123`

## Troubleshooting

### Database Connection Issues
- Ensure you're using the **Internal Connection String** (not External)
- Check that the DATABASE_URL includes `?sslmode=require` for Render PostgreSQL

### CORS Errors
- Verify FRONTEND_URL matches exactly (including https://)
- Check browser console for the actual origin being blocked

### Build Failures
- Check Render build logs
- Ensure all dependencies are in package.json
- For Prisma: Ensure `prisma generate` runs before build

## Alternative: Deploy Frontend on Vercel

For the best Next.js experience, you can deploy the frontend on Vercel:

1. Go to [Vercel](https://vercel.com)
2. Import your GitHub repository
3. Set Root Directory to `frontend`
4. Add Environment Variable:
   - `NEXT_PUBLIC_API_URL` = Your Render backend URL
5. Deploy

Then update the backend's `FRONTEND_URL` to include the Vercel URL.

## Useful Commands

```bash
# View logs
render logs -s defect-tracking-backend

# Run shell command
render shell -s defect-tracking-backend

# Restart service
render restart -s defect-tracking-backend
```

## Support

For issues, check:
1. Render service logs
2. Browser developer console
3. Network tab for API errors

