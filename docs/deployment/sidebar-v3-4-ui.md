# Sidebar v3.4.0 — cartes de navigation

Version cible : `3.4.0`.

## Périmètre

- Le logo BBTM existant (`public/bbtm-logo.png`) est conservé sans modification.
- Chaque famille de navigation utilise une carte arrondie de 14 px et un accent propre : QHSE vert, Opérations et
  Planning bleus, Achats orange, Ressources Humaines violet, Maintenance turquoise, Levage jaune et
  Administration gris.
- Les sous-menus restent sur le fond sombre `#0b1020`, avec un texte gris `#cbd5e1`, des icônes fines et un repère
  ponctuel devant chaque entrée.
- Le module actif direct utilise le bleu `#2563eb` et une icône blanche.
- La version applicative et le bouton « Réduire le menu » restent collés en bas de la sidebar.
- En mode réduit, une seule icône de famille reste visible par carte. Sur mobile, le tiroir restaure les libellés et
  les sous-menus.

La structure des menus et les autorisations ne changent pas. La matrice administrable
`role_module_permissions` reste la source de vérité pour la visibilité par rôle.

## Déploiement

Aucune migration Supabase ni nouvelle variable d'environnement n'est requise. Déployer le client après les
contrôles suivants :

```powershell
npm run lint
npm test
npm run build
```

## Contrôles visuels

1. Vérifier le rendu complet de la sidebar à largeur desktop et l'état actif de Planning.
2. Ouvrir et fermer une famille, puis vérifier que ses sous-menus restent navigables.
3. Réduire et agrandir la sidebar ; le logo doit rester celui de BBTM.
4. À 390 px de large, ouvrir le tiroir, parcourir les cartes puis fermer le menu et son fond d'écran.
5. Vérifier l'affichage de `v3.4.0` et l'absence de débordement horizontal.

## Registre de fidélité

| Point comparé | Référence | Rendu v3.4.0 | Décision |
| --- | --- | --- | --- |
| Identité | Marque SeaPilot illustrative | Logo BBTM existant avec libellé SeaPilot | Écart demandé explicitement : l'asset BBTM est conservé. |
| Cartes | Coins 14 px, verre discret | Coins 14 px, bord fin et dégradé translucide | Conforme. |
| Palette | Accents par famille et sous-menu `#0b1020` | Accents dédiés, sous-menu `rgb(11, 16, 32)` | Conforme. |
| État actif | Planning en `#2563eb` | Planning en `rgb(37, 99, 235)` | Conforme. |
| Densité desktop | Toutes les familles et le footer dans 1450 × 1086 | Navigation `910/910 px`, Administration et footer visibles | Conforme après suppression de la compression verticale. |
| Navigation directe | Chevron visuel orienté vers le bas | Chevron orienté vers la droite | Écart intentionnel : ne pas annoncer un accordéon sur une route directe. |
| Mobile | Non détaillé dans la planche | Tiroir 300 px, fond modal, défilement interne et fermeture dédiée | Extension responsive dans le même système visuel. |

## Retour arrière

Redéployer le client `v3.3.2`. Aucune donnée ni migration n'est à restaurer.
