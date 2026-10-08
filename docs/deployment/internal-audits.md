# Audit ISM Interne

Le menu **Audits** regroupe OVID, eCMID, Audit ISM Externe, Audit ISM Interne et Audit Client. Le module interne comporte le planning, les grilles, la synthèse des écarts et le graphique comparant les résultats annuels par site et chapitre ISM.

Le manuel d’utilisation comprend une notice pour chacune des cinq entrées. OVID, eCMID, Audit ISM Externe et Audit Client utilisent les [dossiers documentaires](./documentary-audits.md) et leur suivi des écarts.

## Référence et notation

La grille initiale reprend les 61 questions et les consignes de vérification de l’onglet **Grille d’audit** du fichier `Grille d'audit BBTM.xlsx`. Les deux barèmes absents, références **10.4** et **11.2.3**, ont été confirmés à **3 points** par l’utilisateur. La grille complète comporte donc **183 points** avant exclusion des réponses N/A. Le classeur ne contient pas de réponses, de constats ou de scores historiques renseignés. Le graphique reprend les chapitres ISM et les résultats réellement enregistrés, avec un résultat N-1 absent lorsque cet audit n’existe pas.

La réponse Conforme vaut le barème maximum, Incomplet sa moitié et Non Conforme zéro. N/A retire le barème du dénominateur. Chaque grille peut être adaptée à un site ou un navire et chaque audit copie ses questions et sa version. Les modifications ultérieures d’une grille ne changent pas les audits précédents. Un audit terminé conserve ses réponses, ses observations, son auditeur, sa date réelle et sa version de grille sans modification.

## Planning annuel

La migration crée huit cibles BBTM : Armement - CHERBOURG, Yard - LE HAVRE, GOURY, LE ROZEL, LANDEMER, SUROIT, KROKDUR et HIRONDELLE DE LA MANCHE. Les navires sont reliés aux identifiants réels de la flotte, sans créer de nouveaux navires. Les dates de référence sont initialement vides : elles doivent être renseignées ou sont initialisées lors de la première planification.

Chaque site possède une date de référence annuelle. La fenêtre autorisée court de trois mois calendaires avant cette date à trois mois après. Un seul audit est prévu par site et année de campagne ; la date planifiée peut appartenir à l’année civile voisine lorsque la fenêtre franchit décembre/janvier. Le serveur valide la fenêtre, qui reste liée à la référence du site après un déplacement du rendez-vous. La date réelle d’exécution reste enregistrable en dehors de la fenêtre pour conserver un audit réalisé en retard.

## Affichage dans le Planning global

La **date planifiée** de chaque audit ISM interne alimente également le module **Planning**, dans la ligne du navire ou du site à terre concerné. Le rendez-vous utilise le même affichage que les visites, sur son jour prévu ; la période et les filtres du Planning déterminent les lignes visibles. L’affichage ne crée ni visite en double ni nouvel audit. Les gestionnaires corrigent le rendez-vous dans sa grille ISM interne, selon le workflow existant et la fenêtre annuelle du site ; le bouton d’actualisation du Planning recharge ensuite les dates enregistrées.

Un clic sur le rendez-vous ouvre ses informations de calendrier. **Ouvrir l’audit** est proposé uniquement lorsque le serveur confirme séparément l’accès au contenu de cet audit. Le lien `/modules/internalAudits?audit=<UUID>` ouvre alors la grille concernée et reprend son année et son site. Un identifiant mal formé ou absent de l’overview autorisé produit le même message générique, sans recherche supplémentaire par identifiant. Aucun autre audit ne peut être ouvert ou modifié sous ce lien invalide ; **Retour au planning des audits** retire le paramètre avant de rétablir la navigation. Un changement de lien ne remplace jamais des réponses ou une grille non enregistrées : il est différé jusqu’à leur sauvegarde ou annulation. Une sélection manuelle d’audit ou d’année retire le paramètre de lien et conserve les autres paramètres de navigation.

