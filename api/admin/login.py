import json
from datetime import datetime, timedelta
from utils import (
    get_response, get_db, create_auth_token, parse_json_body
)


def handler(request):
    if request.method == "OPTIONS":
        return get_response(200, {})

    if request.method != "POST":
        return get_response(405, {"error": "Method not allowed"})

    data = parse_json_body(request)
    username = data.get("username")
    password = data.get("password")

    if not username or not password:
        return get_response(400, {"error": "Missing username or password"})

    try:
        db = get_db()
        cur = db.cursor()
        cur.execute(
            "SELECT * FROM admins WHERE username = %s AND password = %s",
            (username, password)
        )
        admin = cur.fetchone()
        cur.close()
        db.close()

        if admin:
            token = create_auth_token()
            response = get_response(200, {"success": True})
            response["headers"]["Set-Cookie"] = (
                f"admin_token={token}; Path=/; HttpOnly; SameSite=None; Secure; "
                f"Max-Age={86400 * 7}"  # 7 days
            )
            return response
        return get_response(401, {"error": "Invalid credentials"})
    except Exception as e:
        return get_response(500, {"error": str(e)})
