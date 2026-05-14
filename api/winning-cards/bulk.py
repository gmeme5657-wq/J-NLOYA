import json
from utils import (
    get_response, get_db, verify_admin, parse_json_body,
    normalize_card_number, is_valid_card_number
)


def handler(request):
    if request.method == "OPTIONS":
        return get_response(200, {})

    if request.method != "POST":
        return get_response(405, {"error": "Method not allowed"})

    payload, error = verify_admin(request)
    if error:
        return error

    data = parse_json_body(request)
    cards = data.get("cards", [])

    if not isinstance(cards, list) or len(cards) == 0:
        return get_response(400, {"error": "cards must be a non-empty array"})

    allowed_prizes = {
        "10% Discount",
        "Free Drink",
        "10% Discount on Drinks",
        "VIP Combo Offer",
    }

    normalized = []
    for item in cards:
        if not isinstance(item, dict):
            return get_response(400, {"error": "Each card must be an object"})

        raw_cn = item.get("card_number", "")
        card_number = normalize_card_number(str(raw_cn))
        if not card_number or not is_valid_card_number(card_number):
            return get_response(400, {"error": f"Invalid card_number: {raw_cn}"})

        prize = item.get("prize")
        if prize is None or not isinstance(prize, str) or prize not in allowed_prizes:
            return get_response(400, {"error": f"Invalid prize for {card_number}"})

        partner_name = item.get("partner_name")
        if partner_name is None or not isinstance(partner_name, str) or not partner_name.strip():
            return get_response(400, {"error": f"Invalid partner_name for {card_number}"})

        normalized.append({
            "card_number": card_number,
            "prize": prize,
            "partner_name": partner_name.strip(),
        })

    try:
        db = get_db()
        cur = db.cursor()

        for row in normalized:
            cur.execute(
                """INSERT INTO coupon_cards (card_number, is_winner, prize, partner_name, redeemed)
                   VALUES (%s, TRUE, %s, %s, FALSE)
                   ON CONFLICT (card_number) DO UPDATE SET
                      is_winner=TRUE,
                      prize=excluded.prize,
                      partner_name=excluded.partner_name,
                      redeemed=FALSE""",
                (row["card_number"], row["prize"], row["partner_name"])
            )

        db.commit()
        cur.close()
        db.close()

        return get_response(200, {
            "success": True,
            "addedOrUpdated": len(normalized)
        })

    except Exception as e:
        return get_response(500, {"error": str(e)})
