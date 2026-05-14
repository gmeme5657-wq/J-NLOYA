# J&N LOYA Loyalty System

## Setup Instructions

### Backend (Flask)

1. Navigate to backend directory: `cd backend`
2. Activate virtual environment: `source venv/bin/activate`
3. Install dependencies: `pip install -r requirements.txt`
4. Run the server: `python app.py`
   - Server runs on http://localhost:5000

### Frontend (React)

1. Navigate to frontend directory: `cd frontend`
2. Install dependencies: `npm install`
3. Start the app: `npm start`
   - App runs on http://localhost:3000

### Database

- SQLite database is automatically created and seeded when backend starts.
- Seeded with 1 admin user: username `jnloya`, password `jnloya12@`
- Seeded with sample users, rewards, and winners.

## URLs to Access

### Client Interface
- **Homepage**: http://localhost:3000/
  - Enter QR code (e.g., QR001) or click mock user buttons to view loyalty card with points and QR code.

### Admin Interface
- **Login**: http://localhost:3000/admin/login
  - Use username: `jnloya`, password: `jnloya12@`
- **Dashboard**: http://localhost:3000/admin/dashboard (after login)
  - View and manage users, points, and winners.

## API Endpoints
- `GET /api/user/<qr_code>`: Get user details
- `POST /api/admin/login`: Admin login
- `GET /api/users`: List users (admin only)
- `GET /api/rewards`: List rewards
- `GET /api/winners`: List winners (admin only)
- `POST /api/user`: Add user (admin only)
- `POST /api/reward`: Add reward (admin only)
- `POST /api/winner`: Add winner (admin only)

## Running Both Servers
1. Open two terminals.
2. In first terminal: `cd backend && source venv/bin/activate && python app.py`
3. In second terminal: `cd frontend && npm start`
4. Access the URLs above.