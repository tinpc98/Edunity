---
name: Edunity Soft Mint & Teal
colors:
  surface: '#f8f9ff'
  surface-dim: '#d0dbed'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e6eeff'
  surface-container-high: '#dee9fc'
  surface-container-highest: '#d9e3f6'
  on-surface: '#121c2a'
  on-surface-variant: '#3d4947'
  inverse-surface: '#27313f'
  inverse-on-surface: '#eaf1ff'
  outline: '#6d7a77'
  outline-variant: '#bcc9c6'
  surface-tint: '#006a61'
  primary: '#00685f'
  on-primary: '#ffffff'
  primary-container: '#008378'
  on-primary-container: '#f4fffc'
  inverse-primary: '#6bd8cb'
  secondary: '#006b5e'
  on-secondary: '#ffffff'
  secondary-container: '#6ef9e2'
  on-secondary-container: '#007164'
  tertiary: '#38645c'
  on-tertiary: '#ffffff'
  tertiary-container: '#517d75'
  on-tertiary-container: '#f4fffb'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#89f5e7'
  primary-fixed-dim: '#6bd8cb'
  on-primary-fixed: '#00201d'
  on-primary-fixed-variant: '#005049'
  secondary-fixed: '#6ef9e2'
  secondary-fixed-dim: '#4ddcc6'
  on-secondary-fixed: '#00201b'
  on-secondary-fixed-variant: '#005047'
  tertiary-fixed: '#bdece2'
  tertiary-fixed-dim: '#a2d0c6'
  on-tertiary-fixed: '#00201c'
  on-tertiary-fixed-variant: '#224e47'
  background: '#f8f9ff'
  on-background: '#121c2a'
  surface-variant: '#d9e3f6'
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
    fontSize: 30px
    fontWeight: '600'
    lineHeight: 38px
    letterSpacing: -0.015em
  headline-xl-mobile:
    fontFamily: Be Vietnam Pro
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Be Vietnam Pro
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: Be Vietnam Pro
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  headline-sm:
    fontFamily: Be Vietnam Pro
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Be Vietnam Pro
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Be Vietnam Pro
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Be Vietnam Pro
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-lg:
    fontFamily: Be Vietnam Pro
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  label-md:
    fontFamily: Be Vietnam Pro
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  label-sm:
    fontFamily: Be Vietnam Pro
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
  numeric-metric:
    fontFamily: Be Vietnam Pro
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 34px
    letterSpacing: -0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-sm: 1rem
  gutter-lg: 2rem
  margin: 2rem
  margin-mobile: 1rem
  margin-tablet: 1.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

The design system is engineered for modern administrative oversight across educational management, tuition billing, and institutional analytics. It blends enterprise reliability with welcoming, humanistic clarity. 

### Design Philosophy
- **Style Direction:** Modern Soft-Functionalism. Clean structure and generous breathing room merge with calm, medical-grade pastel freshness to avoid the cold, intimidating feel of legacy enterprise software.
- **Audience & Context:** School administrators, finance coordinators, and academic deans navigating high-density workflows (enrollment management, multi-tier tuition invoicing, performance tracking) in Vietnamese and bilingual school environments.
- **Emotional Impact:** Crisp, trustworthy, orderly, and rejuvenating. The soft mint and deep teal pairing mitigates visual fatigue during prolonged operational shifts.

## Colors

The palette relies on deliberate chromatic hierarchy tailored for analytical workflows and clear data segmentation.

### Core Semantic Roles
- **Primary Teal (`#0D9488`):** Anchors high-priority actions, primary navigational active states, and definitive brand elements. Holds a strict minimum 4.5:1 contrast against `#FFFFFF` and `#F7FAFA`.
- **Secondary Mint (`#5EEAD4`):** Serves as an interactive highlighter, focus-ring companion, progress bar indicator, and graphical accent.
- **Tertiary Soft Mint (`#CCFBF1`):** Applied exclusively as tint surfaces, chip backgrounds, soft badge fills, and hover highlights. Never used for essential text without a dark wrapper.
- **Neutral Dark (`#1F2937`):** Primary body and title color, offering soft slate richness instead of harsh absolute black.
- **Structural Light Surfaces:**
  - Canvas Base: `#F7FAFA` (cool neutral-tint canvas)
  - Card & Container Surface: `#FFFFFF` (elevated work surfaces)
  - Navigation/Sidebar Surface: `#F2FAF8` (subtle teal-tinted anchor area)
  - Border System: `#E2EDEB` (delicate, low-contrast structural dividers)

### Feedback & State Matrix
- **Success:** `#10B981` (Surface: `#ECFDF5`)
- **Warning:** `#F59E0B` (Surface: `#FFFBEB`)
- **Critical / Danger:** `#EF4444` (Surface: `#FEF2F2`)
- **Info:** `#0284C7` (Surface: `#F0F9FF`)

## Typography

The typography system relies entirely on **Be Vietnam Pro**, configured to provide balance, open counterforms, and legibility for complex diacritical marks in Vietnamese without sacrificing bilingual English balance.

### Implementation Guidelines
- **Diacritical Protection:** Line-height multipliers never fall below `1.35x` for display sizes and `1.45x` for body sizes. This accommodates combined tone marks (e.g., `ệ`, `ở`, `ữ`) without clipping or baseline collisions.
- **Tabular Data:** Use font-variant-numeric: `tabular-nums` for financial balances, grade calculations, student rosters, and timestamps to ensure vertical column alignment.

