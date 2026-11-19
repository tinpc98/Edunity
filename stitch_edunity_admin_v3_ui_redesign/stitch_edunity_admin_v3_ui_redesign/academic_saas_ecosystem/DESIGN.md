---
name: Academic SaaS Ecosystem
colors:
  surface: '#fbf8ff'
  surface-dim: '#d3d8fe'
  surface-bright: '#fbf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f2ff'
  surface-container: '#ececff'
  surface-container-high: '#e5e7ff'
  surface-container-highest: '#dde1ff'
  on-surface: '#131a36'
  on-surface-variant: '#484556'
  inverse-surface: '#292f4c'
  inverse-on-surface: '#f0efff'
  outline: '#797587'
  outline-variant: '#c9c4d8'
  surface-tint: '#5e38eb'
  primary: '#4f21dd'
  on-primary: '#ffffff'
  primary-container: '#6845f5'
  on-primary-container: '#ebe4ff'
  inverse-primary: '#c9beff'
  secondary: '#5e44c7'
  on-secondary: '#ffffff'
  secondary-container: '#775fe2'
  on-secondary-container: '#fffbff'
  tertiary: '#005a53'
  on-tertiary: '#ffffff'
  tertiary-container: '#00756c'
  on-tertiary-container: '#6dfeee'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e6deff'
  primary-fixed-dim: '#c9beff'
  on-primary-fixed: '#1b0063'
  on-primary-fixed-variant: '#4609d4'
  secondary-fixed: '#e6deff'
  secondary-fixed-dim: '#cabeff'
  on-secondary-fixed: '#1c0062'
  on-secondary-fixed-variant: '#492ab1'
  tertiary-fixed: '#67f9e8'
  tertiary-fixed-dim: '#42dccc'
  on-tertiary-fixed: '#00201d'
  on-tertiary-fixed-variant: '#005049'
  background: '#fbf8ff'
  on-background: '#131a36'
  surface-variant: '#dde1ff'
typography:
  display-lg:
    fontFamily: Be Vietnam Pro
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Be Vietnam Pro
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.01em
  headline-xl:
    fontFamily: Be Vietnam Pro
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Be Vietnam Pro
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 30px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Be Vietnam Pro
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.005em
  title-md:
    fontFamily: Be Vietnam Pro
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: 0em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Be Vietnam Pro
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 18px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Be Vietnam Pro
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  data-mono:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  margin: 2rem
  gutter-mobile: 0.75rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system delivers a clean, high-precision administrative environment engineered for scholarship disbursement, student registry management, and institutional governance. Designed primarily for Vietnamese educational institutions, ministries, and scholarship foundations, the interface conveys reliability, operational efficiency, and institutional prestige without looking antiquated or bureaucratic.

### Emotional Response & Visual Mood
- **Composed & Authoritative:** Instills confidence during high-stakes financial operations, scholarship auditing, and mass student data handling.
- **Approachable & Human:** Balances administrative rigor with warmth, avoiding the cold sterility typical of legacy enterprise software.
- **Culturally Fluent:** Engineered specifically to accommodate Vietnamese diacritics and typography rhythm without line-clipping or irregular vertical baselines.

### Design Movement: Modern Functionalist Enterprise
The aesthetic blends **Modern Enterprise SaaS** with **Soft Tactility**:
- Pure white elevated data cards suspended over a cool, tinted canvas.
- Ultra-subtle border delineations paired with ambient soft drop shadows.
- High-density information architecture designed for audit trails, ledger calculations, and tabular workflows.
- Consistent 12px to 16px corner geometry to soften heavy data surfaces while maintaining a structured, professional posture.

## Colors

The system operates natively in **light mode**, prioritizing optimal legibility across prolonged administrative work shifts, ledger reviews, and document verification.

### Palette Architecture
- **Primary Canvas (`#F7F7FC`):** A soft, lavender-tinted neutral surface that eliminates pure-white eye strain while grounding elevated components.
- **Surface Elevation (`#FFFFFF`):** Applied exclusively to cards, sheets, popovers, and table containers.
- **Brand Primary (`#6845F5`):** High-energy electric lavender. Serves as the primary operational hue for dominant actions, primary tabs, and focal data indicators.
- **Brand Secondary (`#8B73F7`):** Lilac accent utilized for hover states, auxiliary highlights, and multi-tier chart sequences.
- **Tertiary Accent (`#21C9BA`):** Clean mint/teal introduced for successful fiscal transactions, verified scholarship disbursements, and affirmative status indicators.
- **Neutral Typographic Base (`#1D2340`):** Deep indigo-tinted slate delivering sharp contrast against surfaces while harmonizing with the lavender primary hue.

