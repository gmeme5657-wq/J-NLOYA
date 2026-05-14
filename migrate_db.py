#!/usr/bin/env python3
"""
One-time database migration script.
Run this after setting up PostgreSQL on Vercel or locally.
Creates tables and seeds initial data.
"""
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

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

PARTNER_TASTY = "Tasty Grill"
PARTNER_LAMBRISCO = "Lambrisco Lounge"


def create_tables(db):
    """Create all required tables."""
    cur = db.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS admins (
            id SERIAL PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS coupon_cards (
            card_number TEXT PRIMARY KEY,
            is_winner BOOLEAN DEFAULT FALSE,
            prize TEXT DEFAULT NULL,
            partner_name TEXT DEFAULT NULL,
            redeemed BOOLEAN DEFAULT FALSE
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS customer_entries (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            phone TEXT NOT NULL,
            card_number TEXT NOT NULL,
            result TEXT NOT NULL,
            prize TEXT DEFAULT NULL,
            redeemed BOOLEAN DEFAULT FALSE,
            date TEXT DEFAULT (NOW() AT TIME ZONE 'UTC')
        )
    """)

    db.commit()
    cur.close()
    print("✓ Tables created")


def seed_admin(db):
    """Seed admin user."""
    cur = db.cursor()

    cur.execute(
        "INSERT INTO admins (username, password) VALUES (%s, %s) ON CONFLICT DO NOTHING",
        ("jnloya", "jnloya12@")
    )

    db.commit()
    cur.close()
    print("✓ Admin user seeded (jnloya / jnloya12@)")


def seed_all_cards(db):
    """Seed all coupon cards (winning and non-winning)."""
    cur = db.cursor()

    all_cards = [f"A{n:04d}" for n in range(1450, 1950)]

    for card_number in all_cards:
        cur.execute(
            """INSERT INTO coupon_cards (card_number, is_winner, prize, partner_name, redeemed)
               VALUES (%s, FALSE, NULL, NULL, FALSE)
               ON CONFLICT DO NOTHING""",
            (card_number,)
        )

    db.commit()
    cur.close()
    print(f"✓ All {len(all_cards)} coupon cards seeded")


def seed_winning_cards(db):
    """Seed the 100 winning cards with prize distribution."""
    cur = db.cursor()

    ordered = list(WINNING_CARDS_100)
    idx = 0

    # 40 cards: 10% Discount at Tasty Grill
    for card_number in ordered[idx:idx+40]:
        cur.execute(
            """UPDATE coupon_cards SET is_winner = TRUE, prize = %s, partner_name = %s
               WHERE card_number = %s""",
            ("10% Discount", PARTNER_TASTY, card_number)
        )
    idx += 40

    # 25 cards: Free Drink at Lambrisco Lounge
    for card_number in ordered[idx:idx+25]:
        cur.execute(
            """UPDATE coupon_cards SET is_winner = TRUE, prize = %s, partner_name = %s
               WHERE card_number = %s""",
            ("Free Drink", PARTNER_LAMBRISCO, card_number)
        )
    idx += 25

    # 25 cards: 10% Discount on Drinks at Lambrisco Lounge
    for card_number in ordered[idx:idx+25]:
        cur.execute(
            """UPDATE coupon_cards SET is_winner = TRUE, prize = %s, partner_name = %s
               WHERE card_number = %s""",
            ("10% Discount on Drinks", PARTNER_LAMBRISCO, card_number)
        )
    idx += 25

    # 10 cards: VIP Combo Offer at Lambrisco Lounge
    for card_number in ordered[idx:idx+10]:
        cur.execute(
            """UPDATE coupon_cards SET is_winner = TRUE, prize = %s, partner_name = %s
               WHERE card_number = %s""",
            ("VIP Combo Offer", PARTNER_LAMBRISCO, card_number)
        )

    db.commit()
    cur.close()
    print("✓ 100 winning cards seeded with prize distribution")


def main():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("❌ ERROR: DATABASE_URL environment variable not set")
        print("Set it in .env or export DATABASE_URL=...")
        return False

    try:
        print("Connecting to database...")
        db = psycopg2.connect(database_url)

        print("Creating tables...")
        create_tables(db)

        print("Seeding admin user...")
        seed_admin(db)

        print("Seeding all coupon cards...")
        seed_all_cards(db)

        print("Seeding 100 winning cards...")
        seed_winning_cards(db)

        db.close()
        print("\n✅ Database migration complete!")
        return True

    except Exception as e:
        print(f"❌ Migration failed: {e}")
        return False


if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
