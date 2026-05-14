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

        cur.execute("SELECT COUNT(*) FROM coupon_cards")
        total_cards = cur.fetchone()[0]

        cur.execute("SELECT COUNT(*) FROM customer_entries")
        total_entries = cur.fetchone()[0]

        cur.execute("SELECT COUNT(*) FROM customer_entries WHERE result = %s", ("Won",))
        total_winners = cur.fetchone()[0]

        cur.execute("SELECT COUNT(*) FROM customer_entries WHERE result = %s", ("Lost",))
        total_losers = cur.fetchone()[0]

        cur.execute(
            "SELECT COUNT(*) FROM customer_entries WHERE redeemed = TRUE AND result = %s",
            ("Won",)
        )
        redeemed_prizes = cur.fetchone()[0]

        cur.execute(
            "SELECT COUNT(*) FROM customer_entries WHERE redeemed = FALSE AND result = %s",
            ("Won",)
        )
        pending_redemptions = cur.fetchone()[0]

        cur.close()
        db.close()

        return get_response(200, {
            "totalCards": total_cards,
            "totalWinners": total_winners,
            "totalLosers": total_losers,
            "redeemedPrizes": redeemed_prizes,
            "pendingRedemptions": pending_redemptions
        })

    except Exception as e:
        return get_response(500, {"error": str(e)})
