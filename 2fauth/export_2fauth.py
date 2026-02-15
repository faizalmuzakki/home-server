import sqlite3
import csv
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
db_path = os.path.join(SCRIPT_DIR, 'data/database.sqlite')
output_path = os.path.join(SCRIPT_DIR, '2fauth_export_bitwarden.csv')

def export_to_bitwarden():
    if not os.path.exists(db_path):
        print(f"Error: Database not found at {db_path}")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Query the necessary fields
    # Fields in twofaccounts: service, account, secret, otp_type
    cursor.execute("SELECT service, account, secret FROM twofaccounts")
    rows = cursor.fetchall()

    # Bitwarden CSV headers for Login items
    # folder,favorite,type,name,notes,fields,login_uri,login_username,login_password,login_totp
    headers = [
        'folder', 'favorite', 'type', 'name', 'notes', 'fields', 
        'login_uri', 'login_username', 'login_password', 'login_totp'
    ]

    with open(output_path, 'w', newline='', encoding='utf-8') as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow(headers)

        for row in rows:
            service, account, secret = row
            
            # Map to Bitwarden columns
            writer.writerow([
                '',               # folder
                '0',              # favorite
                'login',          # type
                service,          # name
                'Exported from 2FAuth', # notes
                '',               # fields
                '',               # login_uri
                account,          # login_username
                '',               # login_password
                secret            # login_totp
            ])

    conn.close()
    print(f"Successfully exported {len(rows)} accounts to {output_path}")

if __name__ == "__main__":
    export_to_bitwarden()
