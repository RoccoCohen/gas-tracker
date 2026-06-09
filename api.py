import os
import psycopg2
import psycopg2.extras
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

DATABASE_URL = os.environ.get('DATABASE_URL', '')


def get_conn():
    return psycopg2.connect(DATABASE_URL)


def migrate():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS gas_entries (
            id         SERIAL PRIMARY KEY,
            amount     REAL,
            unit       TEXT,
            price      REAL,
            currency   TEXT,
            station    TEXT,
            date       TEXT,
            efs_card   INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)
    cur.execute("ALTER TABLE gas_entries ADD COLUMN IF NOT EXISTS efs_card INTEGER DEFAULT 0")
    conn.commit()
    cur.close()
    conn.close()


migrate()


# ── Static files ──────────────────────────────────────────────────────────────

@app.route('/')
def index():
    res = send_from_directory('.', 'index.html')
    res.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    return res

@app.route('/<path:filename>')
def static_files(filename):
    res = send_from_directory('.', filename)
    res.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    return res


# ── API ───────────────────────────────────────────────────────────────────────

@app.route('/entries', methods=['GET'])
def get_entries():
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        "SELECT id, amount, unit, price, currency, station, date, efs_card "
        "FROM gas_entries ORDER BY date DESC, id DESC"
    )
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route('/entries', methods=['POST'])
def add_entry():
    data = request.json
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO gas_entries (amount, unit, price, currency, station, date, efs_card) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s)",
        (
            data.get('amount'),
            data.get('unit'),
            data.get('price'),
            data.get('currency'),
            data.get('station', ''),
            data.get('date'),
            1 if data.get('efs_card') else 0,
        )
    )
    conn.commit()
    cur.close()
    conn.close()
    return jsonify({'status': 'ok'}), 201


@app.route('/entries/<int:entry_id>', methods=['DELETE'])
def delete_entry(entry_id):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM gas_entries WHERE id = %s", (entry_id,))
    conn.commit()
    cur.close()
    conn.close()
    return jsonify({'status': 'ok'})


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5050, debug=True)
