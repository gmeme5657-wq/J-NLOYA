import json
from utils import (
    get_response, get_db, verify_admin, parse_json_body,
    normalize_card_number
)


def handler(request):
    if request.method == "OPTIONS":
        return get_response(200, {})

    if request.method != "DELETE":
        return get_response(405, {"error": "Method not allowed"})

    payload, error = verify_admin(request)
    if error:
        return error

    data = parse_json_body(request)
    card_number = normalize_card_number(str(data.get("card_number", "")))

    if not card_number:
        return get_response(400, {"error": "Invalid card_number"})

    try:
        db = get_db()
        cur = db.cursor()

        cur.execute(
            "DELETE FROM coupon_cards WHERE card_number = %s AND is_winner = TRUE",
            (card_number,)
        )

        db.commit()
        cur.close()
        db.close()
        return get_response(200, {"success": True})

    except Exception as e:
        return get_response(500, {"error": str(e)})
