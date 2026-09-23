import * as cheerio from "cheerio";
import {
  PortalAuthError,
  PortalNetworkError,
  PortalParserError,
  PortalResponseError,
  ReadOnlyPolicyError,
} from "./errors.js";

const ALLOWED_POST_PATHS = new Set([
  "/includes/project/auth/login.php",
  "/api/set_child.php",
]);

export function assertReadOnlyRequest(baseUrl, target, method = "GET") {
  const portal = new URL(baseUrl);
  const url = new URL(target, `${portal.toString().replace(/\/$/, "")}/`);
  const normalizedMethod = method.toUpperCase();
  const path = url.pathname.toLowerCase();

  if (url.origin !== portal.origin) {
    throw new ReadOnlyPolicyError("Read-only-Schutz: Anfrage außerhalb des konfigurierten Elternportals blockiert.");
  }
  if (normalizedMethod === "GET") {
    if (path.includes("elternbrief_bestaetigen") || path.includes("get_file")) {
      throw new ReadOnlyPolicyError("Read-only-Schutz: Bestätigungs- oder Dateiabruf blockiert.");
    }
    return url.toString();
  }
  if (normalizedMethod === "POST" && ALLOWED_POST_PATHS.has(path)) return url.toString();
  throw new ReadOnlyPolicyError(`Read-only-Schutz: ${normalizedMethod}-Anfrage blockiert.`);
}

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  absorb(headers) {
    const values = typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : (headers.get("set-cookie") ? [headers.get("set-cookie")] : []);
    for (const value of values) {
      const firstPart = value.split(";", 1)[0];
      const separator = firstPart.indexOf("=");
      if (separator <= 0) continue;
      const name = firstPart.slice(0, separator).trim();
      const cookieValue = firstPart.slice(separator + 1).trim();
      if (/max-age=0/i.test(value) || cookieValue === "") this.cookies.delete(name);
      else this.cookies.set(name, cookieValue);
    }
  }

  header() {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
  }
}

function cleanText(value) {
  return value.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\n\s+/g, "\n").trim();
}

export function isAuthenticatedPage(html) {
  const $ = cheerio.load(html);
  return $("a[href*='logout']").length > 0 || $("a").toArray().some((element) => cleanText($(element).text()) === "Abmelden");
}

