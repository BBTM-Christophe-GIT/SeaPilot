# SeaPilot design system

## Extension — accueil manager

- La route d’accueil `/` devient un tableau de bord de pilotage pour le profil manager/direction, toujours rendu dans le shell SeaPilot existant.
- Supprimer du nouvel accueil les blocs et intitulés statiques `Supervision SeaPilot`, `Contrôles recommandés` et l’ancienne section `À traiter aujourd’hui`.
- Le nouvel écran doit tenir dans un viewport desktop de 1440 × 900, shell compris, sans défilement vertical pour consulter les priorités essentielles.
- Après le message `Bonjour Christophe`, afficher une synthèse compacte : volume d’éléments nécessitant une action et commandes utiles, sans hero marketing ni statistiques décoratives.
- Le cœur de l’écran est un espace ouvert en deux zones : mini calendrier mensuel à gauche, file opérationnelle multi-modules à droite. Éviter une grille de cartes répétitives et les panneaux imbriqués.
- Le calendrier affiche le mois complet, met en évidence les dates contenant des échéances ou alertes, distingue l’urgence par la couleur et possède un état de date sélectionnée évident. Un clic sur une date filtre la file de droite.
- La file agrège les demandes d’achat à approuver, documents arrivant à échéance, certificats flotte, alertes du suivi du temps de travail, fins de contrat, visites et actions planifiées.
- Chaque ligne est entièrement cliquable et montre : urgence, module source, objet précis, entité concernée (navire/personne/contrat), échéance relative et date, action attendue, chevron de navigation.
- Prévoir des filtres compacts et accessibles `Tous`, `Urgents`, `Cette semaine`, puis des filtres par module avec leurs comptes réels issus de la liste. Les états sélectionnés utilisent le bleu SeaPilot ; rouge/ambre restent réservés à la criticité.
- Regrouper la file sous quatre en-têtes métier compacts : `Achats`, `Temps de travail`, `Flotte & documents` et `Ressources humaines`. Chaque groupe affiche son nombre d’éléments visibles, conserve l’ordre de criticité puis d’échéance, et disparaît lorsque la date ou le filtre actif ne contient aucun élément de cette catégorie.
- Utiliser des exemples français réalistes : `DA-2026-084`, `M/V BBTM Pioneer`, `Certificat de classe`, `Alerte repos insuffisant`, `Visite médicale — Sophie Le Gall` et `Contrat Lucas Martin`.
- Ne pas afficher de bandeau `Accès rapides` sur cet accueil. Dans l’en-tête de synthèse, conserver uniquement l’action `Consulter les indicateurs` et ne pas afficher de bouton `Ouvrir le planning`.
- Interactions à rendre explicites dans le concept : clic date → filtre, clic filtre → nouvelle liste, clic ligne → module et détail source, survol/focus visible, état vide si aucune échéance.

## Extension — module Navires

- Le module `Navires` reste dans le shell opérationnel existant et conserve les mêmes tokens, typographies et composants.
- Le niveau principal sépare clairement `Navires`, `Bureaux` et `Quais`, avec une liste filtrable à gauche et une fiche détaillée à droite.
- Chaque navire possède ses propres sections `Vue d’ensemble` et `Décision d’effectif`; la décision n’est jamais présentée comme un onglet global de la flotte.
- La fiche navire est structurée par familles : identité maritime, dimensions et capacités, propulsion et performances, équipements de pont, communications, autonomie et aménagement.
- Une photographie principale sert de point focal dans l’en-tête de la fiche. Les bureaux et quais utilisent une présentation sobre sans fonctions maritimes ni décision d’effectif.
- L’action `Éditer brochure` est réservée aux navires et reste visible avec les actions d’administration. La brochure générée reprend l’identité BBTM uniquement et ne mentionne jamais SeaPilot.
- Le design doit privilégier une grande fiche ouverte et des listes structurées, sans grille de cartes décoratives répétitives.

## Product context

SeaPilot is an internal maritime operations application for BBTM. The Projects module is used by administrative and management roles to browse the project portfolio, create and update clients/projects, add planning operations, review commercial and contractual information, generate project documents, and open SharePoint records.

The interface is operational and information-dense. Users work primarily on desktop with occasional tablet/mobile access. Clarity, fast scanning, explicit status, keyboard accessibility, and conservative business styling are more important than decorative effects.

## Confirmed business model