La RPC authentifiée `planning_audits_overview()` rassemble les cinq types d’audit. Elle vérifie la société active et les permissions existantes du Planning sur le navire et la date ; les sites à terre suivent l’autorisation Planning de la société. Elle retourne exclusivement les métadonnées de calendrier : identifiant, type, site/navire, date prévue, éventuelle date de réalisation, titre, état et indicateur `canOpen`. Elle ne renvoie aucune question, réponse, observation, non-conformité, référence de fichier ou URL privée. La visibilité d’un rendez-vous dans le Planning ne donne aucun droit supplémentaire sur l’audit ou ses écarts ; les règles ISM internes restent applicables aux vrais comptes Capitaine et Marin.

## Écarts et profils réels

Une question peut avoir plusieurs écarts : non conformité majeure, non conformité mineure ou remarque. Chaque écart a une description et un responsable, soit une personne active de la société, soit une fonction sur un navire actif : Capitaines, Chefs Mécaniciens ou Équipage. Le serveur reconstruit le libellé du responsable à partir des données réelles. La création propose une durée modifiable : une semaine pour une majeure, un mois calendaire pour une mineure. Le serveur calcule l’échéance depuis la date de création à Paris, avec ajustement à la fin du mois. Une remarque n’a aucune échéance et sa clôture est facultative. Aucune date de clôture ne doit être saisie ; la clôture effective est horodatée par le serveur.

Administrateur, Direction et Armement peuvent gérer les grilles, planifier et réaliser les audits et affecter les écarts. Les vrais comptes Capitaine et Marin peuvent consulter les audits contenant leurs écarts et enregistrer le traitement de ceux qui leur sont affectés. La fonction collective est vérifiée à partir d’un embarquement **confirmé et en cours**, dans la société active et sur le navire désigné. Un rôle de planning générique utilise la fonction RH ; un rôle de planning explicite est prioritaire. Un capitaine ne reçoit pas les écarts réservés aux chefs mécaniciens du seul fait de son profil.

Le responsable peut enregistrer un suivi et proposer l’état **Traité, à vérifier**. Un gestionnaire vérifie ensuite et clôture. Une réouverture par le gestionnaire reste tracée. La création, les changements d’affectation ou d’échéance et chaque traitement créent un événement avec identité et horodatage serveur. Les utilisateurs du client ne peuvent pas insérer ou modifier directement les audits ou leur journal.

Les photos du constat sont conservées sur l’écart. Les photos du traitement et de la clôture sont conservées sur l’événement correspondant. Les photos sont facultatives : JPEG, PNG ou WebP, au maximum 10 Mo par fichier et 10 fichiers par enregistrement. Le bucket `internal-audit-photos` est privé. La lecture et les téléchargements suivent les mêmes autorisations que l’écart ; les URL de consultation sont signées temporairement. Les chemins comprennent la société, l’audit, l’écart, la nature de la preuve et l’auteur. Les preuves enregistrées ne peuvent pas être remplacées ou supprimées par le client. Un échec de sauvegarde nettoie les fichiers non rattachés lorsque cela reste possible et signale un échec de nettoyage.

## Présentation et rapports

Le planning utilise une liste déroulante d’années. La grille d’audit est un tableau compact : référence, question, éléments à vérifier toujours visibles, réponse, points, observation et actions restent sur la même ligne. La carte d’édition répétée sous chaque question est supprimée ; l’édition se fait depuis l’action de la ligne. Sur un petit écran, le tableau défile horizontalement sans faire déborder la page. La date de réalisation est automatiquement renseignée au jour du démarrage de l’audit, dans le fuseau Europe/Paris ; elle reste conservée lors des sauvegardes suivantes.

Le graphique présente le score global et la comparaison par chapitre avec le même site en année N−1. Un score absent reste absent ; un résultat nul est affiché comme zéro. L’export porte sur la version enregistrée de l’audit sélectionné et reste bloqué en présence de modifications non enregistrées. Pour le PDF, l’utilisateur choisit une ou plusieurs sections **Grille d’audit**, **Synthèse** et **Graphique**, ainsi que le tri éventuel de la grille par fonction RH. Le classeur Excel contient les trois onglets correspondants, un graphique Excel natif et les photos intégrées sans dépendre de leurs URL temporaires. Les rapports reprennent les questions, réponses, consignes, observations et points de la grille et les écarts et leur historique lorsque la synthèse est sélectionnée. Les audits non finalisés sont identifiés comme brouillons. Un échec de chargement d’une preuve nécessaire à une section sélectionnée bloque l’export avec un message explicite.

