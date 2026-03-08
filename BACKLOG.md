# Backlog (By Date)

## 2026-03-07 (Previous Changes)

### Completed

- [x] Add drag-and-drop sorting for project cards
  - Implement drag interactions and visual states (dragging, hover, drop indicator)
  - Allow sorting only in unfiltered mode to avoid ordering ambiguity
- [x] Persist project ordering to config file
  - Save sorted results to `projectOrder` in main process
  - Restore order from `projectOrder` when loading projects
- [x] Add "Save Project Config" feature (shortcuts)
  - Save selected projects as a shortcut config
  - Add name validation (required, max 20 chars, charset rules, duplicate check)
  - Enforce max 5 shortcut configs
- [x] Add shortcut config management
  - Show shortcut list and support delete
  - Support drag-and-drop sorting and persistence for shortcuts
- [x] Add shortcut import/export
  - Export configs as JSON
  - Validate and deduplicate on import, truncate when exceeding limits
- [x] Enhance shortcut storage
  - Add config versioning
  - Add AES-256-CBC encrypted storage
  - Add checksum validation
  - Add backup/restore (keep latest 5 backups)
  - Add multi-level config path fallback (`~/.config` -> `userData` -> local project dir)
- [x] Add batch start capability
  - Start selected projects in batch
  - Show progress and success/failure stats
  - Write startup logs

## 2026-03-08 (Current Changes)

### Completed

- [x] Support double-click rename for shortcut configs
  - Enter rename mode directly on double click
  - Fix issue where apply/load was triggered before rename on double click
- [x] Internationalize shortcut-related UI copy
  - Replace shortcut feature copy with i18n keys
  - Cover buttons, dialogs, progress text, toasts, and validation messages
- [x] Internationalize frontend mapping for backend errors
  - Map common backend error strings to localized copy instead of raw English errors
- [x] Add missing zh/en locale entries
  - Add corresponding keys under `projects.shortcuts.*` in both locales

### Todo

- [ ] Unify backend error-code mapping strategy in i18n (avoid string matching)
- [ ] Add automated tests for shortcuts and batch start (unit + UI flow)
- [ ] Add a `lint` script and include it in daily validation workflow
- [ ] Fix `app-config.json` write permission issues in some environments (independent of shortcuts)
