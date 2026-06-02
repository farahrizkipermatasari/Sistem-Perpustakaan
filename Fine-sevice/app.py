import os
import time
import psycopg2
from flask import Flask, jsonify, request

app = Flask(__name__)

DB_HOST = os.getenv("DB_HOST", "fine-db")
DB_NAME = os.getenv("DB_NAME", "fine_db")
DB_USER = os.getenv("DB_USER", "fine_user")
DB_PASSWORD = os.getenv("DB_PASSWORD", "fine_password")
DB_PORT = os.getenv("DB_PORT", "5432")

conn = None

def connect_with_retry(retries=20, delay=3):
    global conn

    for attempt in range(1, retries + 1):
        try:
            conn = psycopg2.connect(
                host=DB_HOST,
                database=DB_NAME,
                user=DB_USER,
                password=DB_PASSWORD,
                port=DB_PORT
            )

            print("Fine Service berhasil terhubung ke PostgreSQL")
            return

        except Exception:
            print(f"Menunggu PostgreSQL siap... percobaan {attempt}")
            time.sleep(delay)

    raise Exception("Fine Service gagal terhubung ke PostgreSQL")


def init_database():
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS fines (
            id SERIAL PRIMARY KEY,
            customer_name VARCHAR(100) NOT NULL,
            amount INTEGER NOT NULL,
            reason TEXT
        )
    """)

    cursor.execute("SELECT COUNT(*) FROM fines")
    total = cursor.fetchone()[0]

    if total == 0:
        cursor.execute("""
            INSERT INTO fines (customer_name, amount, reason)
            VALUES
            ('Andi', 50000, 'Keterlambatan pembayaran'),
            ('Budi', 100000, 'Pelanggaran kontrak')
        """)
        conn.commit()

    cursor.close()


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "service": "fine-service",
        "language": "Python",
        "framework": "Flask",
        "database": "PostgreSQL",
        "status": "running"
    })


@app.route("/fines", methods=["GET"])
def get_fines():

    cursor = conn.cursor()

    cursor.execute("""
        SELECT id, customer_name, amount, reason
        FROM fines
        ORDER BY id
    """)

    rows = cursor.fetchall()
    cursor.close()

    data = []

    for row in rows:
        data.append({
            "id": row[0],
            "customer_name": row[1],
            "amount": row[2],
            "reason": row[3]
        })

    return jsonify({
        "service": "fine-service",
        "data": data
    })


@app.route("/fines", methods=["POST"])
def create_fine():

    body = request.get_json()

    customer_name = body.get("customer_name")
    amount = body.get("amount")
    reason = body.get("reason")

    if not customer_name or amount is None:
        return jsonify({
            "message": "customer_name dan amount wajib diisi"
        }), 400

    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO fines (customer_name, amount, reason)
        VALUES (%s, %s, %s)
        RETURNING id
    """, (customer_name, amount, reason))

    new_id = cursor.fetchone()[0]

    conn.commit()
    cursor.close()

    return jsonify({
        "service": "fine-service",
        "message": "Data denda berhasil ditambahkan",
        "data": {
            "id": new_id,
            "customer_name": customer_name,
            "amount": amount,
            "reason": reason
        }
    }), 201


if __name__ == "__main__":
    connect_with_retry()
    init_database()

    app.run(host="0.0.0.0", port=5002)