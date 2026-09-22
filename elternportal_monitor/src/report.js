function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function timetableByDay(timetable) {
  const result = {};
  for (const lesson of timetable) {
    for (const [day, entry] of Object.entries(lesson.days)) {
      if (!entry.subject) continue;
      (result[day] ||= []).push({ period: lesson.period, time: lesson.time, ...entry });
    }
  }
  return result;
}

export function buildHomeAssistantDays(timetable) {
  return timetableByDay(timetable);
}

export function buildReport({ data, newLetters, checkedAt }) {
  const lines = [`Elternportal – Stand ${checkedAt}`, ""];
  lines.push(newLetters.length ? `Neue Elternbriefe (${newLetters.length}):` : "Keine neuen Elternbriefe.");
  for (const letter of newLetters) lines.push(`- ${letter.date || "ohne Datum"}: ${letter.title}`);
  lines.push("", `Schulaufgaben (${data.exams.length}):`);
  for (const exam of data.exams) lines.push(`- ${exam.date}: ${exam.title}`);
  if (data.exams.length === 0) lines.push("- Keine eingetragen.");
  lines.push("", "Stundenplan:");
  for (const [day, lessons] of Object.entries(timetableByDay(data.timetable))) {
    lines.push(`${day}: ${lessons.map((lesson) => `${lesson.period}. ${lesson.subject}${lesson.room ? ` (${lesson.room})` : ""}`).join(", ")}`);
  }

  const text = lines.join("\n");
  const html = `<h2>Elternportal</h2><p>Stand ${escapeHtml(checkedAt)}</p>
    <h3>${newLetters.length ? `${newLetters.length} neue Elternbriefe` : "Keine neuen Elternbriefe"}</h3>
    <ul>${newLetters.map((letter) => `<li><strong>${escapeHtml(letter.title)}</strong> – ${escapeHtml(letter.date || "ohne Datum")}</li>`).join("")}</ul>
    <h3>Schulaufgaben</h3><ul>${data.exams.length ? data.exams.map((exam) => `<li><strong>${escapeHtml(exam.date)}</strong> – ${escapeHtml(exam.title)}</li>`).join("") : "<li>Keine eingetragen.</li>"}</ul>
    <h3>Stundenplan</h3>${Object.entries(timetableByDay(data.timetable)).map(([day, lessons]) => `<h4>${escapeHtml(day)}</h4><ul>${lessons.map((lesson) => `<li>${lesson.period}. ${escapeHtml(lesson.subject)}${lesson.room ? ` (${escapeHtml(lesson.room)})` : ""}</li>`).join("")}</ul>`).join("")}`;
  return { subject: `Elternportal: ${newLetters.length} neue Briefe, ${data.exams.length} Schulaufgaben`, text, html };
}