- Keep the module name **Projets**.
- Inside the module, the left-hand collection is explicitly named **Contrats**.
- A contract is identified by its project code and title, for example `P264 – Nom du projet`.
- One contract owns one or many operational occurrences.
- Every operation is an independent Planning occurrence and appears on the Planning module.
- A new operation contains editable start date, end date, vessel, status, and `Description / mission`.
- A new operation accepts one or several documents. Files are stored in SharePoint **Documents Projets**, linked specifically to the operation, and remain accessible from both Projects and Planning.
- The contract defines a default charter hire with its currency and unit.
- Creating an operation copies the contract's current charter hire as an operation-level snapshot.
- The copied operation hire can be edited. Later contract changes never update existing operations retroactively.
- Each operation has one charter hire at a time. Users modify that operation's hire as business conditions evolve; there are no multiple tariff-period rows inside one operation.

## Global shell

- Preserve the current global shell: dark navy collapsible sidebar, white topbar, and light gray content canvas.
- The module redesign lives inside the existing `.content-area`.
- Keep BBTM/SeaPilot branding and the existing Lucide icon language.
- The module header should remain recognizably part of SeaPilot and must not become a marketing-style hero.

## Projects information architecture

Organize all project commands in a ribbon directly below the page title, using the Planning module's group/command model:

1. **Portefeuille**
   - Nouveau projet
   - Modifier le projet
   - Archiver
   - Actualiser
2. **Clients & opérations**
   - Nouveau client
   - Modifier le client
   - Nouvelle opération
3. **Documents**
   - Générer offre
   - Générer contrat
   - Générer ordre de travail / compte-rendu
   - Ouvrir SharePoint
4. **Affichage**
   - Filtres
   - Réinitialiser
   - Optional compact/comfortable density toggle

Disabled commands must remain visible when they depend on a selected project/client, with clear disabled styling.

## Layout direction

- Replace the current sequence of metrics, filters, flat toolbar, list, and detail with a coherent contract workspace.
- Use the exact confirmed hierarchy: **Contrats list on the left; selected contract sheet on the right; the contract's operations in a chronological table inside that sheet.**
- The left list contains contracts only, never a flat mixture of contracts and operations.
- Each contract list row shows `Pxxx – Nom`, client, status, and operation count. Make the selected contract unmistakable.
- The right contract header shows contract identity, client, type, reference period, default charter hire, and useful document/status counts.
- Make **Opérations** the main/active contract section. Display operations in chronological order with columns for mission, start, end, vessel, operation charter hire, documents, Planning status, and row actions.
- Distinguish operation hires inherited unchanged from the contract from operation-specific modified hires with text labels, not color alone.
- Keep secondary contract sections for contract/SUPPLYTIME, commercial offer, contract documents, and identification, but subordinate them to the operations workflow.
- Summary metrics should be compact and subordinate to the command ribbon.
- Filters may be collapsible or live in a compact secondary row/drawer, but current filter capabilities must remain discoverable.
- Use realistic French labels and representative maritime/project data.

## Visual tokens

- Font only: Inter/system sans-serif.
- Canvas: `#f3f6f9` / `#f4f6f9`.
- Primary text: `#182132`; headings: `#111827`.
- Secondary text: `#536276`; muted text: `#667085`.
- Brand navy: `#0c3f78`.
- Primary action: `#0c5598`; interactive/focus: `#0c66b7`.
- Surfaces: `#ffffff`, subtle alternate `#fbfcfe`.
- Borders: `#d8e0ea`, `#c7d2df`, `#e3e9f0`.
- Success: `#1d7a48` / `#ecf9f2`.
- Danger: `#bd2d2d` / `#fff1f1`.
- Control radius 6px; panel radius 8px.
- Shadows must remain restrained and functional.
- Do not introduce gradients, glassmorphism, neon colors, serif/decorative fonts, oversized rounded cards, or playful consumer-app styling.

## Components and interaction

- Command ribbon: white surface, compact icon buttons, explicit group labels, vertical group dividers, horizontal overflow on smaller widths.
- Buttons: icon + French label; 40–48px minimum target where practical.
- Statuses: compact chips with readable text, not color alone.
- Focus: visible blue focus ring.
- Selected portfolio item: navy/blue emphasis plus border/background differentiation.
- Tabs: accessible `tablist`/`tabpanel`, arrow-key navigation retained.
- Preserve empty, error, partial-data, loading, disabled, and success states.
- Use only the fonts, colors, spacing, and component styles defined here and in the source CSS.

## Responsive behavior

- Desktop: master/detail split with a stable 360–440px portfolio column.
- Tablet: narrower split or stacked detail depending on available width.
- Mobile: ribbon horizontally scrollable; portfolio and detail become a single-column drill-in flow.
- Never truncate essential project code, client, vessel, or status without a tooltip or secondary line.

## Motion

- 150–180ms ease transitions for hover, selection, panel opening, and density changes.
- Respect `prefers-reduced-motion`.
