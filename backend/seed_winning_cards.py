import argparse
import sqlite3
import os
import re

DATABASE = os.path.join(os.path.dirname(__file__), '..', 'database', 'db.sqlite3')


def get_db():
    db = sqlite3.connect(DATABASE)
    db.row_factory = sqlite3.Row
    return db


def normalize_prefix(prefix: str) -> str:
    p = (prefix or '').strip().upper()
    if not p:
        return "A"
    return p[0]


def normalize_card_number(prefix: str, number: int) -> str:
    return f"{prefix}{number:04d}"


def validate_card_code(card_code: str) -> bool:
    return bool(re.fullmatch(r"[A-Z]\d{4}", card_code))


def parse_args():
    parser = argparse.ArgumentParser(description="Seed winning coupon cards into the database.")
    parser.add_argument("--count", type=int, required=True, help="How many cards to generate")
    parser.add_argument("--prefix", type=str, default="A", help="Default 'A'")
    parser.add_argument("--start", type=int, default=2000, help="Starting numeric part. Default 2000")
    parser.add_argument("--prize", type=str, required=True, help="Prize name (exact string to store)")
    parser.add_argument("--partner", type=str, required=True, help="Partner name (exact string to store)")
    return parser.parse_args()


def seed_winning_cards(count: int, prefix: str, start: int, prize: str, partner: str):
    if count <= 0:
        raise ValueError("--count must be > 0")
    if start < 0:
        raise ValueError("--start must be >= 0")

    prefix = normalize_prefix(prefix)

    codes = [normalize_card_number(prefix, start + i) for i in range(count)]
    for code in codes:
        if not validate_card_code(code):
            raise ValueError(f"Generated invalid code: {code}")

    db = get_db()
    try:
        # Ensure table exists
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

        existing = db.execute(
            f"SELECT card_number FROM coupon_cards WHERE card_number IN ({','.join(['?'] * len(codes))})",
            codes,
        ).fetchall()
        existing_set = {r["card_number"] for r in existing}

        to_insert = [c for c in codes if c not in existing_set]

        if to_insert:
            db.executemany(
                """
                INSERT INTO coupon_cards (card_number, is_winner, prize, partner_name, redeemed)
                VALUES (?, 1, ?, ?, 0)
                """,
                [(c, prize, partner) for c in to_insert],
            )

        # If code exists already, we still enforce winner/prize/partner (idempotent)
        if codes:
            db.executemany(
                """
                UPDATE coupon_cards
                SET is_winner = 1,
                    prize = ?,
                    partner_name = ?,
                    redeemed = 0
                WHERE card_number = ?
                """,
                [(prize, partner, c) for c in codes],
            )

        db.commit()
        inserted_or_updated = len(codes)
        print(f"Successfully added {count} winning cards to database")
        # Note: if duplicates existed, "added" refers to requested count; updates still applied.
        return inserted_or_updated
    finally:
        db.close()


def main():
    args = parse_args()
    seed_winning_cards(
        count=args.count,
        prefix=args.prefix,
        start=args.start,
        prize=args.prize,
        partner=args.partner,
    )


if __name__ == "__main__":
    main()
