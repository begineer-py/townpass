"""JSON API。靜態頁面放在 frontend/，路由一律走 /api。"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="簡記 API", version="0.1.0")


class NoteIn(BaseModel):
    text: str = Field(min_length=1, max_length=200)


class Note(BaseModel):
    id: int
    text: str


_notes: list[Note] = [
    Note(id=1, text="前端是靜態頁面，不自己保存資料。"),
    Note(id=2, text="後端只回 JSON，路徑都在 /api 底下。"),
]
_next_id = 3


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "notes"}


@app.get("/api/notes", response_model=list[Note])
def list_notes() -> list[Note]:
    return _notes


@app.post("/api/notes", response_model=Note, status_code=201)
def create_note(payload: NoteIn) -> Note:
    global _next_id
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=422, detail="內容不能是空白。")
    note = Note(id=_next_id, text=text)
    _next_id += 1
    _notes.insert(0, note)
    return note


@app.delete("/api/notes/{note_id}", status_code=204)
def delete_note(note_id: int) -> None:
    for index, note in enumerate(_notes):
        if note.id == note_id:
            del _notes[index]
            return
    raise HTTPException(status_code=404, detail="找不到這則備忘。")


# 請在 web 目錄啟動。Vercel 會把這個目錄的靜態檔放到 CDN，/api 仍進這個 app。
app.frontend("/", directory="frontend")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=True)
