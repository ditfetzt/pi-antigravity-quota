# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2] - 2026-02-06

### Changed
- Renamed `extensions/quota.ts` to `extensions/index.ts`.
- Updated banner size in `README.md`.

## [0.1.0] - 2026-02-06

### Added
- **Quota Dashboard**: New `/quota` command to visualize Google Cloud Code model usage.
- **Smart Grouping**: Models automatically categorized into families (Claude, Gemini, Other).
- **Visual Health Indicators**: Progress bars and color coding (Green/Yellow/Red) for quick status assessment.
- **Auto-Discovery**: Automatically detects credentials from `~/.pi/agent/auth.json`.
- **Filtering**: Hides internal/deprecated models and noise (like "Gemini 2.5").
- **Npm Support**: Fully structured as a `pi-package` for easy installation via `pi install npm:pi-antigravity-quota`.

### Changed
- Refactored project structure to follow `pi` package conventions (`extensions/` directory).
