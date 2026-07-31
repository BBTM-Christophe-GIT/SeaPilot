# SeaPilot v3.7.4 - Correctif PDF P144

## Correctifs

- Les valeurs multi-lignes de la colonne `Opérations` sont normalisées sur une seule ligne avant le rendu PDF, puis abrégées avec une ellipse si elles dépassent la largeur de la colonne. Cette protection évite la superposition des lignes suivantes et tout chevauchement avec le montant.
- Les DPR `24/24 Weather Stand-by` utilisent désormais la même logique de commentaires que les `24/24 Crew Change` :
  - heure d'accostage lorsque le navire est au port ;
  - refueling lorsqu'une quantité est renseignée ;
  - heure d'appareillage lorsqu'elle est renseignée.

## Validation

- Tests unitaires du formatage des opérations et des commentaires P144.
- Génération et contrôle visuel du PDF de juillet 2026.
- Build de production et vérification du parcours d'export dans le navigateur.
