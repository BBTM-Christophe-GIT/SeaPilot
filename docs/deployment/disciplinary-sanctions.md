# Sanctions Disciplinaires

## Fonctionnement

Route : `/modules/disciplinary`, famille Ressources Humaines.

- La colonne gauche liste uniquement les collaborateurs ayant un dossier. « Nouveau dossier » ouvre le sélecteur des collaborateurs en poste (dates d’embauche/départ). Les dossiers existants restent consultables après le départ.
- Six sanctions : avertissement, blâme, mise à pied disciplinaire, mutation, rétrogradation, licenciement en CDI. Trois qualifications de faute et cinq motifs alcool/stupéfiants avec définitions contextualisées.
- Convocation, notification/proposition de sanction et mise à pied conservatoire distincte. L’application ne décide pas automatiquement de la qualification et n’envoie aucun courrier.
- Courrier modifiable avant validation, adresse et identité préremplies. Date de Paris, mention « Cherbourg-en-Cotentin », nom/fonction de l’émetteur et signature alignés à droite. Signature active du profil récupérée lorsqu’elle existe, ou image PNG/JPEG ajoutée dans l’éditeur.
- Export Word natif utilisant le package du papier à en-tête BBTM fourni : en-têtes, pieds de page, images et paramètres de page conservés. Tout courrier non validé est marqué PROJET à l’export. Après une modification de la préparation, une nouvelle relecture ou régénération est requise pour classer le courrier final.
- Brouillons enregistrés avec contrôle de concurrence ; chaque classement crée un fichier distinct et une référence immuable. Les courriers validés sont conservés dans le dossier même lorsque le courrier suivant est préparé. Les modifications externes dans Word concernent le fichier Drive, pas le courrier validé dans SeaPilot.

## Relecture, partage et validation — v3.42.0

1. Enregistrer le dossier et générer le courrier. L’émetteur initial est le profil connecté.
2. Dans **Relecture et partage**, choisir un ou plusieurs destinataires Administration/Direction de la même entreprise puis **Partager et notifier**. La cloche mène directement à la relecture du bon dossier. Aucun courrier n’est envoyé au collaborateur.
3. L’émetteur enregistre ses corrections directement. Un autre profil autorisé modifie la préparation ou le courrier puis **Proposer les modifications** : chaque champ modifié devient une proposition indépendante. Les données officielles ne sont remplacées qu’après acceptation.
4. L’émetteur **accepte ou rejette** chaque proposition. Les deux versions sont affichées, avec leur mise en forme nettoyée. Une proposition dont le champ a changé entre-temps est refusée à l’acceptation : il faut la rejeter ou demander une nouvelle proposition. Commentaires, auteurs, dates et décisions restent consultables.
5. L’émetteur actuel ou Administration peut changer l’émetteur vers un profil Administration/Direction autorisé. Le nom est issu du profil ; l’ancienne signature est effacée et le nouvel émetteur est notifié.
6. L’émetteur peut **Valider le courrier** après enregistrement, relecture et traitement des propositions. La préparation et le courrier courant deviennent non modifiables. La validation crée une copie immuable consultable dans **Dossier et pièces → Courriers validés**.
7. **Préparer un autre courrier dans ce dossier** permet notamment d’enchaîner convocation et notification. Le précédent courrier validé reste conservé. Le classement Drive accepte uniquement une copie conforme à un courrier validé du dossier.
8. **Suivi** permet de consigner les faits constatés, la convocation envoyée, l’entretien réalisé, la notification, le début/la fin de sanction et la clôture, avec date et note. Pièces jointes et suivi peuvent être ajoutés après validation.

Le partage ne modifie pas les droits Google Drive et n’élargit jamais l’accès applicatif à d’autres rôles. La validation verrouille le contenu conservé dans SeaPilot ; elle ne bloque pas les modifications d’une copie Word externe. Une signature insérée n’est pas un service de signature électronique certifiée.

Migrations `20260915125415_disciplinary_collaboration.sql` et `20260915130254_disciplinary_validated_letters.sql`, appliquées au projet lié. Les écritures passent par des RPC atomiques : rôle, entreprise, émetteur, état, version et propositions contrôlés côté serveur. Les tables de relecture, participants, événements, notifications et courriers validés sont soumises à RLS. Les notifications ne sont lisibles/modifiables que par leur destinataire encore autorisé. Les fonctions à privilèges élevés résident dans le schéma privé, avec façades publiques sans élévation.

Le logo applicatif fourni est utilisé dans le menu (normal/compact) et les écrans d’authentification. Le papier à en-tête BBTM des courriers reste le modèle fourni.

Recette v3.42.0 : suite automatisée, build de production et lint ciblé réussis. Les liens de notification rechargent les corrections du serveur, y compris pour un dossier déjà ouvert ou créé après le chargement de la liste.

