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
    const availabilityTopic = `${base}/availability`;
    const device = { identifiers: ["elternportal_monitor"], name: "Elternportal", manufacturer: "art soft and more (inoffiziell)", model: "Elternportal Monitor" };
    const common = { state_topic: stateTopic, availability_topic: availabilityTopic, payload_available: "online", payload_not_available: "offline", device };
    const entities = [
      ["binary_sensor", "portal_connection", { name: "Portal-Verbindung", unique_id: "elternportal_portal_connection", value_template: "{{ 'ON' if value_json.portal_ok else 'OFF' }}", payload_on: "ON", payload_off: "OFF", device_class: "connectivity", json_attributes_topic: stateTopic }],
      ["sensor", "new_letters", { name: "Neue Elternbriefe", unique_id: "elternportal_new_letters", value_template: "{{ value_json.new_letters }}", icon: "mdi:email-newsletter", json_attributes_topic: stateTopic }],
      ["sensor", "exams", { name: "Schulaufgaben", unique_id: "elternportal_exams", value_template: "{{ value_json.exam_count }}", icon: "mdi:calendar-alert", json_attributes_topic: stateTopic }],
      ["sensor", "timetable", { name: "Stundenplan", unique_id: "elternportal_timetable", value_template: "{{ 'verfügbar' if value_json.timetable_available else 'leer' }}", icon: "mdi:timetable", json_attributes_topic: stateTopic }],
      ["sensor", "last_update", { name: "Letzter Abruf", unique_id: "elternportal_last_update", value_template: "{{ value_json.last_checked }}", device_class: "timestamp", icon: "mdi:clock-check" }],
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
    const safeLetters = newLetters.slice(0, 20).map(({ title, date, status, hasAttachment }) => ({ title, date, status, hasAttachment }));
    const payload = {
      portal_ok: true,
      last_checked: checkedAt,
      new_letters: newLetters.length,
      letters: safeLetters,
      exam_count: data.exams.length,
      exams: data.exams.slice(0, 30),
      timetable_available: data.timetable.length > 0,
      days: buildHomeAssistantDays(data.timetable),
    };
    await publishAsync(this.client, `${this.config.baseTopic}/state`, JSON.stringify(payload), { qos: 1, retain: true });
    for (const letter of newLetters) {
      await publishAsync(this.client, `${this.config.baseTopic}/event/new_letter`, JSON.stringify({
        key: letter.key,
        title: letter.title,
        date: letter.date,
        hasAttachment: letter.hasAttachment,
      }), { qos: 1, retain: false });
    }
  }

  async publishFailure(checkedAt) {
    if (!this.client) return;
    await publishAsync(this.client, `${this.config.baseTopic}/state`, JSON.stringify({
      portal_ok: false,
      last_checked: checkedAt,
      error: "Abruf fehlgeschlagen",
    }), { qos: 1, retain: true });
  }

  async close() {
    if (!this.client) return;
    await publishAsync(this.client, `${this.config.baseTopic}/availability`, "offline", { qos: 1, retain: true });
    await new Promise((resolve) => this.client.end(false, resolve));
  }
}

