import test from "node:test";
import assert from "node:assert/strict";
import { assertReadOnlyRequest, ElternportalClient, parseAppointments } from "../src/elternportal-client.js";
import { PortalNetworkError, PortalParserError, ReadOnlyPolicyError } from "../src/errors.js";
import { buildMqttPayloads } from "../src/mqtt-publisher.js";

const baseUrl = "https://schule.example.invalid";

test("Read-only-Policy erlaubt nur Lesezugriffe und notwendige Anmelde-POSTs", () => {
  assert.match(assertReadOnlyRequest(baseUrl, "/aktuelles/elternbriefe"), /^https:/);
  assert.match(assertReadOnlyRequest(baseUrl, "/includes/project/auth/login.php", "POST"), /^https:/);
  assert.match(assertReadOnlyRequest(baseUrl, "/api/set_child.php?id=7", "POST"), /^https:/);
});

test("Read-only-Policy blockiert Bestätigung, Anhänge, fremde Hosts und sonstige Schreibzugriffe", () => {
  assert.throws(() => assertReadOnlyRequest(baseUrl, "/api/elternbrief_bestaetigen.php?eb=7"), ReadOnlyPolicyError);
  assert.throws(() => assertReadOnlyRequest(baseUrl, "/aktuelles/get_file/?repo=7"), ReadOnlyPolicyError);
  assert.throws(() => assertReadOnlyRequest(baseUrl, "https://example.org/redirect"), ReadOnlyPolicyError);
  assert.throws(() => assertReadOnlyRequest(baseUrl, "/service/krankmeldung", "POST"), ReadOnlyPolicyError);
});

test("Netzwerkfehler werden getrennt klassifiziert", async () => {
  const client = new ElternportalClient({ baseUrl, username: "user@example.invalid", password: "secret", fetchImpl: async () => { throw new TypeError("fetch failed"); } });
  await assert.rejects(() => client.getText("/"), PortalNetworkError);
});

test("ungültige Terminantwort wird als Parserfehler erkannt", () => {
  assert.throws(() => parseAppointments("kein json"), PortalParserError);
  assert.throws(() => parseAppointments({ success: 0, result: [] }), PortalParserError);
});

test("MQTT-Attribute sind getrennt und begrenzt", () => {
  const make = (count, mapper) => Array.from({ length: count }, (_value, index) => mapper(index));
  const data = {
    letters: make(30, (index) => ({ title: `Brief ${index}`, date: "01.01.2026", status: "read", hasAttachment: false, body: "nicht veröffentlichen" })),
    exams: make(30, (index) => ({ date: "01.01.2026", title: `Prüfung ${index}` })),
    appointments: make(30, (index) => ({ title: `Termin ${index}`, start: "2026-10-01T08:00:00.000Z", end: "2026-10-01T09:00:00.000Z", allDay: false })),
    timetable: [],
  };
  const payloads = buildMqttPayloads(data, data.letters, "2026-09-23T08:00:00.000Z");
  assert.equal(payloads.attributes.new_letters.parent_letters.length, 20);
  assert.equal(payloads.attributes.new_letters.new_letter_items.length, 10);
  assert.equal(payloads.attributes.exams.exams.length, 15);
  assert.equal(payloads.attributes.appointments.appointments.length, 15);
  assert.equal("body" in payloads.attributes.new_letters.parent_letters[0], false);
  assert.equal("appointments" in payloads.state, false);
});
