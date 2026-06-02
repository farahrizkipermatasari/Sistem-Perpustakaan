fimport os
import time
import psycopg2
from flask import Flask, jsonify

app = Flask(__name__)

DB_HOST = os.getenv("DB_HOST", "loan-db")
DB_NAME = os.getenv("DB_NAME", "loan_db")
DB_USER = os.getenv("DB_USER", "loan_user")
DB_PASSWORD = os.getenv("DB_PASSWORD", "loan_password")
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
            print("Loan Service berhasil terhubung ke PostgreSQL")
            return
        except Exception:
            print(f"Menunggu PostgreSQL siap... percobaan {attempt}")
            time.sleep(delay)

    raise Exception("Loan Service gagal terhubung ke PostgreSQL")


def init_database():
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS loans (
            id SERIAL PRIMARY KEY,
            member_name VARCHAR(100),
            book_title VARCHAR(100),
            status VARCHAR(50)
        )
    """)

    cursor.execute("SELECT COUNT(*) FROM loans")
    total = cursor.fetchone()[0]

    if total == 0:
        cursor.execute("""
            INSERT INTO loans (member_name, book_title, status)
            VALUES
            ('Wulan', 'Pemrograman Python', 'borrowed'),
            ('David', 'Database PostgreSQL', 'returned')
        """)
        conn.commit()

    cursor.close()


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "service": "loan-service",
        "language": "Python",
        "framework": "Flask",
        "database": "postgresql",
        "status": "running"
    })


@app.route("/loans", methods=["GET"])
def get_loans():
    cursor = conn.cursor()

    cursor.execute("""
        SELECT id, member_name, book_title, status
        FROM loans
        ORDER BY id
    """)

    rows = cursor.fetchall()
    cursor.close()

    data = []

    for row in rows:
        data.append({
            "id": row[0],
            "member_name": row[1],
            "book_title": row[2],
            "status": row[3]
        })

    return jsonify({
        "service": "loan-service",
        "database": "postgresql",
        "data": data
    })


if __name__ == "__main__":
    connect_with_retry()
    init_database()
    app.run(host="0.0.0.0", port=5000)