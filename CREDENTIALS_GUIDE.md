# How to Get Google Service Account Credentials

For a robust "Company" application, we should use a **Service Account**. This allows the app to access private sheets without you needing to log in every time.

## Steps:
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a **New Project** (e.g., "Sheet-Sync-App").
3. Enable **Google Sheets API**:
   - Go to "APIs & Services" > "Library".
   - Search for "Google Sheets API" and click **Enable**.
4. Create a **Service Account**:
   - Go to "APIs & Services" > "Credentials".
   - Click "Create Credentials" > "Service Account".
   - Give it a name (e.g., "sheet-syncer").
   - Click "Done".
5. Generate **Keys**:
   - Click on the newly created Service Account (email address).
   - Go to the **Keys** tab.
   - Click "Add Key" > "Create new key" > **JSON**.
   - A file will download. **Rename this file to `credentials.json`**.
6. **Share the Sheet**:
   - Open your Google Sheet.
   - Click **Share**.
   - Copy the **Service Account Email** (from the Cloud Console or the JSON file).
   - Paste it into the Share dialog and give it **Editor** or **Viewer** access.

Please place the `credentials.json` file in the `server/` folder once the project is created.
