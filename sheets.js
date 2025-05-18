const { google } = require('googleapis');

// Charger la clé JSON depuis la variable d'environnement (string JSON)
const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);

// Initialisation de l'authentification
const auth = new google.auth.GoogleAuth({
  credentials: serviceAccount,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

// Création du client sheets
const sheets = google.sheets({ version: 'v4', auth });

// ID de ta feuille Google Sheets (à remplacer par ton propre ID)
const SPREADSHEET_ID = 'ton_id_de_feuille_ici';

// Exemple : Fonction pour lire une plage de cellules
async function lirePlage(range) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: range,
  });
  return res.data.values || [];
}

// Exemple : Fonction pour écrire dans une plage de cellules
async function ecrirePlage(range, values) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: range,
    valueInputOption: 'RAW',
    requestBody: {
      values: values,
    },
  });
}

// Exporter les fonctions pour les utiliser dans ton bot
module.exports = {
  lirePlage,
  ecrirePlage,
};
