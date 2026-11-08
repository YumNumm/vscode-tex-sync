# Changelog

## 0.1.0

- Initial release.
- Cursor follow: forward SyncTeX as the cursor moves, driven by a local parse of the `.synctex(.gz)` file and executed through LaTeX Workshop's viewer.
- Auto-open PDF: open the PDF beside the editor when a TeX document becomes active.
- Highlight changes after build: when the SyncTeX file is rewritten, lines changed since the previous build are flashed in the PDF via LaTeX Workshop's rectangle indicator. Toggle with `texSync.highlightChanges.enabled`.
- Status bar item with a quick menu to toggle all features.
