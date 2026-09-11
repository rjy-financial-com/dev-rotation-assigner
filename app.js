const STORAGE_KEY = "rotation_state_v1";
const USER_KEY = "rotation_current_user_v1";
const THEME_KEY = "rotation_theme_v1";
const TICKET_PREFIX = "DORYFE-";

// Testing is not in the rotation for now. QA handles it.
// Set this to true later if QA is overburdened and testing should round-robin too.
const TESTING_ROTATION = false;

const DEFAULT_DEVS = [
  { name: "Anusree", order: 1 },
  { name: "Hrithik", order: 2 },
  { name: "Krithika", order: 3 },
  { name: "Rohan", order: 4 },
  { name: "Sharon", order: 5 }
];

const ui = {
  reviewKey: TICKET_PREFIX,
  reviewTitle: "",
  reviewSuggestedName: null,
  reviewError: "",
  testKey: "",
  testSuggestedName: null,
  testError: "",
  addName: "",
  teamError: "",
  edit: null,
  reassignTest: false,
  toast: null,
  persistError: "",
  corruptNotice: false,
  howOpen: false
};

let state = defaultState();
let currentUser = "";
let themePreference = "";
let unreadableBackup = null;
let allowOverwrite = true;
let toastTimer = null;

function defaultState() {
  return {
    version: 1,
    qaNote: "",
    rotationStart: DEFAULT_DEVS[0].name,
    devs: DEFAULT_DEVS.map((dev) => ({
      name: dev.name,
      order: dev.order,
      reviewCount: 0,
      testCount: 0,
      leaveFrom: null,
      leaveTo: null
    })),
    tickets: [],
    history: []
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function todayISO() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
}

function normalizeKey(raw) {
  const key = String(raw || "").trim().toUpperCase().replace(/\s+/g, "");
  if (!key || key === "DORYFE" || key === "DORYFE-") return "";
  if (/^\d+$/.test(key)) return TICKET_PREFIX + key;
  if (/^DORYFE\d+$/.test(key)) return TICKET_PREFIX + key.slice("DORYFE".length);
  return key;
}

function intCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function dateOrNull(value) {
  if (value == null || value === "") return null;
  const text = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function formatDate(iso) {
  if (!iso) return "—";
  const parts = iso.split("-").map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function formatTs(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function isOnLeave(dev, today) {
  return !!(dev.leaveFrom && dev.leaveTo && today >= dev.leaveFrom && today <= dev.leaveTo);
}

function reviewExclude() {
  return currentUser && findDev(currentUser) ? [currentUser] : [];
}

function selectedReviewTicket() {
  const ticket = ticketByKey(ui.reviewKey);
  if (!ticket || !ticket.reviewer) return null;
  return ticket;
}

function reviewPickExclude() {
  const exclude = reviewExclude();
  const ticket = selectedReviewTicket();
  if (!ticket) return exclude;
  if (ticket.reviewer && exclude.indexOf(ticket.reviewer) === -1) exclude.push(ticket.reviewer);
  if (ticket.tester && exclude.indexOf(ticket.tester) === -1) exclude.push(ticket.tester);
  return exclude;
}

function loadCurrentUser() {
  try {
    return localStorage.getItem(USER_KEY) || "";
  } catch (err) {
    return "";
  }
}

function resolvedTheme() {
  if (themePreference === "light" || themePreference === "dark") return themePreference;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme() {
  document.documentElement.dataset.theme = resolvedTheme();
}

function loadTheme() {
  try {
    themePreference = localStorage.getItem(THEME_KEY) || "";
  } catch (err) {
    themePreference = "";
  }
  if (themePreference !== "light" && themePreference !== "dark") themePreference = "";
  applyTheme();
}

function toggleTheme() {
  themePreference = resolvedTheme() === "dark" ? "light" : "dark";
  try {
    localStorage.setItem(THEME_KEY, themePreference);
  } catch (err) {
    ui.persistError = "Could not remember the theme in this browser.";
  }
  applyTheme();
  render();
}

function themeButton() {
  const theme = resolvedTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    '<button type="button" class="theme-switch" data-action="toggle-theme" role="switch" aria-checked="' + (theme === "dark" ? "true" : "false") + '" aria-label="Switch to ' + next + ' theme">' +
      '<span class="theme-switch-icons" aria-hidden="true">' +
        '<svg class="theme-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2.2M12 19.8V22M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2 12h2.2M19.8 12H22M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6"></path></svg>' +
        '<svg class="theme-icon" viewBox="0 0 24 24"><path d="M16.5 14.5A6.5 6.5 0 0 1 9.2 6.2 7 7 0 1 0 18 15.8a6.4 6.4 0 0 1-1.5-1.3z"></path></svg>' +
      "</span>" +
      '<span class="theme-switch-thumb" aria-hidden="true"></span>' +
    "</button>"
  );
}

function saveCurrentUser(name) {
  currentUser = name || "";
  try {
    if (currentUser) localStorage.setItem(USER_KEY, currentUser);
    else localStorage.removeItem(USER_KEY);
  } catch (err) {
    ui.persistError = "Could not remember who you are in this browser.";
  }
}

function syncCurrentUser() {
  if (currentUser && !findDev(currentUser)) saveCurrentUser("");
}

function pickNext(devs, key, exclude) {
  const skipped = exclude || [];
  const today = todayISO();
  const available = devs
    .filter((dev) => !skipped.includes(dev.name))
    .filter((dev) => !(dev.leaveFrom && dev.leaveTo && today >= dev.leaveFrom && today <= dev.leaveTo))
    .sort((a, b) => a[key] - b[key] || a.order - b.order);
  return available[0] || null;
}

function isCatchingUp(dev, key) {
  if (!state.devs.length) return false;
  const counts = state.devs.map((item) => item[key]);
  const min = Math.min.apply(null, counts);
  const max = Math.max.apply(null, counts);
  return dev[key] === min && max - min >= 2;
}

function catchingUpTitle(dev) {
  const parts = [];
  if (isCatchingUp(dev, "reviewCount")) parts.push("reviews");
  if (TESTING_ROTATION && isCatchingUp(dev, "testCount")) parts.push("testing");
  if (!parts.length) return "";
  return "Lowest " + parts.join(" and ") + " count, at least 2 behind the highest.";
}

function isBalanced() {
  if (!state.devs.length) return false;
  const review = state.devs[0].reviewCount;
  if (!TESTING_ROTATION) return state.devs.every((dev) => dev.reviewCount === review);
  const test = state.devs[0].testCount;
  return state.devs.every((dev) => dev.reviewCount === review && dev.testCount === test);
}

function ticketByKey(key) {
  const normalized = normalizeKey(key);
  if (!normalized) return null;
  return state.tickets.find((ticket) => ticket.key === normalized) || null;
}

function pendingTickets() {
  return state.tickets
    .filter((ticket) => ticket.reviewer && !ticket.tester)
    .sort((a, b) => String(a.reviewAt || "").localeCompare(String(b.reviewAt || "")));
}

function selectedTestTarget() {
  const ticket = ticketByKey(ui.testKey);
  if (!ticket || !ticket.reviewer) return null;
  if (ui.reassignTest) return ticket.tester ? ticket : null;
  if (ticket.tester) return null;
  return ticket;
}

function testExclude(ticket) {
  const exclude = [ticket.reviewer];
  if (ui.reassignTest && ticket.tester && exclude.indexOf(ticket.tester) === -1) exclude.push(ticket.tester);
  return exclude;
}

function testCardSignature() {
  const typed = normalizeKey(ui.testKey);
  const ticket = selectedTestTarget();
  if (!typed) return "empty";
  if (!ticket) {
    const existing = ticketByKey(typed);
    return existing && existing.tester ? "taken:" + existing.key : "none";
  }
  const pick = pickNext(state.devs, "testCount", testExclude(ticket));
  return (ui.reassignTest ? "reassign:" : "ticket:") + ticket.key + ":" + (pick ? pick.name : "");
}

function activityAt(ticket) {
  return [ticket.reviewAt, ticket.testAt].filter(Boolean).sort().pop() || "";
}

function emptyPickMessage(kind, exclude) {
  const today = todayISO();
  const skipped = exclude || [];
  if (!state.devs.length) return "Add at least one developer on the team board.";
  const onLeave = state.devs.filter((dev) => isOnLeave(dev, today));
  const availableExceptExcluded = state.devs.filter((dev) => !isOnLeave(dev, today) && !skipped.includes(dev.name));
      if (!availableExceptExcluded.length && onLeave.length === state.devs.length) {
        return "Everyone is on leave for today (" + formatDate(today) + "). Clear a leave range, or wait until someone returns.";
      }
      if (kind === "review" && skipped.length && !availableExceptExcluded.length) {
        return "No one else is available to review. Skipped: " + skipped.join(", ") + ". Clear leave on someone else, or wait until they return.";
      }
      if (kind === "test" && skipped.length && !availableExceptExcluded.length) {
    return "No one can test this ticket. " + skipped.join(", ") + " is the reviewer and cannot also test it, and everyone else is on leave for today (" + formatDate(today) + ").";
  }
  if (!availableExceptExcluded.length && onLeave.length) {
    return "No one is available. On leave today (" + formatDate(today) + "): " + onLeave.map((dev) => dev.name).join(", ") + ".";
  }
  return "No developer is available for this assignment.";
}

function explainBits(pick, key, exclude) {
  const duty = key === "reviewCount" ? "reviews" : "tests";
  const today = todayISO();
  const skipped = exclude || [];
  const onLeave = state.devs.filter((dev) => isOnLeave(dev, today)).map((dev) => dev.name);
  const tied = state.devs.filter((dev) => dev[key] === pick[key] && !isOnLeave(dev, today) && !skipped.includes(dev.name));
  const bits = [pick[key] + " " + duty];
  if (tied.length > 1) bits.push("Tie from " + state.rotationStart);
  if (key === "reviewCount" && skipped.length) {
    const you = skipped.filter((name) => name === currentUser);
    const others = skipped.filter((name) => name !== currentUser);
    if (you.length) bits.push("Skips you");
    if (others.length) bits.push("Not " + others.join(", "));
  } else if (skipped.length) bits.push("Not " + skipped.join(", "));
  if (onLeave.length) bits.push("Leave: " + onLeave.join(", "));
  return bits;
}

function chip(text, extra) {
  return '<span class="chip' + (extra ? " " + extra : "") + '">' + text + "</span>";
}

function chipRow(items) {
  if (!items || !items.length) return "";
  return '<div class="chip-row">' + items.join("") + "</div>";
}

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function avatarHtml(name, size) {
  const sizeClass = size ? " avatar-" + size : "";
  return '<span class="avatar' + sizeClass + '" aria-hidden="true">' + esc(initials(name)) + "</span>";
}

function qaLabel() {
  if (state.qaNote) {
    return TESTING_ROTATION ? state.qaNote + " · not in rotation" : state.qaNote + " · testing";
  }
  return TESTING_ROTATION ? "QA not in rotation" : "QA handles testing";
}

function headerMetaHtml() {
  const bits = [
    chip(esc(formatDate(todayISO()))),
    chip(esc(qaLabel()), "chip-mute")
  ];
  if (isBalanced()) bits.push('<span class="chip chip-ok" id="balanced-flag">Balanced</span>');
  return bits.join("");
}

function howItWorks() {
  const items = TESTING_ROTATION
    ? [
      "Lowest count is next. Ties go A–Z from the start person, then wrap around.",
      "Suggestions skip whoever is using this page.",
      "Leave skips someone without changing their counts — they catch up when they return.",
      "The same person never reviews and tests the same ticket."
    ]
    : [
      "Lowest review count is next. Ties go A–Z from the start person, then wrap around.",
      "Suggestions skip whoever is using this page.",
      "Leave skips someone without changing their counts — they catch up when they return.",
      "Testing stays with QA for now."
    ];
  return (
    '<details class="how"' + (ui.howOpen ? " open" : "") + ">" +
      "<summary>How assignment works</summary>" +
      "<ul>" + items.map((item) => "<li>" + item + "</li>").join("") + "</ul>" +
    "</details>"
  );
}

function teamsMessage(role, name, key) {
  const word = role === "review" ? "reviewer" : "tester";
  return "@" + name + " — " + word + " for " + key;
}

function normalizeState(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const devs = Array.isArray(source.devs) ? source.devs : [];
  const tickets = Array.isArray(source.tickets) ? source.tickets : [];
  const history = Array.isArray(source.history) ? source.history : [];
  const next = {
    version: 1,
    qaNote: String(source.qaNote || "").slice(0, 80),
    rotationStart: String(source.rotationStart || "").trim().slice(0, 40),
    devs: devs.map((dev, index) => ({
      name: String(dev && dev.name || "").trim().slice(0, 40),
      order: Number.isFinite(Number(dev && dev.order)) ? Number(dev.order) : index + 1,
      reviewCount: intCount(dev && dev.reviewCount),
      testCount: intCount(dev && dev.testCount),
      leaveFrom: dateOrNull(dev && dev.leaveFrom),
      leaveTo: dateOrNull(dev && dev.leaveTo)
    })).filter((dev) => dev.name),
    tickets: tickets.map((ticket) => ({
      key: normalizeKey(ticket && ticket.key).slice(0, 40),
      title: String(ticket && ticket.title || "").trim().slice(0, 120),
      reviewer: ticket && ticket.reviewer ? String(ticket.reviewer) : null,
      tester: ticket && ticket.tester ? String(ticket.tester) : null,
      reviewAt: ticket && ticket.reviewAt ? String(ticket.reviewAt) : null,
      testAt: ticket && ticket.testAt ? String(ticket.testAt) : null
    })).filter((ticket) => ticket.key),
    history: history.map((entry) => ({
      type: entry && (entry.type === "test" || entry.type === "reassign-review" || entry.type === "reassign-test") ? entry.type : "review",
      ticketKey: normalizeKey(entry && entry.ticketKey),
      devName: String(entry && entry.devName || ""),
      at: entry && entry.at ? String(entry.at) : null,
      prevReviewCount: intCount(entry && entry.prevReviewCount),
      prevTestCount: intCount(entry && entry.prevTestCount),
      also: entry && entry.also && entry.also.devName ? {
        devName: String(entry.also.devName),
        prevReviewCount: intCount(entry.also.prevReviewCount),
        prevTestCount: intCount(entry.also.prevTestCount)
      } : null,
      prevTicket: entry && entry.prevTicket ? {
        key: normalizeKey(entry.prevTicket.key),
        title: String(entry.prevTicket.title || ""),
        reviewer: entry.prevTicket.reviewer || null,
        tester: entry.prevTicket.tester || null,
        reviewAt: entry.prevTicket.reviewAt || null,
        testAt: entry.prevTicket.testAt || null
      } : null
    })).filter((entry) => entry.ticketKey && entry.devName)
  };
  next.rotationStart = applyRotationOrder(next.devs, next.rotationStart);
  return next;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      unreadableBackup = null;
      allowOverwrite = true;
      ui.corruptNotice = false;
      return defaultState();
    }
    const parsed = normalizeState(JSON.parse(raw));
    unreadableBackup = null;
    allowOverwrite = true;
    ui.corruptNotice = false;
    return parsed;
  } catch (err) {
    try { unreadableBackup = localStorage.getItem(STORAGE_KEY); } catch (readErr) { unreadableBackup = null; }
    allowOverwrite = false;
    ui.corruptNotice = true;
    return defaultState();
  }
}

function persist() {
  if (unreadableBackup && !allowOverwrite) {
    ui.persistError = "Download or dismiss the unreadable backup before saving new assignments.";
    return false;
  }
  try {
    state = normalizeState(state);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    ui.persistError = "";
    unreadableBackup = null;
    return true;
  } catch (err) {
    ui.persistError = "Could not save in this browser. Export a backup before leaving the page.";
    return false;
  }
}

function showToast(message, copyText) {
  ui.toast = { message: message, copyText: copyText || "" };
  paintToast();
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    ui.toast = null;
    toastTimer = null;
    paintToast();
  }, 8000);
}

