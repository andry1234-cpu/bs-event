# Bending Spoons - Internal Event Landing Page

Landing page per evento interno con streaming video, chat live e reactions interattive.

## Funzionalità

✅ **Player Video CASTR**
- Embed player audio/video CASTR
- Aspect ratio 16:9 responsive
- Placeholder fino alla configurazione dell'URL

✅ **Chat Live**
- Messaggi in tempo reale
- Contatore utenti online
- Auto-scroll
- Timestamp sui messaggi

✅ **Live Reactions**
- 5 reactions disponibili: 👍 ❤️ 😂 🎉 👏
- Animazioni floating sopra il player
- Sincronizzazione tra utenti (da implementare con backend)

## Come Usare

### 1. Aprire la pagina
Apri `index.html` in un browser web moderno.

### 2. Configurare il Player CASTR
Una volta ottenuto l'URL del player CASTR, configura l'embed in due modi:

**Opzione A - Via Console:**
```javascript
EventPage.setCastrUrl('https://your-castr-embed-url-here');
```

**Opzione B - Modificare `app.js`:**
```javascript
const CONFIG = {
    castrPlayerUrl: 'https://your-castr-embed-url-here',
    // ...
};
```

### 3. Personalizzare Username
```javascript
EventPage.setUsername('TuoNome');
```

## Struttura File

```
├── index.html      # Struttura HTML principale
├── styles.css      # Stili e design
├── app.js          # Logica JavaScript
└── README.md       # Documentazione
```

## Prossimi Step (Autenticazione)

Opzioni da valutare:
- **Auth0 / Firebase Auth** - Soluzione managed completa
- **Magic Links** - Autenticazione via email senza password
- **OAuth** - Login con Google/Microsoft
- **JWT + Backend custom** - Controllo completo
- **Simple PIN/Password** - Accesso con codice evento

## Funzionalità da Implementare con Backend

Per una versione production-ready, sarà necessario:

1. **WebSocket Server** per chat e reactions real-time
2. **Database** per persistenza messaggi
3. **Sistema di autenticazione** (da scegliere)
4. **API backend** per gestione utenti e sessioni

## Tecnologie Utilizzate

- HTML5
- CSS3 (Grid, Flexbox, Animations)
- JavaScript Vanilla (ES6+)
- CASTR Streaming Platform

## Browser Supportati

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)

## Note

- Attualmente la chat e le reactions funzionano solo localmente
- Include simulazione di messaggi e reactions per demo
- Responsive design per mobile e tablet
