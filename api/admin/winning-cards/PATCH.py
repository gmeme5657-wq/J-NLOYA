import json
from utils import (
    get_response, get_db, verify_admin, parse_json_body,
    normalize_card_number, is_valid_card_number, PRIZE_TYPES
)


def handler(request):
    if request.method == "OPTIONS":
        return get_response(200, {})

    if request.method != "PATCH":
        return get_response(405, {"error": "Method not allowed"})

    payload, error = verify_admin(request)
    if error:
        return error

    data = parse_json_body(request)
    card_number = normalize_card_number(str(data.get("card_number", "")))

    prize = data.get("prize")
    partner_name = data.get("partner_name")
    redeemed = data.get("redeemed")

    if not card_number or not is_valid_card_number(card_number):
        return get_response(400, {"error": "Invalid card_number"})

    if prize is not None and prize not in list(PRIZE_TYPES.values()):
        return get_response(400, {"error": "Invalid prize type"})

    if partner_name is not None and not isinstance(partner_name, str):
        return get_response(400, {"error": "Invalid partner_name"})

    if redeemed not in [True, False, None]:
        return get_response(400, {"error": "redeemed must be true/false"})

    try:
        db = get_db()
        cur = db.cursor()

        cur.execute(
            "SELECT * FROM coupon_cards WHERE card_number = %s AND is_winner = TRUE",
            (card_number,)
        )
        card = cur.fetchone()

        if not card:
            cur.close()
            db.close()
            return get_response(404, {"error": "Card not found or not a winning card"})

        fields = []
        params = []

        if prize is not None:
            fields.append("prize = %s")
            params.append(prize)
        if partner_name is not None:
            fields.append("partner_name = %s")
            params.append(partner_name)
        if redeemed is not None:
            fields.append("redeemed = %s")
            params.append(redeemed)

        if fields:
            sql = "UPDATE coupon_cards SET " + ", ".join(fields) + " WHERE card_number = %s"
            params.append(card_number)
            cur.execute(sql, params)

        db.commit()
        cur.close()
        db.close()
        return get_response(200, {"success": True})

    except Exception as e:
        return get_response(500, {"error": str(e)})
