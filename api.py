import os
from flask import Flask, request, jsonify
from flask_cors import CORS
import pyodbc

app = Flask(__name__)
CORS(app)

conn_str = (
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=acoustic-black-ox.viviotech.us;"
    "DATABASE=Adam_Rocco;"
    f"UID={os.environ['DB_USER']};"
    f"PWD={os.environ['DB_PASSWORD']};"
    "Encrypt=yes;"
    "TrustServerCertificate=yes;"
)


def get_conn():
    return pyodbc.connect(conn_str)


@app.route('/entries', methods=['GET'])
def get_entries():
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, amount, unit, price, currency, station, CONVERT(varchar, date, 23) "
        "FROM fill_ups ORDER BY date DESC"
    )
    rows = cursor.fetchall()
    conn.close()
    return jsonify([
        {
            'id': row[0],
            'amount': row[1],
            'unit': row[2],
            'price': row[3],
            'currency': row[4],
            'station': row[5] or '',
            'date': row[6],
        }
        for row in rows
    ])


@app.route('/entries', methods=['POST'])
def add_entry():
    data = request.json
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO fill_ups (amount, unit, price, currency, station, date) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        data['amount'], data['unit'], data['price'],
        data['currency'], data['station'], data['date'],
    )
    conn.commit()
    conn.close()
    return jsonify({'status': 'ok'}), 201


@app.route('/entries/<int:entry_id>', methods=['DELETE'])
def delete_entry(entry_id):
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM fill_ups WHERE id = ?", entry_id)
    conn.commit()
    conn.close()
    return jsonify({'status': 'ok'})


if __name__ == '__main__':
    app.run(debug=True)