Les droits de navigation sont enregistrés pour les cinq profils sur les cinq entrées du menu Audits. Ils ne remplacent pas les règles de données : l’accès au module interne reste limité aux audits et écarts autorisés par le serveur.

## Déploiement et vérification

Pour le Planning global, appliquer également `supabase/migrations/20261001071713_audits_global_planning.sql` après les migrations internes et documentaires. Cette migration ajoute la date prévue documentaire et la RPC de calendrier ; elle ne modifie pas la fenêtre annuelle interne ni les autorisations de lecture des contenus. Vérifier le refus anonyme, le scope de société/navire/date et la différence entre visibilité Planning et `canOpen` avec des comptes authentifiés distincts. La démonstration ajoute un audit LANDEMER prévu trois jours après la date courante, avec 61 réponses vides ; aucun rendez-vous fictif n’est créé en production.

1. Appliquer la migration initiale `supabase/migrations/20260930214840_internal_audits.sql`, puis la migration additive `supabase/migrations/20260930233050_internal_audit_photos_deadlines.sql` avant de déployer le client. Les RPC publiques sont `SECURITY INVOKER`, les écritures contrôlées et les fonctions RLS sont dans le schéma non exposé `internal_audit_private`. Les cinq tables ont RLS et des droits de lecture explicites. La nouvelle migration ajoute le bucket privé et ses règles, les photos et les durées ; elle conserve l’ancienne signature à trois paramètres de la RPC de traitement.
2. Exécuter `corepack pnpm test src/features/internalAudits --pool=forks --maxWorkers=1`, les tests d’intégration du menu et `corepack pnpm build` avec pnpm 10.34.5.
3. Exécuter les suites `supabase/tests/internal_audits_test.sql` et `supabase/tests/internal_audit_photos_deadlines_test.sql` sur la base locale après application du schéma. Elles utilisent des comptes authentifiés distincts et des fixtures de société, personnel, embarquements et objets de stockage ; tous les changements de recette sont annulés par `ROLLBACK`.
4. Vérifier les conseillers de sécurité Supabase et confirmer en production les huit sites, la grille de 61 lignes, les permissions de navigation et les signatures RPC.
5. Vérifier que Vercel déploie le commit poussé et ouvrir Audit ISM Interne dans l’application. Valider planning, copie de grille, sauvegarde des réponses, écart, traitement, synthèse et comparaison annuelle. Ne pas utiliser les vues de profil simulées de l’administrateur comme preuve du comportement Capitaine/Marin.

Les tests SQL couvrent les affectations personnelles et collectives, les comptes Capitaine et Marin réellement séparés, l’absence d’accès d’un utilisateur non affecté ou d’un administrateur d’une autre société, les barèmes falsifiés, les fenêtres calendaires, la conservation des réponses terminées et les événements de résolution/clôture. Les tests TypeScript vérifient notamment la transmission des permissions serveur, la validation des responsables et la remontée des refus du workflow.

En cas de retour arrière du client, conserver les tables et l’historique. La migration n’altère pas les modules précédents. Exporter les données avant toute suppression manuelle des objets du module.

## Recette du 1er octobre 2026

La migration a été appliquée au projet SeaPilot `szlvyrrmvdvhzixilymh`. Le contrôle distant confirme huit sites, les six liens vers les navires actifs, une grille de 61 questions totalisant 183 points, cinq tables avec RLS et six RPC publiques invoker interdites aux anonymes. Aucun audit ni date anniversaire fictif n’est créé en production. Les conseillers Supabase ne signalent aucun objet du nouveau module ; leurs autres signalements concernent les objets existants.

Les 60 contrôles pgTAP passent sur la base locale avec de vrais utilisateurs authentifiés distincts, notamment Capitaine, Marin, chef mécanicien et autre société. La recette navigateur utilise uniquement les données de démonstration : question ajoutée à la grille LE ROZEL (version 2), émission d’un écart majeur avec responsable et échéance, traitement puis clôture avec deux événements, finalisation avec réponses figées, comparaison 2026/2025 et absence explicite de 2024. Les changements d’onglet ou de sélection sont bloqués tant que les réponses ou la grille ne sont pas enregistrées ou annulées.

