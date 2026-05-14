import json
import re
from datetime import datetime
from utils import (
    get_response, get_db, parse_json_body,
    normalize_card_number, is_valid_card_number,
    cameroon_phone_ok, normalize_phone
)


def handler(request):
    if request.method == "OPTIONS":
        return get_response(200, {})

    if request.method != "POST":
        return get_response(405, {"error": "Method not allowed"})

    data = parse_json_body(request)
    full_name = data.get("full_name")
    phone_number = data.get("phone_number")
    coupon_code = data.get("coupon_code")

    if not all([full_name, phone_number, coupon_code]):
        return get_response(400, {
            "status": "error",
            "message": "All fields required"
        })

    name = str(full_name).strip()
    phone = str(phone_number).strip()
    card_number = normalize_card_number(str(coupon_code))

    if not re.fullmatch(r"^[A-Za-z\s]{2,}$", name):
        return get_response(400, {
            "status": "error",
            "message": "Invalid name format"
        })

    if not cameroon_phone_ok(phone):
        return get_response(400, {
            "status": "error",
            "message": "Invalid phone number. Use 6XXXXXXXX or +2376XXXXXXXX."
        })

    if not is_valid_card_number(card_number):
        return get_response(200, {"status": "invalid_card"})

    phone_norm = normalize_phone(phone)

    try:
        db = get_db()
        cur = db.cursor()

        cur.execute(
            "SELECT * FROM coupon_cards WHERE card_number = %s",
            (card_number,)
        )
        card = cur.fetchone()

        if not card:
            cur.close()
            db.close()
            return get_response(200, {"status": "invalid_card"})

        is_winner = bool(card[1])  # is_winner column
        redeemed = bool(card[4])   # redeemed column

        if redeemed:
            cur.close()
            db.close()
            return get_response(200, {"status": "already_claimed"})

        now_iso = datetime.utcnow().isoformat()

        if is_winner:
            prize = card[2]  # prize column
            cur.execute(
                """INSERT INTO customer_entries
                   (name, phone, card_number, result, prize, redeemed, date)
                   VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                (name, phone_norm, card_number, "Won", prize, False, now_iso)
            )
            cur.execute(
                "UPDATE coupon_cards SET redeemed = TRUE WHERE card_number = %s",
                (card_number,)
            )
            db.commit()
            cur.close()
            db.close()
            return get_response(200, {"status": "won", "prize": prize})

        cur.execute(
            """INSERT INTO customer_entries
               (name, phone, card_number, result, prize, redeemed, date)
               VALUES (%s, %s, %s, %s, %s, %s, %s)""",
            (name, phone_norm, card_number, "Lost", None, False, now_iso)
        )
        db.commit()
        cur.close()
        db.close()
        return get_response(200, {"status": "lost"})

    except Exception as e:
        return get_response(500, {"error": str(e)})
