# Design QA — module Projets

## Evidence

- Source visual truth: `C:\CODEX\SeaPilot\docs\design\projects-interface-redesign-concept-v2.png`
- Normalized comparison source: `C:\CODEX\SeaPilot\docs\design\projects-interface-redesign-concept-v2-normalized.png`
- BIMCO document truth: `C:\CODEX\SeaPilot\src\features\projects\assets\contract-previews\bimco-p144-page-01.png`
- Rendered implementation: `C:\CODEX\SeaPilot\docs\design\projects-interface-redesign-implementation.png`
- Rendered BIMCO state: `C:\CODEX\SeaPilot\docs\design\project-bimco-interface-implementation.png`
- Browser CSS viewport: 1584 × 993 px
- Source pixels: 1584 × 993 px
- Normalized source pixels: 1569 × 984 px
- Implementation pixels: 1569 × 984 px
- Device pixel ratio: 1
- Density normalization: the source was downsampled once with high-quality bicubic interpolation to the in-app browser capture raster. The 15 × 9 px difference comes from the browser host gutters; the application itself reported the 1584 × 993 CSS viewport.
- State: local SeaPilot preview, `Nouveau projet`, first step, `Offre Commerciale`; secondary verification on BIMCO step 2, page 1 of 29.

## Findings

- No remaining P0, P1 or P2 mismatch.
- [P3] The live implementation uses a nearly full-window editor, while the concept shows a narrower centered modal over the portfolio. This is intentional: the later product direction requested a new window and the event-report pattern uses the same high-density working surface.
- [P3] The source concept contains generic labels such as `Campagne` and `Contrat / SUPPLYTIME`. The implementation intentionally replaces them with the approved contract taxonomy: `Offre Commerciale`, `Contrat de Remorquage`, `BIMCO`.

## Required Fidelity Surfaces

- Fonts and typography: the existing SeaPilot font stack, weight hierarchy and compact field typography are preserved. Titles, step labels, form labels and preview copy remain legible at the reference viewport without unintended wrapping.
- Spacing and layout rhythm: the three working zones — step navigation, form, document preview/completeness — follow the concept proportions. Header and footer remain fixed and fully visible; form and document areas scroll independently.
- Colors and tokens: the existing SeaPilot navy, blue action color, pale-blue surfaces, neutral borders and semantic completeness colors are consistently reused.
- Image quality and asset fidelity: the BBTM logo is a real project asset. The BIMCO preview uses the rasterized P144 source page itself, not a recreated form. Towage follows the same source-background approach.
- Copy and content: storage messages consistently say SeaPilot for newly generated documents. The contract selector contains exactly the three approved values.

## Full-view comparison evidence

The normalized concept and implementation capture were opened together at 1569 × 984, from the same 1584 × 993 CSS target. Five comparison points were checked:

1. The creation header and close action retain the same hierarchy.
2. The left navigation clearly communicates the five-step creation path.
3. The form remains the primary editable surface and scrolls independently.
4. The live document preview and completeness rail remain visible alongside the form.
5. The persistent footer keeps cancel, draft and primary creation actions accessible.

The implementation adds type-specific previews and fields without changing this composition.

## Focused-region comparison evidence

The P144 page-one source and the BIMCO implementation state were opened together. The visible BIMCO title, logo, Part I grid, case numbering and cell geometry are the same source artwork. Dynamic values are overlaid only in the intended case areas. A separate tight browser clip was attempted but the in-app browser returned the page origin rather than the requested clip; the full BIMCO implementation screenshot provides the browser-rendered evidence and the exact source image remains directly inspectable.

## Comparison history

### Pass 1

- [P2] The action footer was partially below the viewport because the editor height and backdrop padding were both counted independently.
- Fix: the project assistant now owns a fixed two-row grid, the form owns a content/footer grid, and the main workspace uses the available height instead of a viewport-derived height.

### Pass 2

- Post-fix evidence: `projects-interface-redesign-implementation.png` shows the full footer at the identical viewport. Browser measurements confirm the dialog and footer end at y=975 within the 993 px viewport.
- [P2] Switching from BIMCO page 2 back to the one-page offer briefly retained the stale page index and displayed `2 / 1`.
- Fix: reset the preview page when the contract type changes and clamp the rendered page index to the active document page count.

### Pass 3

- Post-fix evidence: the final `projects-interface-redesign-implementation.png` displays `1 / 1` after returning from BIMCO to `Offre Commerciale`.
- No actionable P0/P1/P2 difference remains.

## Primary interactions tested

- Open `Nouveau projet` from the portfolio.
- Confirm the selector exposes only the three approved contract types.
- Switch to `Contrat de Remorquage` and verify its dedicated fields and source-form preview.
- Switch to `BIMCO`, verify cases 1–34 and navigate from page 1 to page 2 of the 29-page preview.
- Confirm `Opérations` and `Facturation` remain present for every contract type.
- Confirm the project record uses the vertical RH-style section navigation.
- Browser console errors checked: none.

## Implementation Checklist

- [x] Exact three-value contract selector.
- [x] Type-specific fields and a single corresponding generated document.
- [x] Operations and Billing preserved.
- [x] Private SeaPilot/Supabase storage for newly generated documents and operation attachments.
- [x] One-page commercial offer preview.
- [x] Source-faithful towage and BIMCO previews.
- [x] Fixed footer and independent scrolling at the reference viewport.

## Follow-up Polish

- Revisit compact/tablet behavior if the project editor is later required below a desktop-width viewport.

final result: passed