Après intégration avec le dernier `main`, les 111 tests Vitest du module, des permissions, du shell et d’App passent, ainsi que le lint ciblé et la compilation de production de la version 3.62.0. L’interface a été contrôlée sur ordinateur et à 390 pixels, sans débordement de page ni erreur console actuelle. Le mode de démonstration sert à cette recette visuelle ; les autorisations des profils réels sont vérifiées par les fixtures SQL et les réponses serveur des tests UI.

## Compléments de la version 3.63.0

La migration `20260930233050_internal_audit_photos_deadlines.sql` est appliquée au projet SeaPilot. Le contrôle distant confirme un bucket privé de 10 Mo limité aux JPEG/PNG/WebP, trois politiques de stockage et les colonnes de photos et de durée. Aucun constat fictif n’est créé en production. Les conseillers de sécurité ne signalent aucun objet du module.

Les 111 contrôles SQL passent : 60 de la suite initiale et 51 pour les délais, les photos, les autorisations et l’immuabilité des preuves. Les tests des exports chargent réellement le PDF et les fichiers XML du classeur ; le classeur a aussi été ouvert avec openpyxl, qui confirme trois onglets, un graphique natif à deux séries et deux photos intégrées. Les PDF ont été rendus et inspectés pour les questions longues, la synthèse, les preuves photographiques et les sauts de page.

## Compléments de la version 3.64.0

Le planning conserve le classement par année et affiche une ligne par site, avec les illustrations existantes des navires et douze colonnes mensuelles. La fenêtre autorisée est visible sur le calendrier ; les dates réelles restent conservées même lorsqu’elles débordent l’année civile affichée.

L’onglet Graphique présente un radar des chapitres ISM pour les années N et N−1 du même site. Le pourcentage exclut les N/A ; un chapitre absent ne devient jamais un score nul. Un tableau accessible affiche les mêmes valeurs. Les exports complets PDF et Excel gardent leurs trois sections et la comparaison annuelle.

Le bouton **Imprimer la grille** ouvre un PDF consacré aux questions, consignes, réponses, observations et points de l’audit enregistré. Il permet l’impression depuis le lecteur PDF sans lancer automatiquement une impression physique. Les modifications doivent être enregistrées ou annulées avant impression. Aucun fichier de preuve n’est chargé pour cette grille seule.

## Compléments de la version 3.66.0

Dans **Grilles**, **Supprimer le modèle** retire la grille des choix proposés après confirmation. Les audits qui l’ont utilisée conservent leurs questions, version, réponses et écarts. La suppression du dernier modèle laisse la création d’une nouvelle grille disponible. Le PDF vierge du modèle peut être téléchargé avant toute planification.

Chaque ligne du modèle et de sa copie d’audit peut recevoir une fonction du catalogue RH de la société. Une ancienne fonction reste conservée sur une ligne historique. Le choix d’une fonction ou d’un participant ne renseigne pas la date de réalisation. Le tri PDF classe les fonctions par libellé, avec les lignes non affectées à la fin ; les barèmes et scores restent inchangés.

Les gestionnaires désignent les participants depuis les profils RH. Le serveur ajoute les véritables auteurs des sauvegardes, constats et traitements, y compris après la réalisation de l’audit. Les personnes devenues inactives restent conservées dans les audits auxquels elles participent. Un compte sans lien RH conserve son identité connue sans prénom inventé. Le rapport contient les noms, prénoms et signatures de profil disponibles ; une signature absente est signalée. La présence de l’image de profil ne constitue pas une nouvelle signature de l’audit. Les références de signature sont privées et leur accès suit les autorisations de lecture de l’audit.

Le PDF peut inclure une ou plusieurs sections : **Grille d’audit**, **Synthèse**, **Graphique**. Les participants figurent à la suite des sections choisies. La grille seule est téléchargeable avant que les réponses soient complétées. Le classeur Excel conserve ses trois onglets. Les exports restent bloqués tant que des modifications ne sont pas enregistrées ; une signature enregistrée mais indisponible produit une erreur explicite.

Voir [la migration, les règles d’accès et les vérifications](./internal-audit-grid-roles-participants.md).
