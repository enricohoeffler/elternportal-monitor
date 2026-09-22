# Elternportal Monitor – Home-Assistant-App-Repository

Dieses Repository stellt den **Elternportal Monitor** als Home-Assistant-App bereit. Die App liest Elternbriefe, Stundenplan und Schulaufgaben rein lesend aus dem Elternportal und veröffentlicht die Ergebnisse über MQTT Discovery in Home Assistant.

## Installation

1. In Home Assistant **Einstellungen → Apps → App-Store** öffnen.
2. Über das Menü **Repositories** auswählen.
3. Die URL dieses GitHub-Repositories hinzufügen.
4. Den App-Store neu laden und **Elternportal Monitor** installieren.

Die Portal-Zugangsdaten werden ausschließlich in der geschützten App-Konfiguration von Home Assistant hinterlegt. Es gehören keine Zugangsdaten in dieses Repository.

## Sicherheit und Datenschutz

- Elternbrief-Anhänge werden nicht heruntergeladen, weil dies im Portal als Empfangsbestätigung gelten kann.
- Der erste Lauf übernimmt vorhandene Briefe nur als Ausgangsbestand.
- Brieftexte werden standardmäßig nicht veröffentlicht.
- Persistiert werden nur technische Briefschlüssel und Zeitstempel.

Der ausführbare App-Code liegt unter [`elternportal_monitor/`](elternportal_monitor/).