function paintToast() {
  const root = document.getElementById("toast-root");
  if (!ui.toast) {
    root.innerHTML = "";
    return;
  }
  const copy = ui.toast.copyText
    ? '<button type="button" class="btn-ghost" data-action="copy-toast">Copy</button>'
    : "";
  root.innerHTML =
    '<div class="toast" role="status">' +
      "<p>" + esc(ui.toast.message) + "</p>" +
      '<div class="actions">' + copy +
        '<button type="button" class="btn-ghost" data-action="dismiss-toast">Dismiss</button>' +
      "</div>" +
    "</div>";
}

let dialogBusy = false;

function askConfirm(message, confirmLabel) {
  if (dialogBusy) return Promise.resolve(false);
  const dialog = document.getElementById("confirm-dialog");
  dialog.innerHTML =
    "<p>" + esc(message) + "</p>" +
    '<div class="actions">' +
      '<button type="button" class="btn-ghost" data-dialog="cancel">Cancel</button>' +
      '<button type="button" class="btn" data-dialog="ok">' + esc(confirmLabel) + "</button>" +
    "</div>";
  dialogBusy = true;
  return new Promise((resolve) => {
    const finish = (value) => {
      dialogBusy = false;
      dialog.oncancel = null;
      if (dialog.open) dialog.close();
      resolve(value);
    };
    dialog.querySelector("[data-dialog=ok]").onclick = () => finish(true);
    dialog.querySelector("[data-dialog=cancel]").onclick = () => finish(false);
    dialog.oncancel = (event) => {
      event.preventDefault();
      finish(false);
    };
    dialog.showModal();
    dialog.querySelector("[data-dialog=cancel]").focus();
  });
}

