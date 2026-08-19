# Personal Expense Tracker — React + Django

A full-stack student expense tracker with:
- Login and registration
- Token-based authentication
- Protected user-specific expenses
- Dashboard with monthly/today/all-time totals
- Add, edit and delete expenses
- Search, category and date filters
- Analytics and spending trends
- Monthly budget goal
- Demo account
- Django admin
- SQLite locally and PostgreSQL on Render

## Project structure

```text
expense-tracker-fixed/
├── frontend/              # React + Vite
│   ├── src/
│   ├── package.json
│   └── .env
├── backend/               # Django + Django REST Framework
│   ├── manage.py
│   ├── config/
│   ├── expenses/
│   └── requirements.txt
├── render.yaml
└── README.md
```

## 1. Install Python
Install Python 3.12 and make sure `python --version` works.

## 2. Open the correct folder
In VS Code, open the folder **expense-tracker-fixed** itself. Do not open `frontend` when you want to run Django, and do not type a folder path as a command.

## 3. Backend setup
Open a terminal and run:

```powershell
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

Backend: http://127.0.0.1:8000/
API: http://127.0.0.1:8000/api/
Admin: http://127.0.0.1:8000/admin/

## 4. Frontend setup
Keep the backend terminal running. Open a **second** terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open the URL shown by Vite, normally http://localhost:5173/.

## 5. Login flow
1. Open the React URL.
2. Register a new account.
3. React sends the registration request to Django at `/api/auth/register/`.
4. Django creates the user and returns an authentication token.
5. React stores the token and sends it as `Authorization: Token <token>` for expense requests.
6. The dashboard loads only the logged-in user's expenses.
7. Logout removes the local token and invalidates the backend token.

There is also a **Try Demo Account** button.

## 6. If `python` is not recognized
Try:

```powershell
py --version
py -m venv venv
venv\Scripts\activate
py -m pip install -r requirements.txt
py manage.py migrate
py manage.py runserver
```

## 7. If `npm` is not recognized
Install Node.js LTS, restart VS Code, then check:

```powershell
node --version
npm --version
```

## 8. Important path rule
For this project, these are commands:

```powershell
cd backend
cd frontend
```

A path by itself is **not** a command. For example, do not paste `C:\Users\YourName\Desktop\expense-tracker-fixed\backend` directly into PowerShell. Use `cd "C:\Users\YourName\Desktop\expense-tracker-fixed\backend"`.

## 9. Deployment
### Backend — Render
Create a Render web service from this repository:
- Root Directory: `backend`
- Build Command: `pip install -r requirements.txt && python manage.py collectstatic --no-input && python manage.py migrate`
- Start Command: `gunicorn config.wsgi:application`
- Add `DATABASE_URL` for PostgreSQL.
- Set `CORS_ALLOWED_ORIGINS` to your exact Vercel frontend URL after the frontend is deployed.

### Frontend — Vercel
- Root Directory: `frontend`
- Framework: Vite
- Build Command: `npm run build`
- Output Directory: `dist`
- Environment variable: `VITE_API_BASE_URL=https://YOUR-RENDER-BACKEND-URL`

After changing the Vercel URL or Render URL, redeploy the affected service.
