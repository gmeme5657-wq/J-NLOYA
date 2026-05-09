# J&N LOYA Backend

## Requirements
- Python 3.x
- SQLite DB file: `database/db.sqlite3`

## Run the server
Option A (venv)
```bash
cd backend
source venv/bin/activate
python app.py
```

The server runs on:
- `http://127.0.0.1:5001`

## Seed winning cards (Task 5)
This script inserts/updates winning coupon cards into `coupon_cards`.

### Usage
```bash
python seed_winning_cards.py --count 50 --start 2000 --prefix A --prize "20% Discount" --partner "Tasty Grill"
```

### Arguments
- `--count [number]` : how many cards to generate
- `--prefix [letter]` : default `"A"`
- `--start [number]` : default `2000`
- `--prize [text]` : prize name (stored exactly as provided)
- `--partner [text]` : partner name (stored exactly as provided)

### Output
After execution the script prints:
- `Successfully added X winning cards to database`

## Bulk API endpoint (Task 5)
### POST `/api/winning-cards/bulk`
Admin-only.

**Body**
```json
{
  "cards": [
    { "card_number": "A2000", "prize": "10% Discount", "partner_name": "Tasty Grill" }
  ]
}
```

**Response**
```json
{ "success": true, "addedOrUpdated": 1 }
```

### Auth
Uses the existing admin session login:
- Login: `POST /api/admin/login`
- Then call bulk endpoint with cookies (`credentials: include` on the frontend).
