# Mondmission – Funkgerät (Web-App)

Live: https://abenteuerweltchen.github.io/mondmission-player/

- `?s=0…10` öffnet die Station (QR-Codes im Heft).
- `?k=<bestellung>` lädt `orders/<bestellung>.json` (persönliche Begrüßung mit Namen). Demo: `?k=emma`.
- Ohne `k` (und ohne gespeicherte Bestellung) laufen die Funksprüche ohne Namen.
- `audio/sXX_body.mp3` = Hauptteil (für alle gleich), `sXX_open_*/sXX_close_*` = Begrüßung/Abschluss.
- Neue Dateien holen: `tools/holen.json` (Liste aus `pfad` + `url`) pushen → GitHub Action „Audio holen“ lädt sie ins Repo.
