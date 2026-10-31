# PDF de facturation et état des justificatifs

Version `3.80.24`, build `2026-10-31.003`.

## Génération du PDF

Le PDF standard est produit sans lire les pièces jointes. Une vérification
des justificatifs en cours ou en échec ne bloque pas ce format.

Le mode PDF avec annexes lit les justificatifs PDF sélectionnés, vérifie leur
contenu et ajoute uniquement les annexes exploitables. Une pièce manquante,
inaccessible, vide, incomplète ou illisible n'empêche plus la génération du PDF.
Le résultat indique les pièces non jointes et met à jour leur état dans Services
refacturables. Les montants, lignes sélectionnées, références et calculs de
facturation restent inchangés ; aucune facture ni annexe n'est reconstituée.

Le ZIP contient la synthèse et toutes les pièces sélectionnées disponibles,
quel que soit leur format. Les pièces manquantes, incomplètes ou inaccessibles
ne bloquent plus son téléchargement. Après un export PDF avec annexes ou ZIP,
le message liste uniquement les noms des fichiers non intégrés. La présence
d'un PDF dans le ZIP ne prouve pas qu'il peut être fusionné ; ce transfert ne
remplace pas un diagnostic de lisibilité déjà établi.

## Tableau Services refacturables

Chaque fichier est accompagné de son état : disponible, manquant, invalide,
inaccessible ou copie locale à vérifier. Un frais sans pièce affiche l'absence
de justificatif. Les fichiers restent identifiables et leurs liens conservés.

La vérification complète démarre automatiquement à l'ouverture de Facturation,
après chargement des pièces de la période. Elle couvre les copies en ligne et
les anciennes références Drive locales, sans clic sur une commande de contrôle.
Le lanceur local est contacté uniquement lorsqu'un fichier l'exige. Une tentative
de connexion est partagée pour tout le contrôle, y compris en cas d'échec : les
lots suivants ne provoquent pas de relances en boucle. Le bouton Revérifier
n'est plus affiché depuis la version 3.80.24. Une modification des pièces
déclenche automatiquement un nouveau contrôle des documents de la période.

Le navigateur conserve ses autorisations d'ouverture du protocole et d'accès
local ; leur éventuelle confirmation initiale reste gérée par le navigateur
([règles Microsoft Edge](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-policies/autolaunchprotocolsfromorigins)).
Un refus ou une connexion indisponible est signalé sans déclarer le fichier
absent à tort. Le PDF et le ZIP restent téléchargeables avec les pièces disponibles.

Les changements de projet, compte, mois ou documents annulent les contrôles
devenus obsolètes, y compris les lectures locales en cours. Une réponse tardive ne peut pas modifier l'état d'une autre
période. L'enregistrement de l'export ne supprime pas le diagnostic des annexes
du mois. Les erreurs d'autorisation ne sont pas présentées comme des fichiers
absents et ne déclenchent aucun contournement des contrôles d'accès.

## Affichage compact des pièces

Depuis la version `3.80.22` (build `2026-10-31.001`), chaque pièce occupe une
ligne compacte. Les noms longs utilisent une
ellipse ; le nom complet reste dans l'infobulle et le nom accessible du bouton.
Les fichiers en erreur ont une puce légèrement rouge et une pastille rouge
avec triangle blanc. Leur cause apparaît sous le fichier sur une seule ligne
synthétique. Aucun diagnostic visible n'est ajouté pour un fichier disponible
ou non vérifié. Le diagnostic complet reste disponible au survol et dans la
description accessible du fichier. Plusieurs pièces
restent présentées séparément et le bouton Ajouter conserve sa hauteur normale.
Sur mobile, le défilement horizontal reste contenu dans le tableau et les
commandes tactiles gardent leur taille minimale.

Depuis la version `3.80.23`, le texte Disponible n'est plus affiché ; le statut
reste accessible aux lecteurs d'écran. La phrase générique Fichier Google Drive
inaccessible n'est plus affichée sous la puce. La puce rouge et le triangle blanc
signalent toujours le problème, et le diagnostic complet reste disponible au
survol et dans la description accessible. Les autres causes spécifiques restent
présentées sur une seule ligne.

## Gestion des pièces dans le dialogue des frais

Chaque document enregistré dispose d'actions Remplacer et Supprimer. Ces
changements sont préparés dans le dialogue, puis appliqués avec Enregistrer le
frais. Annuler la modification d'une pièce ou fermer le dialogue avant cet
enregistrement abandonne les changements correspondants. Les fichiers en
attente d'ajout peuvent également être remplacés ou retirés avant enregistrement.
Les noms identiques restent des documents distincts, ciblés par leur identifiant.

Un remplacement téléverse d'abord un nouveau fichier à une adresse unique,
puis met à jour la même ligne de pièce jointe si son ancien emplacement est
toujours identique. Il ne crée pas une deuxième pièce jointe. Une erreur de
téléversement conserve l'ancien lien. Les conflits d'accès ou de modification
concurrente n'écrasent pas une autre pièce ; une réponse réseau perdue est
réconciliée avant tout nettoyage d'octets potentiellement liés.

Les remplacements et ajouts sont traités avant les suppressions. Après un
échec partiel, les opérations réussies quittent la file d'attente et ne sont
pas rejouées lors de la reprise. Le dialogue signale que le frais a été
enregistré si la mise à jour de ses pièces reste à terminer. La suppression
retire la référence du frais et de ses exports ; les anciennes copies
privées ou Drive restent conservées selon la politique de stockage existante.

Les actions sont réservées aux profils qui gèrent la facturation. Les règles
RLS existantes limitent les écritures aux profils Admin/Direction appartenant
à la société concernée. Les opérations ciblent le projet, le frais,
l'identifiant, le type et l'ancien emplacement de la pièce. Aucune migration
ni modification des politiques d'accès n'est requise.

Le champ Fournisseur conserve la recherche par société ou spécialité et son
clavier. La loupe disparaît quand le texte correspond au fournisseur sélectionné ;
le chevron reste à droite et ne peut plus recouvrir le début du nom.

## Données et déploiement

Aucune référence métier, copie historique ou pièce indisponible n'est supprimée.
Les vérifications et les avertissements sont propres à la consultation en cours.
Aucune migration, nouvelle dépendance ni mise à jour du lanceur n'est requise.

Depuis la version 3.80.21, la règle de blocage des PDF fusionnés documentée dans
[la version 3.80.20](./project-billing-missing-attachments.md) est levée ; la
version 3.80.22 lève également le blocage des ZIP. Le rétablissement des
originaux reste nécessaire pour joindre toutes les pièces, mais plus pour
télécharger un PDF ou un ZIP avec les pièces disponibles.