Contrôles : tests React des parcours de création, pièces par dossier, édition par un relecteur, verrouillage, décisions, partage multiple et conservation d’un commentaire en cas d’échec ; tests de cloche pour les cinq profils ; tests SQL en transactions annulées pour les autorisations, conflits, décisions, notifications privées, transfert d’émetteur, archives immuables et courrier suivant. Vérification visuelle dans le navigateur, bureau et mobile 390 px ; aucun envoi réel de notification pendant la recette.

## Accès et données

Migration : `20260915085025_disciplinary_sanctions.sql`, appliquée au projet Supabase lié le 15/09/2026. Tables `disciplinary_cases`, `disciplinary_documents` et RPC `disciplinary_has_access`.

L’accès exige l’appartenance à l’entreprise, le rôle `admin` ou `direction` et la permission de module active. Administration peut activer/désactiver ces deux profils. Les cases Armement, Capitaine et Marin sont désactivées ; une contrainte SQL interdit également leur activation par API. RLS contrôle dossiers et métadonnées des pièces, y compris sur accès direct. Les pièces ne sont pas ajoutées aux bibliothèques RH générales.

Les tables conservent le brouillon, l’original du courrier lors de son classement et les références des fichiers. Les fichiers Word/PDF et pièces vivent dans Google Drive, sans bucket public ni jeton Google embarqué dans le navigateur.

## Google Drive et ouverture Office

Même mécanisme que les procédures : **Google Drive pour ordinateur**, dossier synchronisé et lanceur Windows `seapilot-drive`.

