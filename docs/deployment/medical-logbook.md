# Registre médical

Le module **Registres → Registre médical** est disponible à `/modules/medicalLogbook`. Il reprend les sept rubriques du document de référence : date, heure, nom du patient, blessure ou maladie, traitement ou médicaments administrés, secouriste et signature. L’interface et les PDF sont en français.

La publication **3.73.0**, build **2026-10-14.001**, comprend la note de mise à jour `3.73.0-medical-logbook`, demandée le 14 octobre 2026 et visible pour Administrateur et Capitaine. Elle suit les comportements habituels **Ok**, **Lire plus tard** et de consultation depuis la version de SeaPilot.

La version **3.73.1**, build **2026-10-14.002**, affiche directement une ligne prête à compléter, avec **Ajouter une ligne** sous les cellules. La note publiée et les états de lecture existants sont conservés.

## Utilisation

Sélectionner un navire. Une ligne vierge apparaît directement dans le tableau. Renseigner la date et l’heure locales, le patient et le compte rendu, puis cliquer sur **Ajouter une ligne**, sous cette ligne : l’entrée est enregistrée avec la signature personnelle de l’utilisateur connecté et une nouvelle ligne vierge est proposée. **Effacer** remet le brouillon à zéro. La présence d’une ligne vierge ne produit aucune écriture. Une validation ou un échec d’enregistrement conserve les champs pour les corriger ou réessayer.

**Modifier** rend une entrée enregistrée éditable sur place ; **Enregistrer l’entrée** applique la correction et **Annuler** l’abandonne. Une ligne vierge laisse disponibles les filtres, les exports et le changement de navire. Ces actions sont bloquées dès qu’un brouillon est modifié ou qu’une correction est en cours, afin de conserver le contexte de la saisie.

Le nom du secouriste et sa signature proviennent automatiquement du profil connecté, sans saisie d’une autre identité. La signature doit être enregistrée dans **RH / Brevets → sa fiche → Signature**. Le lien proposé ouvre directement `/modules/humanResources?person=<id>&section=signature`. Sans profil actif associé ou sans signature valide, l’enregistrement reste impossible ; les données saisies restent disponibles pour réessayer.

La recherche et l’année filtrent le tableau. **Historique** montre toutes les versions. Chaque correction utilise la signature actuelle de son auteur tout en conservant les versions antérieures. **Archiver** retire une entrée du registre actif ; **Inclure les archives** permet de la consulter et de la restaurer. Aucun dossier n’est supprimé définitivement.

**Exporter PDF** produit localement un PDF A4 paysage des lignes filtrées, avec les sept colonnes et les signatures de leurs versions enregistrées. Les textes longs continuent sur d’autres pages, avec les en-têtes et le contexte du patient répétés. **Registre vierge PDF** fournit la grille à remplir à la main. Les signatures sont téléchargées par le client authentifié dans le bucket privé existant ; leur empreinte et leur taille sont vérifiées avant intégration. Une signature indisponible bloque l’export signé au lieu de produire un document incomplet. Aucun logo, police ou dossier médical n’est envoyé à un service d’export externe.

## Accès et conservation

Les droits demandés sont réservés aux administrateurs de leur société active et aux capitaines de leurs navires autorisés. Un capitaine doit être lié à une personne active et à une affectation confirmée en cours, présente à la fois dans le Planning réel et dans sa dernière publication. Les intervalles exacts `starts_at ≤ maintenant < ends_at` sont vérifiés dans les deux sources : une affectation future, provisoire, expirée, annulée ou non publiée ne confère aucun accès. Les comptes inactifs et les autres sociétés sont refusés.

Marin, Direction, Armement et visiteur ne peuvent ni consulter ni écrire ces données, même si une permission de navigation incorrecte a été configurée. La matrice Administration désactive ces cases. Les permissions de navigation ne remplacent pas les contrôles serveur.

Les entrées et leur historique sont dans le schéma non exposé `medical_logbook_private`, avec RLS et sans privilège direct client. Les six RPC publiques sont `SECURITY INVOKER`, exécutables uniquement par `authenticated`, et appellent des fonctions privées qui contrôlent les droits. La société, le navire initial, l’auteur et les horodatages sont imposés par le serveur. Les révisions empêchent l’écrasement concurrent d’une correction.

Le serveur reprend la version active de `working_time_profile_signatures` pour la personne correspondant à `auth.uid()`. Il refuse les signatures ou identités fournies par le client. Chaque version médicale conserve une référence et un instantané de la signature ; les clés étrangères `RESTRICT` retiennent aussi les anciennes versions utilisées dans l’historique. Le stockage conserve ses droits existants. La nouvelle politique ajoute uniquement la lecture des fichiers référencés par une entrée ou un historique médical dont le navire est autorisé ; elle n’autorise aucune écriture ni URL publique.

Les remarques informatives du conseiller Supabase sur les deux tables privées sans politique sont intentionnelles : aucun rôle client ne possède de privilège direct, et seuls les RPC contrôlés accèdent à ces tables. Le schéma privé ne doit jamais être ajouté aux schémas exposés de l’API.

## Déploiement et vérification

Appliquer `20261014081132_medical_logbook.sql`, puis `20261014081722_medical_logbook_current_assignment_times.sql`, avant le client. Les versions correspondent à l’historique du projet Supabase SeaPilot. La seconde migration tient compte de la normalisation réelle du Planning : une date de fin à minuit peut appartenir au jour suivant et ne doit pas prolonger les droits. Le registre démarre vide. Aucune nouvelle dépendance ni variable d’environnement n’est nécessaire. Aucun nouveau bucket public n’est créé.

`supabase/tests/medical_logbook_test.sql` utilise les vrais rôles PostgreSQL authentifiés, des sociétés, personnes, affectations et signatures synthétiques, puis annule toute la transaction. Elle vérifie les refus de périmètre, les intervalles et publications, les signatures absentes ou falsifiées, les versions anciennes, les conflits, l’historique immuable et les archives. La recette ne prend jamais une vue Marin/Capitaine simulée comme preuve des droits réels.

La préversion contient uniquement des personnes, événements et une image de signature marquée DEMO inventés. Les écritures y restent en mémoire sans appel au service de production ni stockage navigateur. Elle sert à vérifier le rendu et les interactions sur ordinateur et mobile ; le périmètre réel est vérifié séparément par les fixtures SQL.
