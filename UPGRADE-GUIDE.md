# Upgrade a Cloud Functions (Post-Evento)

## ⚠️ Soluzione attuale
I token Millicast sono **offuscati con base64** nel codice client. Questa è una soluzione **temporanea** per l'evento.

## 🔒 Soluzione definitiva - Cloud Functions

### Step 1: Upgrade Firebase a Blaze Plan
1. Vai su: https://console.firebase.google.com/project/bendingspoons-eventdec25/usage/details
2. Clicca "Upgrade" e seleziona **Blaze (pay-as-you-go)**
3. Configura billing (gratuito fino a soglie elevate)

### Step 2: Deploy Cloud Functions
```bash
firebase deploy --only functions
```

### Step 3: Verifica il deploy
Le Cloud Functions saranno disponibili su:
- `getMillicastToken`: genera token sicuri server-side
- `healthCheck`: endpoint di test

### Step 4: Aggiorna app.js
Il codice per usare Cloud Functions è già preparato in questo commit. 
Basta decommentare le righe con `httpsCallable` e rimuovere l'offuscamento.

### Step 5: Cambia token Millicast
Dopo l'evento, rigenera i token su Millicast Dashboard per invalidare quelli vecchi.

## 📊 Costi stimati
- Cloud Functions: **gratuiti** fino a 2M invocazioni/mese
- Per un evento con 100-500 persone: **€0**

## 🔐 Vantaggi
- Token non visibili nel codice client
- Controllo accessi server-side
- Analytics su chi accede allo stream
- Revocabile istantaneamente