## Layout & Spacing

The layout is grounded in a rigorous **8px geometric progression** (`0.25rem` = 4px, `0.5rem` = 8px, `1rem` = 16px, `1.5rem` = 24px, `2rem` = 32px).

### Grid & Structure
- **Desktop (1280px+):** Fixed collateral navigation sidebar (`260px` to `280px`), followed by a 12-column fluid content area with `gutter-lg` (`2rem`) and `margin` (`2rem`). Content max-width is constrained at `1600px` for ultra-wide dashboards to preserve scan paths.
- **Tablet (768px - 1279px):** Collapsible sidebar (icons only, `72px`), fluid 8-column grid with `gutter` (`1.5rem`) and `margin-tablet` (`1.5rem`).
- **Mobile (< 768px):** Off-canvas drawer menu, 4-column layout with `gutter-sm` (`1rem`) and `margin-mobile` (`1rem`). Complex tables convert into stacked summary cards.

## Elevation & Depth

To maintain a clean and airy dashboard, depth is achieved through structural layering and soft enterprise shadows tinted with brand undertones, avoiding muddy dark drop shadows.

### Elevation Hierarchy
- **Level 0 (Canvas Base):** Flat `#F7FAFA`. No shadow.
- **Level 1 (Card & Section Surfaces):** Background `#FFFFFF` framed by a 1px border `#E2EDEB`. Subtle ambient tint:
  - `0 1px 3px 0 rgba(13, 148, 136, 0.04), 0 1px 2px -1px rgba(13, 148, 136, 0.02)`
- **Level 2 (Hovered Cards, Dropdowns, Popovers):**
  - `0 4px 12px -2px rgba(15, 23, 42, 0.06), 0 2px 6px -2px rgba(13, 148, 136, 0.08)`
- **Level 3 (Modal Dialogs & Slide-out Panels):**
  - `0 20px 25px -5px rgba(15, 23, 42, 0.08), 0 8px 10px -6px rgba(15, 23, 42, 0.04)`
- **Focus Elevation:** Focused interactive components produce no drop shadow, but project an outer diffuse glow: `0 0 0 3px rgba(94, 234, 212, 0.45)`.

## Shapes

The interface balances functional precision with approachable curvature:
- **Base (rounded / 0.5rem - 8px):** Inputs, select menus, small action buttons, table cell selections.
- **Component Accent (rounded-lg / 0.625rem - 10px):** Primary form buttons, tab switchers, and segment selectors.
- **Container Surfaces (rounded-xl / 0.875rem to 1rem - 14px to 16px):** Standard analytical metric widgets, cards, and data table envelopes.
- **Overlay Panels (18px to 20px):** Modal windows, transactional slide-over drawers, and confirmation dialogues.

## Components

### Buttons
- **Primary:** Solid `#0D9488` fill, `#FFFFFF` text, `font-weight: 500`. Border-radius: `10px`. Hover: darken primary to `#0F766E`. Active: scale to `0.98`. Focus: `3px` ring of `#5EEAD4` with `2px` white offset.
- **Secondary / Soft:** Fill `#CCFBF1`, text `#0D9488`, `font-weight: 600`. Hover: `#99F6E4`.
- **Outline / Ghost:** Fill `transparent`, 1px border `#E2EDEB`, text `#1F2937`. Hover: `#F2FAF8` surface with `#0D9488` text.

### Inputs & Form Elements
- **Height & Radius:** `40px` compact / `44px` default. Radius: `8px`.
- **Styling:** Surface `#FFFFFF`, border `1px solid #E2EDEB`, placeholder color `#9CA3AF`.
- **States:** Focus replaces border with `#0D9488` and displays `0 0 0 3px rgba(94, 234, 212, 0.35)`. Error states apply `#EF4444` border and `#FEF2F2` background tint.

### Data Cards & KPI Tiles
- **Structure:** Surface `#FFFFFF`, border `1px solid #E2EDEB`, radius `14px`, interior padding `20px` (`space-lg`).
- **KPI Metrics:** Top row features metric label in `label-md` uppercase with a soft mint tertiary icon container (`#CCFBF1` background, `#0D9488` icon glyph). Metric value uses `numeric-metric` (`#1F2937`), supported by contextual trend pills below.

### Chips & Badges
- **Status Pills:** Radius `9999px` (pill), height `24px`, padding `0 10px`. 
- **Variants:**
  - Paid / Enrolled: `#ECFDF5` background, `#065F46` text.
  - Pending: `#FFFBEB` background, `#92400E` text.
  - Overdue / Expelled: `#FEF2F2` background, `#991B1B` text.
  - Admin / Active Role: `#CCFBF1` background, `#0F766E` text.

### Tables & Lists
- **Structure:** Encased in standard rounded-xl cards with `overflow: hidden`.
- **Header:** Background `#F2FAF8`, border-bottom `1px solid #E2EDEB`, labels `label-sm` in `#4B5563`.
- **Row:** Height `52px`, alternating row border `1px solid #F1F5F9`. Hover state creates a uniform `#F7FAFA` fill. Action buttons remain muted until row hover.

### Modals & Drawers
- **Backdrop:** `#0F172A` with `40%` opacity and `4px` blur.
- **Frame:** Radius `20px`, surface `#FFFFFF`, border `1px solid #E2EDEB`. Header and footer are demarcated with `space-lg` padding and subtle divider lines.