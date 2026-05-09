from flask import Flask, request, jsonify, session
import sqlite3
import os
import re
import random
from datetime import datetime
from flask_cors import CORS

app = Flask(__name__)
app.config['SESSION_COOKIE_SAMESITE'] = 'None'
app.config['SESSION_COOKIE_SECURE'] = False
CORS(app, supports_credentials=True, origins=["http://127.0.0.1:3000", "http://localhost:3000"])
app.secret_key = 'secret_key_for_session'

DATABASE = os.path.join(os.path.dirname(__file__), '..', 'database', 'db.sqlite3')


def get_db():
    db = sqlite3.connect(DATABASE)
    db.row_factory = sqlite3.Row
    return db


CARD_PREFIX = "A"
CARD_MIN = 1450
CARD_MAX = 1949

# Task-provided winning cards (100 cards)
WINNING_CARDS_100 = [
    "A1452","A1457","A1461","A1468","A1473","A1479","A1484","A1489","A1495","A1502",
    "A1507","A1513","A1518","A1524","A1530","A1535","A1541","A1546","A1552","A1558",
    "A1563","A1569","A1574","A1580","A1585","A1591","A1596","A1602","A1608","A1613",
    "A1619","A1625","A1630","A1636","A1641","A1647","A1653","A1658","A1664","A1670",
    "A1675","A1681","A1686","A1692","A1698","A1703","A1709","A1714","A1720","A1726",
    "A1731","A1737","A1742","A1748","A1754","A1759","A1765","A1770","A1776","A1782",
    "A1787","A1793","A1799","A1804","A1810","A1816","A1821","A1827","A1833",
    "A1838","A1844","A1850","A1855","A1861","A1867","A1872","A1878","A1884","A1889",
    "A1895","A1900","A1906","A1912","A1917","A1923","A1928","A1934","A1940","A1945",
    "A1949",
    "A1450","A1464","A1480","A1492","A1510","A1528","A1545","A1562","A1583","A1594",
]

PRIZE_TYPES = {
    "10% Discount": "10% Discount",
    "Free Drink": "Free Drink",
    "10% Discount on Drinks": "10% Discount on Drinks",
    "VIP Combo Offer": "VIP Combo Offer",
}

PARTNER_TASTY = "Tasty Grill"
PARTNER_LAMBRISCO = "Lambrisco Lounge"


def is_valid_card_number(card_number: str) -> bool:
    if not isinstance(card_number, str):
        return False
    if not re.fullmatch(r"^A\d{4}$", card_number):
        return False
    num = int(card_number[1:])
    return CARD_MIN <= num <= CARD_MAX


def normalize_card_number(card_number: str) -> str:
    if not isinstance(card_number, str):
        return ""
    card_number = card_number.strip().upper()
    if not re.match(r"^A\d+$", card_number):
        return ""
    num = card_number[1:]
    if not num.isdigit():
        return ""
    return f"{CARD_PREFIX}{int(num):04d}"


def cameroon_phone_ok(phone: str) -> bool:
    if not isinstance(phone, str):
        return False
    phone = phone.strip()
    if re.fullmatch(r"6\d{8}", phone):
        return True
    if re.fullmatch(r"\+2376\d{8}", phone):
        return True
    return False


def normalize_phone(phone: str) -> str:
    phone = phone.strip()
    if re.fullmatch(r"6\d{8}", phone):
        return f"+237{phone}"
    return phone


