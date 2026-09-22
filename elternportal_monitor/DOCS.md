# Elternportal Monitor – Home-Assistant-App

Die App liest Elternbriefe, Stundenplan und Schulaufgaben aus dem Elternportal und veröffentlicht daraus automatisch erkannte MQTT-Entitäten.

## Konfiguration

- `portal_base_url`: Basisadresse der Schule.
- `username` / `password`: Elternportal-Zugang. Diese Werte nicht in Logs oder Support-Anfragen kopieren.
- `child_id`: `0` für das aktuell ausgewählte oder einzige Kind. Bei mehreren Kindern eine konkrete Portal-ID verwenden.
- `poll_interval_minutes`: Abrufintervall, mindestens fünf Minuten; empfohlen sind 60 Minuten.
- `include_letter_body`: Aus Datenschutzgründen ausgeschaltet lassen, sofern Volltexte nicht ausdrücklich benötigt werden.
- `mqtt_discovery_prefix`: Normalerweise `homeassistant`.
- `mqtt_base_topic`: Normalerweise `elternportal`.

Die App lädt keine Elternbrief-Anhänge herunter und bestätigt keinen Empfang.

## Erzeugte Entitäten

- Portal-Verbindung
- Neue Elternbriefe
- Schulaufgaben
- Stundenplan
- Letzter Abruf

Neue Briefe werden zusätzlich einmalig auf `elternportal/event/new_letter` veröffentlicht. Eine Home-Assistant-Automation kann dieses Topic für Push-Nachrichten verwenden.

