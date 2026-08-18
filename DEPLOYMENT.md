# Deployment Guide: Expense Tracker

This repository contains two main parts:
1. **Backend (Django REST API)**: Located in `Expense Tracker/config` (or `Expense Tracker`)
2. **Frontend (React + Vite SPA)**: Located in `expense-frontend`

---

## 🚀 Part 1: Backend Deployment on Render

### Method A: One-Click / Render Blueprint (Recommended)
1. Push this repository to GitHub or GitLab.
2. Log in to [Render Dashboard](https://dashboard.render.com/).
3. Click **New +** > **Blueprint**.
4. Connect your repository. Render will automatically detect `render.yaml` and configure:
   - Python Web Service with `gunicorn config.wsgi:application`
   - Free Managed PostgreSQL Database
   - Auto-generated `SECRET_KEY` and linked `DATABASE_URL`
5. Click **Apply**.

---

### Method B: Manual Web Service Setup on Render
1. Create a **PostgreSQL Database** on Render:
   - Name: `expense-db`
   - Copy the **Internal Database URL** (or External URL).
2. Create a **New Web Service**:
   - Connect your GitHub repo.
   - **Root Directory**: `Expense Tracker/config`
   - **Environment**: `Python 3`
   - **Build Command**: `./build.sh` (or `pip install -r requirements.txt && python manage.py collectstatic --no-input && python manage.py migrate`)
   - **Start Command**: `gunicorn config.wsgi:application`
3. Add the following **Environment Variables** in Render:
   | Key | Value | Description |
   |---|---|---|
   | `PYTHON_VERSION` | `3.12.0` | Python version |
   | `DEBUG` | `False` | Production debug mode |
   | `SECRET_KEY` | *(Click Generate)* | Strong random secret key |
   | `DATABASE_URL` | *(Paste PostgreSQL URL)* | Database connection string |
   | `ALLOWED_HOSTS` | `.onrender.com,localhost,127.0.0.1` | Allowed hosts |
   | `CORS_ALLOWED_ORIGINS` | `https://*.vercel.app,http://localhost:5173` | Allowed frontend origins |
   | `CSRF_TRUSTED_ORIGINS` | `https://*.onrender.com,https://*.vercel.app` | CSRF origins |

4. Click **Create Web Service**. Note your Render URL (e.g. `https://expense-tracker-api.onrender.com`).

---

## ⚡ Part 2: Frontend Deployment on Vercel

1. Log in to [Vercel](https://vercel.com/).
2. Click **Add New...** > **Project**.
3. Import your Git repository.
4. Configure Project Settings:
   - **Framework Preset**: `Vite`
   - **Root Directory**: `expense-frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. Under **Environment Variables**, add:
   | Key | Value |
   |---|---|
   | `VITE_API_BASE_URL` | `https://your-backend-name.onrender.com` (Your Render Backend URL) |
6. Click **Deploy**.

---

## 💻 Local Development

### Run Backend Locally:
```bash
cd "Expense Tracker/config"
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```
Backend will run at: `http://127.0.0.1:8000/`

### Run Frontend Locally:
```bash
cd expense-frontend
npm install
npm run dev
```
Frontend will run at: `http://localhost:5173/` (or `http://localhost:5174/`)
