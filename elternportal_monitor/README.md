# Elternportal-Monitor

Der Monitor liest **Elternbriefe, Stundenplan und Schulaufgaben** aus dem Elternportal. Er kann täglich eine E-Mail versenden, Home-Assistant-Sensoren aktualisieren und bei neuen Elternbriefen über einen Home-Assistant-`notify`-Dienst pushen.

Wichtig: Die Anwendung lädt keine Elternbrief-Anhänge herunter und ruft keinen Bestätigungs-Endpunkt auf. Im Portal kann bereits der Download eines Elternbriefs dessen Empfang bestätigen.

## Schnellstart

Voraussetzungen: Node.js 20.6+ oder Docker.

1. `.env.example` nach `.env` kopieren.
2. Portal-Zugang und mindestens einen Benachrichtigungskanal eintragen.
3. Abhängigkeiten installieren und einmal testen:

   ```bash
   npm install
   npm test
   npm start
   ```

Falls das Portal die Anmeldung ablehnt, zuerst dieselbe E-Mail-Adresse und dasselbe Passwort manuell im Browser testen und beide Werte anschließend neu in `.env` eintragen. Werte mit `#`, Leerzeichen oder Sonderzeichen sicherheitshalber in doppelte Anführungszeichen setzen. `npm run diagnose:login` gibt ausschließlich anonymisierte Diagnosemerkmale aus.

Für den dauerhaften Betrieb:

```bash
docker compose up -d --build
```

## Installation als Home-Assistant-App

Voraussetzungen: Home Assistant OS oder Supervised sowie ein laufender MQTT-Broker. Beides wurde in der Zielinstallation bestätigt.

1. Unter **Einstellungen → Apps → App-Store → Repositories** die URL dieses GitHub-Repositories hinzufügen.
2. Den App-Store neu laden und **Elternportal Monitor** installieren.
3. In der App-Konfiguration Portal-Adresse, E-Mail-Adresse und Passwort setzen. `child_id: 0` bleibt für das einzige beziehungsweise aktuell ausgewählte Kind bestehen.
4. App starten und Protokoll prüfen.
5. Danach erscheinen die MQTT-Discovery-Entitäten automatisch in Home Assistant.

Für lokale Entwicklung kann alternativ der Ordner `elternportal_monitor` nach `/addons/elternportal_monitor` kopiert werden.

Der Brokerzugang wird innerhalb der App über die Supervisor-Diensterkennung bezogen; ein MQTT-Passwort muss nicht zusätzlich in der App-Konfiguration gespeichert werden.

Im Daemon-Modus wird sofort und danach alle `POLL_INTERVAL_MINUTES` geprüft. Eine Tageszusammenfassung wird frühestens ab `DAILY_EMAIL_HOUR` einmal je Kalendertag verschickt. Neue Briefe lösen unabhängig davon sofort E-Mail und – falls konfiguriert – Home-Assistant-Push aus. Beim allerersten Lauf werden vorhandene Briefe als Ausgangsbestand übernommen und nicht als „neu“ gemeldet.

## Geheimnisse

`.env` ist absichtlich ignoriert. Zugangsdaten und Tokens nur dort oder über den Secret-Mechanismus der Laufzeit setzen. Der lokale Status unter `data/state.json` enthält ausschließlich technische Briefschlüssel und Zeitstempel, keine Inhalte oder Zugangsdaten.

## Home Assistant

Die empfohlene Home-Assistant-App verwendet MQTT Discovery. Der ältere REST-Modus bleibt für externe Standalone-Installationen verfügbar: Mit `HA_URL` und einem Long-Lived Access Token in `HA_TOKEN` aktualisiert der Monitor:

- `sensor.elternportal_neue_elternbriefe`
- `sensor.elternportal_schulaufgaben`
- `sensor.elternportal_stundenplan`
- `binary_sensor.elternportal_monitor`

Für Push `HA_NOTIFY_SERVICE` auf den Dienstnamen ohne `notify.` setzen, zum Beispiel `mobile_app_mein_handy`. Die Entitäten werden über die REST-API erzeugt; sie sind nach einem Home-Assistant-Neustart erst nach dem nächsten Monitorlauf wieder vorhanden.

Eine einfache Dashboard-Karte liegt unter `home-assistant/dashboard.yaml`.

## Betriebshinweise

- Das Portal stellt keine dokumentierte öffentliche API bereit; die HTML-Parser sind deshalb durch Tests abgesichert, können aber nach Portaländerungen angepasst werden müssen.
- Fehler werden ohne Zugangsdaten und ohne Elternbrieftexte geloggt.
- Bei mehreren Kindern pro Konto sollte je Kind eine eigene Instanz mit eigenem `STATE_FILE` laufen.