function clearSuggestions() {
  ui.reviewSuggestedName = null;
  ui.testSuggestedName = null;
}

function findDev(name) {
  return state.devs.find((dev) => dev.name === name) || null;
}

function findAssignee(name) {
  if (!name) return null;
  return findDev(name) || state.devs.find((dev) => dev.name.toLowerCase() === String(name).toLowerCase()) || null;
}

function releaseCount(name, key) {
  const dev = findAssignee(name);
  if (!dev || dev[key] <= 0) return null;
  dev[key] -= 1;
  return dev;
}

function compareNames(a, b) {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function devsByName() {
  return state.devs.slice().sort((a, b) => compareNames(a.name, b.name));
}

function rotationSequence() {
  return state.devs.slice().sort((a, b) => a.order - b.order || compareNames(a.name, b.name));
}

function applyRotationOrder(devs, rotationStart) {
  const sorted = devs.slice().sort((a, b) => compareNames(a.name, b.name));
  if (!sorted.length) return "";
  const startName = sorted.some((dev) => dev.name === rotationStart) ? rotationStart : sorted[0].name;
  const startIndex = sorted.findIndex((dev) => dev.name === startName);
  const count = sorted.length;
  sorted.forEach((dev, index) => {
    dev.order = ((index - startIndex + count) % count) + 1;
  });
  return startName;
}

function nextInRotation(name) {
  const ordered = rotationSequence();
  const index = ordered.findIndex((dev) => dev.name === name);
  if (index === -1 || !ordered.length) return "";
  return ordered[(index + 1) % ordered.length].name;
}

function renameReferences(oldName, newName) {
  state.tickets.forEach((ticket) => {
    if (ticket.reviewer === oldName) ticket.reviewer = newName;
    if (ticket.tester === oldName) ticket.tester = newName;
  });
  state.history.forEach((entry) => {
    if (entry.devName === oldName) entry.devName = newName;
    if (!entry.prevTicket) return;
    if (entry.prevTicket.reviewer === oldName) entry.prevTicket.reviewer = newName;
    if (entry.prevTicket.tester === oldName) entry.prevTicket.tester = newName;
  });
}

function assignReview(key, title, pick) {
  const dev = findDev(pick.name);
  if (!dev || ticketByKey(key)) return;
  const at = new Date().toISOString();
  state.history.push({
    type: "review",
    ticketKey: key,
    devName: dev.name,
    at: at,
    prevReviewCount: dev.reviewCount,
    prevTestCount: dev.testCount,
    prevTicket: null
  });
  dev.reviewCount += 1;
  state.tickets.push({
    key: key,
    title: title,
    reviewer: dev.name,
    tester: null,
    reviewAt: at,
    testAt: null
  });
  ui.reviewKey = TICKET_PREFIX;
  ui.reviewTitle = "";
  ui.reviewError = "";
  ui.testKey = key;
  ui.testError = "";
  clearSuggestions();
  persist();
  render();
  showToast(teamsMessage("review", dev.name, key), teamsMessage("review", dev.name, key));
}

function reassignReview(ticket, pick, title) {
  const dev = findDev(pick.name);
  const current = state.tickets.find((item) => item.key === ticket.key);
  if (!dev || !current || !current.reviewer || dev.name === current.reviewer) return;
  if (current.tester && dev.name === current.tester) return;
  const previousReviewer = current.reviewer;
  const old = findAssignee(previousReviewer);
  const at = new Date().toISOString();
  state.history.push({
    type: "reassign-review",
    ticketKey: current.key,
    devName: dev.name,
    at: at,
    prevReviewCount: dev.reviewCount,
    prevTestCount: dev.testCount,
    also: old ? {
      devName: old.name,
      prevReviewCount: old.reviewCount,
      prevTestCount: old.testCount
    } : null,
    prevTicket: clone(current)
  });
  releaseCount(previousReviewer, "reviewCount");
  dev.reviewCount += 1;
  current.reviewer = dev.name;
  current.reviewAt = at;
  if (title) current.title = title;
  ui.reviewKey = TICKET_PREFIX;
  ui.reviewTitle = "";
  ui.reviewError = "";
  ui.testKey = current.key;
  ui.testError = "";
  ui.reassignTest = false;
  clearSuggestions();
  persist();
  render();
  const dropped = old
    ? previousReviewer + "'s review count is now " + old.reviewCount + ". "
    : previousReviewer + " is no longer on the team, so their count was not changed. ";
  showToast(
    "Reassigned from " + previousReviewer + ". " + dropped + teamsMessage("review", dev.name, current.key),
    teamsMessage("review", dev.name, current.key)
  );
}

function assignTest(ticket, pick) {
  const dev = findDev(pick.name);
  const current = state.tickets.find((item) => item.key === ticket.key);
  if (!dev || !current || current.tester || !current.reviewer || dev.name === current.reviewer) return;
  const at = new Date().toISOString();
  state.history.push({
    type: "test",
    ticketKey: current.key,
    devName: dev.name,
    at: at,
    prevReviewCount: dev.reviewCount,
    prevTestCount: dev.testCount,
    prevTicket: clone(current)
  });
  dev.testCount += 1;
  current.tester = dev.name;
  current.testAt = at;
  ui.testError = "";
  clearSuggestions();
  const nextPending = pendingTickets()[0];
  ui.testKey = nextPending ? nextPending.key : "";
  ui.reassignTest = false;
  persist();
  render();
  showToast(teamsMessage("test", dev.name, current.key), teamsMessage("test", dev.name, current.key));
}

function reassignTest(ticket, pick) {
  const dev = findDev(pick.name);
  const current = state.tickets.find((item) => item.key === ticket.key);
  if (!dev || !current || !current.tester || !current.reviewer) return;
  if (dev.name === current.tester || dev.name === current.reviewer) return;
  const previousTester = current.tester;
  const old = findAssignee(previousTester);
  const at = new Date().toISOString();
  state.history.push({
    type: "reassign-test",
    ticketKey: current.key,
    devName: dev.name,
    at: at,
    prevReviewCount: dev.reviewCount,
    prevTestCount: dev.testCount,
    also: old ? {
      devName: old.name,
      prevReviewCount: old.reviewCount,
      prevTestCount: old.testCount
    } : null,
    prevTicket: clone(current)
  });
  releaseCount(previousTester, "testCount");
  dev.testCount += 1;
  current.tester = dev.name;
  current.testAt = at;
  ui.testError = "";
  ui.reassignTest = false;
  clearSuggestions();
  const nextPending = pendingTickets()[0];
  ui.testKey = nextPending ? nextPending.key : "";
  persist();
  render();
  const dropped = old
    ? previousTester + "'s test count is now " + old.testCount + ". "
    : previousTester + " is no longer on the team, so their count was not changed. ";
  showToast(
    "Reassigned from " + previousTester + ". " + dropped + teamsMessage("test", dev.name, current.key),
    teamsMessage("test", dev.name, current.key)
  );
}

function undoLast() {
  const action = state.history[state.history.length - 1];
  if (!action) return;
  const dev = findDev(action.devName);
  if (dev) {
    dev.reviewCount = action.prevReviewCount;
    dev.testCount = action.prevTestCount;
  }
  if (action.also) {
    const other = findDev(action.also.devName);
    if (other) {
      other.reviewCount = action.also.prevReviewCount;
      other.testCount = action.also.prevTestCount;
    }
  }
  const index = state.tickets.findIndex((ticket) => ticket.key === action.ticketKey);
  if (action.prevTicket == null) {
    if (index >= 0) state.tickets.splice(index, 1);
  } else if (index >= 0) {
    state.tickets[index] = clone(action.prevTicket);
  } else {
    state.tickets.push(clone(action.prevTicket));
  }
  state.history.pop();
  if (action.type === "review" && normalizeKey(ui.testKey) === action.ticketKey) ui.testKey = "";
  clearSuggestions();
  const warning = dev ? "" : " Ticket restored, but " + action.devName + " is no longer on the team so their counter was not changed.";
  persist();
  render();
  showToast("Undid last assignment." + warning);
}

function suggestReview() {
  const key = normalizeKey(ui.reviewKey);
  ui.reviewError = "";
  if (!reviewExclude().length) {
    ui.reviewError = "Choose who you are first. Reviewer suggestions skip you.";
    ui.reviewSuggestedName = null;
    render();
    return;
  }
  if (!key) {
    ui.reviewError = "Enter the ticket number after DORYFE-.";
    ui.reviewSuggestedName = null;
    render();
    return;
  }
  if (key.length > 40) {
    ui.reviewError = "Ticket key is too long.";
    ui.reviewSuggestedName = null;
    render();
    return;
  }
  const existing = ticketByKey(key);
  const pick = pickNext(state.devs, "reviewCount", reviewPickExclude());
  ui.reviewKey = key;
  if (existing && !ui.reviewTitle.trim()) ui.reviewTitle = existing.title || "";
  ui.reviewSuggestedName = pick ? pick.name : "";
  render();
}

function confirmReview() {
  const key = normalizeKey(ui.reviewKey);
  const title = ui.reviewTitle.trim().slice(0, 120);
  if (!reviewExclude().length) {
    ui.reviewError = "Choose who you are first. Reviewer suggestions skip you.";
    ui.reviewSuggestedName = null;
    render();
    return;
  }
  const existing = ticketByKey(key);
  const pick = pickNext(state.devs, "reviewCount", reviewPickExclude());
  if (pick && (pick.name === currentUser || (existing && (pick.name === existing.reviewer || pick.name === existing.tester)))) {
    ui.reviewError = "That person cannot review this ticket.";
    ui.reviewSuggestedName = null;
    render();
    return;
  }
  if (!key) {
    suggestReview();
    return;
  }
  if (!pick) {
    ui.reviewSuggestedName = "";
    render();
    return;
  }
  if (pick.name !== ui.reviewSuggestedName) {
    ui.reviewSuggestedName = pick.name;
    showToast("Suggestion changed. Review it, then confirm.");
    render();
    return;
  }
  if (existing) reassignReview(existing, pick, title);
  else assignReview(key, title, pick);
}

function suggestTest() {
  if (!TESTING_ROTATION) return;
  ui.testError = "";
  const ticket = selectedTestTarget();
  const typed = ticketByKey(ui.testKey);
  if (!normalizeKey(ui.testKey)) {
    ui.testError = "Select a ticket, or type a key that already has a reviewer.";
    ui.testSuggestedName = null;
    render();
    return;
  }
  if (!ticket) {
    ui.testError = typed && typed.tester
      ? typed.key + " already has a tester. Use Reassign tester to move it."
      : "No ticket with that key is waiting for a tester. Assign a reviewer first.";
    ui.testSuggestedName = null;
    render();
    return;
  }
  const exclude = testExclude(ticket);
  const pick = pickNext(state.devs, "testCount", exclude);
  if (!pick) {
    ui.testError = emptyPickMessage("test", exclude);
    ui.testSuggestedName = null;
    render();
    return;
  }
  ui.testKey = ticket.key;
  ui.testSuggestedName = pick.name;
  render();
}

function confirmTest() {
  if (!TESTING_ROTATION) return;
  const ticket = selectedTestTarget();
  if (!ticket) {
    suggestTest();
    return;
  }
  const exclude = testExclude(ticket);
  const pick = pickNext(state.devs, "testCount", exclude);
  if (!pick) {
    ui.testSuggestedName = "";
    render();
    return;
  }
  if (pick.name !== ui.testSuggestedName) {
    ui.testSuggestedName = pick.name;
    showToast("Suggestion changed. Review it, then confirm.");
    render();
    return;
  }
  if (ui.reassignTest) reassignTest(ticket, pick);
  else assignTest(ticket, pick);
}

function saveEdit() {
  if (!ui.edit) return;
  const nameInput = document.getElementById("edit-name");
  const fromInput = document.getElementById("edit-from");
  const toInput = document.getElementById("edit-to");
  if (nameInput) ui.edit.name = nameInput.value;
  if (fromInput) ui.edit.leaveFrom = fromInput.value || null;
  if (toInput) ui.edit.leaveTo = toInput.value || null;
  const original = ui.edit.originalName;
  const dev = findDev(original);
  if (!dev) {
    ui.edit = null;
    render();
    return;
  }
  const name = ui.edit.name.trim().slice(0, 40);
  const leaveFrom = dateOrNull(ui.edit.leaveFrom);
  const leaveTo = dateOrNull(ui.edit.leaveTo);
  if (!name) {
    ui.teamError = "Name cannot be empty.";
    render();
    return;
  }
  const duplicate = state.devs.some((item) => item.name !== original && item.name.toLowerCase() === name.toLowerCase());
  if (duplicate) {
    ui.teamError = "That name is already on the team.";
    render();
    return;
  }
  if ((leaveFrom && !leaveTo) || (!leaveFrom && leaveTo)) {
    ui.teamError = "Set both leave dates, or clear them.";
    render();
    return;
  }
  if (leaveFrom && leaveTo && leaveFrom > leaveTo) {
    ui.teamError = "Leave start must be on or before leave end.";
    render();
    return;
  }
  if (name !== original) {
    renameReferences(original, name);
    if (currentUser === original) saveCurrentUser(name);
    if (state.rotationStart === original) state.rotationStart = name;
  }
  dev.name = name;
  dev.leaveFrom = leaveFrom;
  dev.leaveTo = leaveTo;
  ui.edit = null;
  ui.teamError = "";
  clearSuggestions();
  persist();
  render();
}

function addDev() {
  const name = ui.addName.trim().slice(0, 40);
  if (!name) {
    ui.teamError = "Enter a name to add.";
    render();
    return;
  }
  if (state.devs.some((dev) => dev.name.toLowerCase() === name.toLowerCase())) {
    ui.teamError = "That name is already on the team.";
    render();
    return;
  }
  state.devs.push({
    name: name,
    order: 0,
    reviewCount: 0,
    testCount: 0,
    leaveFrom: null,
    leaveTo: null
  });
  ui.addName = "";
  ui.teamError = "";
  clearSuggestions();
  persist();
  render();
}

async function removeDev(name) {
  if (state.devs.length <= 1) {
    ui.teamError = "Keep at least one developer in the rotation.";
    render();
    return;
  }
  const ok = await askConfirm(
    "Remove " + name + " from the rotation? Past tickets keep their name. Undo will not change a removed developer's counter.",
    "Remove"
  );
  if (!ok) return;
  if (state.rotationStart === name) state.rotationStart = nextInRotation(name);
  state.devs = state.devs.filter((dev) => dev.name !== name);
  if (currentUser === name) saveCurrentUser("");
  if (ui.edit && ui.edit.originalName === name) ui.edit = null;
  ui.teamError = "";
  clearSuggestions();
  persist();
  render();
}

function exportState() {
  const blob = new Blob([JSON.stringify(normalizeState(state), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "rotation_state_v1.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function applyImported(parsed) {
  const next = normalizeState(parsed);
  if (!next.devs.length) {
    showToast("That file has no developers, so it was not imported.");
    return;
  }
  state = next;
  ui.reviewKey = TICKET_PREFIX;
  ui.reviewTitle = "";
  ui.reviewError = "";
  ui.testKey = "";
  ui.testError = "";
  ui.addName = "";
  ui.teamError = "";
  ui.edit = null;
  clearSuggestions();
  allowOverwrite = true;
  syncCurrentUser();
  persist();
  render();
  showToast("Imported rotation state.");
}

async function onImportFile(input) {
  const file = input.files && input.files[0];
  input.value = "";
  if (!file) return;
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch (err) {
    showToast("That file is not valid JSON.");
    return;
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.devs)) {
    showToast("That file is not a rotation state export.");
    return;
  }
  const ok = await askConfirm("Import replaces the current rotation, including assignments and leave dates.", "Import");
  if (!ok) return;
  applyImported(parsed);
}

async function resetAll() {
  const ok = await askConfirm(
    "Reset all rotation state? This clears assignments, leave dates, and counters. Export a backup first if you need one.",
    "Reset all"
  );
  if (!ok) return;
  state = defaultState();
  ui.reviewKey = TICKET_PREFIX;
  ui.reviewTitle = "";
  ui.reviewError = "";
  ui.testKey = "";
  ui.testError = "";
  ui.addName = "";
  ui.teamError = "";
  ui.edit = null;
  ui.reassignTest = false;
  clearSuggestions();
  allowOverwrite = true;
  syncCurrentUser();
  persist();
  render();
  showToast("Rotation reset to the default team.");
}

function rotationStartControl() {
  const options = devsByName()
    .map((dev) => {
      const selected = dev.name === state.rotationStart ? " selected" : "";
      return '<option value="' + esc(dev.name) + '"' + selected + ">" + esc(dev.name) + "</option>";
    })
    .join("");
  const chips = rotationSequence().flatMap((dev, index, list) => {
    const start = dev.name === state.rotationStart ? " is-start" : "";
    const item = '<li class="' + start + '">' + esc(dev.name) + "</li>";
    if (index === list.length - 1) return [item];
    return [item, '<li class="cycle-sep" aria-hidden="true">→</li>'];
  }).join("");
  return (
    '<div class="start-row">' +
      '<label class="who">Starts with' +
        '<select id="rotation-start" data-field="rotationStart" title="When counts are tied, this person is next, then A–Z wrapping around. Counts and past tickets stay the same.">' + options + "</select>" +
      "</label>" +
      (chips ? '<ol class="cycle-chips" aria-label="Tie-break order">' + chips + "</ol>" : "") +
    "</div>"
  );
}

function currentUserSelect() {
  const options = devsByName()
    .map((dev) => {
      const selected = dev.name === currentUser ? " selected" : "";
      return '<option value="' + esc(dev.name) + '"' + selected + ">" + esc(dev.name) + "</option>";
    })
    .join("");
  return (
    '<label class="who">I am' +
      '<select id="current-user" data-field="currentUser">' +
        '<option value="">Choose…</option>' +
        options +
      "</select>" +
    "</label>"
  );
}

function nextCard(kicker, nameId, name, chips, help, person) {
  const body = person
    ? '<div class="next-person">' +
        avatarHtml(person, "lg") +
        '<div class="name-block">' +
          '<p class="next-name" id="' + nameId + '">' + name + "</p>" +
          chipRow(chips) +
        "</div>" +
      "</div>"
    : '<p class="next-name" id="' + nameId + '">' + name + "</p>" + chipRow(chips);
  return (
    '<article class="next-card">' +
      '<p class="kicker">' + kicker + "</p>" +
      body +
      (help ? '<p class="next-help">' + help + "</p>" : "") +
    "</article>"
  );
}

function reviewerCard() {
  const ticket = selectedReviewTicket();
  const exclude = reviewPickExclude();
  if (!reviewExclude().length) {
    return nextCard(
      "Next reviewer",
      "next-reviewer-name",
      "Choose who you are",
      null,
      "Set <strong>I am</strong> in the header. Suggestions skip you."
    );
  }
  const pick = pickNext(state.devs, "reviewCount", exclude);
  const kicker = ticket ? "Next reviewer · " + esc(ticket.key) : "Next reviewer";
  if (!pick) {
    return nextCard(kicker, "next-reviewer-name", "No one available", null, esc(emptyPickMessage("review", exclude)));
  }
  const badge = isCatchingUp(pick, "reviewCount")
    ? '<span class="badge" title="' + esc(catchingUpTitle(pick)) + '">catching up</span>'
    : "";
  const chips = [
    ticket ? chip("Replacing " + esc(ticket.reviewer), "chip-warn") : chip("Skips you", "chip-mute"),
    chip(pick.reviewCount + " reviews"),
    chip("Turn " + pick.order)
  ];
  return nextCard(kicker, "next-reviewer-name", esc(pick.name) + badge, chips, "", pick.name);
}

function testerCard() {
  const ticket = selectedTestTarget();
  const typed = normalizeKey(ui.testKey);
  if (!typed) {
    return nextCard("Next tester", "next-tester-name", "Select a ticket", null, "Pick a ticket in Assign testing. The reviewer is skipped.");
  }
  if (!ticket) {
    const existing = ticketByKey(typed);
    const help = existing && existing.tester
      ? existing.key + " already has a tester."
      : "No waiting ticket matches that key.";
    return nextCard("Next tester", "next-tester-name", "—", null, esc(help));
  }
  const exclude = testExclude(ticket);
  const pick = pickNext(state.devs, "testCount", exclude);
  const kicker = "Next tester · " + esc(ticket.key);
  if (!pick) {
    return nextCard(kicker, "next-tester-name", "No one available", null, esc(emptyPickMessage("test", exclude)));
  }
  const badge = isCatchingUp(pick, "testCount")
    ? '<span class="badge" title="' + esc(catchingUpTitle(pick)) + '">catching up</span>'
    : "";
  const chips = [
    chip("Not " + esc(ticket.reviewer), "chip-mute"),
    ui.reassignTest ? chip("Replacing " + esc(ticket.tester), "chip-warn") : "",
    chip(pick.testCount + " tests"),
    chip("Turn " + pick.order)
  ].filter(Boolean);
  return nextCard(kicker, "next-tester-name", esc(pick.name) + badge, chips, "", pick.name);
}

function suggestionBlock(kind) {
  const isReview = kind === "review";
  const suggestedName = isReview ? ui.reviewSuggestedName : ui.testSuggestedName;
  if (suggestedName == null) return "";
  const ticket = isReview ? selectedReviewTicket() : selectedTestTarget();
  const exclude = isReview ? reviewPickExclude() : (ticket ? testExclude(ticket) : []);
  const key = isReview ? "reviewCount" : "testCount";
  const pick = suggestedName ? pickNext(state.devs, key, exclude) : null;
  if (!pick) {
    return '<div class="empty-note">' + esc(emptyPickMessage(kind, exclude)) + "</div>";
  }
  const badge = isCatchingUp(pick, key)
    ? '<span class="badge" title="' + esc(catchingUpTitle(pick)) + '">(catching up)</span>'
    : "";
      const action = isReview ? "confirm-review" : "confirm-test";
      const confirmLabel = isReview
        ? (ticket ? "Confirm new reviewer" : "Confirm reviewer")
        : (ui.reassignTest ? "Confirm new tester" : "Confirm tester");
      const chips = explainBits(pick, key, exclude).map((bit) => chip(esc(bit)));
      return (
        '<div class="suggestion" role="status">' +
          '<div class="next-person">' +
            avatarHtml(pick.name) +
            '<div class="name-block">' +
              '<p class="kicker">Suggested ' + (isReview ? "reviewer" : "tester") + "</p>" +
              '<p class="suggestion-name">' + esc(pick.name) + badge + "</p>" +
              chipRow(chips) +
            "</div>" +
          "</div>" +
          '<div class="actions" style="margin-top:0.75rem">' +
            '<button type="button" class="btn" data-action="' + action + '">' + confirmLabel + "</button>" +
          "</div>" +
        "</div>"
      );
}

function ticketButton(ticket, action, selected) {
  const selectedClass = selected ? " is-selected" : "";
  const title = ticket.title ? " · " + esc(ticket.title) : "";
  return (
    '<li><button type="button" class="pending-item' + selectedClass + '" data-action="' + action + '" data-key="' + esc(ticket.key) + '" aria-pressed="' + (selected ? "true" : "false") + '">' +
      "<strong>" + esc(ticket.key) + title + "</strong>" +
      "<span>" + esc(ticket.reviewer) + " · " + esc(formatTs(ticket.reviewAt)) + "</span>" +
    "</button></li>"
  );
}

function reassignList() {
  const pending = pendingTickets();
  if (!pending.length) {
    return '<p class="hint">None yet. Enter a ticket key below.</p>';
  }
  const selected = selectedReviewTicket();
  return (
    '<ul class="pending">' +
      pending.map((ticket) => ticketButton(ticket, "select-review-ticket", !!(selected && selected.key === ticket.key))).join("") +
    "</ul>"
  );
}

function pendingList() {
  const pending = pendingTickets();
  if (!pending.length) {
    return '<p class="hint">Nothing waiting. Assign a reviewer first.</p>';
  }
  const selected = ticketByKey(ui.testKey);
  const selectedWaiting = selected && !selected.tester ? selected : null;
  return (
    '<ul class="pending">' +
      pending.map((ticket) => ticketButton(ticket, "select-ticket", !!(selectedWaiting && selectedWaiting.key === ticket.key))).join("") +
    "</ul>"
  );
}

function leaveCell(dev) {
  if (!dev.leaveFrom && !dev.leaveTo) return "—";
  if (dev.leaveFrom && dev.leaveTo) {
    return esc(formatDate(dev.leaveFrom)) + " – " + esc(formatDate(dev.leaveTo));
  }
  const one = dev.leaveFrom || dev.leaveTo;
  return esc(formatDate(one)) + '<span class="leave-note">Set both dates to count as leave</span>';
}

function teamRows() {
  const today = todayISO();
  return state.devs
    .slice()
    .sort((a, b) => compareNames(a.name, b.name))
    .map((dev) => {
      if (ui.edit && ui.edit.originalName === dev.name) {
        return (
          "<tr>" +
            '<td colspan="' + (TESTING_ROTATION ? "7" : "6") + '">' +
              '<form class="stack" data-form="save-edit">' +
                '<p class="field-label">Edit ' + esc(dev.name) + "</p>" +
                '<label>Name<input id="edit-name" data-field="editName" type="text" maxlength="40" value="' + esc(ui.edit.name) + '"></label>' +
                '<div class="row-2">' +
                  '<label>From<input id="edit-from" data-field="editFrom" type="date" value="' + esc(ui.edit.leaveFrom || "") + '"></label>' +
                  '<label>To<input id="edit-to" data-field="editTo" type="date" value="' + esc(ui.edit.leaveTo || "") + '"></label>' +
                "</div>" +
                '<div class="edit-actions">' +
                  '<button type="submit" class="btn">Save</button>' +
                  '<button type="button" class="btn-ghost" data-action="clear-leave">Clear dates</button>' +
                  '<button type="button" class="btn-ghost" data-action="cancel-edit">Cancel</button>' +
                "</div>" +
              "</form>" +
            "</td>" +
          "</tr>"
        );
      }
      const onLeave = isOnLeave(dev, today);
      const badge = catchingUpTitle(dev)
        ? '<span class="badge" title="' + esc(catchingUpTitle(dev)) + '">catching up</span>'
        : "";
      const you = dev.name === currentUser ? '<span class="you">you</span>' : "";
      const start = dev.name === state.rotationStart ? '<span class="start-mark">start</span>' : "";
      return (
        '<tr class="' + (onLeave ? "on-leave" : "") + '">' +
          '<td><div class="name-cell">' + avatarHtml(dev.name, "sm") + "<span>" + esc(dev.name) + you + start + badge + "</span></div></td>" +
          '<td class="num">' + dev.reviewCount + "</td>" +
          (TESTING_ROTATION ? '<td class="num">' + dev.testCount + "</td>" : "") +
          "<td>" + leaveCell(dev) + "</td>" +
          "<td><span class=\"status " + (onLeave ? "leave" : "available") + "\">" + (onLeave ? "Leave" : "Available") + "</span></td>" +
          '<td class="num">' + dev.order + "</td>" +
          "<td>" +
            '<div class="actions">' +
              '<button type="button" class="btn-ghost btn-compact" data-action="edit-dev" data-name="' + esc(dev.name) + '">Edit</button>' +
              '<button type="button" class="btn-danger btn-compact" data-action="remove-dev" data-name="' + esc(dev.name) + '">Remove</button>' +
            "</div>" +
          "</td>" +
        "</tr>"
      );
    }).join("");
}

function ticketLog() {
  const tickets = state.tickets.slice().sort((a, b) => activityAt(b).localeCompare(activityAt(a)));
  if (!tickets.length) return '<p class="hint">No tickets yet.</p>';
  return (
    '<ul class="log">' +
      tickets.map((ticket) => {
        const title = ticket.title ? '<span class="muted"> · ' + esc(ticket.title) + "</span>" : "";
        const tester = ticket.tester
          ? esc(ticket.tester) + " · " + esc(formatTs(ticket.testAt))
          : "Awaiting tester";
        // Testing rotation is off until QA needs it. See TESTING_ROTATION.
        const testerAction = !TESTING_ROTATION
          ? ""
          : ticket.tester
            ? '<button type="button" class="btn-ghost btn-compact" data-action="reassign-tester" data-key="' + esc(ticket.key) + '">Reassign tester</button>'
            : '<button type="button" class="btn-ghost btn-compact" data-action="choose-tester" data-key="' + esc(ticket.key) + '">Suggest tester</button>';
        const testerLine = TESTING_ROTATION
          ? '<p class="ticket-meta"><span class="meta-label">Tester</span> ' + tester + "</p>"
          : "";
        return (
          '<li class="ticket">' +
            '<div class="ticket-main">' +
              '<p class="ticket-key">' + esc(ticket.key) + title + "</p>" +
              '<p class="ticket-meta"><span class="meta-label">Reviewer</span> ' + esc(ticket.reviewer || "—") + " · " + esc(formatTs(ticket.reviewAt)) + "</p>" +
              testerLine +
            "</div>" +
            '<div class="ticket-actions">' +
              '<button type="button" class="btn-ghost btn-compact" data-action="reassign-from-log" data-key="' + esc(ticket.key) + '">Change reviewer</button>' +
              testerAction +
            "</div>" +
          "</li>"
        );
      }).join("") +
    "</ul>"
  );
}

function undoLabel() {
  const last = state.history[state.history.length - 1];
  if (!last) return "Undo last assignment";
  const duty = last.type === "test" ? "testing" : last.type === "reassign-test" ? "tester change" : last.type === "reassign-review" ? "reviewer change" : "review";
  return "Undo " + duty + " · " + last.devName + " · " + last.ticketKey;
}

function view() {
  const balanced = isBalanced();
  const pending = pendingTickets();
  const last = state.history[state.history.length - 1];
  const persist = ui.persistError ? '<p class="error">' + esc(ui.persistError) + "</p>" : "";
  const reviewError = ui.reviewError ? '<p class="error">' + esc(ui.reviewError) + "</p>" : "";
  const testError = ui.testError ? '<p class="error">' + esc(ui.testError) + "</p>" : "";
  const teamError = ui.teamError ? '<p class="error">' + esc(ui.teamError) + "</p>" : "";
  const testingPanel = TESTING_ROTATION
    ? '<section class="panel" id="assign-test">' +
        '<div class="section-head"><h2>Assign testing</h2><span class="count-pill">' + pending.length + " waiting</span></div>" +
        '<form class="stack" data-form="suggest-test">' +
          pendingList() +
          (ui.reassignTest && selectedTestTarget()
            ? '<p class="reassign-note">Replacing ' + esc(selectedTestTarget().tester) + " on " + esc(selectedTestTarget().key) + ". Their test count drops by 1.</p>" +
              '<button type="button" class="btn-ghost" data-action="cancel-reassign-test">Pick a waiting ticket</button>'
            : "") +
          '<label>Or type a key<input id="test-key" data-field="testKey" type="text" maxlength="40" spellcheck="false" autocomplete="off" placeholder="DORYFE-1234" value="' + esc(ui.testKey) + '"></label>' +
          testError +
          '<div class="actions"><button type="submit" class="btn-ghost">' + (ui.reassignTest ? "Suggest new tester" : "Suggest tester") + "</button></div>" +
          suggestionBlock("test") +
        "</form>" +
      "</section>"
    : "";
  const corrupt = ui.corruptNotice
    ? '<div class="banner">Saved rotation data could not be read. Download it before assigning, or dismiss this and start fresh.' +
        '<div class="actions" style="margin-top:0.6rem">' +
          '<button type="button" class="btn-ghost" data-action="download-backup">Download backup</button>' +
          '<button type="button" class="btn-ghost" data-action="dismiss-corrupt">Dismiss</button>' +
        "</div></div>"
    : "";

  return (
    '<div class="wrap">' +
      corrupt +
      '<header class="top">' +
        "<div>" +
          "<h1>Dev Rotation Assigner</h1>" +
          '<p class="meta" id="header-meta">' + headerMetaHtml() + "</p>" +
        "</div>" +
        '<div class="top-actions">' +
          currentUserSelect() +
          themeButton() +
          '<button type="button" class="btn-ghost" data-action="undo" title="' + esc(undoLabel()) + '" ' + (last ? "" : "disabled") + ">Undo</button>" +
        "</div>" +
      "</header>" +
      howItWorks() +
      '<div class="next-grid' + (TESTING_ROTATION ? "" : " is-single") + '" aria-live="polite">' + reviewerCard() + (TESTING_ROTATION ? testerCard() : "") + "</div>" +
      '<div class="layout' + (TESTING_ROTATION ? "" : " is-single") + '">' +
        '<section class="panel" id="assign-review">' +
          '<div class="section-head"><h2>Assign review</h2><span class="count-pill">' + pending.length + (TESTING_ROTATION ? " waiting" : " assigned") + "</span></div>" +
          '<form class="stack" data-form="suggest-review">' +
            (pending.length ? '<p class="field-label">' + (TESTING_ROTATION ? "Ready for testing" : "Assigned") + "</p>" : "") +
            reassignList() +
            (selectedReviewTicket()
              ? '<p class="reassign-note">Replacing ' + esc(selectedReviewTicket().reviewer) + " on " + esc(selectedReviewTicket().key) + ". Their review count drops by 1.</p>" +
                '<button type="button" class="btn-ghost" data-action="new-ticket">New ticket</button>'
              : "") +
            '<div class="row-2">' +
              '<label>Ticket key<input id="review-key" data-field="reviewKey" type="text" maxlength="40" spellcheck="false" autocomplete="off" placeholder="DORYFE-1234 or 1234" value="' + esc(ui.reviewKey) + '"></label>' +
              '<label>Title<input id="review-title" data-field="reviewTitle" type="text" maxlength="120" placeholder="Optional" value="' + esc(ui.reviewTitle) + '"></label>' +
            "</div>" +
            reviewError +
            '<div class="actions"><button type="submit" class="btn">' + (selectedReviewTicket() ? "Suggest new reviewer" : "Suggest reviewer") + "</button></div>" +
            suggestionBlock("review") +
          "</form>" +
        "</section>" +
        testingPanel +
      "</div>" +
      '<section class="panel section team' + (balanced ? " is-balanced" : "") + '">' +
        '<div class="section-head"><h2>Team board</h2></div>' +
        rotationStartControl() +
        teamError +
        '<div class="table-wrap">' +
          "<table>" +
            '<caption class="sr-only">Team rotation board</caption>' +
            "<thead><tr>" +
              "<th>Name</th><th class=\"num\">Reviews</th>" + (TESTING_ROTATION ? "<th class=\"num\">Tests</th>" : "") + "<th>Time off</th><th>Status</th><th class=\"num\">Turn</th><th>Actions</th>" +
            "</tr></thead>" +
            "<tbody>" + (teamRows() || '<tr><td colspan="' + (TESTING_ROTATION ? "7" : "6") + '">No developers yet.</td></tr>') + "</tbody>" +
          "</table>" +
        "</div>" +
        '<form class="add-row" data-form="add-dev">' +
          '<label>Add developer<input id="add-name" data-field="addName" type="text" maxlength="40" value="' + esc(ui.addName) + '"></label>' +
          '<button type="submit" class="btn">Add</button>' +
        "</form>" +
        '<div class="qa-row">' +
          '<label>QA <span class="muted">(not assigned work)</span><input id="qa-note" data-field="qaNote" type="text" maxlength="80" value="' + esc(state.qaNote) + '" placeholder="Name or note"></label>' +
        "</div>" +
      "</section>" +
      '<section class="panel section">' +
        "<h2>Ticket log</h2>" +
        ticketLog() +
      "</section>" +
      '<section class="panel section">' +
        "<h2>Backup</h2>" +
        '<div class="util-row">' +
          '<button type="button" class="btn-ghost" data-action="undo" title="' + esc(undoLabel()) + '" ' + (last ? "" : "disabled") + ">" + esc(undoLabel()) + "</button>" +
          '<button type="button" class="btn-ghost" data-action="export" title="Saved in this browser as ' + STORAGE_KEY + '">Export JSON</button>' +
          '<button type="button" class="btn-ghost" data-action="import" title="Who you are stays on this browser and is not overwritten by import.">Import JSON</button>' +
          '<input id="import-file" type="file" accept=".json,application/json" hidden>' +
          '<button type="button" class="btn-danger" data-action="reset">Reset all</button>' +
        "</div>" +
        persist +
      "</section>" +
    "</div>"
  );
}

let focusRestoreToken = 0;

function render() {
  const focus = document.activeElement;
  const focusId = focus && focus.id;
  const start = focus && typeof focus.selectionStart === "number" ? focus.selectionStart : null;
  const end = focus && typeof focus.selectionEnd === "number" ? focus.selectionEnd : null;
  const token = ++focusRestoreToken;
  document.getElementById("app").innerHTML = view();
  restoreFocus(focusId, start, end);
  // Replacing the field during an input event drops focus when the event ends.
  setTimeout(() => {
    if (token !== focusRestoreToken) return;
    restoreFocus(focusId, start, end);
  }, 0);
}

function restoreFocus(focusId, start, end) {
  if (!focusId) return;
  const el = document.getElementById(focusId);
  if (!el) return;
  const active = document.activeElement;
  const app = document.getElementById("app");
  if (active && active !== document.body && app && app.contains(active) && active !== el) return;
  if (document.activeElement !== el) el.focus({ preventScroll: true });
  if (start != null && el.setSelectionRange) {
    try { el.setSelectionRange(start, end); } catch (err) { /* date inputs */ }
  }
}

function onField(target) {
  const field = target.getAttribute("data-field");
  if (!field) return;
  if (field === "reviewKey") {
    const before = selectedReviewTicket() ? selectedReviewTicket().key : "";
    const hadSuggestion = ui.reviewSuggestedName != null || !!ui.reviewError;
    ui.reviewKey = target.value;
    ui.reviewSuggestedName = null;
    ui.reviewError = "";
    const after = selectedReviewTicket() ? selectedReviewTicket().key : "";
    if (hadSuggestion || before !== after) render();
    return;
  }
  if (field === "reviewTitle") {
    ui.reviewTitle = target.value;
    return;
  }
  if (field === "testKey") {
    const before = testCardSignature();
    const hadSuggestion = ui.testSuggestedName != null || !!ui.testError;
    ui.testKey = target.value;
    if (ui.reassignTest) {
      const typed = ticketByKey(ui.testKey);
      if (!typed || !typed.tester) ui.reassignTest = false;
    }
    ui.testSuggestedName = null;
    ui.testError = "";
    if (hadSuggestion || before !== testCardSignature()) render();
    return;
  }
  if (field === "addName") {
    ui.addName = target.value;
    return;
  }
  if (field === "currentUser") {
    saveCurrentUser(target.value);
    ui.reviewSuggestedName = null;
    ui.reviewError = "";
    render();
    return;
  }
  if (field === "rotationStart") {
    if (!findDev(target.value)) return;
    state.rotationStart = target.value;
    clearSuggestions();
    persist();
    render();
    return;
  }
  if (field === "qaNote") {
    state.qaNote = target.value.slice(0, 80);
    persist();
    const meta = document.getElementById("header-meta");
    if (meta) meta.innerHTML = headerMetaHtml();
    return;
  }
  if (!ui.edit) return;
  if (field === "editName") ui.edit.name = target.value;
  if (field === "editFrom") ui.edit.leaveFrom = target.value || null;
  if (field === "editTo") ui.edit.leaveTo = target.value || null;
}

async function copyToast() {
  if (!ui.toast || !ui.toast.copyText) return;
  const text = ui.toast.copyText;
  try {
    await navigator.clipboard.writeText(text);
    showToast("Copied: " + text, text);
    return;
  } catch (err) { /* file:// often blocks clipboard */ }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.left = "-9999px";
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch (copyErr) { ok = false; }
  area.remove();
  showToast(ok ? "Copied: " + text : text, text);
}

document.addEventListener("toggle", (event) => {
  if (event.target && event.target.classList && event.target.classList.contains("how")) {
    ui.howOpen = event.target.open;
  }
}, true);

document.addEventListener("input", (event) => onField(event.target));

document.addEventListener("change", (event) => {
  if (event.target.id === "import-file") onImportFile(event.target);
  else onField(event.target);
});

document.addEventListener("submit", (event) => {
  const form = event.target.closest("[data-form]");
  if (!form) return;
  event.preventDefault();
  const name = form.getAttribute("data-form");
  if (name === "suggest-review") suggestReview();
  if (name === "suggest-test") suggestTest();
  if (name === "add-dev") addDev();
  if (name === "save-edit") saveEdit();
});

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button || button.disabled) return;
  const action = button.getAttribute("data-action");
  if (action === "confirm-review") confirmReview();
  if (action === "confirm-test") confirmTest();
  if (action === "select-ticket") {
    ui.testKey = button.getAttribute("data-key") || "";
    ui.reassignTest = false;
    ui.testSuggestedName = null;
    ui.testError = "";
    render();
  }
  if (action === "select-review-ticket" || action === "reassign-from-log") {
    const ticket = ticketByKey(button.getAttribute("data-key"));
    if (!ticket) return;
    ui.reviewKey = ticket.key;
    ui.reviewTitle = ticket.title || "";
    ui.reviewSuggestedName = null;
    ui.reviewError = "";
    render();
    const section = document.getElementById("assign-review");
    if (section) section.scrollIntoView({ block: "start" });
  }
  if (action === "choose-tester") {
    ui.testKey = button.getAttribute("data-key") || "";
    ui.reassignTest = false;
    ui.testSuggestedName = null;
    ui.testError = "";
    render();
    const section = document.getElementById("assign-test");
    if (section) section.scrollIntoView({ block: "start" });
  }
  if (action === "reassign-tester") {
    if (!TESTING_ROTATION) return;
    const ticket = ticketByKey(button.getAttribute("data-key"));
    if (!ticket || !ticket.tester) return;
    ui.testKey = ticket.key;
    ui.reassignTest = true;
    ui.testSuggestedName = null;
    ui.testError = "";
    render();
    const section = document.getElementById("assign-test");
    if (section) section.scrollIntoView({ block: "start" });
  }
  if (action === "cancel-reassign-test") {
    ui.reassignTest = false;
    ui.testSuggestedName = null;
    ui.testError = "";
    const oldestWaiting = pendingTickets()[0];
    ui.testKey = oldestWaiting ? oldestWaiting.key : "";
    render();
  }
  if (action === "new-ticket") {
    ui.reviewKey = TICKET_PREFIX;
    ui.reviewTitle = "";
    ui.reviewSuggestedName = null;
    ui.reviewError = "";
    render();
    const input = document.getElementById("review-key");
    if (input) {
      input.focus();
      const end = input.value.length;
      try { input.setSelectionRange(end, end); } catch (err) { /* ignore */ }
    }
  }
  if (action === "edit-dev") {
    const dev = findDev(button.getAttribute("data-name"));
    if (!dev) return;
    ui.edit = {
      originalName: dev.name,
      name: dev.name,
      leaveFrom: dev.leaveFrom,
      leaveTo: dev.leaveTo
    };
    ui.teamError = "";
    render();
  }
  if (action === "cancel-edit") {
    ui.edit = null;
    ui.teamError = "";
    render();
  }
  if (action === "clear-leave" && ui.edit) {
    ui.edit.leaveFrom = null;
    ui.edit.leaveTo = null;
    render();
  }
  if (action === "save-edit") saveEdit();
  if (action === "remove-dev") removeDev(button.getAttribute("data-name"));
  if (action === "toggle-theme") toggleTheme();
  if (action === "undo") undoLast();
  if (action === "export") exportState();
  if (action === "import") {
    const input = document.getElementById("import-file");
    if (input) input.click();
  }
  if (action === "reset") resetAll();
  if (action === "copy-toast") copyToast();
  if (action === "dismiss-toast") {
    ui.toast = null;
    if (toastTimer) clearTimeout(toastTimer);
    paintToast();
  }
  if (action === "download-backup") {
    const blob = new Blob([unreadableBackup || ""], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "rotation_state_unreadable.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }
  if (action === "dismiss-corrupt") {
    allowOverwrite = true;
    ui.corruptNotice = false;
    persist();
    render();
  }
});

window.addEventListener("storage", (event) => {
  if (event.key === THEME_KEY) {
    loadTheme();
    render();
    return;
  }
  if (event.key === USER_KEY) {
    currentUser = loadCurrentUser();
    syncCurrentUser();
    clearSuggestions();
    render();
    return;
  }
  if (event.key !== STORAGE_KEY) return;
  state = loadState();
  syncCurrentUser();
  clearSuggestions();
  render();
});

state = loadState();
loadTheme();
currentUser = loadCurrentUser();
syncCurrentUser();
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (themePreference) return;
  applyTheme();
  render();
});
if (!ui.testKey) {
  const oldestWaiting = pendingTickets()[0];
  if (oldestWaiting) ui.testKey = oldestWaiting.key;
}
render();
