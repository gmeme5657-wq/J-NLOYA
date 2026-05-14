import json
from utils import (
    get_response, get_db, verify_admin
)


def handler(request):
    if request.method == "OPTIONS":
        return get_response(200, {})

    if request.method != "GET":
        return get_response(405, {"error": "Method not allowed"})

    payload, error = verify_admin(request)
    if error:
        return error

    try:
        db = get_db()
        cur = db.cursor()

        cur.execute(
            """SELECT card_number, prize, partner_name, redeemed
               FROM coupon_cards
               WHERE is_winner = TRUE
               ORDER BY card_number ASC"""
        )
        rows = cur.fetchall()
        cur.close()
        db.close()

        result = []
        for row in rows:
            result.append({
                "card_number": row[0],
                "prize": row[1],
                "partner_name": row[2],
                "redeemed": bool(row[3])
            })

        return get_response(200, result)

    except Exception as e:
        return get_response(500, {"error": str(e)})
