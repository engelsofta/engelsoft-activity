# Engelsoft Activity

**Dein Zuhause. Eine Zeitleiste. Kein Rätselraten.**

[![Release](https://img.shields.io/github/v/release/engelsofta/engelsoft-activity)](https://github.com/engelsofta/engelsoft-activity/releases/latest)
[![Checks](https://github.com/engelsofta/engelsoft-activity/actions/workflows/checks.yml/badge.svg)](https://github.com/engelsofta/engelsoft-activity/actions/workflows/checks.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-gold.svg)](LICENSE)

Engelsoft Activity ist eine lokale Home-Assistant-Integration mit eigener Aktivitätsansicht. Sie verwendet das vorhandene HA-Logbuch und erscheint in der Sidebar als **Activity**.

## Funktionen

- Live-Zeitleiste mit klaren Zustandsfarben: Ein/Aus, Online/Offline, Hinweise und Alarme.
- Engelsoft-Glasdesign, Hell-/Dunkelmodus und responsive Darstellung ohne mobile Überschrift.
- Durchsuchbare Mehrfachfilter für Räume, Entitätstypen, Integrationen und einzelne Entitäten.
- Favoriten und Ruhefilter für gezielt ausgeblendete Entitäten.
- Aktivitätsverteilung mit anklickbaren Zeitabschnitten und Rangliste der aktivsten Entitäten.
- Ereignisdetails mit gemeinsamem HA-Kontext und direktem Zugriff auf Entitätsdetails.
- Zeiträume von 1, 3, 6, 12 oder 24 Stunden; Vor-/Zurückblättern und CSV-Export.
- Neueste Einträge zuerst, ältere Daten im Hintergrund; Ladeanzeige ohne Layoutsprung.

## Installation über HACS

Dieses Repository ist als **benutzerdefiniertes Repository** vorbereitet. Es ist nicht automatisch Teil des HACS-Standardkatalogs.

1. In HACS die benutzerdefinierten Repositories öffnen.
2. `https://github.com/engelsofta/engelsoft-activity` als Typ **Integration** hinzufügen.
3. **Engelsoft Activity** herunterladen und Home Assistant neu starten.
4. Unter **Einstellungen → Geräte & Dienste → Integration hinzufügen** nach **Engelsoft Activity** suchen.
5. **Activity** in der Sidebar öffnen.

Getestete Ausgangsversion: Home Assistant **2026.10**. Das HA-Logbuch muss aktiv sein.

## Manuelle Installation – nur Laufzeitdateien

Das Release enthält zwei schlanke Archive:

- **Engelsoft-Activity-0.1.8.zip:** enthält nur `custom_components/engelsoft_activity/…` und kann in den HA-Konfigurationsordner entpackt werden.
- **engelsoft_activity.zip:** enthält dieselben Integrationsdateien direkt an der Archivwurzel und wird für HACS verwendet. Manuell nur nach `custom_components/engelsoft_activity/` entpacken.

Danach Home Assistant neu starten und die Integration wie oben hinzufügen. Es ist keine YAML-Konfiguration nötig. Bei Updates Home Assistant neu starten und die Browseransicht vollständig neu laden.

**Keine GitHub-Dateien auf HA:** Die Release-Pakete enthalten keine `.git`- oder `.github`-Ordner, Tests, Screenshots, Dokumentation, Werkzeuge, Logs oder Backups. Nicht den gesamten Repository-Quellcode in die HA-Konfiguration kopieren.

## Filter bedienen

Jede Filterliste enthält eine Suche und Checkboxen. Mehrere Werte innerhalb eines Filters bedeuten **ODER**; unterschiedliche Filter werden mit **UND** kombiniert. Ohne Auswahl sind alle Werte zugelassen.

Beispiel: zwei Räume + eine Integration + fünf Entitäten zeigt Aktivitäten dieser fünf Entitäten, soweit sie zur ausgewählten Integration und zu einem der beiden Räume gehören.

Der Stern merkt Entitäten als Favoriten. Die durchgestrichene Glocke blendet eine Entität bei aktivem Ruhefilter aus. Unter **Einblicke → Ausgeblendete Entitäten** lässt sie sich wieder einblenden. Dies ändert keine HA-Aufzeichnung, Geräte oder Benachrichtigungen.

Die Kennzahlen „Filterbasis“ berücksichtigen die Such- und Mehrfachfilter, ohne Kategorie und Histogramm-Zeitfokus. Entitätsanzahl, Zeitleiste und Export folgen der aktuellen Auswahl.

## Datenschutz und Grenzen

- Kein eigener Cloud-Dienst, keine Telemetrie und keine Zugangsdaten in der Integration. Logbuchabfragen laufen über die bestehende authentifizierte HA-Verbindung.
- Favoriten und ausgeblendete Entitäten liegen im Browser, getrennt nach HA-Benutzer. Ein kurzlebiger Cache liegt ausschließlich im Speicher der aktuellen Browser-Sitzung.
- CSV-Dateien werden nur auf ausdrücklichen Klick lokal heruntergeladen und können persönliche Logbuchdaten enthalten.
- Das integrierte Hintergrundbild wird lokal ausgeliefert; es gibt dafür keine externen Bildabrufe.
- Verfügbare Zeiträume folgen der HA-Aufbewahrung und den Logbuchausschlüssen. Raumzuordnungen stammen aus dem aktuellen Register, nicht aus historischen Raumzuordnungen.
- Registerberechtigungen hängen vom HA-Konto ab; bei fehlenden Rechten bleibt die Zeitleiste verfügbar, einzelne Zusatzfilter können unvollständig sein.
- Ein gemeinsamer Ereigniskontext stammt von HA und ist keine eigene Ursachenanalyse. Die Ansicht ist derzeit deutschsprachig; Setup-Texte gibt es auf Deutsch und Englisch.

## Entwicklung und Prüfen

```sh
npm ci
npm test
npx playwright install chromium
npm run test:browser
python scripts/package.py
```

Die Browserprüfung verwendet ausschließlich künstliche Beispieldaten. Sie ersetzt keinen Test am echten HA-System. Der Paketbau nutzt eine explizite Dateiliste und prüft Archivinhalt sowie Versionsgleichheit. GitHub Actions prüft zusätzlich die Integration mit Hassfest.

Screenshots können später ergänzt werden. Vorher echte Geräte-, Personen- und Raumnamen sowie IDs anonymisieren.

## Unterstützung

[Fehler melden](https://github.com/engelsofta/engelsoft-activity/issues) · [Releases](https://github.com/engelsofta/engelsoft-activity/releases)

Bitte keine vollständigen HA-Logs, Zugangsdaten oder privaten Konfigurationen in öffentliche Issues stellen.

MIT-Lizenz – siehe [LICENSE](LICENSE).
