import json
from utils import (
    get_response, get_db, verify_admin, parse_json_body
)


def handler(request):
    if request.method == "OPTIONS":
        return get_response(200, {})

    if request.method != "GET":
        return get_response(405, {"error": "Method not allowed"})

    payload, error = verify_admin(request)
    if error:
        return error

    q = (request.args.get("q") or "").strip()
    result = (request.args.get("result") or "").strip()
    redeemed = (request.args.get("redeemed") or "").strip()

    try:
        db = get_db()
        cur = db.cursor()

        where = []
        params = []

        if q:
            where.append(
                "(name LIKE %s OR phone LIKE %s OR card_number LIKE %s)"
            )
            like = f"%{q}%"
            params.extend([like, like, like])

        if result in ["Won", "Lost"]:
            where.append("result = %s")
            params.append(result)

        if redeemed in ["true", "false"]:
            where.append("redeemed = %s")
            params.append(True if redeemed == "true" else False)

        where_sql = ("WHERE " + " AND ".join(where)) if where else ""
        query = f"""
            SELECT id, name, phone, card_number, result, prize, date, redeemed
            FROM customer_entries
            {where_sql}
            ORDER BY date DESC
        """

        cur.execute(query, params)
        rows = cur.fetchall()
        cur.close()
        db.close()

        result_rows = []
        for row in rows:
            result_rows.append({
                "id": row[0],
                "name": row[1],
                "phone": row[2],
                "card_number": row[3],
                "result": row[4],
                "prize": row[5],
                "date": row[6],
                "redeemed": row[7]
            })

        return get_response(200, result_rows)

    except Exception as e:
        return get_response(500, {"error": str(e)})
