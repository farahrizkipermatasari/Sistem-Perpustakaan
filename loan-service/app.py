import os
import time
import psycopg2
import requests
from flask import Flask, jsonify, request

app = Flask(__name__)

DB_HOST = os.getenv("DB_HOST", "loan-db")
DB_NAME = os.getenv("DB_NAME", "loan_db")
DB_USER = os.getenv("DB_USER", "loan_user")
DB_PASSWORD = os.getenv("DB_PASSWORD", "loan_password")
DB_PORT = os.getenv("DB_PORT", "5432")

MEMBER_SERVICE_URL = os.getenv(
    "MEMBER_SERVICE_URL",
    "http://member-service:8081"    
)

BOOK_SERVICE_URL = os.getenv(
    "BOOK_SERVICE_URL",
    "http://book-service:3001"
)

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


def get_connection():
    global conn
    if conn is None or conn.closed != 0:
        connect_with_retry()
    return conn

def init_database():
    connection = get_connection()
    cursor = connection.cursor()

    try:
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS loans (
                id SERIAL PRIMARY KEY,
                member_id INTEGER,
                member_name VARCHAR(100),
                book_id VARCHAR(100),
                book_title VARCHAR(200),
                status VARCHAR(20) DEFAULT 'borrowed'
            )
        """)

        cursor.execute("""
            ALTER TABLE loans
            ADD COLUMN IF NOT EXISTS member_id INTEGER
        """)
        cursor.execute(""" 
            ALTER TABLE loans 
            ADD COLUMN IF NOT EXISTS book_id VARCHAR(100)
        """)
        cursor.execute("""
            ALTER TABLE loans
            ADD COLUMN IF NOT EXISTS member_name VARCHAR(100)
        """)
        cursor.execute("""
            ALTER TABLE loans
            ADD COLUMN IF NOT EXISTS book_title VARCHAR(200)
        """)
        cursor.execute("""
            ALTER TABLE loans
            ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'borrowed'
        """)
        cursor.execute("SELECT COUNT(*) FROM loans")
        total = cursor.fetchone()[0]

        if total == 0:
            cursor.execute("""
                INSERT INTO loans (
                    member_id,
                    member_name,
                    book_id,
                    book_title,
                    status
                )
                VALUES
                    (
                        1,
                        'Nafi Maula',
                        '6a1ea601d57532acad5aa794',
                        'Node.js Dasar',
                        'borrowed'
                    ),
                    (
                        2,
                        'Rina Yulia',
                        '6a1ea601d57532acad5aa795',
                        'MongoDB Praktis',
                        'returned'
                    )
                           
            """)
            cursor.execute("""
                SELECT setval(
                    pg_get_serial_sequence('loans', 'id'),
                    COALESCE((SELECT MAX(id) FROM loans), 1),
                    true
                )
            """)
        connection.commit()
        print("Tabel loan siap dipakai")
    
    except Exception:
        connection.rollback()
        raise

    finally:
        cursor.close()

def get_member_from_service(member_id):
    try:
        response = requests.get(
            f"{MEMBER_SERVICE_URL}/members/{member_id}",
            timeout=5
        )

        if response.status_code == 404:
            return None, "Member tidak ditemukan"
        response.raise_for_status()
        result = response.json()
        member = result.get("data", result)
        return member, None
    
    except requests.RequestException:
        return None, "Member Service tidak dapat dipakai"
    
def get_book_from_service(book_id):
    try:
        response = requests.get(
            f"{BOOK_SERVICE_URL}/books/{book_id}",
            timeout=5
        )

        if response.status_code == 404:
            return None, "Buku tidak ditemukan"
        response.raise_for_status()
        result = response.json()
        book = result.get("data", result)
        return book, None
    
    except requests.RequestException:
        return None, "Book Service tidak dapat dipakai"

def update_book_stock(book_id, delta):
    try:
        response = requests.patch(
            f"{BOOK_SERVICE_URL}/books/{book_id}/stock",
            json={"delta": delta},
            timeout=5
        )

        result = response.json()
        if response.status_code != 200:
            return None, result.get("message", "Gagal memperbarui stok buku")
        return True, None
    except requests.RequestException:
        return False, "Book Service tidak dapat dipakai"


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
    connection = get_connection()
    cursor = connection.cursor()

    try:
        cursor.execute("""
            SELECT
                id,
                member_id,
                member_name,
                book_id,
                book_title,
                status
            FROM loans
            ORDER BY id
        """)
        rows = cursor.fetchall()

        data = []

        for row in rows:
            data.append({
                "id": row[0],
                "member_id": row[1],
                "member_name": row[2],
                "book_id": row[3],
                "book_title": row[4],
                "status": row[5]
            })
        return jsonify({
            "service": "loan-service",
            "database": "postgresql",
            "data": data
        }), 200
    finally:
        cursor.close()

@app.route("/loans/<int:loan_id>", methods=["GET"])
def get_loan_by_id(loan_id):
    connection = get_connection()
    cursor = connection.cursor()

    try:
        cursor.execute("""
            SELECT
                id,
                member_id,
                member_name,
                book_id,
                book_title,
                status
            FROM loans
            WHERE id = %s
        """, (loan_id,))
        row = cursor.fetchone()
        if row is None:
            return jsonify({
                "message": "Loan tidak ditemukan"
            }), 404
        return jsonify({
            "id": row[0],
            "member_id": row[1],
            "member_name": row[2],
            "book_id": row[3],
            "book_title": row[4],
            "status": row[5]
        }), 200
    finally:
        cursor.close()

@app.route("/loans", methods=["POST"])
def create_loan():
    data = request.get_json(silent=True)

    if not data:
        return jsonify({
            "message": "Data tidak valid"
        }), 400
    required_fields = [
        "member_id",
        "book_id"
    ]

    missing_fields = [
        field
        for field in required_fields
        if field not in data or data[field] in (None, "")
    ]

    if missing_fields:
        return jsonify({
            "message": "Data peminjaman tidak lengkap",
            "missing_fields": missing_fields
        }), 400
    
    member, member_error = get_member_from_service(data["member_id"])

    if member_error:
        return jsonify({
            "message": member_error
        }), 400
    
    book, book_error = get_book_from_service(data["book_id"])
    
    if book_error:
        return jsonify({
            "message": book_error
        }), 400
    
    if book.get("stock", 0) <= 0:
        return jsonify({
            "message": "Stok buku habis"
        }), 400
    
    stock_update, stock_error = update_book_stock(data["book_id"], -1)

    if not stock_update:
        return jsonify({
            "message": stock_error
        }), 400
    
    member_name = member["name"]
    book_title = book["title"]
        
    status = data.get("status", "borrowed")

    connection = get_connection()
    cursor = connection.cursor()
    
    try:
        cursor.execute("""
            INSERT INTO loans (
                member_id,
                member_name,
                book_id,
                book_title,
                status
            )
            VALUES (%s, %s, %s, %s, %s)
            RETURNING
                id,
                member_id,
                member_name,
                book_id,
                book_title,
                status
        """, (
            data["member_id"],
            member_name,
            data["book_id"],
            book_title,
            status
        ))

        row = cursor.fetchone()
        connection.commit()

        return jsonify({
            "message": "Data peminjaman berhasil ditambahkan",
            "data": {
                "id": row[0],
                "member_id": row[1],
                "member_name": row[2],
                "book_id": row[3],
                "book_title": row[4],
                "status": row[5]
            }
        }), 201
    except Exception as error:
        connection.rollback()
        update_book_stock(data["book_id"], 1)
        return jsonify({
            "message": "Gagal menambahkan data peminjam",
            "error": str(error)
        }), 500
    finally:
        cursor.close()

@app.route("/loans/<int:loan_id>", methods=["PUT"])
def update_loan(loan_id):
    data = request.get_json(silent=True)

    if not data:
        return jsonify({
            "message": "Body request harus berupa JSON"
        }), 400

    allowed_fields = {
        "member_id",
        "member_name",
        "book_id",
        "book_title",
        "status"
    }

    update_fields = []
    update_values = []

    for field in allowed_fields:
        if field in data:
            update_fields.append(f"{field} = %s")
            update_values.append(data[field])

    if not update_fields:
        return jsonify({
            "message": "Tidak ada field yang dapat diperbarui"
        }), 400

    if "status" in data:
        allowed_status = ["borrowed", "returned"]

        if data["status"] not in allowed_status:
            return jsonify({
                "message": "Status harus borrowed atau returned"
            }), 400

    

    connection = get_connection()
    cursor = connection.cursor()

    try:
        cursor.execute("""
            SELECT book_id, status
            FROM loans
            WHERE id = %s
        """, (loan_id,))

        old_loan = cursor.fetchone()

        if old_loan is None:
            return jsonify({
                "message": "Loan tidak ditemukan"
            }), 404
        
        old_book_id = old_loan[0]
        old_status = old_loan[1]
        update_values.append(loan_id)

        cursor.execute(f"""
            UPDATE loans
            SET {", ".join(update_fields)}
            WHERE id = %s
            RETURNING
                id,
                member_id,
                member_name,
                book_id,
                book_title,
                status
        """, tuple(update_values))

        row = cursor.fetchone()

        new_status = row[5]

        if old_status == "borrowed" and new_status == "returned":
            stock_update, stock_error = update_book_stock(old_book_id, 1)
            if not stock_update:
                connection.rollback()
                return jsonify({
                    "message": stock_error
                }), 400

        connection.commit()

        return jsonify({
            "message": "Data peminjaman berhasil diperbarui",
            "data": {
                "id": row[0],
                "member_id": row[1],
                "member_name": row[2],
                "book_id": row[3],
                "book_title": row[4],
                "status": row[5]
            }
        }), 200

    except Exception as error:
        connection.rollback()

        return jsonify({
            "message": "Gagal memperbarui data peminjaman",
            "error": str(error)
        }), 500
    
    finally:
        cursor.close()

@app.route("/loans/<int:loan_id>", methods=["DELETE"])
def delete_loan(loan_id):
    connection = get_connection()
    cursor = connection.cursor()

    try:
        cursor.execute("""
            DELETE FROM loans
            WHERE id = %s
            RETURNING id
        """, (loan_id,))

        row = cursor.fetchone()

        if row is None:
            connection.rollback()

            return jsonify({
                "message": "Loan tidak ditemukan"
            }), 404

        connection.commit()

        return jsonify({
            "message": "Data peminjaman berhasil dihapus",
            "id": row[0]
        }), 200

    except Exception as error:
        connection.rollback()

        return jsonify({
            "message": "Gagal menghapus data peminjaman",
            "error": str(error)
        }), 500

    finally:
        cursor.close()

if __name__ == "__main__":
    connect_with_retry()
    init_database()
    app.run(host="0.0.0.0", port=5001)