def validate_and_build_prize_map(winning_cards: list[str]) -> dict[str, dict]:
    """
    Distribute prizes exactly as requested:
    - 40 cards: prize="10% Discount", partner_name="Tasty Grill"
    - 25 cards: prize="Free Drink", partner_name="Lambrisco Lounge"
    - 25 cards: prize="10% Discount on Drinks", partner_name="Lambrisco Lounge"
    - 10 cards: prize="VIP Combo Offer", partner_name="Lambrisco Lounge"
    redeemed=false for all.
    """
    if len(winning_cards) != 100:
        raise ValueError(f"Expected 100 winning cards, got {len(winning_cards)}")

    # Deterministic distribution: first N items get each prize bucket
    ordered = list(winning_cards)

    prize_map: dict[str, dict] = {}
    idx = 0

    for cn in ordered[idx: idx + 40]:
        prize_map[cn] = {"prize": PRIZE_TYPES["10% Discount"], "partner_name": PARTNER_TASTY}
    idx += 40

    for cn in ordered[idx: idx + 25]:
        prize_map[cn] = {"prize": PRIZE_TYPES["Free Drink"], "partner_name": PARTNER_LAMBRISCO}
    idx += 25

    for cn in ordered[idx: idx + 25]:
        prize_map[cn] = {
            "prize": PRIZE_TYPES["10% Discount on Drinks"],
            "partner_name": PARTNER_LAMBRISCO,
        }
    idx += 25

    for cn in ordered[idx: idx + 10]:
        prize_map[cn] = {"prize": PRIZE_TYPES["VIP Combo Offer"], "partner_name": PARTNER_LAMBRISCO}
    idx += 10

    return prize_map


