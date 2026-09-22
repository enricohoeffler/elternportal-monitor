import { loadConfig, homeAssistantConfigured, smtpConfigured } from "./config.js";
import { ElternportalClient } from "./elternportal-client.js";
import { buildReport } from "./report.js";
import { sendEmail, updateHomeAssistant } from "./notifications.js";
import { loadState, saveState } from "./state.js";
import { MqttPublisher } from "./mqtt-publisher.js";

function zonedParts(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function localDateAndHour(date, timezone) {
  const parts = zonedParts(date, timezone);
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number.parseInt(parts.hour, 10) };
}

function safeError(error) {
  return error instanceof Error ? error.message : String(error);
}

async function runOnce(config, mqttPublisher) {
  const previous = await loadState(config.stateFile);
  const client = new ElternportalClient(config.portal);
  const data = await client.readAll({ includeLetterBody: config.includeLetterBody });
  const known = new Set(previous.seenLetterKeys);
  const newLetters = previous.initialized ? data.letters.filter((letter) => !known.has(letter.key)) : [];
  const now = new Date();
  const checkedAt = now.toISOString();
  const local = localDateAndHour(now, config.timezone);
  const dailyDue = config.dailySummary && previous.lastSummaryDate !== local.date && local.hour >= config.dailyEmailHour;
  const report = buildReport({ data, newLetters, checkedAt });

  let summarySent = false;
  if (smtpConfigured(config) && (newLetters.length > 0 || dailyDue)) {
    await sendEmail(config, report);
    summarySent = dailyDue;
  }
  if (homeAssistantConfigured(config)) {
    await updateHomeAssistant(config, data, newLetters, checkedAt);
  }
  await mqttPublisher.publishSnapshot(data, newLetters, checkedAt);

  await saveState(config.stateFile, {
    initialized: true,
    seenLetterKeys: data.letters.map((letter) => letter.key).slice(0, 500),
    lastSummaryDate: summarySent ? local.date : previous.lastSummaryDate,
    lastSuccessAt: checkedAt,
  });
  console.log(`[${checkedAt}] Erfolgreich: ${data.letters.length} Briefe, ${newLetters.length} neu, ${data.exams.length} Schulaufgaben, ${data.timetable.length} Stundenplanzeilen.`);
}

async function main() {
  const config = loadConfig();
  const mqttPublisher = new MqttPublisher(config.mqtt);
  await mqttPublisher.connect();
  const shutdown = async () => {
    await mqttPublisher.close();
    process.exit(0);
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  do {
    try {
      await runOnce(config, mqttPublisher);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Abruf fehlgeschlagen: ${safeError(error)}`);
      await mqttPublisher.publishFailure(new Date().toISOString()).catch(() => {});
      if (config.mode === "once") process.exitCode = 1;
    }
    if (config.mode !== "daemon") break;
    await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMinutes * 60_000));
  } while (true);
  await mqttPublisher.close();
}

await main();
