import sqlite3
import json
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
db_path = os.path.join(SCRIPT_DIR, 'data/database.sqlite')
output_path = os.path.join(SCRIPT_DIR, '2fauth_export_bitwarden.json')

def export_to_bitwarden_json():
    if not os.path.exists(db_path):
        print(f"Error: Database not found at {db_path}")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Query the necessary fields
    cursor.execute("SELECT service, account, secret FROM twofaccounts")
    rows = cursor.fetchall()

    items = []
    for row in rows:
        service, account, secret = row
        
        # Bitwarden JSON structure for a login item
        item = {
            "type": 1,  # 1 for Login
            "name": service,
            "notes": "Exported from 2FAuth",
            "login": {
                "username": account,
                "totp": secret
            }
        }
        items.append(item)

    export_data = {
        "items": items
    }

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(export_data, f, indent=2)

    conn.close()
    print(f"Successfully exported {len(rows)} accounts to {output_path}")

if __name__ == "__main__":
    export_to_bitwarden_json()