export function parseParentLetters(html, { includeBody = false } = {}) {
  const $ = cheerio.load(html);
  const rows = $("#asam_content tr").toArray();
  const letters = [];

  for (let index = 0; index < rows.length - 1; index += 1) {
    const summaryRow = $(rows[index]);
    const idMatch = cleanText(summaryRow.find("td").first().text()).match(/^#(\d+)$/);
    if (!idMatch) continue;

    const detailRow = $(rows[index + 1]);
    const title = cleanText(detailRow.find("h4").first().text());
    if (!title) continue;
    const detailText = cleanText(detailRow.text());
    const dateMatch = detailText.match(/(\d{2}\.\d{2}\.\d{4}),\s*(\d{2}:\d{2})/);
    const classElement = detailRow.find("span").toArray().find((element) => /Klasse\/n:/.test($(element).text()));
    const classes = classElement ? cleanText($(classElement).text()).replace(/^Klasse\/n:\s*/, "") : "";
    const statusText = cleanText(summaryRow.find("td").last().text()).toLowerCase();
    const link = detailRow.find("a[href*='get_file']").first().attr("href") || "";
    const id = Number.parseInt(idMatch[1], 10);
    const date = dateMatch ? `${dateMatch[1]}, ${dateMatch[2]}` : "";

    const letter = {
      id,
      key: `${id}:${date}:${title}`,
      title,
      date,
      classes,
      status: statusText.includes("noch nicht") ? "unread" : "read",
      hasAttachment: Boolean(link),
    };
    if (includeBody) {
      const bodyCell = detailRow.find("td").first().clone();
      bodyCell.find("h4, a, span").remove();
      letter.body = cleanText(bodyCell.text());
    }
    letters.push(letter);
  }
  return letters;
}

export function parseTimetable(html) {
  const $ = cheerio.load(html);
  const table = $("#asam_content table").toArray()
    .map((element) => $(element))
    .find((candidate) => {
      const rows = candidate.find("tr").toArray();
      if (rows.length < 2) return false;
      const headerCells = $(rows[0]).children("th, td");
      if (headerCells.length < 2) return false;
      return rows.slice(1).some((row) => {
        const firstCell = $(row).children("th, td").first().clone();
        firstCell.find("br").replaceWith("\n");
        return /^(\d+)\.?($|\s)/.test(cleanText(firstCell.text()));
      });
    });
  if (!table) return [];
  const rows = table.find("tr").toArray();
  const weekdays = $(rows[0]).children("th, td").toArray().map((cell) => cleanText($(cell).text()));
  const lessons = [];

  for (const row of rows.slice(1)) {
    const cells = $(row).find("th, td").toArray();
    if (cells.length < 2) continue;
    const infoCell = $(cells[0]).clone();
    infoCell.find("br").replaceWith("\n");
    const info = cleanText(infoCell.text()).split("\n").map(cleanText).filter(Boolean);
    const periodMatch = (info[0] || "").match(/^(\d+)\.?$/);
    if (!periodMatch) continue;
    const days = {};
    for (let cellIndex = 1; cellIndex < cells.length; cellIndex += 1) {
      const cell = $(cells[cellIndex]).clone();
      cell.find("br").replaceWith("\n");
      const values = cleanText(cell.text()).split("\n").map(cleanText).filter(Boolean);
      const hasLeadingPeriodHeader = weekdays.length === cells.length;
      const weekdayIndex = hasLeadingPeriodHeader ? cellIndex : cellIndex - 1;
      const weekday = weekdays[weekdayIndex] || `Tag ${cellIndex}`;
      days[weekday] = { subject: values[0] || "", room: values.slice(1).join(" / ") };
    }
    lessons.push({
      period: Number.parseInt(periodMatch[1], 10),
      time: info.slice(1).join(" "),
      days,
    });
  }
  return lessons;
}

export function parseExams(html) {
  const $ = cheerio.load(html);
  const exams = [];
  $("#asam_content table tr").each((_index, row) => {
    const cells = $(row).find("td").toArray();
    if (cells.length < 2) return;
    const date = cleanText($(cells[0]).text());
    if (!/^\d{2}\.\d{2}\.\d{4}$/.test(date)) return;
    const title = cleanText($(cells[cells.length - 1]).text());
    if (title) exams.push({ date, title });
  });
  return exams;
}

export function parseAppointments(payload, { now = Date.now() } = {}) {
  let data;
  try {
    data = typeof payload === "string" ? JSON.parse(payload) : payload;
  } catch (error) {
    throw new PortalParserError("Terminantwort des Elternportals ist kein gültiges JSON.", { cause: error });
  }
  if (!data || Number(data.success) !== 1 || !Array.isArray(data.result)) {
    throw new PortalParserError("Terminantwort des Elternportals hat eine unerwartete Struktur.");
  }
  return data.result
    .map((item) => {
      const startMs = Number.parseInt(item.start, 10);
      const endMs = Number.parseInt(item.end, 10);
      const titleHtml = String(item.title || item.title_short || "").replace(/<br\s*\/?>/gi, "\n");
      const title = cleanText(cheerio.load(`<div>${titleHtml}</div>`)("div").text());
      if (!title || !Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
      return {
        title,
        start: new Date(startMs).toISOString(),
        end: new Date(endMs).toISOString(),
        allDay: Number.parseInt(item.bo_end, 10) === 1,
      };
    })
    .filter((item) => item && Date.parse(item.start) >= now)
    .sort((left, right) => Date.parse(left.start) - Date.parse(right.start));
}

export class ElternportalClient {
  constructor({ baseUrl, username, password, childId = 0, fetchImpl = fetch }) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.username = username;
    this.password = password;
    this.childId = childId;
    this.fetchImpl = fetchImpl;
    this.jar = new CookieJar();
  }

  async request(path, options = {}) {
    let url = new URL(path, `${this.baseUrl}/`).toString();
    let method = options.method || "GET";
    let body = options.body;
    const baseHeaders = { "user-agent": "Elternportal-Monitor/0.2.3", ...(options.headers || {}) };

    for (let redirects = 0; redirects <= 5; redirects += 1) {
      url = assertReadOnlyRequest(this.baseUrl, url, method);
      const cookie = this.jar.header();
      let response;
      try {
        response = await this.fetchImpl(url, {
          method,
          body,
          headers: { ...baseHeaders, ...(cookie ? { cookie } : {}) },
          redirect: "manual",
        });
      } catch (error) {
        if (error instanceof ReadOnlyPolicyError) throw error;
        throw new PortalNetworkError("Netzwerkverbindung zum Elternportal fehlgeschlagen.", { cause: error });
      }
      this.jar.absorb(response.headers);
      if (![301, 302, 303, 307, 308].includes(response.status)) return response;
      const location = response.headers.get("location");
      if (!location) return response;
      url = new URL(location, url).toString();
      if ([301, 302, 303].includes(response.status)) {
        method = "GET";
        body = undefined;
      }
    }
    throw new PortalResponseError("Zu viele Weiterleitungen beim Portalabruf.");
  }

  async getText(path) {
    const response = await this.request(path);
    if (response.status === 401 || response.status === 403) {
      throw new PortalAuthError(`Elternportal-Sitzung abgelehnt (${response.status}).`, { retryable: true });
    }
    if (!response.ok) throw new PortalResponseError(`Portalabruf fehlgeschlagen (${response.status}).`);
    return response.text();
  }

  async login() {
    const loginPage = await this.getText("/");
    const $ = cheerio.load(loginPage);
    const csrf = $("[name='csrf']").attr("value") || "";
    if (!csrf) throw new PortalParserError("CSRF-Token der Loginseite wurde nicht gefunden.");

    const form = new URLSearchParams({
      csrf,
      username: this.username,
      password: this.password,
      go_to: "",
    });
    const loginResponse = await this.request("/includes/project/auth/login.php", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    if (!loginResponse.ok) throw new PortalAuthError(`Portal-Anmeldung fehlgeschlagen (${loginResponse.status}).`);
    const loginHtml = await loginResponse.text();
    if (!isAuthenticatedPage(loginHtml)) {
      throw new PortalAuthError("Das Elternportal hat Benutzername oder Passwort abgelehnt.");
    }

    if (this.childId > 0) {
      const childResponse = await this.request(`/api/set_child.php?id=${encodeURIComponent(this.childId)}`, { method: "POST" });
      if (!childResponse.ok) throw new PortalAuthError(`Kind-Auswahl fehlgeschlagen (${childResponse.status}).`);
      const childResult = (await childResponse.text()).trim();
      if (childResult !== "1") {
        throw new PortalAuthError("Das Elternportal hat die konfigurierte ELTERNPORTAL_CHILD_ID abgelehnt.");
      }
    }

    const startPage = await this.getText("/start");
    if (!isAuthenticatedPage(startPage)) {
      throw new PortalAuthError("Die Elternportal-Sitzung konnte nach der Anmeldung nicht bestätigt werden.", { retryable: true });
    }
  }

  async readAll({ includeLetterBody = false } = {}) {
    await this.login();
    const now = Date.now();
    const appointmentParams = new URLSearchParams({
      from: String(now),
      to: String(now + 90 * 24 * 60 * 60 * 1_000),
      utc_offset: String(new Date().getTimezoneOffset()),
    });
    const [lettersHtml, timetableHtml, examsHtml, appointmentsJson] = await Promise.all([
      this.getText("/aktuelles/elternbriefe"),
      this.getText("/service/stundenplan"),
      this.getText("/service/termine/liste/schulaufgaben"),
      this.getText(`/api/ws_get_termine.php?${appointmentParams}`),
    ]);
    for (const [label, html] of [["Elternbriefe", lettersHtml], ["Stundenplan", timetableHtml], ["Schulaufgaben", examsHtml]]) {
      if (!isAuthenticatedPage(html)) {
        throw new PortalAuthError(`Elternportal-Sitzung beim Abruf von ${label} abgelaufen.`, { retryable: true });
      }
      if (!cheerio.load(html)("#asam_content").length) {
        throw new PortalParserError(`Portalstruktur für ${label} wurde nicht erkannt.`);
      }
    }
    return {
      letters: parseParentLetters(lettersHtml, { includeBody: includeLetterBody }),
      timetable: parseTimetable(timetableHtml),
      exams: parseExams(examsHtml),
      appointments: parseAppointments(appointmentsJson, { now }),
    };
  }
}
