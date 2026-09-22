import test from "node:test";
import assert from "node:assert/strict";
import { isAuthenticatedPage, parseExams, parseParentLetters, parseTimetable } from "../src/elternportal-client.js";

test("erkennt angemeldete Portalnavigation unabhängig vom Logout-Pfad", () => {
  assert.equal(isAuthenticatedPage(`<nav><a href="logout">Abmelden</a></nav>`), true);
  assert.equal(isAuthenticatedPage(`<nav><a href="/logout.php">Symbol</a></nav>`), true);
  assert.equal(isAuthenticatedPage(`<form><input name="password"></form>`), false);
});

test("parst Elternbrief-Metadaten ohne Download", () => {
  const html = `<div id="asam_content"><table>
    <tr><td>#7</td><td>noch nicht bestätigt</td></tr>
    <tr><td><a href="/aktuelles/get_file/?repo=1"><h4>Ausflug</h4> 20.09.2026, 10:15</a><span>Klasse/n: 5x</span><p>Interner Text</p></td></tr>
  </table></div>`;
  const letters = parseParentLetters(html);
  assert.deepEqual(letters, [{
    id: 7,
    key: "7:20.09.2026, 10:15:Ausflug",
    title: "Ausflug",
    date: "20.09.2026, 10:15",
    classes: "5x",
    status: "unread",
    hasAttachment: true,
  }]);
  assert.equal("body" in letters[0], false);
});

test("parst Stundenplan tabellarisch", () => {
  const html = `<div id="asam_content"><table>
    <tr><td>Montag</td><td>Dienstag</td></tr>
    <tr><td>1.<br>08.00 - 08.45</td><td>D<br>R1</td><td>M<br>R2</td></tr>
  </table></div>`;
  assert.deepEqual(parseTimetable(html), [{
    period: 1,
    time: "08.00 - 08.45",
    days: { Montag: { subject: "D", room: "R1" }, Dienstag: { subject: "M", room: "R2" } },
  }]);
});

test("findet den Stundenplan zwischen anderen Tabellen und berücksichtigt die leere Kopfzelle", () => {
  const html = `<div id="asam_content">
    <table class="table_header"><tr><td>Seitentitel</td></tr></table>
    <div class="table-responsive"><table class="table table-condensed table-bordered">
      <tr><th></th><th>Montag</th><th>Dienstag</th></tr>
      <tr><td>1.<br>08.00 - 08.45</td><td><span>D</span><br><span>R1</span></td><td><span>M</span><br><span>R2</span></td></tr>
    </table></div>
    <table><tr><td>Weitere Informationen</td></tr><tr><td>Eintrag</td><td>Wert</td></tr></table>
  </div>`;
  assert.deepEqual(parseTimetable(html), [{
    period: 1,
    time: "08.00 - 08.45",
    days: { Montag: { subject: "D", room: "R1" }, Dienstag: { subject: "M", room: "R2" } },
  }]);
});

test("parst Schulaufgaben", () => {
  const html = `<div id="asam_content"><table><tr><td>17.11.2026</td><td>Schulaufgabe in Englisch</td></tr></table></div>`;
  assert.deepEqual(parseExams(html), [{ date: "17.11.2026", title: "Schulaufgabe in Englisch" }]);
});
