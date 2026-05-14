import json
import os
import re
from datetime import datetime
from typing import Optional, Tuple, Dict, Any
import jwt
import psycopg2
from psycopg2.extras import RealDictCursor


def get_response(statusCode: int, data: Any, headers: Optional[Dict] = None) -> Dict:
    """Format response in Vercel serverless format."""
    default_headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
    }
    if headers:
        default_headers.update(headers)

    return {
        "statusCode": statusCode,
        "headers": default_headers,
        "body": json.dumps(data)
    }


def get_db():
    """Get database connection using Postgres."""
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise RuntimeError("DATABASE_URL environment variable not set")
    return psycopg2.connect(db_url)


def extract_auth_token(request) -> Optional[str]:
    """Extract JWT token from cookies."""
    cookies = request.headers.get("Cookie", "")
    for cookie in cookies.split(";"):
        name, _, value = cookie.strip().partition("=")
        if name == "admin_token":
            return value
    return None


def verify_admin(request) -> Tuple[Optional[Dict], Optional[Dict]]:
    """
    Verify JWT token from request cookies.
    Returns (payload, error_response) — one will be None.
    """
    token = extract_auth_token(request)
    if not token:
        return None, get_response(401, {"error": "Unauthorized"})

    try:
        secret = os.getenv("JWT_SECRET", "secret_key_for_session")
        payload = jwt.decode(token, secret, algorithms=["HS256"])
        return payload, None
    except jwt.InvalidTokenError:
        return None, get_response(401, {"error": "Unauthorized"})


def create_auth_token(user_id: str = "admin") -> str:
    """Create JWT token."""
    secret = os.getenv("JWT_SECRET", "secret_key_for_session")
    return jwt.encode({"user": user_id}, secret, algorithm="HS256")


CARD_PREFIX = "A"
CARD_MIN = 1450
CARD_MAX = 1949

PRIZE_TYPES = {
    "10% Discount": "10% Discount",
    "Free Drink": "Free Drink",
    "10% Discount on Drinks": "10% Discount on Drinks",
    "VIP Combo Offer": "VIP Combo Offer",
}

PARTNER_TASTY = "Tasty Grill"
PARTNER_LAMBRISCO = "Lambrisco Lounge"

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


def validate_and_build_prize_map(winning_cards: list) -> dict:
    """Distribute prizes as specified."""
    if len(winning_cards) != 100:
        raise ValueError(f"Expected 100 winning cards, got {len(winning_cards)}")

    ordered = list(winning_cards)
    prize_map = {}
    idx = 0

    for cn in ordered[idx:idx+40]:
        prize_map[cn] = {"prize": "10% Discount", "partner_name": PARTNER_TASTY}
    idx += 40

    for cn in ordered[idx:idx+25]:
        prize_map[cn] = {"prize": "Free Drink", "partner_name": PARTNER_LAMBRISCO}
    idx += 25

    for cn in ordered[idx:idx+25]:
        prize_map[cn] = {"prize": "10% Discount on Drinks", "partner_name": PARTNER_LAMBRISCO}
    idx += 25

    for cn in ordered[idx:idx+10]:
        prize_map[cn] = {"prize": "VIP Combo Offer", "partner_name": PARTNER_LAMBRISCO}

    return prize_map


def parse_json_body(request) -> dict:
    """Parse JSON body from request."""
    try:
        if isinstance(request.body, bytes):
            return json.loads(request.body.decode())
        return json.loads(request.body) if request.body else {}
    except (json.JSONDecodeError, AttributeError):
        return {}
