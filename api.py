import os
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import pymssql
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)


def get_conn():
    return pymssql.connect(
        server='acoustic-black-ox.viviotech.us',
        user=os.environ['DB_USER'],
        password=os.environ['DB_PASSWORD'],
        database='Adam_Rocco',
        tds_version='7.4',
        login_timeout=10,
        timeout=10,
    )


def migrate():
    """Add added_by column to rv_gas if it doesn't exist yet."""
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute("""
        IF NOT EXISTS (
            SELECT * FROM sys.columns
            WHERE object_id = OBJECT_ID('rv_gas') AND name = 'added_by'
        )
        ALTER TABLE rv_gas ADD added_by NVARCHAR(100) NULL
    """)
    conn.commit()
    conn.close()


# ── Static file serving ───────────────────────────────────────────────────────

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:filename>')
def static_files(filename):
    return send_from_directory('.', filename)


# ── API ───────────────────────────────────────────────────────────────────────

@app.route('/entries', methods=['GET'])
def get_entries():
    try:
        conn = get_conn()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, amount, unit, price, currency, station, "
            "CONVERT(varchar, date, 23), added_by "
            "FROM rv_gas ORDER BY date DESC"
        )
        rows = cursor.fetchall()
        conn.close()
        return jsonify([
            {
                'id':        row[0],
                'amount':    row[1],
                'unit':      row[2],
                'price':     row[3],
                'currency':  row[4],
                'station':   row[5] or '',
                'date':      row[6],
                'added_by':  row[7] or '',
            }
            for row in rows
        ])
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/entries', methods=['POST'])
def add_entry():
    try:
        data = request.json
        conn = get_conn()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO rv_gas (amount, unit, price, currency, station, date, added_by) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                data['amount'],
                data['unit'],
                data['price'],
                data['currency'],
                data['station'],
                data['date'],
                data.get('added_by', ''),
            ),
        )
        conn.commit()
        conn.close()
        return jsonify({'status': 'ok'}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/entries/<int:entry_id>', methods=['DELETE'])
def delete_entry(entry_id):
    try:
        conn = get_conn()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM rv_gas WHERE id = ?", (entry_id,))
        conn.commit()
        conn.close()
        return jsonify({'status': 'ok'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    try:
        migrate()
    except Exception as e:
        print(f'[warn] DB migration skipped: {e}')
    app.run(host='0.0.0.0', port=5050, debug=True)
