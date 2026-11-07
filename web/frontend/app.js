const health = document.querySelector("#health");
const form = document.querySelector("#note-form");
const input = document.querySelector("#note-text");
const message = document.querySelector("#form-message");
const list = document.querySelector("#notes");

function setHealth(state, text) {
  health.dataset.state = state;
  health.textContent = text;
}

function showMessage(text) {
  message.textContent = text;
}

async function readError(response) {
  try {
    const body = await response.json();
    if (typeof body.detail === "string") {
      return body.detail;
    }
  } catch {
    // 不是 JSON 時，用下面的通用訊息。
  }
  return "這次沒有成功，請再試一次。";
}

async function checkHealth() {
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("health failed");
    }
    setHealth("ok", "API 連線正常");
  } catch {
    setHealth("down", "API 連不上");
  }
}

function renderNotes(notes) {
  list.replaceChildren();
  if (notes.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "目前沒有備忘。";
    list.append(empty);
    return;
  }

  for (const note of notes) {
    const item = document.createElement("li");
    const text = document.createElement("p");
    text.textContent = note.text;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "刪除";
    remove.addEventListener("click", () => removeNote(note.id));

    item.append(text, remove);
    list.append(item);
  }
}

async function loadNotes() {
  const response = await fetch("/api/notes", { cache: "no-store" });
  if (!response.ok) {
    showMessage(await readError(response));
    return;
  }
  renderNotes(await response.json());
}

async function removeNote(id) {
  showMessage("");
  const response = await fetch(`/api/notes/${id}`, { method: "DELETE" });
  if (!response.ok) {
    showMessage(await readError(response));
    return;
  }
  await loadNotes();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage("");
  const text = input.value.trim();
  if (!text) {
    showMessage("內容不能是空白。");
    return;
  }

  const response = await fetch("/api/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) {
    showMessage(await readError(response));
    return;
  }

  input.value = "";
  await loadNotes();
});

checkHealth();
loadNotes().catch(() => {
  showMessage("讀取備忘失敗。");
});
