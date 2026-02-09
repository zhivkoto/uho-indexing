# Uho Design System

> A comprehensive design system for the Uho dashboard — an IDL-driven Solana event indexer UI.
> Version 1.0 · Last updated: 2025-07-15

---

## Table of Contents

1. [Design Principles](#1-design-principles)
2. [Color System](#2-color-system)
3. [Typography Scale](#3-typography-scale)
4. [Spacing & Layout](#4-spacing--layout)
5. [Component Catalog](#5-component-catalog)
6. [Page Layouts](#6-page-layouts)
7. [Animation & Motion](#7-animation--motion)
8. [Iconography](#8-iconography)
9. [Data Patterns](#9-data-patterns)

---

## 1. Design Principles

### 1.1 — Signal Over Noise
Every pixel earns its place. Data density is high, but clutter is zero. If an element doesn't help the user make a decision or understand state, it's gone. White space is a feature, not waste.

### 1.2 — Instant Legibility
A developer glancing at the dashboard at 2 AM should parse the state of the indexer in under 2 seconds. Status is communicated through color, position, and hierarchy — not through reading paragraphs. Monospace data. Sans-serif UI. No ambiguity.

### 1.3 — Crypto-Native Confidence
The interface should feel like a tool built by people who live on-chain. Addresses are truncated correctly. Slots are formatted. Transactions link to explorers. The user never has to wonder "is this a pubkey or a hash?" — the UI tells them.

### 1.4 — Progressive Disclosure
The dashboard shows the summary. The explorer shows the data. The detail view shows everything. Each layer reveals more without overwhelming the previous one. Complexity is available, never imposed.

### 1.5 — Built to Last, Not to Impress
No gratuitous gradients. No animations that slow comprehension. The aesthetic is restrained, dark, and technical — impressive because it's *precise*, not because it's flashy. Think cockpit, not nightclub.

---

## 2. Color System

### 2.1 Primary Accent: Electric Cyan

The primary accent is a high-saturation cyan that reads as "active," "live," and "on-chain." It carries connotations of data flowing, systems online, and real-time indexing.

### 2.2 Full Palette

#### Background Scale (Surfaces)

| Token | Hex | Tailwind | Usage |
|-------|-----|----------|-------|
| `bg-base` | `#09090B` | `bg-[#09090B]` | App background, page canvas |
| `bg-raised` | `#0F0F12` | `bg-[#0F0F12]` | Cards, panels, sidebar |
| `bg-elevated` | `#16161A` | `bg-[#16161A]` | Modals, dropdowns, popovers |
| `bg-overlay` | `#1C1C22` | `bg-[#1C1C22]` | Hover states on cards, table row hover |
| `bg-subtle` | `#23232B` | `bg-[#23232B]` | Input fills, code blocks, table alternating rows |
| `bg-muted` | `#2A2A35` | `bg-[#2A2A35]` | Disabled backgrounds, skeleton loaders |

#### Border Scale

| Token | Hex | Tailwind | Usage |
|-------|-----|----------|-------|
| `border-default` | `#1E1E26` | `border-[#1E1E26]` | Card borders, dividers |
| `border-subtle` | `#2A2A35` | `border-[#2A2A35]` | Input borders (resting) |
| `border-emphasis` | `#3A3A48` | `border-[#3A3A48]` | Active borders, focus rings (secondary) |

#### Text Scale

| Token | Hex | Tailwind | Usage |
|-------|-----|----------|-------|
| `text-primary` | `#EDEDEF` | `text-[#EDEDEF]` | Headings, primary content |
| `text-secondary` | `#A0A0AB` | `text-[#A0A0AB]` | Body text, descriptions |
| `text-tertiary` | `#63637A` | `text-[#63637A]` | Timestamps, labels, placeholders |
| `text-disabled` | `#3A3A48` | `text-[#3A3A48]` | Disabled text |

#### Accent — Cyan

| Token | Hex | Tailwind | Usage |
|-------|-----|----------|-------|
| `accent-50` | `#ECFEFF` | `text-[#ECFEFF]` | — |
| `accent-100` | `#CFFAFE` | `text-[#CFFAFE]` | — |
| `accent-200` | `#A5F3FC` | `text-[#A5F3FC]` | — |
| `accent-300` | `#67E8F9` | `text-[#67E8F9]` | Accent text on dark bg |
| `accent-400` | `#22D3EE` | `text-[#22D3EE]` | **Primary accent** — buttons, links, active states |
| `accent-500` | `#06B6D4` | `text-[#06B6D4]` | Hover state for accent elements |
| `accent-600` | `#0891B2` | `text-[#0891B2]` | Pressed state |
| `accent-700` | `#0E7490` | `text-[#0E7490]` | — |
| `accent-900/20` | `#164E63/33` | `bg-[#164E63]/20` | Accent background tint (badges, highlights) |

Primary accent for fills: `#22D3EE` (`accent-400`)
Primary accent for text on dark: `#67E8F9` (`accent-300`)
Accent glow (box-shadow): `0 0 20px rgba(34, 211, 238, 0.15)`

#### Semantic Colors

| Token | Hex | Tailwind | Usage |
|-------|-----|----------|-------|
| `success` | `#34D399` | `text-emerald-400` | Running, healthy, success |
| `success-bg` | `#065F46/20` | `bg-emerald-900/20` | Success badge background |
| `warning` | `#FBBF24` | `text-amber-400` | Syncing, degraded, warnings |
| `warning-bg` | `#78350F/20` | `bg-amber-900/20` | Warning badge background |
| `error` | `#F87171` | `text-red-400` | Error, stopped, failure |
| `error-bg` | `#7F1D1D/20` | `bg-red-900/20` | Error badge background |
| `info` | `#60A5FA` | `text-blue-400` | Informational states |
| `info-bg` | `#1E3A5F/20` | `bg-blue-900/20` | Info badge background |

### 2.3 Tailwind Config Extension

```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        uho: {
          base: '#09090B',
          raised: '#0F0F12',
          elevated: '#16161A',
          overlay: '#1C1C22',
          subtle: '#23232B',
          muted: '#2A2A35',
          border: '#1E1E26',
          'border-subtle': '#2A2A35',
          'border-emphasis': '#3A3A48',
          'text-primary': '#EDEDEF',
          'text-secondary': '#A0A0AB',
          'text-tertiary': '#63637A',
          'text-disabled': '#3A3A48',
          accent: {
            DEFAULT: '#22D3EE',
            light: '#67E8F9',
            dark: '#0891B2',
            muted: 'rgba(34, 211, 238, 0.15)',
            bg: 'rgba(22, 78, 99, 0.20)',
          },
        },
      },
      boxShadow: {
        'accent-glow': '0 0 20px rgba(34, 211, 238, 0.15)',
        'accent-glow-lg': '0 0 40px rgba(34, 211, 238, 0.10)',
        'card': '0 1px 3px rgba(0, 0, 0, 0.3)',
        'card-hover': '0 4px 12px rgba(0, 0, 0, 0.4)',
        'modal': '0 16px 48px rgba(0, 0, 0, 0.5)',
      },
      backgroundImage: {
        'glass-gradient': 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
      },
    },
  },
};
```

---

## 3. Typography Scale

### 3.1 Font Families

| Role | Font | Fallback | Tailwind |
|------|------|----------|----------|
| **UI / Sans** | Inter | system-ui, -apple-system, sans-serif | `font-sans` |
| **Data / Mono** | JetBrains Mono | ui-monospace, 'Cascadia Code', monospace | `font-mono` |

```css
/* @import in global CSS or <head> */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
```

```js
// tailwind.config.js
fontFamily: {
  sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
  mono: ['JetBrains Mono', 'ui-monospace', 'Cascadia Code', 'monospace'],
},
```

### 3.2 Type Scale

| Token | Size | Weight | Line Height | Letter Spacing | Tailwind |
|-------|------|--------|-------------|----------------|----------|
| `display` | 36px | 700 | 40px (1.11) | -0.02em | `text-4xl font-bold leading-10 tracking-tight` |
| `h1` | 28px | 700 | 34px (1.21) | -0.02em | `text-[28px] font-bold leading-[34px] tracking-tight` |
| `h2` | 22px | 600 | 28px (1.27) | -0.01em | `text-[22px] font-semibold leading-7` |
| `h3` | 18px | 600 | 24px (1.33) | 0 | `text-lg font-semibold leading-6` |
| `h4` | 15px | 600 | 20px (1.33) | 0 | `text-[15px] font-semibold leading-5` |
| `body` | 14px | 400 | 20px (1.43) | 0 | `text-sm leading-5` |
| `body-medium` | 14px | 500 | 20px (1.43) | 0 | `text-sm font-medium leading-5` |
| `caption` | 12px | 400 | 16px (1.33) | 0.01em | `text-xs leading-4 tracking-wide` |
| `caption-medium` | 12px | 500 | 16px (1.33) | 0.01em | `text-xs font-medium leading-4 tracking-wide` |
| `overline` | 11px | 600 | 14px (1.27) | 0.06em | `text-[11px] font-semibold leading-[14px] tracking-widest uppercase` |
| `mono-body` | 13px | 400 | 20px (1.54) | 0 | `font-mono text-[13px] leading-5` |
| `mono-sm` | 12px | 400 | 16px (1.33) | 0 | `font-mono text-xs leading-4` |
| `mono-lg` | 15px | 500 | 22px (1.47) | 0 | `font-mono text-[15px] font-medium leading-[22px]` |
| `stat` | 32px | 700 | 36px (1.12) | -0.02em | `font-mono text-[32px] font-bold leading-9 tracking-tight` |

### 3.3 Usage Rules

- **Headings and UI labels:** Always `font-sans` (Inter)
- **Data values** (addresses, hashes, slot numbers, amounts, counts, JSON): Always `font-mono` (JetBrains Mono)
- **Table headers:** `caption-medium` or `overline` in `text-tertiary`
- **Table data cells:** `mono-body` or `mono-sm`
- **Stat numbers on dashboard cards:** `stat` token
- **Never mix:** Don't use mono for button labels or sans for addresses

---

## 4. Spacing & Layout

### 4.1 Spacing Scale

Base unit: **4px**

| Token | Value | Tailwind | Common Usage |
|-------|-------|----------|--------------|
| `space-1` | 4px | `p-1` / `gap-1` | Tight inner padding (badge padding-y) |
| `space-2` | 8px | `p-2` / `gap-2` | Icon gaps, small padding |
| `space-3` | 12px | `p-3` / `gap-3` | Input padding-x, table cell padding |
| `space-4` | 16px | `p-4` / `gap-4` | Card padding, section gaps |
| `space-5` | 20px | `p-5` / `gap-5` | — |
| `space-6` | 24px | `p-6` / `gap-6` | Card padding (large), content gaps |
| `space-8` | 32px | `p-8` / `gap-8` | Section spacing |
| `space-10` | 40px | `p-10` / `gap-10` | — |
| `space-12` | 48px | `p-12` / `gap-12` | Page margins, large section gaps |
| `space-16` | 64px | `p-16` / `gap-16` | Hero spacing, major sections |

### 4.2 Layout Constants

| Element | Value | Tailwind |
|---------|-------|----------|
| **Sidebar width (expanded)** | 240px | `w-60` |
| **Sidebar width (collapsed)** | 64px | `w-16` |
| **Header height** | 56px | `h-14` |
| **Max content width** | 1440px | `max-w-[1440px]` |
| **Page padding (horizontal)** | 24px | `px-6` |
| **Page padding (vertical)** | 24px | `py-6` |
| **Card border radius** | 12px | `rounded-xl` |
| **Button border radius** | 9999px | `rounded-full` |
| **Input border radius** | 9999px | `rounded-full` |
| **Badge border radius** | 9999px | `rounded-full` |
| **Modal border radius** | 16px | `rounded-2xl` |
| **Table border radius** | 12px | `rounded-xl` (wrapper) |

### 4.3 Grid System

**Main layout:** Sidebar + Content area

```
┌──────┬──────────────────────────────────────┐
│      │  Header (56px)                       │
│  S   ├──────────────────────────────────────┤
│  I   │                                      │
│  D   │  Content Area                        │
│  E   │  max-w-[1440px] mx-auto px-6 py-6   │
│  B   │                                      │
│  A   │                                      │
│  R   │                                      │
│      │                                      │
└──────┴──────────────────────────────────────┘
```

**Content grid:** Use CSS Grid or Flexbox with consistent gap:

```html
<!-- Dashboard stat cards: 4-column grid -->
<div class="grid grid-cols-4 gap-4">

<!-- Event explorer: full-width table -->
<div class="w-full">

<!-- Two-column layout (e.g., detail + sidebar) -->
<div class="grid grid-cols-[1fr_360px] gap-6">
```

### 4.4 Responsive Breakpoints

| Breakpoint | Width | Tailwind | Behavior |
|------------|-------|----------|----------|
| `mobile` | < 640px | default | Sidebar hidden, stack everything, full-width cards |
| `sm` | ≥ 640px | `sm:` | — |
| `md` | ≥ 768px | `md:` | Sidebar collapsible (icon only), 2-col stat grid |
| `lg` | ≥ 1024px | `lg:` | Sidebar expanded, 3-col stat grid |
| `xl` | ≥ 1280px | `xl:` | Full layout, 4-col stat grid |
| `2xl` | ≥ 1536px | `2xl:` | Wider content area, more breathing room |

---

## 5. Component Catalog

### 5.1 Buttons

#### Variants

**Primary (Filled)**
```html
<button class="
  inline-flex items-center justify-center gap-2
  rounded-full px-5 py-2.5
  bg-[#22D3EE] text-[#09090B]
  text-sm font-semibold leading-5
  hover:bg-[#06B6D4] active:bg-[#0891B2]
  disabled:bg-[#2A2A35] disabled:text-[#3A3A48] disabled:cursor-not-allowed
  transition-colors duration-150
  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22D3EE] focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090B]
">
  Primary Action
</button>
```

**Secondary (Outline)**
```html
<button class="
  inline-flex items-center justify-center gap-2
  rounded-full px-5 py-2.5
  bg-transparent border border-[#2A2A35] text-[#EDEDEF]
  text-sm font-semibold leading-5
  hover:bg-[#1C1C22] hover:border-[#3A3A48] active:bg-[#23232B]
  disabled:border-[#1E1E26] disabled:text-[#3A3A48] disabled:cursor-not-allowed
  transition-colors duration-150
  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22D3EE] focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090B]
">
  Secondary Action
</button>
```

**Ghost (Text Only)**
```html
<button class="
  inline-flex items-center justify-center gap-2
  rounded-full px-4 py-2
  bg-transparent text-[#A0A0AB]
  text-sm font-medium leading-5
  hover:bg-[#1C1C22] hover:text-[#EDEDEF] active:bg-[#23232B]
  disabled:text-[#3A3A48] disabled:cursor-not-allowed
  transition-colors duration-150
">
  Ghost Action
</button>
```

**Danger**
```html
<button class="
  inline-flex items-center justify-center gap-2
  rounded-full px-5 py-2.5
  bg-red-500/10 border border-red-500/20 text-red-400
  text-sm font-semibold leading-5
  hover:bg-red-500/20 hover:border-red-500/30 active:bg-red-500/30
  disabled:bg-[#2A2A35] disabled:text-[#3A3A48] disabled:border-transparent disabled:cursor-not-allowed
  transition-colors duration-150
">
  Danger Action
</button>
```

**Icon Button (Square Pill)**
```html
<button class="
  inline-flex items-center justify-center
  rounded-full w-9 h-9
  bg-transparent text-[#A0A0AB]
  hover:bg-[#1C1C22] hover:text-[#EDEDEF] active:bg-[#23232B]
  transition-colors duration-150
">
  <!-- 18px icon -->
</button>
```

#### Size Variants

| Size | Padding | Text | Height | Tailwind |
|------|---------|------|--------|----------|
| `sm` | px-3.5 py-1.5 | text-xs | 30px | `px-3.5 py-1.5 text-xs` |
| `md` (default) | px-5 py-2.5 | text-sm | 38px | `px-5 py-2.5 text-sm` |
| `lg` | px-6 py-3 | text-sm | 42px | `px-6 py-3 text-sm` |

#### Usage Guidelines
- Primary: One per visible section. The main CTA.
- Secondary: Supporting actions — filters, exports, secondary navigation.
- Ghost: Tertiary actions, close buttons, toolbar items.
- Danger: Destructive actions only — always require confirmation.

---

### 5.2 Cards

#### Base Card
```html
<div class="
  rounded-xl
  bg-[#0F0F12] border border-[#1E1E26]
  p-6
  shadow-card
">
  <!-- content -->
</div>
```

#### Card with Glass Effect
```html
<div class="
  rounded-xl
  bg-[#0F0F12]/80 backdrop-blur-sm
  border border-[#1E1E26]
  bg-glass-gradient
  p-6
  shadow-card
">
  <!-- content -->
</div>
```

#### Stat Card (Dashboard)
```html
<div class="
  rounded-xl
  bg-[#0F0F12] border border-[#1E1E26]
  p-5
  hover:border-[#2A2A35] hover:shadow-card-hover
  transition-all duration-200
  group
">
  <div class="flex items-center justify-between mb-3">
    <span class="text-xs font-medium leading-4 tracking-wide uppercase text-[#63637A]">
      Events Indexed
    </span>
    <span class="w-8 h-8 rounded-lg bg-[#164E63]/20 flex items-center justify-center text-[#22D3EE]">
      <!-- icon 16px -->
    </span>
  </div>
  <div class="font-mono text-[32px] font-bold leading-9 tracking-tight text-[#EDEDEF]">
    1,247,892
  </div>
  <div class="mt-2 flex items-center gap-1.5 text-xs leading-4 text-emerald-400">
    <span>↑ 12.3%</span>
    <span class="text-[#63637A]">vs last hour</span>
  </div>
</div>
```

#### Interactive Card (Program Card)
```html
<div class="
  rounded-xl
  bg-[#0F0F12] border border-[#1E1E26]
  p-5
  hover:border-[#22D3EE]/30 hover:shadow-accent-glow
  transition-all duration-200
  cursor-pointer
">
  <!-- content -->
</div>
```

#### Card Variants

| Variant | Border | Background | Shadow | Use Case |
|---------|--------|------------|--------|----------|
| Default | `border-[#1E1E26]` | `bg-[#0F0F12]` | `shadow-card` | General containers |
| Glass | `border-[#1E1E26]` | `bg-[#0F0F12]/80 backdrop-blur-sm` | `shadow-card` | Overlapping content |
| Interactive | `border-[#1E1E26]` hover: `border-[#22D3EE]/30` | `bg-[#0F0F12]` | hover: `shadow-accent-glow` | Clickable cards |
| Inset | none | `bg-[#09090B]` | none | Nested content within cards |

---

### 5.3 Tables

#### Data Table

```html
<div class="rounded-xl border border-[#1E1E26] overflow-hidden">
  <table class="w-full">
    <thead>
      <tr class="border-b border-[#1E1E26] bg-[#0F0F12]">
        <th class="
          px-4 py-3 text-left
          text-[11px] font-semibold leading-[14px] tracking-widest uppercase
          text-[#63637A]
          cursor-pointer select-none
          hover:text-[#A0A0AB]
          transition-colors duration-150
        ">
          <div class="flex items-center gap-1.5">
            Event Type
            <!-- Sort icon (ChevronUpDown 14px) -->
          </div>
        </th>
        <!-- more headers -->
      </tr>
    </thead>
    <tbody>
      <!-- Even rows -->
      <tr class="
        border-b border-[#1E1E26]
        hover:bg-[#1C1C22]
        transition-colors duration-100
        cursor-pointer
      ">
        <td class="px-4 py-3 font-mono text-[13px] leading-5 text-[#EDEDEF]">
          SwapEvent
        </td>
        <!-- more cells -->
      </tr>
      <!-- Odd rows (alternating) -->
      <tr class="
        border-b border-[#1E1E26]
        bg-[#0B0B0E]
        hover:bg-[#1C1C22]
        transition-colors duration-100
        cursor-pointer
      ">
        <!-- cells -->
      </tr>
    </tbody>
  </table>
</div>
```

#### Table Cell Types

**Address Cell**
```html
<td class="px-4 py-3">
  <div class="flex items-center gap-2">
    <span class="font-mono text-[13px] leading-5 text-[#67E8F9]">
      7xKX...9fMp
    </span>
    <button class="
      opacity-0 group-hover:opacity-100
      text-[#63637A] hover:text-[#EDEDEF]
      transition-all duration-150
    " title="Copy address">
      <!-- ClipboardIcon 14px -->
    </button>
  </div>
</td>
```

**Timestamp Cell**
```html
<td class="px-4 py-3">
  <span class="text-sm leading-5 text-[#A0A0AB]" title="2024-01-15 14:32:07 UTC">
    2m ago
  </span>
</td>
```

**Number/Amount Cell**
```html
<td class="px-4 py-3 text-right font-mono text-[13px] leading-5 text-[#EDEDEF]">
  1,234.56
</td>
```

**Status Cell**
```html
<td class="px-4 py-3">
  <!-- Uses Badge component (see 5.5) -->
</td>
```

#### Compact Mode

For data-dense views, reduce cell padding:
```
px-3 py-2   (instead of px-4 py-3)
text-xs     (instead of text-[13px])
```

#### Sortable Header States

| State | Style |
|-------|-------|
| Default | `text-[#63637A]` — icon hidden or very dim |
| Hover | `text-[#A0A0AB]` — sort icon visible |
| Active (asc) | `text-[#22D3EE]` — ChevronUp icon |
| Active (desc) | `text-[#22D3EE]` — ChevronDown icon |

#### Pagination Bar
```html
<div class="
  flex items-center justify-between
  px-4 py-3
  border-t border-[#1E1E26]
  bg-[#0F0F12]
">
  <span class="text-xs leading-4 text-[#63637A]">
    Showing 1–50 of 12,847 events
  </span>
  <div class="flex items-center gap-1">
    <button class="rounded-full w-8 h-8 flex items-center justify-center text-[#63637A] hover:text-[#EDEDEF] hover:bg-[#1C1C22] disabled:text-[#3A3A48] transition-colors">
      <!-- ChevronLeft -->
    </button>
    <button class="rounded-full w-8 h-8 flex items-center justify-center text-sm font-medium bg-[#22D3EE]/10 text-[#22D3EE]">1</button>
    <button class="rounded-full w-8 h-8 flex items-center justify-center text-sm font-medium text-[#A0A0AB] hover:bg-[#1C1C22]">2</button>
    <button class="rounded-full w-8 h-8 flex items-center justify-center text-sm font-medium text-[#A0A0AB] hover:bg-[#1C1C22]">3</button>
    <span class="text-[#63637A] px-1">…</span>
    <button class="rounded-full w-8 h-8 flex items-center justify-center text-sm font-medium text-[#A0A0AB] hover:bg-[#1C1C22]">257</button>
    <button class="rounded-full w-8 h-8 flex items-center justify-center text-[#63637A] hover:text-[#EDEDEF] hover:bg-[#1C1C22] transition-colors">
      <!-- ChevronRight -->
    </button>
  </div>
</div>
```

---

### 5.4 Inputs

#### Text Input
```html
<div class="relative">
  <input
    type="text"
    placeholder="Search events..."
    class="
      w-full rounded-full
      bg-[#23232B] border border-[#2A2A35]
      px-4 py-2.5 pl-10
      text-sm leading-5 text-[#EDEDEF]
      placeholder:text-[#63637A]
      hover:border-[#3A3A48]
      focus:border-[#22D3EE] focus:ring-1 focus:ring-[#22D3EE]/50
      focus:outline-none
      transition-colors duration-150
    "
  />
  <div class="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#63637A]">
    <!-- SearchIcon 16px -->
  </div>
</div>
```

#### Select / Dropdown Trigger
```html
<button class="
  inline-flex items-center justify-between gap-2
  rounded-full
  bg-[#23232B] border border-[#2A2A35]
  px-4 py-2.5
  text-sm leading-5 text-[#EDEDEF]
  hover:border-[#3A3A48]
  focus:border-[#22D3EE] focus:ring-1 focus:ring-[#22D3EE]/50
  focus:outline-none
  transition-colors duration-150
  min-w-[180px]
">
  <span>All Programs</span>
  <!-- ChevronDown 16px text-[#63637A] -->
</button>
```

#### Date/Slot Range Input
```html
<div class="flex items-center gap-2">
  <input
    type="text"
    placeholder="From slot"
    class="
      w-32 rounded-full
      bg-[#23232B] border border-[#2A2A35]
      px-3.5 py-2
      font-mono text-xs leading-4 text-[#EDEDEF]
      placeholder:text-[#63637A]
      focus:border-[#22D3EE] focus:ring-1 focus:ring-[#22D3EE]/50
      focus:outline-none
      transition-colors duration-150
    "
  />
  <span class="text-[#63637A] text-xs">→</span>
  <input type="text" placeholder="To slot" class="/* same */" />
</div>
```

#### Input States

| State | Border | Background | Text |
|-------|--------|------------|------|
| Default | `border-[#2A2A35]` | `bg-[#23232B]` | `text-[#EDEDEF]` |
| Hover | `border-[#3A3A48]` | `bg-[#23232B]` | `text-[#EDEDEF]` |
| Focus | `border-[#22D3EE]` + ring | `bg-[#23232B]` | `text-[#EDEDEF]` |
| Error | `border-red-500/50` + ring red | `bg-[#23232B]` | `text-[#EDEDEF]` |
| Disabled | `border-[#1E1E26]` | `bg-[#16161A]` | `text-[#3A3A48]` |

---

### 5.5 Badges / Tags

#### Status Badges
```html
<!-- Running / Healthy -->
<span class="
  inline-flex items-center gap-1.5
  rounded-full px-2.5 py-0.5
  bg-emerald-900/20 border border-emerald-500/20
  text-xs font-medium leading-4 text-emerald-400
">
  <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
  Running
</span>

<!-- Syncing -->
<span class="
  inline-flex items-center gap-1.5
  rounded-full px-2.5 py-0.5
  bg-amber-900/20 border border-amber-500/20
  text-xs font-medium leading-4 text-amber-400
">
  <span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
  Syncing
</span>

<!-- Stopped -->
<span class="
  inline-flex items-center gap-1.5
  rounded-full px-2.5 py-0.5
  bg-[#2A2A35] border border-[#3A3A48]
  text-xs font-medium leading-4 text-[#A0A0AB]
">
  <span class="w-1.5 h-1.5 rounded-full bg-[#63637A]"></span>
  Stopped
</span>

<!-- Error -->
<span class="
  inline-flex items-center gap-1.5
  rounded-full px-2.5 py-0.5
  bg-red-900/20 border border-red-500/20
  text-xs font-medium leading-4 text-red-400
">
  <span class="w-1.5 h-1.5 rounded-full bg-red-400"></span>
  Error
</span>
```

#### Event Type Tag
```html
<span class="
  inline-flex items-center
  rounded-full px-2.5 py-0.5
  bg-[#164E63]/20 border border-[#22D3EE]/20
  font-mono text-xs leading-4 text-[#67E8F9]
">
  SwapEvent
</span>
```

#### Count Badge (Sidebar/Tab)
```html
<span class="
  inline-flex items-center justify-center
  rounded-full min-w-[20px] h-5 px-1.5
  bg-[#22D3EE]/15 text-[#22D3EE]
  font-mono text-[10px] font-semibold leading-none
">
  42
</span>
```

---

### 5.6 Sidebar / Navigation

#### Sidebar Container
```html
<aside class="
  fixed left-0 top-0 bottom-0
  w-60
  bg-[#0F0F12] border-r border-[#1E1E26]
  flex flex-col
  z-40
  transition-all duration-200
  /* Collapsed: w-16 */
">
  <!-- Logo Area -->
  <div class="h-14 flex items-center px-5 border-b border-[#1E1E26]">
    <span class="text-lg font-bold text-[#EDEDEF] tracking-tight">uho</span>
    <span class="text-lg font-bold text-[#22D3EE] tracking-tight ml-0.5">.</span>
  </div>

  <!-- Navigation -->
  <nav class="flex-1 py-3 px-3 space-y-0.5 overflow-y-auto">
    <!-- Nav items -->
  </nav>

  <!-- Footer: Collapse toggle, version -->
  <div class="px-3 py-3 border-t border-[#1E1E26]">
    <button class="w-full rounded-lg px-3 py-2 flex items-center gap-3 text-[#63637A] hover:text-[#A0A0AB] hover:bg-[#1C1C22] transition-colors text-xs">
      <!-- PanelLeftClose icon 16px -->
      <span>Collapse</span>
    </button>
  </div>
</aside>
```

#### Nav Item

```html
<!-- Active -->
<a class="
  flex items-center gap-3
  rounded-lg px-3 py-2
  bg-[#22D3EE]/10 text-[#22D3EE]
  text-sm font-medium leading-5
  transition-colors duration-150
">
  <!-- Icon 18px -->
  <span>Dashboard</span>
</a>

<!-- Default -->
<a class="
  flex items-center gap-3
  rounded-lg px-3 py-2
  text-[#A0A0AB]
  text-sm font-medium leading-5
  hover:bg-[#1C1C22] hover:text-[#EDEDEF]
  transition-colors duration-150
">
  <!-- Icon 18px -->
  <span>Event Explorer</span>
</a>

<!-- With count badge -->
<a class="
  flex items-center gap-3
  rounded-lg px-3 py-2
  text-[#A0A0AB]
  text-sm font-medium leading-5
  hover:bg-[#1C1C22] hover:text-[#EDEDEF]
  transition-colors duration-150
">
  <!-- Icon 18px -->
  <span class="flex-1">Logs</span>
  <span class="rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center bg-red-900/30 text-red-400 font-mono text-[10px] font-semibold">3</span>
</a>
```

#### Nav Item Icons (Map)

| Page | Icon (Lucide) |
|------|---------------|
| Dashboard | `LayoutDashboard` |
| Event Explorer | `Search` |
| Programs | `Blocks` or `Code2` |
| Logs/Activity | `ScrollText` |
| Settings | `Settings` |

#### Collapsed State

When collapsed (`w-16`):
- Hide text labels
- Center icons
- Show tooltips on hover (right-aligned)
- Logo area shows only the "uho." dot mark or a small icon

---

### 5.7 Charts

#### Area/Line Chart (Throughput)

**Container:**
```html
<div class="rounded-xl bg-[#0F0F12] border border-[#1E1E26] p-5">
  <div class="flex items-center justify-between mb-4">
    <div>
      <h3 class="text-[15px] font-semibold leading-5 text-[#EDEDEF]">Events / Minute</h3>
      <p class="text-xs leading-4 text-[#63637A] mt-0.5">Last 24 hours</p>
    </div>
    <div class="flex items-center gap-1">
      <!-- Time range pills: 1h, 6h, 24h, 7d -->
      <button class="rounded-full px-3 py-1 text-xs font-medium bg-[#22D3EE]/10 text-[#22D3EE]">24h</button>
      <button class="rounded-full px-3 py-1 text-xs font-medium text-[#63637A] hover:text-[#A0A0AB] hover:bg-[#1C1C22]">7d</button>
    </div>
  </div>
  <div class="h-[200px]">
    <!-- Chart rendered here (Recharts / Chart.js / Tremor) -->
  </div>
</div>
```

**Chart Color Tokens:**
- Primary line: `#22D3EE`
- Area fill: `linear-gradient(180deg, rgba(34,211,238,0.15) 0%, rgba(34,211,238,0) 100%)`
- Grid lines: `#1E1E26`
- Axis labels: `#63637A`, `font-mono text-[10px]`
- Tooltip background: `#16161A` with `border border-[#2A2A35]`
- Tooltip text: `#EDEDEF`
- Crosshair/cursor line: `#3A3A48` dashed

**Multi-line charts** (e.g., per-program throughput):
- Line 1: `#22D3EE` (cyan)
- Line 2: `#A78BFA` (violet-400)
- Line 3: `#34D399` (emerald-400)
- Line 4: `#FBBF24` (amber-400)
- Line 5: `#F87171` (red-400)

#### Bar Chart (Event Distribution)

Same container pattern. Bar color: `#22D3EE` at 80% opacity, hover at 100%.

**Chart Library Recommendation:** [Recharts](https://recharts.org) with custom theme, or [Tremor](https://tremor.so) for faster prototyping. Both support the dark theme tokens above.

---

### 5.8 Tooltips

```html
<!-- Tooltip container (positioned via JS) -->
<div class="
  absolute z-50
  rounded-lg
  bg-[#16161A] border border-[#2A2A35]
  px-3 py-2
  text-xs leading-4 text-[#EDEDEF]
  shadow-modal
  animate-in fade-in-0 zoom-in-95
  max-w-[240px]
" role="tooltip">
  Full address: 7xKXpmQfBBJua9a3PYKwU2Fj9fMpvLe1Z8jEwwMN9fMp
  <div class="absolute w-2 h-2 bg-[#16161A] border-l border-b border-[#2A2A35] rotate-45 -bottom-1 left-1/2 -translate-x-1/2"></div>
</div>
```

**Tooltip Rules:**
- Delay: 300ms before showing
- Max width: 240px
- Always dark fill, never translucent
- Used for: address expansion, timestamp full format, data explanation
- Arrow pointing toward trigger element

---

### 5.9 Modals

```html
<!-- Backdrop -->
<div class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
  <!-- Modal -->
  <div class="
    w-full max-w-lg
    rounded-2xl
    bg-[#16161A] border border-[#1E1E26]
    shadow-modal
    animate-in fade-in-0 zoom-in-95 duration-200
  ">
    <!-- Header -->
    <div class="flex items-center justify-between px-6 py-4 border-b border-[#1E1E26]">
      <h2 class="text-lg font-semibold leading-6 text-[#EDEDEF]">Event Detail</h2>
      <button class="
        rounded-full w-8 h-8 flex items-center justify-center
        text-[#63637A] hover:text-[#EDEDEF] hover:bg-[#1C1C22]
        transition-colors duration-150
      ">
        <!-- X icon 16px -->
      </button>
    </div>
    <!-- Body -->
    <div class="px-6 py-5">
      <!-- content -->
    </div>
    <!-- Footer (optional) -->
    <div class="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#1E1E26]">
      <button class="/* Ghost button */">Cancel</button>
      <button class="/* Primary button */">Confirm</button>
    </div>
  </div>
</div>
```

**Modal Sizes:**
| Size | Max Width | Use Case |
|------|-----------|----------|
| `sm` | `max-w-sm` (384px) | Confirmations, simple prompts |
| `md` | `max-w-lg` (512px) | Event detail, forms |
| `lg` | `max-w-2xl` (672px) | JSON viewer, complex detail |
| `xl` | `max-w-4xl` (896px) | Full event data with tabs |

---

### 5.10 Dropdowns

```html
<!-- Dropdown menu (positioned below trigger) -->
<div class="
  absolute z-50 mt-1
  min-w-[200px]
  rounded-xl
  bg-[#16161A] border border-[#1E1E26]
  shadow-modal
  py-1
  animate-in fade-in-0 slide-in-from-top-2 duration-150
">
  <!-- Item -->
  <button class="
    w-full flex items-center gap-3
    px-3 py-2
    text-sm leading-5 text-[#A0A0AB]
    hover:bg-[#1C1C22] hover:text-[#EDEDEF]
    transition-colors duration-100
  ">
    <!-- Icon 16px (optional) -->
    <span>All Events</span>
  </button>

  <!-- Active Item -->
  <button class="
    w-full flex items-center gap-3
    px-3 py-2
    text-sm leading-5 text-[#22D3EE]
    bg-[#22D3EE]/5
  ">
    <!-- Check icon 16px -->
    <span>SwapEvent</span>
  </button>

  <!-- Separator -->
  <div class="my-1 h-px bg-[#1E1E26]"></div>

  <!-- Danger Item -->
  <button class="
    w-full flex items-center gap-3
    px-3 py-2
    text-sm leading-5 text-red-400
    hover:bg-red-900/20
    transition-colors duration-100
  ">
    <span>Clear Filters</span>
  </button>
</div>
```

---

### 5.11 Toast Notifications

```html
<!-- Toast container: fixed bottom-right -->
<div class="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 max-w-[380px]">
  <!-- Success Toast -->
  <div class="
    flex items-start gap-3
    rounded-xl
    bg-[#16161A] border border-emerald-500/20
    px-4 py-3.5
    shadow-modal
    animate-in slide-in-from-bottom-4 fade-in-0 duration-300
  ">
    <div class="w-5 h-5 rounded-full bg-emerald-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
      <!-- CheckIcon 12px text-emerald-400 -->
    </div>
    <div class="flex-1 min-w-0">
      <p class="text-sm font-medium leading-5 text-[#EDEDEF]">Events synced</p>
      <p class="text-xs leading-4 text-[#63637A] mt-0.5">1,247 new events indexed from slot 245,892,100</p>
    </div>
    <button class="text-[#63637A] hover:text-[#EDEDEF] transition-colors flex-shrink-0">
      <!-- X icon 14px -->
    </button>
  </div>

  <!-- Error Toast -->
  <div class="
    flex items-start gap-3
    rounded-xl
    bg-[#16161A] border border-red-500/20
    px-4 py-3.5
    shadow-modal
  ">
    <div class="w-5 h-5 rounded-full bg-red-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
      <!-- AlertCircle 12px text-red-400 -->
    </div>
    <div class="flex-1 min-w-0">
      <p class="text-sm font-medium leading-5 text-[#EDEDEF]">RPC Error</p>
      <p class="text-xs leading-4 text-[#63637A] mt-0.5">Connection to Helius RPC timed out</p>
    </div>
    <button class="text-[#63637A] hover:text-[#EDEDEF] transition-colors flex-shrink-0">
      <!-- X icon 14px -->
    </button>
  </div>
</div>
```

**Toast behavior:**
- Auto-dismiss after 5s (success/info), 8s (warning), persistent (error — user must dismiss)
- Stack from bottom, max 3 visible
- Exit: `animate-out fade-out-0 slide-out-to-right-4 duration-200`

---

### 5.12 Data Display Components

#### Address Display
```html
<!-- Truncated with copy -->
<div class="inline-flex items-center gap-1.5 group">
  <span class="font-mono text-[13px] leading-5 text-[#67E8F9] cursor-pointer hover:underline" title="7xKXpmQfBBJua9a3PYKwU2Fj9fMpvLe1Z8jEwwMN9fMp">
    7xKX...9fMp
  </span>
  <button class="
    opacity-0 group-hover:opacity-100
    text-[#63637A] hover:text-[#22D3EE]
    transition-all duration-150
  ">
    <!-- ClipboardIcon 14px -->
  </button>
</div>
```

#### Transaction Signature Display
```html
<div class="inline-flex items-center gap-1.5 group">
  <a
    href="https://solscan.io/tx/5KtPn1..."
    target="_blank"
    rel="noopener noreferrer"
    class="font-mono text-[13px] leading-5 text-[#67E8F9] hover:underline"
  >
    5KtP...mQ7x
  </a>
  <span class="text-[#63637A]">
    <!-- ExternalLink 12px -->
  </span>
  <button class="opacity-0 group-hover:opacity-100 text-[#63637A] hover:text-[#22D3EE] transition-all duration-150">
    <!-- ClipboardIcon 14px -->
  </button>
</div>
```

#### Slot Number Display
```html
<span class="font-mono text-[13px] leading-5 text-[#EDEDEF]">
  #245,892,100
</span>
```

#### JSON Viewer
```html
<div class="
  rounded-xl
  bg-[#09090B] border border-[#1E1E26]
  overflow-hidden
">
  <!-- Header -->
  <div class="flex items-center justify-between px-4 py-2.5 border-b border-[#1E1E26] bg-[#0F0F12]">
    <span class="text-xs font-medium leading-4 text-[#63637A]">Event Data</span>
    <div class="flex items-center gap-1">
      <button class="rounded-full px-2.5 py-1 text-[10px] font-medium text-[#63637A] hover:text-[#EDEDEF] hover:bg-[#1C1C22] transition-colors">
        Raw
      </button>
      <button class="rounded-full px-2.5 py-1 text-[10px] font-medium bg-[#22D3EE]/10 text-[#22D3EE]">
        Formatted
      </button>
      <button class="rounded-full w-7 h-7 flex items-center justify-center text-[#63637A] hover:text-[#EDEDEF] hover:bg-[#1C1C22] transition-colors ml-1" title="Copy JSON">
        <!-- ClipboardIcon 14px -->
      </button>
    </div>
  </div>
  <!-- JSON body -->
  <pre class="p-4 overflow-x-auto">
    <code class="font-mono text-xs leading-5">
      <span class="text-[#63637A]">{</span>
      <span class="text-[#63637A]">  "amount":</span> <span class="text-[#67E8F9]">1234567890</span><span class="text-[#63637A]">,</span>
      <span class="text-[#63637A]">  "authority":</span> <span class="text-emerald-400">"7xKXpmQf...9fMp"</span><span class="text-[#63637A]">,</span>
      <span class="text-[#63637A]">  "is_buy":</span> <span class="text-amber-400">true</span>
      <span class="text-[#63637A]">}</span>
    </code>
  </pre>
</div>
```

**JSON Syntax Colors:**
| Type | Color | Tailwind |
|------|-------|----------|
| Keys | `#63637A` | `text-[#63637A]` |
| Strings | `#34D399` | `text-emerald-400` |
| Numbers | `#67E8F9` | `text-[#67E8F9]` |
| Booleans | `#FBBF24` | `text-amber-400` |
| Null | `#F87171` | `text-red-400` |
| Brackets/Braces | `#63637A` | `text-[#63637A]` |

---

### 5.13 Loading States

#### Skeleton Loader
```html
<!-- Skeleton line -->
<div class="h-4 w-3/4 rounded-md bg-[#2A2A35] animate-pulse"></div>

<!-- Skeleton stat card -->
<div class="rounded-xl bg-[#0F0F12] border border-[#1E1E26] p-5">
  <div class="h-3 w-20 rounded bg-[#2A2A35] animate-pulse mb-3"></div>
  <div class="h-8 w-32 rounded bg-[#2A2A35] animate-pulse mb-2"></div>
  <div class="h-3 w-24 rounded bg-[#2A2A35] animate-pulse"></div>
</div>

<!-- Skeleton table row -->
<tr class="border-b border-[#1E1E26]">
  <td class="px-4 py-3"><div class="h-4 w-24 rounded bg-[#2A2A35] animate-pulse"></div></td>
  <td class="px-4 py-3"><div class="h-4 w-20 rounded bg-[#2A2A35] animate-pulse"></div></td>
  <td class="px-4 py-3"><div class="h-4 w-32 rounded bg-[#2A2A35] animate-pulse"></div></td>
  <td class="px-4 py-3"><div class="h-4 w-16 rounded bg-[#2A2A35] animate-pulse"></div></td>
</tr>
```

#### Spinner
```html
<div class="w-5 h-5 border-2 border-[#2A2A35] border-t-[#22D3EE] rounded-full animate-spin"></div>
```

Spinner sizes: `w-4 h-4` (sm), `w-5 h-5` (md), `w-8 h-8` (lg)

#### Inline Loading (Button)
```html
<button class="/* Primary button classes */ opacity-80 cursor-wait" disabled>
  <div class="w-4 h-4 border-2 border-[#09090B]/30 border-t-[#09090B] rounded-full animate-spin"></div>
  <span>Indexing...</span>
</button>
```

#### Live Pulse Indicator (Header)
```html
<!-- Shown when indexer is actively polling -->
<div class="flex items-center gap-2">
  <span class="relative flex h-2.5 w-2.5">
    <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22D3EE] opacity-50"></span>
    <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#22D3EE]"></span>
  </span>
  <span class="text-xs font-medium text-[#22D3EE]">Live</span>
</div>
```

---

### 5.14 Empty States

```html
<div class="flex flex-col items-center justify-center py-16 px-6">
  <!-- Icon: 48px, muted -->
  <div class="w-12 h-12 rounded-2xl bg-[#1C1C22] flex items-center justify-center text-[#3A3A48] mb-4">
    <!-- InboxIcon 24px or relevant icon -->
  </div>
  <h3 class="text-sm font-semibold leading-5 text-[#EDEDEF] mb-1">No events found</h3>
  <p class="text-xs leading-4 text-[#63637A] text-center max-w-[280px] mb-5">
    No events match your current filters. Try adjusting the time range or event type.
  </p>
  <button class="/* Secondary button sm */">
    Clear Filters
  </button>
</div>
```

**Empty state variations:**
| View | Icon | Title | CTA |
|------|------|-------|-----|
| Event Explorer (no results) | `Search` | "No events found" | "Clear Filters" |
| Programs (none configured) | `Code2` | "No programs indexed" | "Add Program" |
| Logs (empty) | `ScrollText` | "No activity yet" | — |
| Error state | `AlertTriangle` | "Something went wrong" | "Retry" |

---

### 5.15 Header Bar

```html
<header class="
  h-14 
  bg-[#0F0F12]/80 backdrop-blur-md
  border-b border-[#1E1E26]
  flex items-center justify-between
  px-6
  sticky top-0 z-30
">
  <!-- Left: Page title + breadcrumb -->
  <div class="flex items-center gap-3">
    <h1 class="text-[15px] font-semibold leading-5 text-[#EDEDEF]">Dashboard</h1>
  </div>

  <!-- Right: Status + Actions -->
  <div class="flex items-center gap-4">
    <!-- Live indicator -->
    <div class="flex items-center gap-2">
      <span class="relative flex h-2 w-2">
        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50"></span>
        <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
      </span>
      <span class="text-xs font-medium text-emerald-400">Healthy</span>
    </div>

    <!-- Last synced -->
    <span class="text-xs text-[#63637A]">
      Slot <span class="font-mono text-[#A0A0AB]">#245,892,100</span>
    </span>

    <!-- Separator -->
    <div class="w-px h-5 bg-[#1E1E26]"></div>

    <!-- Search (icon button) -->
    <button class="rounded-full w-8 h-8 flex items-center justify-center text-[#63637A] hover:text-[#EDEDEF] hover:bg-[#1C1C22] transition-colors">
      <!-- SearchIcon 16px -->
    </button>

    <!-- Settings (icon button) -->
    <button class="rounded-full w-8 h-8 flex items-center justify-center text-[#63637A] hover:text-[#EDEDEF] hover:bg-[#1C1C22] transition-colors">
      <!-- SettingsIcon 16px -->
    </button>
  </div>
</header>
```

---

### 5.16 Tabs

```html
<div class="border-b border-[#1E1E26]">
  <nav class="flex gap-0 -mb-px">
    <!-- Active tab -->
    <button class="
      px-4 py-2.5
      text-sm font-medium leading-5
      text-[#22D3EE]
      border-b-2 border-[#22D3EE]
      transition-colors duration-150
    ">
      All Events
    </button>
    <!-- Inactive tab -->
    <button class="
      px-4 py-2.5
      text-sm font-medium leading-5
      text-[#63637A]
      border-b-2 border-transparent
      hover:text-[#A0A0AB] hover:border-[#2A2A35]
      transition-colors duration-150
    ">
      SwapEvent
    </button>
    <button class="
      px-4 py-2.5
      text-sm font-medium leading-5
      text-[#63637A]
      border-b-2 border-transparent
      hover:text-[#A0A0AB] hover:border-[#2A2A35]
      transition-colors duration-150
    ">
      TransferEvent
    </button>
  </nav>
</div>
```

#### Pill Tabs (Alternative — for chart time ranges, view toggles)
```html
<div class="inline-flex items-center gap-0.5 rounded-full bg-[#16161A] p-0.5">
  <button class="rounded-full px-3 py-1.5 text-xs font-medium bg-[#22D3EE]/10 text-[#22D3EE]">Table</button>
  <button class="rounded-full px-3 py-1.5 text-xs font-medium text-[#63637A] hover:text-[#A0A0AB]">JSON</button>
</div>
```

---

### 5.17 Filter Bar

```html
<div class="
  flex items-center gap-3 flex-wrap
  p-4
  rounded-xl
  bg-[#0F0F12] border border-[#1E1E26]
">
  <!-- Search input -->
  <div class="relative flex-1 min-w-[200px]">
    <input type="text" placeholder="Search events..." class="/* Text Input classes, full width */" />
  </div>

  <!-- Program selector -->
  <button class="/* Select trigger classes */">
    <span>All Programs</span>
  </button>

  <!-- Event type selector -->
  <button class="/* Select trigger classes */">
    <span>All Events</span>
  </button>

  <!-- Time range -->
  <div class="flex items-center gap-2">
    <!-- Date range inputs -->
  </div>

  <!-- Active filter chips -->
  <div class="flex items-center gap-2 w-full">
    <span class="
      inline-flex items-center gap-1.5
      rounded-full px-3 py-1
      bg-[#22D3EE]/10 border border-[#22D3EE]/20
      text-xs font-medium text-[#22D3EE]
    ">
      program: Jupiter
      <button class="hover:text-[#EDEDEF] transition-colors">
        <!-- X icon 12px -->
      </button>
    </span>
    <button class="text-xs text-[#63637A] hover:text-[#EDEDEF] transition-colors">
      Clear all
    </button>
  </div>
</div>
```

---

## 6. Page Layouts

### 6.1 Dashboard (Overview)

```
┌─────────────────────────────────────────────────────────────┐
│ Header: "Dashboard" | Live ● Healthy | Slot #245,892,100   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│  │ Programs │ │  Events  │ │Last Slot │ │  Errors  │      │
│  │ Indexed  │ │ Indexed  │ │ Indexed  │ │ (24h)    │      │
│  │    3     │ │1,247,892 │ │245.89M   │ │   12     │      │
│  │ ↑ 0%    │ │ ↑ 12.3% │ │ ↑ 0.1%  │ │ ↓ 40%   │      │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘      │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Events / Minute                          [1h 6h 24h] │  │
│  │ ▁▂▃▅▇█▇▅▆▇███▇▅▃▂▂▃▅▇█▇▅▆▇█████▇▅▃     200/min  │  │
│  │ Area chart with gradient fill                        │  │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────┐ ┌──────────────────────────┐  │
│  │ Latest Events           │ │ Event Distribution       │  │
│  │ ┌─────────────────────┐ │ │ ┌──────────────────────┐ │  │
│  │ │ SwapEvent  2s ago   │ │ │ │ ██████████ Swap 68%  │ │  │
│  │ │ 5KtP...mQ7x        │ │ │ │ ████      Xfer  22% │ │  │
│  │ │ SwapEvent  5s ago   │ │ │ │ ██        Liq   10% │ │  │
│  │ │ 9abc...def1        │ │ │ └──────────────────────┘ │  │
│  │ │ TransferEvent 8s   │ │ │                          │  │
│  │ │ 3xyz...uvw2        │ │ │ Programs                 │  │
│  │ │ ...                 │ │ │ ┌──────────────────────┐ │  │
│  │ └─────────────────────┘ │ │ │ Jupiter v0.6 ● Run  │ │  │
│  │ View all →              │ │ │ Raydium v0.3 ● Run  │ │  │
│  └─────────────────────────┘ │ │ Orca    v0.2 ● Sync │ │  │
│                               │ └──────────────────────┘ │  │
│                               └──────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**Layout implementation:**
```html
<div class="space-y-6">
  <!-- Stat cards: 4-col grid -->
  <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
    <!-- StatCard × 4 -->
  </div>

  <!-- Throughput chart: full width -->
  <div><!-- ChartCard --></div>

  <!-- Bottom row: 2-col -->
  <div class="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
    <!-- Latest Events feed (card with scrollable list) -->
    <!-- Right column: Event Distribution chart + Programs mini-list -->
  </div>
</div>
```

**Latest Events Feed Item:**
```html
<div class="flex items-center gap-3 py-2.5 px-4 hover:bg-[#1C1C22] transition-colors cursor-pointer border-b border-[#1E1E26] last:border-0">
  <span class="
    inline-flex items-center rounded-full px-2 py-0.5
    bg-[#164E63]/20 border border-[#22D3EE]/20
    font-mono text-[10px] text-[#67E8F9]
  ">
    SwapEvent
  </span>
  <span class="font-mono text-xs text-[#A0A0AB] flex-1 truncate">5KtP...mQ7x</span>
  <span class="text-[10px] text-[#63637A] whitespace-nowrap">2s ago</span>
</div>
```

---

### 6.2 Event Explorer

```
┌─────────────────────────────────────────────────────────────┐
│ Header: "Event Explorer"                                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Filter Bar                                            │  │
│  │ [🔍 Search...  ] [Program ▾] [Event ▾] [Time range]  │  │
│  │ Chips: program: Jupiter × | event: SwapEvent ×        │  │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Tabs: [ All Events | SwapEvent | TransferEvent | + ]  │  │
│  ├─────────────────────────────────────────────────────┤   │
│  │ SLOT        TX             EVENT     AMT     TIME    │  │
│  │ ──────────────────────────────────────────────────── │  │
│  │ #245.89M   5KtP...mQ7x   Swap    1,234   2s ago   │  │
│  │ #245.89M   9abc...def1   Swap      567   5s ago   │  │
│  │ #245.89M   3xyz...uvw2   Xfer   89,012   8s ago   │  │
│  │ ...                                                  │  │
│  ├─────────────────────────────────────────────────────┤   │
│  │ Showing 1-50 of 12,847     [< 1 2 3 ... 257 >]      │  │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Key behaviors:**
- Clicking a row expands inline detail OR navigates to Event Detail view
- Table columns are resizable
- Sort by any column (click header)
- Filters update URL query params (shareable links)
- Tabs are dynamically generated from available event types
- Event count shown next to each tab name

**Expandable Row Detail:**
```html
<!-- When a row is clicked, expand below it -->
<tr class="bg-[#0B0B0E]">
  <td colspan="6" class="px-4 py-4">
    <div class="grid grid-cols-[1fr_1fr] gap-6">
      <!-- Left: Key-value pairs -->
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-xs text-[#63637A]">Transaction</span>
          <span class="font-mono text-xs text-[#67E8F9]">5KtPn1...mQ7x ↗</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-xs text-[#63637A]">Slot</span>
          <span class="font-mono text-xs text-[#EDEDEF]">#245,892,100</span>
        </div>
        <!-- more fields -->
      </div>
      <!-- Right: JSON viewer (compact) -->
      <div><!-- JSON Viewer component --></div>
    </div>
  </td>
</tr>
```

---

### 6.3 Event Detail

```
┌─────────────────────────────────────────────────────────────┐
│ Header: "Event Detail" | ← Back to Explorer                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ SwapEvent                        ● Confirmed        │   │
│  │ Transaction: 5KtPn1LmfBBJua...mQ7x  [Copy] [↗Sol] │   │
│  │ Slot: #245,892,100 | Time: 2024-01-15 14:32:07 UTC │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────────────────┐ ┌────────────────────────┐   │
│  │ Event Fields             │ │ Raw JSON               │   │
│  │ ┌──────────────────────┐ │ │ ┌────────────────────┐ │   │
│  │ │ authority             │ │ │ │ {                  │ │   │
│  │ │ 7xKX...9fMp   [Copy] │ │ │ │   "amount": 123  │ │   │
│  │ ├──────────────────────┤ │ │ │   "authority":..  │ │   │
│  │ │ amount               │ │ │ │   "is_buy": true  │ │   │
│  │ │ 1,234,567,890        │ │ │ │ }                  │ │   │
│  │ ├──────────────────────┤ │ │ └────────────────────┘ │   │
│  │ │ is_buy               │ │ │ [Copy] [Raw/Formatted] │   │
│  │ │ true                 │ │ └────────────────────────┘   │
│  │ └──────────────────────┘ │                               │
│  └──────────────────────────┘                               │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Other events in this transaction (3)                  │  │
│  │ SwapEvent | TransferEvent | TransferEvent             │  │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Layout:** 
```html
<div class="space-y-6">
  <!-- Event header card -->
  <div class="/* Card */">
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-3">
        <span class="/* Event Type Tag (large) */">SwapEvent</span>
        <span class="/* Status Badge */">Confirmed</span>
      </div>
      <div class="flex items-center gap-2">
        <button class="/* Ghost button sm */">Copy Link</button>
        <a class="/* Ghost button sm */" href="..." target="_blank">View on Solscan ↗</a>
      </div>
    </div>
    <!-- Transaction + Slot + Time metadata -->
  </div>

  <!-- Two-column: Fields + JSON -->
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <div class="/* Card */"><!-- Decoded fields as key-value list --></div>
    <div><!-- JSON Viewer component --></div>
  </div>

  <!-- Related events -->
  <div class="/* Card */"><!-- List of other events from same tx --></div>
</div>
```

**Event Field Row:**
```html
<div class="flex items-start justify-between py-3 border-b border-[#1E1E26] last:border-0">
  <span class="text-xs font-medium text-[#63637A] min-w-[120px]">authority</span>
  <div class="flex items-center gap-1.5 text-right">
    <span class="font-mono text-[13px] text-[#67E8F9]">7xKX...9fMp</span>
    <button class="text-[#63637A] hover:text-[#22D3EE] transition-colors">
      <!-- CopyIcon 14px -->
    </button>
  </div>
</div>
```

---

### 6.4 Programs

```
┌─────────────────────────────────────────────────────────────┐
│ Header: "Programs"                                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌───────────────────────────────────────────────────┐     │
│  │ JupiterV6                                ● Running │     │
│  │ JUP6...sWUV                               [Copy]  │     │
│  │                                                    │     │
│  │ Events: 4 types | 892,341 total indexed            │     │
│  │ Last indexed: Slot #245,892,100 (2s ago)           │     │
│  │                                                    │     │
│  │ Event Types:                                       │     │
│  │ [SwapEvent 68%] [RouteEvent 22%]                   │     │
│  │ [FeeEvent 8%]   [ErrorEvent 2%]                    │     │
│  │                                                    │     │
│  │ IDL Version: 0.6.0 | Events: 4 | Instructions: 12 │     │
│  │ [View Events →] [View IDL]                         │     │
│  └───────────────────────────────────────────────────┘     │
│                                                             │
│  ┌───────────────────────────────────────────────────┐     │
│  │ Raydium CLMM                             ● Running │     │
│  │ ...                                                │     │
│  └───────────────────────────────────────────────────┘     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Program Card (expanded):**
```html
<div class="rounded-xl bg-[#0F0F12] border border-[#1E1E26] overflow-hidden">
  <!-- Header -->
  <div class="flex items-center justify-between px-6 py-4 border-b border-[#1E1E26]">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 rounded-xl bg-[#164E63]/20 flex items-center justify-center text-[#22D3EE]">
        <!-- Code2 icon 20px -->
      </div>
      <div>
        <h3 class="text-[15px] font-semibold leading-5 text-[#EDEDEF]">JupiterV6</h3>
        <div class="flex items-center gap-1.5 mt-0.5">
          <span class="font-mono text-xs text-[#67E8F9]">JUP6L...sWUV</span>
          <button class="text-[#63637A] hover:text-[#22D3EE]"><!-- CopyIcon 12px --></button>
        </div>
      </div>
    </div>
    <span class="/* Status Badge: Running */"></span>
  </div>

  <!-- Stats row -->
  <div class="grid grid-cols-3 divide-x divide-[#1E1E26] border-b border-[#1E1E26]">
    <div class="px-6 py-3">
      <div class="text-[11px] font-semibold tracking-widest uppercase text-[#63637A]">Events Indexed</div>
      <div class="font-mono text-lg font-bold text-[#EDEDEF] mt-0.5">892,341</div>
    </div>
    <div class="px-6 py-3">
      <div class="text-[11px] font-semibold tracking-widest uppercase text-[#63637A]">Event Types</div>
      <div class="font-mono text-lg font-bold text-[#EDEDEF] mt-0.5">4</div>
    </div>
    <div class="px-6 py-3">
      <div class="text-[11px] font-semibold tracking-widest uppercase text-[#63637A]">Last Slot</div>
      <div class="font-mono text-lg font-bold text-[#EDEDEF] mt-0.5">#245.89M</div>
    </div>
  </div>

  <!-- Event type chips -->
  <div class="px-6 py-4 flex flex-wrap gap-2">
    <span class="/* Event Type Tag */">SwapEvent</span>
    <span class="/* Event Type Tag */">RouteEvent</span>
    <span class="/* Event Type Tag */">FeeEvent</span>
    <span class="/* Event Type Tag */">ErrorEvent</span>
  </div>

  <!-- Footer actions -->
  <div class="flex items-center justify-end gap-3 px-6 py-3 bg-[#0B0B0E] border-t border-[#1E1E26]">
    <button class="/* Ghost button sm */">View IDL</button>
    <button class="/* Secondary button sm */">View Events →</button>
  </div>
</div>
```

---

### 6.5 Logs / Activity

```
┌─────────────────────────────────────────────────────────────┐
│ Header: "Activity Log"                                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Filter: [All ▾] [Info] [Warning] [Error]    [Auto-scroll] │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 14:32:07  INFO   Polled slots 245,892,090–100       │   │
│  │                  Found 12 transactions, 34 events    │   │
│  │ 14:32:02  INFO   Polled slots 245,892,080–090       │   │
│  │                  Found 8 transactions, 22 events     │   │
│  │ 14:31:58  WARN   RPC rate limit approaching (80%)   │   │
│  │ 14:31:52  ERROR  Failed to decode tx 5KtP...mQ7x    │   │
│  │                  InvalidAccountData: expected 128b   │   │
│  │ 14:31:47  INFO   Polled slots 245,892,070–080       │   │
│  │ ...                                                  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Log Entry:**
```html
<div class="flex items-start gap-3 px-4 py-2.5 hover:bg-[#1C1C22] transition-colors border-b border-[#1E1E26]/50">
  <!-- Timestamp -->
  <span class="font-mono text-xs leading-5 text-[#63637A] whitespace-nowrap tabular-nums">
    14:32:07
  </span>
  <!-- Level badge -->
  <span class="
    inline-flex items-center justify-center
    rounded px-1.5 py-0.5
    text-[10px] font-bold leading-none tracking-wide uppercase
    min-w-[44px]
    /* INFO: bg-blue-900/20 text-blue-400 */
    /* WARN: bg-amber-900/20 text-amber-400 */
    /* ERROR: bg-red-900/20 text-red-400 */
  ">
    INFO
  </span>
  <!-- Message -->
  <div class="flex-1 min-w-0">
    <p class="font-mono text-xs leading-5 text-[#EDEDEF]">
      Polled slots 245,892,090–245,892,100
    </p>
    <p class="font-mono text-xs leading-5 text-[#63637A]">
      Found 12 transactions, 34 events
    </p>
  </div>
</div>
```

**Level filter pills:**
```html
<div class="flex items-center gap-1">
  <button class="rounded-full px-3 py-1 text-xs font-medium bg-[#1C1C22] text-[#EDEDEF]">All</button>
  <button class="rounded-full px-3 py-1 text-xs font-medium text-blue-400 hover:bg-blue-900/10">Info</button>
  <button class="rounded-full px-3 py-1 text-xs font-medium text-amber-400 hover:bg-amber-900/10">Warn <span class="ml-1 text-[10px]">2</span></button>
  <button class="rounded-full px-3 py-1 text-xs font-medium text-red-400 hover:bg-red-900/10">Error <span class="ml-1 text-[10px]">1</span></button>
</div>
```

---

### 6.6 Settings

```
┌─────────────────────────────────────────────────────────────┐
│ Header: "Settings"                                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Connection                                            │  │
│  │ ┌──────────────────────────────────────────────────┐ │  │
│  │ │ RPC Endpoint                                     │ │  │
│  │ │ https://mainnet.helius-rpc.com  ● Connected      │ │  │
│  │ ├──────────────────────────────────────────────────┤ │  │
│  │ │ Database                                         │ │  │
│  │ │ postgres://localhost:5432/uho   ● Connected      │ │  │
│  │ ├──────────────────────────────────────────────────┤ │  │
│  │ │ API Server                                       │ │  │
│  │ │ http://localhost:3000           ● Running         │ │  │
│  │ └──────────────────────────────────────────────────┘ │  │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Indexer Configuration (read-only)                     │  │
│  │ ┌──────────────────────────────────────────────────┐ │  │
│  │ │ Polling interval   │  5 seconds                  │ │  │
│  │ │ Batch size         │  10 slots                   │ │  │
│  │ │ Max retries        │  3                          │ │  │
│  │ │ Commitment         │  confirmed                  │ │  │
│  │ └──────────────────────────────────────────────────┘ │  │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ About                                                 │  │
│  │ Uho v0.1.0 | Built with Rust + Axum + Postgres       │  │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Settings Section:**
```html
<div class="space-y-6">
  <!-- Section card -->
  <div class="rounded-xl bg-[#0F0F12] border border-[#1E1E26] overflow-hidden">
    <div class="px-6 py-4 border-b border-[#1E1E26]">
      <h2 class="text-[15px] font-semibold leading-5 text-[#EDEDEF]">Connection</h2>
      <p class="text-xs leading-4 text-[#63637A] mt-0.5">External service connections</p>
    </div>
    <div class="divide-y divide-[#1E1E26]">
      <!-- Setting row -->
      <div class="flex items-center justify-between px-6 py-4">
        <div>
          <div class="text-sm font-medium text-[#EDEDEF]">RPC Endpoint</div>
          <div class="font-mono text-xs text-[#A0A0AB] mt-0.5">https://mainnet.helius-rpc.com</div>
        </div>
        <span class="/* Status Badge: Connected (success) */"></span>
      </div>
      <!-- more rows -->
    </div>
  </div>
</div>
```

---

## 7. Animation & Motion

### 7.1 Transitions

| Property | Duration | Easing | Tailwind |
|----------|----------|--------|----------|
| Color (bg, text, border) | 150ms | ease | `transition-colors duration-150` |
| All (combined) | 200ms | ease | `transition-all duration-200` |
| Opacity | 150ms | ease | `transition-opacity duration-150` |
| Transform (scale, translate) | 200ms | ease-out | `transition-transform duration-200 ease-out` |

### 7.2 Hover Effects

| Element | Effect | Implementation |
|---------|--------|----------------|
| Buttons | Darken fill / lighten border | Color transition (defined per variant) |
| Cards (interactive) | Border glow + shadow | `hover:border-[#22D3EE]/30 hover:shadow-accent-glow transition-all duration-200` |
| Table rows | Background tint | `hover:bg-[#1C1C22] transition-colors duration-100` |
| Nav items | Background + text color | `hover:bg-[#1C1C22] hover:text-[#EDEDEF] transition-colors duration-150` |
| Links/addresses | Underline | `hover:underline` |
| Icon buttons | Background + text | `hover:bg-[#1C1C22] hover:text-[#EDEDEF] transition-colors` |

### 7.3 Enter/Exit Animations

**Dropdown/Popover Enter:**
```css
/* Tailwind: animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 duration-150 */
@keyframes dropdownIn {
  from { opacity: 0; transform: scale(0.95) translateY(-4px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
```

**Modal Enter:**
```css
/* Backdrop: animate-in fade-in-0 duration-200 */
/* Modal: animate-in fade-in-0 zoom-in-95 duration-200 */
```

**Toast Enter:**
```css
/* animate-in slide-in-from-bottom-4 fade-in-0 duration-300 */
@keyframes toastIn {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}
```

**Toast Exit:**
```css
/* animate-out slide-out-to-right-4 fade-out-0 duration-200 */
```

### 7.4 Loading Animations

| Animation | Duration | Tailwind |
|-----------|----------|----------|
| Pulse (skeletons) | 2s infinite | `animate-pulse` |
| Spin (spinners) | 750ms linear infinite | `animate-spin` |
| Ping (live dots) | 1s cubic-bezier(0,0,0.2,1) infinite | `animate-ping` |

### 7.5 Page Transitions

Keep it simple. No full-page transitions. Content area fades in:
```css
/* animate-in fade-in-0 duration-150 */
```

### 7.6 Motion Preferences

Always respect `prefers-reduced-motion`:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 8. Iconography

### 8.1 Icon Library

**Primary:** [Lucide Icons](https://lucide.dev) (open source, consistent, tree-shakeable)

Install: `npm install lucide-react`

### 8.2 Icon Sizes

| Context | Size | Tailwind |
|---------|------|----------|
| Nav sidebar | 18px | `w-[18px] h-[18px]` |
| Button icon (with text) | 16px | `w-4 h-4` |
| Icon button | 18px | `w-[18px] h-[18px]` |
| Stat card icon | 16px | `w-4 h-4` |
| Inline (text) | 14px | `w-3.5 h-3.5` |
| Empty state | 24px | `w-6 h-6` |
| Hero/illustration | 48px | `w-12 h-12` |

### 8.3 Icon Color Rules

- **Default:** `text-[#63637A]` (tertiary)
- **On hover:** `text-[#A0A0AB]` or `text-[#EDEDEF]`
- **Active/accent:** `text-[#22D3EE]`
- **Semantic:** Match semantic color (success/warning/error icons)
- **Inside filled buttons:** Match button text color

### 8.4 Icon Map

| Usage | Lucide Icon |
|-------|-------------|
| Dashboard | `LayoutDashboard` |
| Event Explorer / Search | `Search` |
| Programs / Code | `Code2` |
| Logs / Activity | `ScrollText` |
| Settings | `Settings` |
| External link | `ExternalLink` |
| Copy | `Copy` |
| Check (success) | `Check` |
| Error / Alert | `AlertCircle` |
| Warning | `AlertTriangle` |
| Info | `Info` |
| Chevron (sort, dropdown) | `ChevronUp` / `ChevronDown` / `ChevronUpDown` |
| Arrow (navigation) | `ArrowLeft` / `ArrowRight` |
| Close | `X` |
| Filter | `Filter` |
| Clock / Time | `Clock` |
| Hash / Transaction | `Hash` |
| Blocks / Slot | `Blocks` |
| Refresh | `RefreshCw` |
| Expand | `Maximize2` |
| Collapse sidebar | `PanelLeftClose` |
| Expand sidebar | `PanelLeftOpen` |
| JSON | `Braces` |
| Download / Export | `Download` |
| Live | `Radio` |

---

## 9. Data Patterns

### 9.1 Address Display

**Truncation Rule:** First 4 characters + "..." + last 4 characters.

| Full Address | Display |
|-------------|---------|
| `7xKXpmQfBBJua9a3PYKwU2Fj9fMpvLe1Z8jEwwMN9fMp` | `7xKX...9fMp` |
| `JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4` | `JUP6...TaV4` |

**Implementation:**
```typescript
function truncateAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}
```

**Display rules:**
- Always monospace (`font-mono`)
- Always cyan/accent color (`text-[#67E8F9]`)
- Always show copy button on hover
- Always show full address in tooltip
- Link to Solscan/Solana Explorer where applicable

### 9.2 Transaction Signatures

Same truncation as addresses (4...4). Additionally:
- Always link to `https://solscan.io/tx/{signature}` (or configurable explorer)
- Show external link icon inline
- Copy button on hover

### 9.3 Slot Numbers

**Format:** Prefixed with `#`, comma-separated thousands.

| Raw | Display |
|-----|---------|
| `245892100` | `#245,892,100` |

**Abbreviated (stat cards):**
| Raw | Display |
|-----|---------|
| `245892100` | `#245.89M` |
| `1234567` | `#1.23M` |
| `123456` | `#123,456` |

**Implementation:**
```typescript
function formatSlot(slot: number, abbreviated = false): string {
  if (abbreviated && slot >= 1_000_000) {
    return `#${(slot / 1_000_000).toFixed(2)}M`;
  }
  return `#${slot.toLocaleString()}`;
}
```

### 9.4 Timestamps

**Primary format:** Relative time (e.g., "2s ago", "5m ago", "2h ago")
**Tooltip format:** Full ISO 8601 in UTC: `2024-01-15 14:32:07 UTC`
**Table detail:** Both relative and absolute available via toggle

| Relative | Full |
|----------|------|
| `2s ago` | `2024-01-15 14:32:07 UTC` |
| `5m ago` | `2024-01-15 14:27:12 UTC` |
| `2h ago` | `2024-01-15 12:32:07 UTC` |
| `3d ago` | `2024-01-12 14:32:07 UTC` |
| `> 30d` | Show full date: `Jan 15, 2024` |

### 9.5 Numbers & Amounts

**Integer counts (events, totals):**
- Comma-separated: `1,247,892`
- Abbreviated for stats: `1.25M`, `12.3K`

**Token amounts:**
- Raw amounts should be converted from lamports/decimals where IDL info is available
- Otherwise display raw with note: `1,234,567,890 (raw)`
- Always monospace, right-aligned in tables

**Percentages:**
- One decimal place: `12.3%`
- Color-coded in delta displays:
  - Positive: `text-emerald-400` with `↑` prefix
  - Negative: `text-red-400` with `↓` prefix
  - Zero: `text-[#63637A]` with `—`

### 9.6 JSON Display

**Formatted mode (default):**
- 2-space indentation
- Syntax highlighting (see §5.12 JSON Viewer colors)
- Collapsible nested objects (click to expand/collapse)
- Max initial depth: 2 levels expanded

**Raw mode:**
- Minified single-line JSON
- Selectable text for easy copy
- Same monospace font, no color highlighting

**Large JSON (> 50 keys or nested):**
- Virtual scrolling or windowed rendering
- Search within JSON (`Cmd+F` inside viewer)
- Path breadcrumb: `root > data > swapInfo > amount`

### 9.7 Boolean Display

In tables, display booleans as color-coded text or icon:
```html
<!-- true -->
<span class="text-emerald-400 font-mono text-xs">true</span>
<!-- false -->
<span class="text-[#63637A] font-mono text-xs">false</span>
```

Or with icons:
```html
<!-- true -->
<span class="w-4 h-4 text-emerald-400"><!-- Check icon --></span>
<!-- false -->
<span class="w-4 h-4 text-[#3A3A48]"><!-- X icon --></span>
```

### 9.8 Empty / Null Values

Display null or undefined values as:
```html
<span class="text-[#3A3A48] italic text-xs">null</span>
```

Never leave cells visually empty — always show an explicit null indicator or a dash (`—`).

### 9.9 Error Messages

```html
<div class="
  flex items-start gap-3
  rounded-xl
  bg-red-900/10 border border-red-500/20
  px-4 py-3
">
  <span class="text-red-400 mt-0.5"><!-- AlertCircle 16px --></span>
  <div>
    <p class="text-sm font-medium text-red-400">RPC Connection Failed</p>
    <p class="text-xs text-red-400/70 mt-0.5 font-mono">Error: ECONNREFUSED 127.0.0.1:8899</p>
  </div>
</div>
```

---

## Appendix A: Component Quick Reference

| Component | Border Radius | Accent |
|-----------|--------------|--------|
| Button | `rounded-full` | Cyan fill / Cyan border |
| Card | `rounded-xl` (12px) | Cyan glow on hover (interactive) |
| Input | `rounded-full` | Cyan border on focus |
| Badge | `rounded-full` | Semantic color |
| Modal | `rounded-2xl` (16px) | — |
| Dropdown | `rounded-xl` (12px) | Cyan text for active item |
| Table wrapper | `rounded-xl` (12px) | — |
| Tooltip | `rounded-lg` (8px) | — |
| Toast | `rounded-xl` (12px) | Semantic border color |
| Tab (pill) | `rounded-full` | Cyan bg-tint + text |
| Log level badge | `rounded` (4px) | Semantic color |
| Nav item | `rounded-lg` (8px) | Cyan bg-tint + text |
| Sidebar | none (full height) | — |

## Appendix B: Recommended Libraries

| Category | Library | Why |
|----------|---------|-----|
| **Framework** | React + Next.js | SSR for fast initial load, RSC for data fetching |
| **Styling** | Tailwind CSS v4 | Utility-first, matches this spec |
| **Charts** | Recharts or Tremor | Composable, dark-theme friendly |
| **Icons** | Lucide React | Consistent, tree-shakeable, great defaults |
| **Tables** | TanStack Table v8 | Headless, sorting/filtering/pagination built-in |
| **JSON Viewer** | react-json-view-lite or custom | Lightweight, themeable |
| **Toasts** | Sonner | Beautiful defaults, dark mode, exactly our style |
| **Animations** | Tailwind + CSS | No heavy lib needed; Framer Motion for complex cases |
| **Date formatting** | date-fns | Lightweight relative time |
| **State** | TanStack Query | Server state management, auto-refetch for live data |

## Appendix C: CSS Custom Properties

For maximum flexibility, export the design tokens as CSS custom properties:

```css
:root {
  /* Backgrounds */
  --uho-bg-base: #09090B;
  --uho-bg-raised: #0F0F12;
  --uho-bg-elevated: #16161A;
  --uho-bg-overlay: #1C1C22;
  --uho-bg-subtle: #23232B;
  --uho-bg-muted: #2A2A35;

  /* Borders */
  --uho-border: #1E1E26;
  --uho-border-subtle: #2A2A35;
  --uho-border-emphasis: #3A3A48;

  /* Text */
  --uho-text-primary: #EDEDEF;
  --uho-text-secondary: #A0A0AB;
  --uho-text-tertiary: #63637A;
  --uho-text-disabled: #3A3A48;

  /* Accent */
  --uho-accent: #22D3EE;
  --uho-accent-light: #67E8F9;
  --uho-accent-dark: #0891B2;
  --uho-accent-muted: rgba(34, 211, 238, 0.15);
  --uho-accent-bg: rgba(22, 78, 99, 0.20);

  /* Semantic */
  --uho-success: #34D399;
  --uho-warning: #FBBF24;
  --uho-error: #F87171;
  --uho-info: #60A5FA;

  /* Layout */
  --uho-sidebar-width: 240px;
  --uho-sidebar-collapsed: 64px;
  --uho-header-height: 56px;
  --uho-max-content: 1440px;
  --uho-radius-card: 12px;
  --uho-radius-button: 9999px;
  --uho-radius-modal: 16px;
}
```

---

*This design system is the single source of truth for the Uho dashboard UI. When in doubt, reference this document. When the document is insufficient, extend it — don't improvise.*

*The vibe: precision, restraint, confidence.* 🗿