### Alternate Theme Mapping (Variables Configuration)
- **Variant B (Mint / Teal System):** Primary: `#089E99`, Secondary: `#21C9BA`, Canvas: `#F5FAF9`, Neutral: `#19383D`.
- **Variant C (Navy / Coral System):** Primary: `#32357A`, Secondary: `#F07B68`, Sidebar: `#202744`, Canvas: `#F8F7FA`, Neutral: `#202643`.

### Semantic Status Tokens
- **Success (Approved / Disbursed):** Text `#027A48`, Background `#ECFDF3`, Border `#A6F4C5`.
- **Warning (Pending Review / Incomplete):** Text `#B54708`, Background `#FFFAEB`, Border `#FEDF89`.
- **Destructive / Error (Rejected / Revoked):** Text `#B42318`, Background `#FEF3F2`, Border `#FECDCA`.
- **Information / Processing (Under Evaluation):** Text `#3538CD`, Background `#EEF4FF`, Border `#C7D7FE`.

## Typography

Typography is calibrated to support Vietnamese diacritics natively while retaining strict vertical layout rhythms for dense administrative screens.

### Font Hierarchy Roles
- **Headlines & Structural Labels (`Be Vietnam Pro`):** Purpose-built for Vietnamese display rendering. Provides open apertures, distinct tone mark positioning, and modern structural presence across dashboard headers, section banners, metric callouts, and navigational items.
- **Body & Numerical Grids (`Inter`):** Assigned to continuous prose, forms, lists, tabular data sets, and financial ledgers. Provides tabular numeric alignments (`tnum`) for monetary figures and institutional codes.

### Diacritic & Baseline Integrity
- Vertical line-heights are normalized with a minimum margin factor of 1.45x for all Vietnamese text blocks to prevent accent glyph collisions (such as `ở`, `ữ`, `ề`, `ặ`).
- All numeric ledger fields, currency calculations (VND / USD), and registration IDs must enforce `font-feature-settings: "tnum" 1, "cv05" 1`.

## Layout & Spacing

The administrative architecture utilizes an asymmetric fixed-fluid layout model optimized for high-resolution desktop control consoles while degrading cleanly down to mobile viewports.

### Grid Architecture & Layout Blueprint
- **Global Structure:** A fixed persistent 260px administrative navigation sidebar alongside a fluid main viewport canvas.
- **Dashboard Canvas:** 12-column responsive fluid grid utilizing a 24px (`1.5rem`) gutter and 32px (`2rem`) edge canvas margin.
- **Breakpoints:**
  - **Desktop (>= 1280px):** 12 columns. Permanent sidebar expanded. Ledger metrics display in 4-column groupings.
  - **Tablet (768px - 1279px):** 8 columns. Sidebar collapses to an 72px icon rail. Gutter steps down to 16px (`1rem`), margin steps to 24px (`1.5rem`). Ledger metrics switch to 2x2 configurations.
  - **Mobile (< 768px):** 4 columns. Sidebar becomes an off-canvas drawer. Gutter shifts to 12px (`0.75rem`), margin to 16px (`1rem`). Data tables adopt horizontal scroll containers or card stacking.

### Spacing Rhythm
All spacing adheres strictly to an 8px base rhythm (with a 4px half-step for inline badges and table cells):
- `space-xs` (4px): Dense chip spacing, icon-to-label gaps.
- `space-sm` (8px): Form input inner paddings, list item gaps.
- `space-md` (16px): Standard internal card padding, form field vertical separation.
- `space-lg` (24px): Card header-to-body separation, table filter toolbar margins.
- `space-xl` (32px): Primary dashboard widget gaps and section dividers.

## Elevation & Depth

Visual hierarchy is maintained through soft atmospheric light rather than harsh structural borders. Surfaces float weightlessly above the tinted canvas (`#F7F7FC`), creating clear spatial prioritization.

### Elevation Hierarchy
- **Level 0 (Canvas Base):** Flat `#F7F7FC`. Zero shadow.
- **Level 1 (Standard Surface / Cards / Table Containers):**
  - Background: `#FFFFFF`
  - Shadow: `0 4px 20px -2px rgba(29, 35, 64, 0.05)`
  - Border: 1px solid `rgba(29, 35, 64, 0.06)`
- **Level 2 (Active Focus / Interactive Flyouts / Dropdowns):**
  - Background: `#FFFFFF`
  - Shadow: `0 12px 32px -4px rgba(29, 35, 64, 0.08)`
  - Border: 1px solid `rgba(104, 69, 245, 0.12)`
