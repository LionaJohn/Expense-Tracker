# Deployment Guide

## Backend on Render
- Root Directory: `backend`
- Build Command: `pip install -r requirements.txt && python manage.py collectstatic --no-input && python manage.py migrate`
- Start Command: `gunicorn config.wsgi:application`
- Add `DATABASE_URL` for PostgreSQL.
- Add `CORS_ALLOWED_ORIGINS` with the exact Vercel frontend URL.

## Frontend on Vercel
- Root Directory: `frontend`
- Framework: Vite
- Build Command: `npm run build`
- Output Directory: `dist`
- Environment variable: `VITE_API_BASE_URL=https://YOUR-RENDER-BACKEND-URL`