def ensure_seed_data():
    db = get_db()

    # admins table
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY,
            username TEXT UNIQUE,
            password TEXT
        )
        """
    )

    # coupon_cards table (extend with partner_name)
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS coupon_cards (
            card_number TEXT PRIMARY KEY,
            is_winner BOOLEAN DEFAULT FALSE,
            prize TEXT DEFAULT NULL,
            partner_name TEXT DEFAULT NULL,
            redeemed BOOLEAN DEFAULT FALSE
        )
        """
    )

    # customer_entries table
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS customer_entries (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            phone TEXT NOT NULL,
            card_number TEXT NOT NULL,
            result TEXT NOT NULL, -- Won / Lost
            prize TEXT DEFAULT NULL,
            redeemed BOOLEAN DEFAULT FALSE,
            date TEXT DEFAULT (datetime('now'))
        )
        """
    )

    # Seed admin
    db.execute(
        "INSERT OR IGNORE INTO admins (username, password) VALUES (?, ?)",
        ('jnloya', 'jnloya12@'),
    )

    # Check how many cards are currently seeded
    existing_cards = db.execute("SELECT COUNT(*) as c FROM coupon_cards").fetchone()["c"]

    # If empty (or clearly not seeded), insert/overwrite with the requested 100 winning cards.
    # We also ensure ALL A1450..A1806 master cards exist.
    all_cards = [f"{CARD_PREFIX}{n:04d}" for n in range(CARD_MIN, CARD_MAX + 1)]

    for cn in all_cards:
        db.execute(
            """
            INSERT OR IGNORE INTO coupon_cards (card_number, is_winner, prize, partner_name, redeemed)
            VALUES (?, 0, NULL, NULL, 0)
            """,
            (cn,),
        )

    # Always enforce the 100 winning cards prize distribution (idempotent with UPDATE).
    prize_map = validate_and_build_prize_map(WINNING_CARDS_100)

    # Mark winners & assign prizes/partners; set redeemed=false for all 100
    for cn, payload in prize_map.items():
        db.execute(
            """
            UPDATE coupon_cards
            SET is_winner = 1,
                prize = ?,
                partner_name = ?,
                redeemed = 0
            WHERE card_number = ?
            """,
            (payload["prize"], payload["partner_name"], cn),
        )

    # Ensure cards NOT in the 100 list are not winners (optional safety)
    # Only apply if table already had other winners.
    placeholders = ",".join(["?"] * len(WINNING_CARDS_100))
    if placeholders:
        db.execute(
            f"""
            UPDATE coupon_cards
            SET is_winner = 0,
                prize = NULL,
                partner_name = NULL,
                redeemed = 0
            WHERE card_number NOT IN ({placeholders})
            """,
            WINNING_CARDS_100,
        )

    db.commit()
    db.close()


ensure_seed_data()


@app.route('/api/admin/login', methods=['POST'])
def api_admin_login():
    data = request.json or {}
    username = data.get('username')
    password = data.get('password')

    db = get_db()
    admin = db.execute(
        'SELECT * FROM admins WHERE username = ? AND password = ?',
        (username, password),
    ).fetchone()
    db.close()

    if admin:
        session['admin'] = True
        return jsonify({'success': True})
    return jsonify({'error': 'Invalid credentials'}), 401


def require_admin():
    if not session.get('admin'):
        return jsonify({'error': 'Unauthorized'}), 401
    return None


@app.route('/api/check-card', methods=['POST'])
def check_coupon():
    data = request.json or {}
    full_name = data.get('full_name')
    phone_number = data.get('phone_number')
    coupon_code = data.get('coupon_code')

    if not all([full_name, phone_number, coupon_code]):
        return jsonify({'status': 'error', 'message': 'All fields required'}), 400

    name = str(full_name).strip()
    phone = str(phone_number).strip()
    card_number = normalize_card_number(str(coupon_code))

    if not re.fullmatch(r'^[A-Za-z\s]{2,}$', name):
        return jsonify({'status': 'error', 'message': 'Invalid name format'}), 400

    if not cameroon_phone_ok(phone):
        return jsonify({
            'status': 'error',
            'message': 'Invalid phone number. Use 6XXXXXXXX or +2376XXXXXXXX.'
        }), 400

    if not is_valid_card_number(card_number):
        return jsonify({'status': 'invalid_card'}), 200

    phone_norm = normalize_phone(phone)

    db = get_db()
    card = db.execute(
        "SELECT * FROM coupon_cards WHERE card_number = ?",
        (card_number,)
    ).fetchone()

    if not card:
        db.close()
        return jsonify({'status': 'invalid_card'}), 200

    is_winner = bool(card['is_winner'])
    redeemed = bool(card['redeemed'])

    if redeemed:
        db.close()
        return jsonify({'status': 'already_claimed'}), 200

    now_iso = datetime.utcnow().isoformat()

    if is_winner:
        prize = card['prize']
        db.execute(
            """
            INSERT INTO customer_entries (name, phone, card_number, result, prize, redeemed, date)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (name, phone_norm, card_number, 'Won', prize, False, now_iso),
        )
        db.execute(
            "UPDATE coupon_cards SET redeemed = TRUE WHERE card_number = ?",
            (card_number,)
        )
        db.commit()
        db.close()
        return jsonify({'status': 'won', 'prize': prize}), 200

    db.execute(
        """
        INSERT INTO customer_entries (name, phone, card_number, result, prize, redeemed, date)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (name, phone_norm, card_number, 'Lost', None, False, now_iso),
    )
    db.commit()
    db.close()
    return jsonify({'status': 'lost'}), 200


@app.route('/api/admin/entries', methods=['GET'])
def admin_entries():
    err = require_admin()
    if err:
        return err

    q = request.args.get('q', '').strip()
    result = request.args.get('result', '').strip()  # Won / Lost
    redeemed = request.args.get('redeemed', '').strip()  # true/false/empty

    db = get_db()

    where = []
    params = []

    if q:
        where.append("(customer_entries.name LIKE ? OR customer_entries.phone LIKE ? OR customer_entries.card_number LIKE ?)")
        like = f"%{q}%"
        params.extend([like, like, like])

    if result in ['Won', 'Lost']:
        where.append("customer_entries.result = ?")
        params.append(result)

    if redeemed in ['true', 'false']:
        where.append("customer_entries.redeemed = ?")
        params.append(1 if redeemed == 'true' else 0)

    where_sql = ("WHERE " + " AND ".join(where)) if where else ""
    rows = db.execute(
        f"""
        SELECT
          customer_entries.id,
          customer_entries.name,
          customer_entries.phone,
          customer_entries.card_number,
          customer_entries.result,
          customer_entries.prize,
          customer_entries.date,
          customer_entries.redeemed
        FROM customer_entries
        {where_sql}
        ORDER BY datetime(customer_entries.date) DESC
        """,
        params
    ).fetchall()
    db.close()
    return jsonify([dict(r) for r in rows]), 200


@app.route('/api/admin/winning-cards', methods=['GET'])
def admin_winning_cards():
    err = require_admin()
    if err:
        return err

    db = get_db()
    rows = db.execute(
        """
        SELECT card_number, prize, partner_name, redeemed
        FROM coupon_cards
        WHERE is_winner = 1
        ORDER BY card_number ASC
        """
    ).fetchall()
    db.close()
    return jsonify([{
        "card_number": r["card_number"],
        "prize": r["prize"],
        "partner_name": r["partner_name"],
        "redeemed": bool(r["redeemed"]),
    } for r in rows]), 200


@app.route('/api/admin/winning-cards', methods=['PATCH'])
def admin_update_winning_card():
    err = require_admin()
    if err:
        return err

    data = request.json or {}
    card_number = normalize_card_number(str(data.get('card_number', '')))

    prize = data.get('prize')
    partner_name = data.get('partner_name')
    redeemed = data.get('redeemed')

    if not card_number or not is_valid_card_number(card_number):
        return jsonify({"error": "Invalid card_number"}), 400

    if prize is not None and prize not in list(PRIZE_TYPES.values()):
        return jsonify({"error": "Invalid prize type"}), 400

    if partner_name is not None and not isinstance(partner_name, str):
        return jsonify({"error": "Invalid partner_name"}), 400

    if redeemed not in [True, False, None]:
        return jsonify({"error": "redeemed must be true/false"}), 400

    db = get_db()
    card = db.execute(
        "SELECT * FROM coupon_cards WHERE card_number = ? AND is_winner = 1",
        (card_number,)
    ).fetchone()
    if not card:
        db.close()
        return jsonify({"error": "Card not found or not a winning card"}), 404

    # Build update dynamically
    fields = []
    params = []

    if prize is not None:
        fields.append("prize = ?")
        params.append(prize)
    if partner_name is not None:
        fields.append("partner_name = ?")
        params.append(partner_name)
    if redeemed is not None:
        fields.append("redeemed = ?")
        params.append(1 if redeemed else 0)

    if fields:
        sql = "UPDATE coupon_cards SET " + ", ".join(fields) + " WHERE card_number = ?"
        params.append(card_number)
        db.execute(sql, params)

    db.commit()
    db.close()
    return jsonify({"success": True}), 200


@app.route('/api/admin/winning-cards', methods=['DELETE'])
def admin_delete_winning_card():
    err = require_admin()
    if err:
        return err

    data = request.json or {}
    card_number = normalize_card_number(str(data.get('card_number', '')))
    if not card_number:
        return jsonify({"error": "Invalid card_number"}), 400

    db = get_db()
    db.execute(
        "DELETE FROM coupon_cards WHERE card_number = ? AND is_winner = 1",
        (card_number,)
    )
    db.commit()
    db.close()
    return jsonify({"success": True}), 200


@app.route('/api/winning-cards/bulk', methods=['POST'])
def winning_cards_bulk():
    err = require_admin()
    if err:
        return err

    data = request.json or {}
    cards = data.get('cards', [])
    if not isinstance(cards, list) or len(cards) == 0:
        return jsonify({"error": "cards must be a non-empty array"}), 400

    allowed_prizes = set([
        "10% Discount",
        "Free Drink",
        "10% Discount on Drinks",
        "VIP Combo Offer",
    ])

    # Normalize & validate all cards first
    normalized = []
    for item in cards:
        if not isinstance(item, dict):
            return jsonify({"error": "Each card must be an object"}), 400

        raw_cn = item.get('card_number', '')
        card_number = normalize_card_number(str(raw_cn))
        if not card_number or not is_valid_card_number(card_number):
            return jsonify({"error": f"Invalid card_number: {raw_cn}"}), 400

        prize = item.get('prize')
        if prize is None or not isinstance(prize, str) or prize not in allowed_prizes:
            return jsonify({"error": f"Invalid prize for {card_number}"}), 400

        partner_name = item.get('partner_name')
        if partner_name is None or not isinstance(partner_name, str) or not partner_name.strip():
            return jsonify({"error": f"Invalid partner_name for {card_number}"}), 400

        normalized.append({
            "card_number": card_number,
            "prize": prize,
            "partner_name": partner_name.strip(),
        })

    # Insert/update in one transaction
    db = get_db()
    try:
        for row in normalized:
            db.execute(
                """
                INSERT INTO coupon_cards (card_number, is_winner, prize, partner_name, redeemed)
                VALUES (?, 1, ?, ?, 0)
                ON CONFLICT(card_number) DO UPDATE SET
                    is_winner=1,
                    prize=excluded.prize,
                    partner_name=excluded.partner_name,
                    redeemed=0
                """,
                (row["card_number"], row["prize"], row["partner_name"]),
            )
        db.commit()
    finally:
        db.close()

    return jsonify({"success": True, "addedOrUpdated": len(normalized)}), 200


@app.route('/api/admin/stats', methods=['GET'])
def admin_stats():
    err = require_admin()
    if err:
        return err

    db = get_db()

    total_cards = db.execute("SELECT COUNT(*) as c FROM coupon_cards").fetchone()["c"]
    total_entries = db.execute("SELECT COUNT(*) as c FROM customer_entries").fetchone()["c"]
    total_winners = db.execute("SELECT COUNT(*) as c FROM customer_entries WHERE result = 'Won'").fetchone()["c"]
    total_losers = db.execute("SELECT COUNT(*) as c FROM customer_entries WHERE result = 'Lost'").fetchone()["c"]

    redeemed_prizes = db.execute(
        "SELECT COUNT(*) as c FROM customer_entries WHERE redeemed = 1 AND result = 'Won'"
    ).fetchone()["c"]

    pending_redemptions = db.execute(
        """
        SELECT COUNT(*) as c
        FROM customer_entries
        WHERE redeemed = 0 AND result = 'Won'
        """
    ).fetchone()["c"]

    db.close()
    return jsonify({
        "totalCards": total_cards,
        "totalWinners": total_winners,
        "totalLosers": total_losers,
        "redeemedPrizes": redeemed_prizes,
        "pendingRedemptions": pending_redemptions
    }), 200
@app.route("/admin")
def admin_dashboard():
    conn = get_db_connection()
    c = conn.cursor()
    
    c.execute("SELECT COUNT(*) FROM cards")
    total_cards = c.fetchone()[0]
    
    c.execute("SELECT COUNT(*) FROM cards WHERE status = 'winner'")
    total_winners = c.fetchone()[0]
    
    c.execute("SELECT COUNT(*) FROM cards WHERE status = 'loser'")
    total_losers = c.fetchone()[0]
    
    c.execute("SELECT COUNT(*) FROM redemptions WHERE status = 'redeemed'")
    redeemed_prizes = c.fetchone()[0]
    
    c.execute("SELECT COUNT(*) FROM redemptions WHERE status = 'pending'")
    pending_redemptions = c.fetchone()[0]
    
    conn.close()
    
    return f"""
    <h1>J&N LOYA Admin Dashboard</h1>
    <ul>
        <li><strong>Total Cards:</strong> {total_cards}</li>
        <li><strong>Total Winners:</strong> {total_winners}</li>
        <li><strong>Total Losers:</strong> {total_losers}</li>
        <li><strong>Redeemed Prizes:</strong> {redeemed_prizes}</li>
        <li><strong>Pending Redemptions:</strong> {pending_redemptions}</li>
    </ul>
    """if __name__ == '__main__':
    app.run(debug=True, port=5001)
