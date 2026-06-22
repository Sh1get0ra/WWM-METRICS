# Where Winds Metrics | WWMetrics
### 風燕計 / 燕云计 / 연운계

[![Cloudflare Pages](https://img.shields.io/badge/Live-Cloudflare%20Pages-orange)](https://wwm-metrics.pages.dev)

**Language**:
[![日本語](https://img.shields.io/badge/-日本語-c9a45a?style=for-the-badge)](README.md)
[![English](https://img.shields.io/badge/-English-c83c2b?style=for-the-badge)](README.en.md)
[![简体中文](https://img.shields.io/badge/-简体中文-c9a45a?style=for-the-badge)](README.zh-CN.md)
[![한국어](https://img.shields.io/badge/-한국어-c9a45a?style=for-the-badge)](README.ko.md)
[![Tiếng Việt](https://img.shields.io/badge/-Tiếng_Việt-c9a45a?style=for-the-badge)](README.vi.md)

🔗 **Tool URL**: https://wwm-metrics.pages.dev

> 📱 **Mobile support complete** (iPhone SE 375px and up / Android all sizes). Both PC and mobile are supported.

---

## Overview

A gear strength comparison / optimization tool for **Where Winds Meet**.
Computes the **Martial Index** from character stats imported from the Where Winds Meet - Official Data Tool, based on the Where Winds Meet damage formula.
Proposes optimal equipment and per-piece comparisons to guide equipment improvement.

---

## Key Features

### 📥 Data Import
- **One-click character data import** from the Where Winds Meet - Official Data Tool → gear info including tune/attune, equipped xinfa, and other character info — all imported at once.
- Instant Martial Index display with zero manual input.

### 🏯 Martial Index
- A score computed from character stats using fixed skill coefficients shared across all players.
- By fixing differences such as martial arts skill multipliers, it enables absolute equipment strength comparison.

### 🪶 Gear Compare
- Real-time preview of Martial Index variation between imported gear and new gear.
- Built-in convenient OCR input for new gear (all languages supported).

### 🧘 Xinfa Compare
- Tier effect list + per-element xinfa effects.
- Since accurately scoring effects other than T2/T5 is currently difficult, a global damage coefficient is applied.

### 📊 Analysis Panel
- **Expected Value Ranking**: View tune/attune expected value ranking based on current gear.
- **Gear Optimization**: Suggest and apply optimal gear configurations from current state.

### 📈 Martial Index History
- Past imports and Martial Index trends shown as a graph.
- Multi-character support, period switching (all / 30d / 7d).

### 💾 Presets
- Multi-slot save / load / delete.
- Saves in-progress gear configurations + baseline.

### 📡 OBS Share
- Generates an overlay URL with customizable color schemes for streaming status info on OBS.

### 🌐 Multilingual UI
- Japanese / English / Simplified Chinese / Korean / Vietnamese — full UI + data coverage.
- ※ Please contact us if you notice any incorrect translations.

---

## Martial Index Tier Criteria

Judged by the ratio between the Martial Index computed from equipment at import time and the Martial Index based on optimized equipment.
The Martial Index Tier is auto-determined at import time and does not change until re-import.

| Tier | Ratio |
|---|---|
| **SS** | ≥ 95% of max |
| **S** | ≥ 90% |
| **A** | ≥ 80% |
| **B** | ≥ 65% |
| **C** | below |

---

## Effects Reflected in Calculation

- Gear base stats (Physical ATK / per-element ATK, etc.)
- Tune / Attune effects
- Martial arts talents (Crit Rate cap +Δ, per-element ATK / Pen / DMG bonus, etc.)
- Xinfa Tier effects (T2/T5 = visible stats, T0/T1/T3/T4/T6 = hidden additive)
- 2-Piece set bonus (additive when 2 pieces equipped)
- 4-Piece set bonus (+100 fixed when 4 pieces equipped, distributed evenly)
- Base stats (Body / Strength / Defense / Agility / Power) → derived (Base Stats / Judgment Rates)
- Character base stats (Talents / Melodies of Peace / Enhance, etc.)

---

## Effects NOT Reflected in Calculation

- PvP-Exclusive Attune (Attune slot 6) — display only, no calculation contribution

---

## About Discrepancies with In-Game Stats

The Martial Index is computed assuming character base stats (Talents / Melodies of Peace / Enhance, etc.) are **maxed out — common to all players**.
If your character has not yet maxed these, the tool's value may appear higher than your in-game stats.
This is intentional, to enable absolute equipment strength comparison.

---

## Usage

1. **Open the tool** → https://wwm-metrics.pages.dev
2. Click the **📥** button → import data from the Where Winds Meet - Official Data Tool.
3. Try and verify various configurations with the imported data!

---

## Tech Stack

- **HTML / CSS / JavaScript** (framework-free)
- Hosted on Cloudflare Pages
- LocalStorage for import data, baseline, and presets

---

## Keywords

`Where Winds Meet` `WWM` `Martial Index` `damage calculator` `expected value` `gear optimization` `tune` `attune` `xinfa` `inner way` `martial arts talents` `風燕伝` `武格指数` `燕云十六声` `풍연전` `Yến Vân`
