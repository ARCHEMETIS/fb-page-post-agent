# Draft file contract

Writers—whether human or automated—place each finished Facebook draft in `drafts/pending/` as a UTF-8 JSON file. The GitHub Actions workflow submits pending files in filename order. After a successful submission, it moves the file to `drafts/posted/` and commits that move. Invalid or failed submissions stay in `pending/` for correction or retry.

Each file must have this shape:

```json
{
  "text": "Required non-empty Facebook caption",
  "image": {
    "title": "Required non-empty card title",
    "subtitle": "Optional supporting line",
    "sourceUrl": "https://example.com/optional-source"
  }
}
```

For example, `drafts/pending/2026-08-08-morning-routine.json` could contain:

```json
{
  "text": "เริ่มต้นเช้าวันใหม่ด้วยเป้าหมายเล็ก ๆ ที่ทำได้จริง เพราะความก้าวหน้าที่ยั่งยืนเกิดจากการลงมือทำอย่างสม่ำเสมอ 🌱",
  "image": {
    "title": "เริ่มเล็ก แต่ไปได้ไกล",
    "subtitle": "หนึ่งก้าวในวันนี้ เปลี่ยนวันพรุ่งนี้ได้",
    "sourceUrl": "https://example.com/morning-routine"
  }
}
```
