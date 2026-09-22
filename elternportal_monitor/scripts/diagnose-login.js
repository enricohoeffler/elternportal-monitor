import * as cheerio from "cheerio";
import { readFile } from "node:fs/promises";
import { loadConfig } from "../src/config.js";
import { ElternportalClient, isAuthenticatedPage } from "../src/elternportal-client.js";

const config = loadConfig();
const client = new ElternportalClient(config.portal);
const envText = await readFile(".env", "utf8");
const passwordLine = envText.split(/\r?\n/).find((line) => line.startsWith("ELTERNPORTAL_PASSWORD=")) || "";
const rawPassword = passwordLine.slice("ELTERNPORTAL_PASSWORD=".length);
const usernameLine = envText.split(/\r?\n/).find((line) => line.startsWith("ELTERNPORTAL_USERNAME=")) || "";
const rawUsername = usernameLine.slice("ELTERNPORTAL_USERNAME=".length);

const initialResponse = await client.request("/");
const initialHtml = await initialResponse.text();
const $ = cheerio.load(initialHtml);
const csrf = $("[name='csrf']").attr("value") || "";
const form = new URLSearchParams({
  csrf,
  username: config.portal.username,
  password: config.portal.password,
  go_to: "",
});

const loginResponse = await client.request("/includes/project/auth/login.php", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: form.toString(),
});
const loginHtml = await loginResponse.text();
const loginDocument = cheerio.load(loginHtml);
const portalMessage = loginDocument(".alert, .alert-danger, .text-danger, [role='alert']")
  .toArray()
  .map((element) => loginDocument(element).text().replace(/\s+/g, " ").trim())
  .filter(Boolean)
  .join(" | ")
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[E-Mail ausgeblendet]")
  .slice(0, 500);
let childStatus = "skipped";
let childAccepted = true;
if (config.portal.childId > 0) {
  const childResponse = await client.request(`/api/set_child.php?id=${encodeURIComponent(config.portal.childId)}`, { method: "POST" });
  const childText = (await childResponse.text()).trim();
  childStatus = childResponse.status;
  childAccepted = childText === "1";
}
const startResponse = await client.request("/start");
const startHtml = await startResponse.text();

console.log(JSON.stringify({
  initialStatus: initialResponse.status,
  envSyntax: {
    usernameLoadedLength: config.portal.username.length,
    usernameHasOuterWhitespace: config.portal.username !== config.portal.username.trim(),
    usernameRawQuoted: /^["']/.test(rawUsername),
    passwordLoadedLength: config.portal.password.length,
    passwordHasOuterWhitespace: config.portal.password !== config.portal.password.trim(),
    passwordRawQuoted: /^["']/.test(rawPassword),
    passwordRawHasHash: rawPassword.includes("#"),
  },
  csrfLength: csrf.length,
  loginStatus: loginResponse.status,
  loginPath: new URL(loginResponse.url).pathname,
  loginAuthenticated: isAuthenticatedPage(loginHtml),
  portalMessage: portalMessage || "Keine strukturierte Fehlermeldung gefunden",
  cookieNames: [...client.jar.cookies.keys()],
  childStatus,
  childAccepted,
  startStatus: startResponse.status,
  startPath: new URL(startResponse.url).pathname,
  startAuthenticated: isAuthenticatedPage(startHtml),
}, null, 2));
