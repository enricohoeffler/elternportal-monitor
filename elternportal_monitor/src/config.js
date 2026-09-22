function envBool(name, fallback = false) {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

function envInt(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) ? value : fallback;
}

export function loadConfig() {
  const config = {
    portal: {
      baseUrl: (process.env.PORTAL_BASE_URL || "https://example.eltern-portal.org").replace(/\/$/, ""),
      username: process.env.ELTERNPORTAL_USERNAME || "",
      password: process.env.ELTERNPORTAL_PASSWORD || "",
      childId: envInt("ELTERNPORTAL_CHILD_ID", 0),
    },
    mode: process.env.MODE === "daemon" ? "daemon" : "once",
    pollIntervalMinutes: Math.max(5, envInt("POLL_INTERVAL_MINUTES", 60)),
    stateFile: process.env.STATE_FILE || "./data/state.json",
    timezone: process.env.APP_TIMEZONE || "Europe/Berlin",
    dailySummary: envBool("DAILY_SUMMARY", true),
    dailyEmailHour: Math.min(23, Math.max(0, envInt("DAILY_EMAIL_HOUR", 6))),
    includeLetterBody: envBool("INCLUDE_LETTER_BODY", false),
    smtp: {
      host: process.env.SMTP_HOST || "",
      port: envInt("SMTP_PORT", 587),
      secure: envBool("SMTP_SECURE", false),
      user: process.env.SMTP_USER || "",
      password: process.env.SMTP_PASSWORD || "",
      from: process.env.SMTP_FROM || "",
      to: process.env.SMTP_TO || "",
    },
    homeAssistant: {
      url: (process.env.HA_URL || "").replace(/\/$/, ""),
      token: process.env.HA_TOKEN || "",
      notifyService: (process.env.HA_NOTIFY_SERVICE || "").replace(/^notify\./, ""),
    },
    mqtt: {
      enabled: envBool("MQTT_ENABLED", false),
      host: process.env.MQTT_HOST || "",
      port: envInt("MQTT_PORT", 1883),
      username: process.env.MQTT_USERNAME || "",
      password: process.env.MQTT_PASSWORD || "",
      discoveryPrefix: process.env.MQTT_DISCOVERY_PREFIX || "homeassistant",
      baseTopic: process.env.MQTT_BASE_TOPIC || "elternportal",
    },
  };

  if (!config.portal.username || !config.portal.password) {
    throw new Error("ELTERNPORTAL_USERNAME und ELTERNPORTAL_PASSWORD müssen gesetzt sein.");
  }
  return config;
}

export function smtpConfigured(config) {
  const smtp = config.smtp;
  return Boolean(smtp.host && smtp.from && smtp.to);
}

export function homeAssistantConfigured(config) {
  return Boolean(config.homeAssistant.url && config.homeAssistant.token);
}
