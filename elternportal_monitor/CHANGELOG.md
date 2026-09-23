# Changelog

## 0.2.3

- Zentrale Read-only-Request-Policy blockiert Bestätigungs-, Datei- und sonstige Schreibzugriffe.
- Letzter gültiger MQTT-Datenstand bleibt bei Abruffehlern erhalten; der Fehlerstatus wird separat veröffentlicht.
- Sensorattribute auf getrennte Topics verteilt und auf kleine Vorschauen begrenzt.
- Authentifizierungs-, Netzwerk-, Portal-, Parser- und Policyfehler werden getrennt klassifiziert.
- Einmalige Neuanmeldung bei einer während des Abrufs abgelaufenen Sitzung ergänzt.

## 0.2.2

- Allgemeine Portaltermine für die kommenden 90 Tage ergänzt.
- Vollständige Elternbrief-Metadatenliste für Home-Assistant-Dashboards veröffentlicht.
- Eigenen MQTT-Discovery-Sensor für Termine ergänzt.

## 0.2.1

- Stundenplantabelle anhand ihrer Struktur erkannt, statt versehentlich die Kopf-Tabelle auszuwerten.
- Reale Stundenplan-Kopfzeile mit leerer erster Spalte unterstützt.
- Regressionstest für Seiten mit mehreren Tabellen ergänzt.

## 0.2.0

- Home-Assistant-App mit MQTT Discovery für Verbindung, Elternbriefe, Schulaufgaben, Stundenplan und letzten Abruf ergänzt.
