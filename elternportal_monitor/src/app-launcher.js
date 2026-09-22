import { readFile } from "node:fs/promises";

try {
  const options = JSON.parse(await readFile("/data/options.json", "utf8"));
  const mapping = {
    portal_base_url: "PORTAL_BASE_URL",
    username: "ELTERNPORTAL_USERNAME",
    password: "ELTERNPORTAL_PASSWORD",
    child_id: "ELTERNPORTAL_CHILD_ID",
    poll_interval_minutes: "POLL_INTERVAL_MINUTES",
    include_letter_body: "INCLUDE_LETTER_BODY",
    mqtt_discovery_prefix: "MQTT_DISCOVERY_PREFIX",
    mqtt_base_topic: "MQTT_BASE_TOPIC",
  };
  for (const [option, environment] of Object.entries(mapping)) {
    if (options[option] !== undefined && process.env[environment] === undefined) {
      process.env[environment] = String(options[option]);
    }
  }
  process.env.MODE ||= "daemon";
  process.env.STATE_FILE ||= "/data/state.json";
  process.env.MQTT_ENABLED ||= "true";
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

await import("./index.js");

