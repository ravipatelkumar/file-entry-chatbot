// n8n Webhook URL
const WEBHOOK_URL = "https://amber-platforms-electron-trat.trycloudflare.com/webhook/file-entry";

const app = document.getElementById("app");
const chat = document.getElementById("chat");
const composer = document.getElementById("composer");
const messageInput = document.getElementById("messageInput");
const fileInput = document.getElementById("fileInput");
const sendBtn = document.getElementById("sendBtn");

const filePreview = document.getElementById("filePreview");
const fileIcon = document.getElementById("fileIcon");
const selectedFileName = document.getElementById("selectedFileName");
const selectedFileSize = document.getElementById("selectedFileSize");
const removeFile = document.getElementById("removeFile");

const statusEl = document.getElementById("status");
const statusText = document.getElementById("statusText");
const dropzone = document.getElementById("dropzone");

let selectedFile = null;
let isSending = false;

/* ---------- Theme ---------- */
const THEME_KEY = "fea-theme";

function applyTheme(name) {
  document.documentElement.dataset.theme = name;
  document.querySelectorAll("[data-theme-btn]").forEach(btn => {
    btn.setAttribute("aria-checked", btn.dataset.themeBtn === name);
  });
  try { localStorage.setItem(THEME_KEY, name); } catch {}
}

(function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch {}
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(saved || (prefersDark ? "forge" : "steel"));
})();

document.querySelectorAll("[data-theme-btn]").forEach(btn => {
  btn.addEventListener("click", () => applyTheme(btn.dataset.themeBtn));
});

/* ---------- Helpers ---------- */
function addMessage(text, type = "bot") {
  const div = document.createElement("div");
  div.className = `message ${type}`;
  div.textContent = text;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  return div;
}

function addTyping() {
  const div = document.createElement("div");
  div.className = "message bot typing";
  div.setAttribute("aria-label", "Processing");
  div.innerHTML = "<span></span><span></span><span></span>";
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  return div;
}

function removeWithAnimation(el) {
  return new Promise(resolve => {
    el.classList.add("leaving");
    el.addEventListener("animationend", () => { el.remove(); resolve(); }, { once: true });
    setTimeout(() => { el.remove(); resolve(); }, 300); // fallback
  });
}

function formatBytes(bytes) {
  if (!bytes) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function fileExt(name) {
  const ext = name.includes(".") ? name.split(".").pop() : "file";
  return ext.slice(0, 4).toUpperCase();
}

function setStatus(state) {
  statusEl.className = `status ${state}`;
  statusText.textContent =
    state === "busy" ? "Working" : state === "offline" ? "Offline" : "Online";
}

/* ---------- File handling ---------- */
function showFilePreview(file) {
  selectedFile = file;
  fileIcon.textContent = fileExt(file.name);
  selectedFileName.textContent = file.name;
  selectedFileSize.textContent = formatBytes(file.size);
  filePreview.classList.add("show");
  filePreview.setAttribute("aria-hidden", "false");
}

function clearFile() {
  selectedFile = null;
  fileInput.value = "";
  filePreview.classList.remove("show");
  filePreview.setAttribute("aria-hidden", "true");
}

function setSending(state) {
  isSending = state;
  sendBtn.disabled = state;
  messageInput.disabled = state;
  fileInput.disabled = state;
  app.classList.toggle("is-busy", state);
  setStatus(state ? "busy" : "");
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (file) showFilePreview(file);
});

removeFile.addEventListener("click", clearFile);

/* Drag & drop anywhere on the app */
let dragDepth = 0;
app.addEventListener("dragenter", e => {
  if (isSending || !e.dataTransfer.types.includes("Files")) return;
  e.preventDefault();
  dragDepth++;
  dropzone.classList.add("show");
});
app.addEventListener("dragover", e => e.preventDefault());
app.addEventListener("dragleave", () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) dropzone.classList.remove("show");
});
app.addEventListener("drop", e => {
  e.preventDefault();
  dragDepth = 0;
  dropzone.classList.remove("show");
  const file = e.dataTransfer.files[0];
  if (file && !isSending) showFilePreview(file);
});

/* ---------- Input ---------- */
messageInput.addEventListener("input", () => {
  messageInput.style.height = "auto";
  messageInput.style.height = Math.min(messageInput.scrollHeight, 130) + "px";
});

messageInput.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    composer.requestSubmit();
  }
});

/* ---------- Submit ---------- */
composer.addEventListener("submit", async event => {
  event.preventDefault();
  if (isSending) return;

  const message = messageInput.value.trim();
  if (!message && !selectedFile) return;

  sendBtn.classList.remove("fly");
  void sendBtn.offsetWidth; // restart animation
  sendBtn.classList.add("fly");

  if (message) addMessage(message, "user");

  if (selectedFile) {
    const fileMsg = addMessage("", "user");
    const card = document.createElement("div");
    card.className = "file-card";
    card.textContent = `📎 ${selectedFile.name} (${formatBytes(selectedFile.size)})`;
    fileMsg.appendChild(card);
  }

  const formData = new FormData();
  formData.append("message", message);
  if (selectedFile) formData.append("file", selectedFile);

  // Clear composer right away so it feels responsive
  messageInput.value = "";
  messageInput.style.height = "auto";
  clearFile();

  setSending(true);
  const typing = addTyping();

  try {
    const response = await fetch(WEBHOOK_URL, { method: "POST", body: formData });
    const raw = await response.text();

    let result = {};
    try { result = raw ? JSON.parse(raw) : {}; }
    catch { result = { message: raw }; }

    await removeWithAnimation(typing);

    if (!response.ok) {
      addMessage(`❌ Request failed\n${result.message || "n8n returned an error."}`, "bot error");
    } else {
      addMessage(result.message || result.reply || "✅ Request processed successfully.");
    }
    setSending(false);
  } catch {
    await removeWithAnimation(typing);
    addMessage(
      "❌ Could not connect to n8n.\n\nMake sure n8n is running and the Webhook URL is reachable.",
      "bot error"
    );
    setSending(false);
    setStatus("offline");
  }

  messageInput.focus();
});