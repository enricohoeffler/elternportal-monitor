import nodemailer from "nodemailer";
import { buildHomeAssistantDays } from "./report.js";

export async function sendEmail(config, report) {
  const transport = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.password } : undefined,
  });
  await transport.sendMail({
    from: config.smtp.from,
    to: config.smtp.to,
    subject: report.subject,
    text: report.text,
    html: report.html,
  });
}

async function haRequest(config, path, body) {
  const response = await fetch(`${config.homeAssistant.url}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.homeAssistant.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Home-Assistant-Aufruf fehlgeschlagen (${response.status}, ${path}).`);
}

export async function updateHomeAssistant(config, data, newLetters, checkedAt) {
  const common = { last_checked: checkedAt, source: "Elternportal" };
  await Promise.all([
    haRequest(config, "/api/states/sensor.elternportal_neue_elternbriefe", {
      state: String(newLetters.length),
      attributes: {
        ...common,
        friendly_name: "Neue Elternbriefe",
        icon: "mdi:email-newsletter",
        letters: newLetters.slice(0, 20).map(({ title, date, status, hasAttachment }) => ({ title, date, status, hasAttachment })),
      },
    }),
    haRequest(config, "/api/states/sensor.elternportal_schulaufgaben", {
      state: String(data.exams.length),
      attributes: { ...common, friendly_name: "Schulaufgaben", icon: "mdi:calendar-alert", items: data.exams.slice(0, 30) },
    }),
    haRequest(config, "/api/states/sensor.elternportal_stundenplan", {
      state: data.timetable.length ? "verfügbar" : "leer",
      attributes: { ...common, friendly_name: "Stundenplan", icon: "mdi:timetable", days: buildHomeAssistantDays(data.timetable) },
    }),
    haRequest(config, "/api/states/binary_sensor.elternportal_monitor", {
      state: "on",
      attributes: { ...common, friendly_name: "Elternportal-Monitor", device_class: "connectivity" },
    }),
  ]);

  if (newLetters.length && config.homeAssistant.notifyService) {
    const titles = newLetters.slice(0, 3).map((letter) => letter.title).join("; ");
    await haRequest(config, `/api/services/notify/${encodeURIComponent(config.homeAssistant.notifyService)}`, {
      title: "Neue Elternbriefe",
      message: `${newLetters.length} neu: ${titles}${newLetters.length > 3 ? " …" : ""}`,
    });
  }
}