- **Level 3 (Modal Dialogs / Global Drawers):**
  - Background: `#FFFFFF`
  - Shadow: `0 24px 48px -12px rgba(29, 35, 64, 0.16)`
  - Overlay: Backdrop blur of `4px` with background `rgba(29, 35, 64, 0.4)`

### Atmospheric Characteristics
Shadows are subtly tinted with the slate neutral `#1D2340` instead of dead black, preserving vibrancy and preventing a muddy look across high-density screens.

## Shapes

The design system implements a controlled, refined curvature profile (`roundedness: 2` base) to project approachable authority without leaning juvenile or overly informal.

### Geometry Specifications
- **Base Interactive Controls (Buttons, Inputs, Selectors):** 8px (`rounded-md`). Sharp enough to feel precise for financial entry; rounded enough to eliminate harsh corners.
- **Standard Surfaces (Cards, Metric Modules, Data Grid Shells):** 12px to 16px (`rounded-lg` to `rounded-xl`). Creates clean separation between dashboard tiles.
- **Status Badges, Filter Pills, and Avatars:** Fully rounded pill shapes (`9999px`).
- **Center-Aligned Modal Layouts:** 16px (`rounded-xl`) outer container rounding, preserving uniform corner continuity with dashboard widgets.

## Components

### 1. Buttons
- **Primary:** Solid background `#6845F5`, text `#FFFFFF`, radius 8px. Height: 40px (md), 32px (sm). Hover: `#5534E0`. Focused: Active ring `0 0 0 3px rgba(104, 69, 245, 0.25)`.
- **Secondary / Outline:** Background `#FFFFFF`, border 1px solid `rgba(29, 35, 64, 0.15)`, text `#1D2340`. Hover: `#F7F7FC`.
- **Ghost:** Background transparent, text `#1D2340`. Hover: Background `rgba(104, 69, 245, 0.06)`, text `#6845F5`.

### 2. Status Chips & Badges
- Pill-shaped (`rounded-full`), height 24px, typography `label-sm`.
- Formatted with an inner 6px solid circular status indicator dot aligned left.
- Vietnamese terminology tokens: "Đã giải ngân" (Disbursed), "Đang xét duyệt" (In Review), "Cần bổ sung" (Action Required), "Đã từ chối" (Rejected).

### 3. Financial Ledger Widgets
- Designed for scholarship quota tracking, fund allocations, and balance audits.
- Card wrapper with Level 1 elevation, 16px border-radius, and 24px padding.
- Displays metric label (`label-md`), massive numeric counter (`display-lg` with `tnum`), dynamic trend pill indicator (`+14.5%`), and a micro sparkline or progress bar displaying allocation progress against total budget caps.

### 4. Data Tables (Sophisticated Audit Grid)
- **Container:** Level 1 elevation, 12px radius, overflow hidden.
- **Header:** Background `#F7F7FC`, 44px height, text `#6845F5` / Slate mute, typography `label-sm` uppercase.
- **Rows:** 56px height, alternating subtle hover background `#F9F9FD`. 1px border-bottom `rgba(29, 35, 64, 0.05)`.
- **Cells:** Vertical baseline alignment; numerical fields (monetary amounts in VND, student identification numbers) right-aligned with monospace numerals.
- **Inline Actions:** Visible on row hover to reduce visual clutter.

### 5. Input Fields & Form Controls
- **Height:** 40px standard. Border: 1px solid `rgba(29, 35, 64, 0.15)`. Radius: 8px. Background: `#FFFFFF`.
- **Active / Focus:** Border `#6845F5`, shadow ring `0 0 0 3px rgba(104, 69, 245, 0.15)`.
- **Vietnamese Input Support:** Clear baseline space allocated underneath for error/helper strings (`body-sm`) to avoid jumping when accent diacritics appear.

### 6. Checkboxes & Radio Buttons
- 18px dimensions, 4px corner radius for checkboxes, 50% circular for radio.
- Selected state: `#6845F5` fill with white SVG iconography. 

### 7. Center-Aligned Modals
- **Dimensions:** Fixed widths (480px regular, 640px ledger review, 800px full application audit).
- **Positioning:** Exact viewport center with a 4px blur backdrop.
- **Header:** Clean title (`headline-md`) with an explicit top-right close affordance.
- **Footer:** Right-aligned or dual-action bottom rail with primary confirmation button anchored right and secondary dismiss button adjacent left.