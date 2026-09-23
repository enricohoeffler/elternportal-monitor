import mqtt from "mqtt";
import { buildHomeAssistantDays } from "./report.js";

async function supervisorMqttConfig() {
  const token = process.env.SUPERVISOR_TOKEN;
  if (!token) return null;
  const response = await fetch("http://supervisor/services/mqtt", {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`MQTT-Diensterkennung fehlgeschlagen (${response.status}).`);
  const payload = await response.json();
  const data = payload.data || payload;
  return {
    host: data.host,
    port: Number(data.port || 1883),
    username: data.username || "",
    password: data.password || "",
    protocol: data.ssl ? "mqtts" : "mqtt",
  };
}

function publishAsync(client, topic, payload, options = {}) {
  return new Promise((resolve, reject) => {
    client.publish(topic, payload, options, (error) => error ? reject(error) : resolve());
  });
}

function connectAsync(client) {
  return new Promise((resolve, reject) => {
    const onConnect = () => { cleanup(); resolve(); };
    const onError = (error) => { cleanup(); reject(error); };
    const cleanup = () => {
      client.off("connect", onConnect);
      client.off("error", onError);
    };
    client.once("connect", onConnect);
    client.once("error", onError);
  });
}

const PREVIEW_LIMITS = Object.freeze({ letters: 20, newLetters: 10, exams: 15, appointments: 15 });

export function buildMqttPayloads(data, newLetters, checkedAt) {
  const safeLetters = data.letters.slice(0, PREVIEW_LIMITS.letters).map(({ title, date, status, hasAttachment }) => ({ title, date, status, hasAttachment }));
  const safeNewLetters = newLetters.slice(0, PREVIEW_LIMITS.newLetters).map(({ title, date, status, hasAttachment }) => ({ title, date, status, hasAttachment }));
  return {
    state: {
      last_checked: checkedAt,
      new_letters: newLetters.length,
      letter_count: data.letters.length,
      exam_count: data.exams.length,
      appointment_count: data.appointments.length,
      timetable_available: data.timetable.length > 0,
    },
    attributes: {
      new_letters: { letter_count: data.letters.length, parent_letters: safeLetters, new_letter_items: safeNewLetters },
      exams: { exams: data.exams.slice(0, PREVIEW_LIMITS.exams) },
      appointments: { appointments: data.appointments.slice(0, PREVIEW_LIMITS.appointments) },
      timetable: { days: buildHomeAssistantDays(data.timetable) },
    },
  };
}

export class MqttPublisher {
  constructor(config) {
    this.config = config;
    this.client = null;
  }

  async connect() {
    if (!this.config.enabled) return;
    const discovered = this.config.host ? null : await supervisorMqttConfig();
    const connection = discovered || {
      host: this.config.host,
      port: this.config.port,
      username: this.config.username,
      password: this.config.password,
      protocol: "mqtt",
    };
    if (!connection.host) throw new Error("MQTT ist aktiviert, aber kein Broker wurde gefunden.");
    const statusTopic = `${this.config.baseTopic}/availability`;
    this.client = mqtt.connect(`${connection.protocol}://${connection.host}:${connection.port}`, {
      username: connection.username || undefined,
      password: connection.password || undefined,
      reconnectPeriod: 5_000,
      will: { topic: statusTopic, payload: "offline", qos: 1, retain: true },
    });
    await connectAsync(this.client);
    await this.publishDiscovery();
    await publishAsync(this.client, statusTopic, "online", { qos: 1, retain: true });
  }

  async publishDiscovery() {
    const prefix = this.config.discoveryPrefix;
    const base = this.config.baseTopic;
    const stateTopic = `${base}/state`;
    const healthTopic = `${base}/health`;
    const availabilityTopic = `${base}/availability`;
    const device = { identifiers: ["elternportal_monitor"], name: "Elternportal", manufacturer: "art soft and more (inoffiziell)", model: "Elternportal Monitor" };
    const common = { availability_topic: availabilityTopic, payload_available: "online", payload_not_available: "offline", device };
    const entities = [
      ["binary_sensor", "portal_connection", { name: "Portal-Verbindung", unique_id: "elternportal_portal_connection", state_topic: healthTopic, value_template: "{{ 'ON' if value_json.portal_ok else 'OFF' }}", payload_on: "ON", payload_off: "OFF", device_class: "connectivity", json_attributes_topic: healthTopic }],
      ["sensor", "new_letters", { name: "Neue Elternbriefe", unique_id: "elternportal_new_letters", state_topic: stateTopic, value_template: "{{ value_json.new_letters }}", icon: "mdi:email-newsletter", json_attributes_topic: `${base}/attributes/new_letters` }],
      ["sensor", "exams", { name: "Schulaufgaben", unique_id: "elternportal_exams", state_topic: stateTopic, value_template: "{{ value_json.exam_count }}", icon: "mdi:calendar-alert", json_attributes_topic: `${base}/attributes/exams` }],
      ["sensor", "appointments", { name: "Termine", unique_id: "elternportal_appointments", state_topic: stateTopic, value_template: "{{ value_json.appointment_count }}", icon: "mdi:calendar-month", json_attributes_topic: `${base}/attributes/appointments` }],
      ["sensor", "timetable", { name: "Stundenplan", unique_id: "elternportal_timetable", state_topic: stateTopic, value_template: "{{ 'verfügbar' if value_json.timetable_available else 'leer' }}", icon: "mdi:timetable", json_attributes_topic: `${base}/attributes/timetable` }],
      ["sensor", "last_update", { name: "Letzter Abruf", unique_id: "elternportal_last_update", state_topic: stateTopic, value_template: "{{ value_json.last_checked }}", device_class: "timestamp", icon: "mdi:clock-check" }],
    ];
    await Promise.all(entities.map(([domain, objectId, definition]) => publishAsync(
      this.client,
      `${prefix}/${domain}/elternportal/${objectId}/config`,
      JSON.stringify({ ...common, ...definition }),
      { qos: 1, retain: true },
    )));
  }

  async publishSnapshot(data, newLetters, checkedAt) {
    if (!this.client) return;
    const payloads = buildMqttPayloads(data, newLetters, checkedAt);
    await Promise.all([
      publishAsync(this.client, `${this.config.baseTopic}/state`, JSON.stringify(payloads.state), { qos: 1, retain: true }),
      ...Object.entries(payloads.attributes).map(([name, payload]) => publishAsync(this.client, `${this.config.baseTopic}/attributes/${name}`, JSON.stringify(payload), { qos: 1, retain: true })),
      publishAsync(this.client, `${this.config.baseTopic}/health`, JSON.stringify({ portal_ok: true, last_checked: checkedAt, error_type: null }), { qos: 1, retain: true }),
    ]);
    for (const letter of newLetters) {
      await publishAsync(this.client, `${this.config.baseTopic}/event/new_letter`, JSON.stringify({
        key: letter.key,
        title: letter.title,
        date: letter.date,
        hasAttachment: letter.hasAttachment,
      }), { qos: 1, retain: false });
    }
  }

  async publishFailure(checkedAt, { type = "unknown" } = {}) {
    if (!this.client) return;
    await publishAsync(this.client, `${this.config.baseTopic}/health`, JSON.stringify({
      portal_ok: false,
      last_checked: checkedAt,
      error_type: type,
    }), { qos: 1, retain: true });
  }

  async close() {
    if (!this.client) return;
    await publishAsync(this.client, `${this.config.baseTopic}/availability`, "offline", { qos: 1, retain: true });
    await new Promise((resolve) => this.client.end(false, resolve));
  }
}
