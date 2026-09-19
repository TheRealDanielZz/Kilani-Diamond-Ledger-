# Design Implementation Plan: Kilani Diamond Reporter UI Unification

## Target & Scope
* **Target:** Core Design System & UI Kit ([`components/UI.tsx`](file:///Users/mo/Documents/Anti%20Graviti%20Projects/Kilani%20Diamond%20Reporter%20v7.0/components/UI.tsx)), Theme Tokens ([`index.css`](file:///Users/mo/Documents/Anti%20Graviti%20Projects/Kilani%20Diamond%20Reporter%20v7.0/index.css)), and Primary Operational Views ([`pages/ManagerDashboard.tsx`](file:///Users/mo/Documents/Anti%20Graviti%20Projects/Kilani%20Diamond%20Reporter%20v7.0/pages/ManagerDashboard.tsx)).
* **Scope:** Systematic UI overhaul and unification across the Kilani Diamond Reporter application.

---

## Chosen Direction: Variant E — Unified Atelier Glass
A harmonious synthesis of **Apple Pro spatial depth** and **authentic luxury jewellery atelier materials**:
1. **Elimination of AI/SaaS tells:** Removal of synthetic SVG turbulence noise overlays, multi-coloured neon gradient top borders, and redundant uppercase tracked-out monospace labels.
2. **Atelier-Grounded Palette:** Deep velvet bench blacks, frosted dark glass surfaces, brushed 18k champagne gold primary accents, and crisp diamond-luster typography.
3. **High-Stakes Ledger Clarity:** Uncompromising contrast for diamond carats (`ct`), piece counts (`pcs`), and millimeter stone sizes (`mm`) with tabular-numeric alignment.
4. **Tactile Ergonomics:** Apple-grade minimum 44px touch targets, rounded-2xl geometries, and subtle frosted border hairlines (`border-white/10`).

---

## Design Tokens & Specifications

### 1. Color Palette
| Token | Dark Mode Value | Light Mode Value | Usage |
| :--- | :--- | :--- | :--- |
| `--color-surface-base` | `#0A0B0F` | `#F4F4F7` | Deep velvet canvas background |
| `--color-surface-raised` | `rgba(255, 255, 255, 0.03)` | `#FFFFFF` | Vitreous glass cards, modals |
| `--color-surface-input` | `rgba(255, 255, 255, 0.04)` | `#F0F0F4` | Form inputs, segmented controls |
| `--color-border` | `rgba(255, 255, 255, 0.08)` | `rgba(0, 0, 0, 0.08)` | Hairline dividers and card outlines |
| `--color-accent` | `#C5A059` | `#A67D28` | Brushed 18K Champagne Gold primary action |
| `--color-accent-hover` | `#D6B26D` | `#8F6A1E` | Hover state for gold accents |
| `--color-on-surface` | `#F4F4F8` | `#0A0A0E` | High-contrast body & headline text |
| `--color-on-surface-muted`| `#71717A` | `#71717A` | Metadata and secondary labels |
| `--color-status-issue` | `#60A5FA` | `#2563EB` | Blue jewel tone for diamond requests |
| `--color-status-return` | `#F59E0B` | `#D97706` | Amber jewel tone for physical bag returns |
| `--color-status-verified`| `#10B981` | `#059669` | Emerald jewel tone for confirmed weights |
| `--color-status-alert` | `#F43F5E` | `#E11D48` | Ruby jewel tone for breakage/discrepancies |

### 2. Typography
* **Primary Sans:** `Inter` (weights: 400 Regular, 500 Medium, 600 SemiBold, 700 Bold) with `-0.015em` letter spacing on headings.
* **Numeric Ledger:** `Inter` with `tabular-nums font-semibold` or `JetBrains Mono` strictly reserved for serialized codes (e.g. `KIL-9241`, Bag `#1084`).
* **Rule:** Eliminate all `uppercase tracking-[0.2em] font-mono` label decoration above headings. Use natural sentence case.

### 3. Spacing, Geometry & Shadows
* **Card Radius:** `rounded-2xl` (16px) for standard panels, `rounded-xl` (12px) for nested line items.
* **Button Radius:** `rounded-xl` to `rounded-2xl` with a mandatory `min-h-[44px]` touch target floor.
* **Elevation & Glass:** `backdrop-blur-xl bg-white/[0.03] border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.36)]`. Zero noisy SVG turbulence filters.

---

## Component Breakdown

### 1. [`components/UI.tsx`](file:///Users/mo/Documents/Anti%20Graviti%20Projects/Kilani%20Diamond%20Reporter%20v7.0/components/UI.tsx)
* **`<Card />`**: Remove synthetic SVG turbulence noise filter (`mix-blend-overlay feTurbulence`). Standardize on clean frosted glass surface with crisp hairline border.
* **`<Button />`**: Refactor `primary` variant to use `#C5A059` champagne gold with dark text and subtle elevation. Refactor `secondary` variant to use frosted glass with hairline border.
* **`<ControlTile />`**: Replace uppercase mono titles with sentence case medium sans labels; prioritize large tabular numeric readout.
* **`<Badge />`**: Replace neon pills with jewel-toned frosted chips with subtle borders.

### 2. [`index.css`](file:///Users/mo/Documents/Anti%20Graviti%20Projects/Kilani%20Diamond%20Reporter%20v7.0/index.css)
* Update tokens: `--color-accent` &rarr; `#C5A059`, `--color-surface-base` &rarr; `#0A0B0F`.
* Clean up noisy liquid-glass styles; remove pseudo-element noise textures.

### 3. [`pages/ManagerDashboard.tsx`](file:///Users/mo/Documents/Anti%20Graviti%20Projects/Kilani%20Diamond%20Reporter%20v7.0/pages/ManagerDashboard.tsx)
* Replace glowing multi-color gradient lines (`h-[3px] bg-gradient-to-r...`) on Requests & Returns cards with elegant jewel-toned icon badges.
* Clean up header typography: Replace `WELCOME, MO` all-caps mono with natural greeting (`Good afternoon, Mo`).
* Upgrade project cards and request/return list items with high-contrast tabular stone counts and clear action buttons.

---

## Step-by-Step Implementation Tasks
- [ ] **Step 1: Token & CSS Layer**: Update palette and glass tokens in `index.css`.
- [ ] **Step 2: Core UI Primitives**: Refactor `components/UI.tsx` (`Card`, `Button`, `ControlTile`, `Badge`, `SegmentedControl`).
- [ ] **Step 3: Manager Dashboard**: Apply unified Atelier Glass hierarchy to `pages/ManagerDashboard.tsx`.
- [ ] **Step 4: Quality & Contrast Verification**: Run production build and verify light/dark mode contrast and responsiveness.