Dossier créé et synchronisé : [SeaPilot / Sanctions Disciplinaires](https://drive.google.com/drive/folders/1Z9-8yKz114uGZYqAF-LB-vPlD1DbwdDa).

Depuis la version **3.41.0**, la configuration est centralisée dans **Administration → Documents et Google Drive**. Un seul lanceur Windows 2.0.0 ouvre et enregistre les fichiers de tous les modules. La racine locale unique est mémorisée par utilisateur Windows :

```text
SeaPilotRoot = G:\Mon Drive\SeaPilot
```

Sur chaque poste :

1. Installer Google Drive pour ordinateur. Le sous-dossier confidentiel **Sanctions Disciplinaires** doit déjà être partagé avec les seuls comptes autorisés et synchronisé.
2. Extraire `/connectors/seapilot-drive-windows.zip` et exécuter `Installer.cmd` une fois (mise à jour nécessaire pour les anciens lanceurs).
3. Dans Administration, renseigner uniquement le chemin du dossier **SeaPilot** puis « Enregistrer la racine SeaPilot ». Les dossiers des collaborateurs en poste de l’entreprise active sont préparés automatiquement. « Vérifier ce PC » relit le réglage déjà enregistré.
4. Dans le module, classer le courrier ou ajouter une pièce : le lanceur retrouve ou crée le dossier du collaborateur, puis le sous-dossier de date. Aucune sélection de dossier dans chaque profil ni après rechargement.
5. Autoriser l’ouverture du lanceur et, si le navigateur le demande, la connexion locale. Attendre la fin de la synchronisation Drive avant une consultation sur un autre poste.

Arborescence : `SeaPilot / Sanctions Disciplinaires / Prénom NOM - c<entreprise>-p<collaborateur> / AAAA-MM-JJ / identifiant-document - nom.ext`. Le suffixe stable évite les homonymes et retrouve un dossier existant si le nom RH change. Les collaborateurs ajoutés après la configuration obtiennent leur dossier au premier classement. Un brouillon sauvegardé seul reste dans SeaPilot.

Formats autorisés : DOCX, XLSX, PPTX, PDF, PNG/JPEG, TXT, ODT/ODS/ODP ; 25 Mo maximum par fichier. Chaque classement crée un fichier distinct, sans écraser un document déjà modifié dans Word.

Le bouton « Ouvrir le fichier » utilise le protocole commun `seapilot-drive://root/open/...` avec un chemin relatif à SeaPilot. Les anciennes références et URI restent lisibles. Les postes sans lanceur Windows peuvent télécharger le Word, l’enregistrer manuellement puis utiliser « Lier un fichier déjà enregistré ». En cas de résultat d’écriture incertain ou d’échec d’enregistrement de la référence, le chemin est conservé pour cette récupération.

Voir [le lanceur commun](./shared-windows-drive-launcher.md) pour le transport local, la vérification des droits et l’ajout de modules.

**Droits Drive :** vérification du dossier réel le 15/09/2026 : quatre comptes individuels autorisés, tous de profil Administration dans SeaPilot ; aucun partage public ou de domaine retourné. Les autorisations Google Drive sont indépendantes des rôles SeaPilot. Lors d’un changement de rôle, d’un départ ou d’une désactivation du module, retirer aussi les autorisations Drive devenues injustifiées et maîtriser les copies synchronisées sur les postes. L’application ne révoque pas les droits Google automatiquement. Aucun accès à ce dossier ne doit être accordé à Armement, Capitaine ou Marin, y compris via un dossier parent ou un groupe.

## Rappels juridiques

Sources vérifiées le 15/09/2026 :

- [Service Public : sanctions](https://www.service-public.gouv.fr/particuliers/vosdroits/F2234), [qualification de la faute](https://www.service-public.gouv.fr/particuliers/vosdroits/F1137), [licenciement](https://www.service-public.gouv.fr/particuliers/vosdroits/F2839), [indemnité](https://www.service-public.gouv.fr/particuliers/vosdroits/F987).
- [Modification du contrat](https://www.service-public.gouv.fr/particuliers/vosdroits/F2339) et [délais de recours](https://www.service-public.gouv.fr/particuliers/vosdroits/F2360).
- Code des transports : [L5531-22](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000033555230), [L5531-31](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000033555250).
- [Guide Indeed fourni](https://fr.indeed.com/recrutement/c/info/sanction-disciplinaire-procedure-et-modele-de-lettre), utilisé comme complément rédactionnel. Son indication générale de deux mois pour contester n’est pas reprise : le module affiche deux ans pour l’exécution du contrat et douze mois pour la rupture, avec mention des exceptions.

Le calendrier applique les jours ouvrables, les reports des échéances et les jours chômés supplémentaires saisis. Il reste indicatif : vérifier les dispositions maritimes, la convention collective et le règlement intérieur. Les articles cités sur l’alcoolémie ne sont pas présentés comme une base de dépistage des stupéfiants. La faute lourde exige une intention de nuire distinctement établie. Le classement final d’un licenciement générique est bloqué pour un CDD ou un salarié protégé.

## Validation

### Texte enrichi — v3.40.1

Les champs **Faits observés**, **Éléments justificatifs**, **Obligations et consignes applicables** et **Modalités de la sanction** utilisent l’éditeur partagé de SeaPilot : gras, italique, souligné, titres, citations, polices, listes, alignements et liens. Le corps du courrier dispose du même éditeur pour les retouches avant export.

Les chaînes HTML nettoyées restent stockées dans les propriétés JSON existantes des brouillons et des instantanés de courrier. Aucune migration ni modification des droits d’accès ou du classement Drive n’est nécessaire. Les anciens contenus en texte simple sont toujours lisibles et modifiables. La validation considère le texte visible, pour éviter qu’un champ ne contenant que des balises vides soit accepté.

L’export convertit la mise en forme en paragraphes, styles de caractères, listes et liens Word natifs ; le document reste modifiable dans Office. Les modalités renseignées pour un avertissement ou un blâme sont également reprises. Les valeurs de texte simple (lieu, noms, explications) sont échappées à l’assemblage ; le contenu enrichi est nettoyé avant affichage et export. Les zones de saisie sont verrouillées pendant un enregistrement.

Contrôles : génération des trois types de courrier, conservation des quatre champs, anciens textes simples, listes imbriquées, liens, rejet du HTML exécutable et des champs vides ; interaction dans le navigateur à 390 et 1 440 pixels ; document généré ouvert dans Microsoft Word et rendu en PDF.

- Tests du modèle : 90 combinaisons faute/sanction/motif, assistance à l’entretien, distinction conservatoire/disciplinaires, exemples officiels de délais, fêtes et fins de mois, relecture après changement et date réelle d’envoi.
- Tests interface avec contextes de rôles réels : interdiction avant chargement pour Marin, Capitaine et Armement ; génération et modification pour Direction.
- `supabase/tests/disciplinary_access_test.sql` exécuté en transaction annulée : droits des cinq profils, pièces jointes, isolation entreprise, désactivation de Direction, interdiction d’octroi à Marin, anonymes et immutabilité du dossier.
- Tests Drive : chemins, liens, limites et non-écrasement. Lanceur Windows : ouverture DOCX/PDF et rejet des traversées, macros, exécutables et jonctions.
- Word généré ouvert et rendu en PDF par Microsoft Word, contrôle visuel du document et de l’en-tête ; bureau et mobile contrôlés dans le navigateur.

Maquette validée enregistrée dans [Superdesign](https://superdesign.dev/teams/72b387e8-4c5d-44bd-8ae5-97dbc2f1181c/projects/f9960330-f385-426d-9e3c-dedc8ae59b48?node=draft-variant-b5a55e78-3769-45aa-a5ae-8ede7142a252).
