import os
import sqlite3
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

DB_PATH = os.environ.get('DB_PATH', 'gas_tracker.db')


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def migrate():
    conn = get_conn()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS gas_entries (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            amount    REAL,
            unit      TEXT,
            price     REAL,
            currency  TEXT,
            station   TEXT,
            date      TEXT,
            added_by  TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        )
    """)
    conn.commit()
    conn.close()


# ── Static files ──────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:filename>')
def static_files(filename):
    return send_from_directory('.', filename)


# ── API ───────────────────────────────────────────────────────────────────────

@app.route('/entries', methods=['GET'])
def get_entries():
    conn = get_conn()
    rows = conn.execute(
        "SELECT id, amount, unit, price, currency, station, date, added_by "
        "FROM gas_entries ORDER BY date DESC, id DESC"
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route('/entries', methods=['POST'])
def add_entry():
    data = request.json
    conn = get_conn()
    conn.execute(
        "INSERT INTO gas_entries (amount, unit, price, currency, station, date, added_by) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            data.get('amount'),
            data.get('unit'),
            data.get('price'),
            data.get('currency'),
            data.get('station', ''),
            data.get('date'),
            data.get('added_by', ''),
        )
    )
    conn.commit()
    conn.close()
    return jsonify({'status': 'ok'}), 201


@app.route('/entries/<int:entry_id>', methods=['DELETE'])
def delete_entry(entry_id):
    conn = get_conn()
    conn.execute("DELETE FROM gas_entries WHERE id = ?", (entry_id,))
    conn.commit()
    conn.close()
    return jsonify({'status': 'ok'})


if __name__ == '__main__':
    migrate()
    app.run(host='0.0.0.0', port=5050, debug=True)
