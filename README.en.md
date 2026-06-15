# Where Winds Metrics | WWMETRICS
### 風燕計 / 燕云计 / 연운계

[![Cloudflare Pages](https://img.shields.io/badge/Live-Cloudflare%20Pages-orange)](https://wwm-metrics.pages.dev)

**Language**:
[![日本語](https://img.shields.io/badge/-日本語-c9a45a?style=for-the-badge)](README.md)
[![English](https://img.shields.io/badge/-English-c83c2b?style=for-the-badge)](README.en.md)
[![简体中文](https://img.shields.io/badge/-简体中文-c9a45a?style=for-the-badge)](README.zh-CN.md)
[![한국어](https://img.shields.io/badge/-한국어-c9a45a?style=for-the-badge)](README.ko.md)

🔗 **Tool URL**: https://wwm-metrics.pages.dev

> 📱 **Mobile support complete** (iPhone SE 375px and up / Android all sizes). PC and mobile both supported.

---

## Overview

A gear strength / optimization analyzer for **Where Winds Meet**.
Centered around the **Martial Index**, the tool imports your role data from the official data tool (extension) and aggregates gear, tune/attune affixes, martial arts, inner ways (xinfa), and gear set effects to compute damage expectation.

> v2.0.0 retires the legacy manual-stat-entry UI and fully migrates to a gear-data-driven experience.

---

## Key Features

### 📥 Data Import (Fully Automatic)
- One-click pull of role data from the official data tool (extension) → gear (10 slots), tune/attune affixes, inner ways (4 slots + arsenal), martial arts, and character info.
- Instant Martial Index display with zero manual input.

### 🏯 Martial Index
- A single composite score combining gear + tune/attune + martial arts + xinfa + set effects, calculated with **fixed skill coefficients shared across all players**.
- Eliminates world-level / enemy-parameter variance → enables absolute gear-strength comparison.

### ⚔️ Gear Cards / Xinfa Cards
- Gear cards: martial-element color coding (Bellstrike / Stonesplit / Silkbind / Bamboocut / Formless), set name, martial arts name, and score.
- Xinfa cards: Tier (T1–T5) seal chip, xinfa name, score.

### 🪶 Gear Compare Modal (Scroll UI)
- Try a candidate gear → instant Δ Score preview.
- MAX% rank colors (gold / purple / blue), **rainbow hue-rotate animation when reaching 100%**.
- PvP-only Attune slot (Attune 6) supported; new gear level capped at character level.

### 🧘 Xinfa Modal
- Unified UI with Gear Compare. Tier effect list (T0–T6) and per-element xinfa effects.

### 📊 Analysis Panel (Tabbed)
- **Affix Expected Value Ranking**: Δ Score for each tune/attune +N option.
- **Stat Efficiency Analysis**: ΔScore per +1 stat point.
- **Gear Optimization**: greedy global optimizer across all gear.
- **History**: past imports and Δ records.

### 💾 Presets
- Multi-slot save / load / delete.
- Each preset bundles import snapshot + state + virtual gear + baseline.

### 📡 OBS Share / Streaming URL
- Display-only URL (`?view=sidebar`) for OBS overlay (sidebar only).
- Color customization (background / opacity / text color, 6 options).

### 🌐 Localization (4 Languages)
- Japanese / English / Simplified Chinese / Korean — full UI + data coverage.

### 🎨 Light / Dark Theme
- Wuxia-ink dark theme (default).
- Washi-paper light theme — smoother S-tier animation + contrast optimization.

---

## Tier Threshold

The Tier is determined by your current Martial Index relative to the **maximum score achievable after applying all optimization suggestions** (locked at import, refreshed on re-import):

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
- Tune / Attune affixes (Tune 1–5, Attune 1–5)
- Martial arts talents (Crit Rate cap +Δ, per-element ATK / Pen / DMG bonus, etc.)
- Xinfa Tier effects (T2/T5 = visible stats, T0/T1/T3/T4/T6 = hidden additive)
- 2-Piece set bonus (additive)
- 4-Piece set bonus (+100 fixed, distributed evenly across gear)
- Base values (Body / Strength / Defense / Agility / Power) → derived stats

---

## Effects NOT Reflected

- 4-Piece conditional effects (HP / Qi / Parry / Heavy-Strike triggers, etc.) — substituted by a uniform +100.
- Guanyin (confirmed not to affect in-game stat screen → excluded).
- PvP-only Attune (Attune 6) — display only, no calculation contribution.

---

## Usage

1. **Open the tool** → https://wwm-metrics.pages.dev
2. Click **IMPORT** (top right) → pull data from the official data tool (extension).
3. Gear and xinfa cards populate automatically.
4. Click a gear card → **Gear Compare Modal** → change martial art / set / tune-attune → preview Δ Score.
5. Use the Analysis Panel to review ranking / efficiency / optimization.

---

## Tech Stack

- **HTML / CSS / JavaScript** (framework-free)
- Hosted on GitHub Pages
- LocalStorage for import data, baseline, and presets

---

## Keywords

`Where Winds Meet` `WWM` `Martial Index` `damage calculator` `expected value` `gear optimization` `tune` `attune` `xinfa` `inner way` `martial arts talents` `風燕伝` `武格指数` `燕云十六声` `풍연전`
