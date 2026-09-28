# Contrats d’affrètement et sélection des navires — v3.61.2

Le remorqueur se choisit dans une carte « 5. Remorqueur · Navire principal * », immédiatement sous « 4. Remorqué » dans la section du contrat. Le navire affrété se choisit dans la section du contrat d’affrètement, en tête de la carte « Navire et titres de navigation ».

Ces parcours ne présentent plus d’étape Facturation : Documents devient l’étape 4. BIMCO conserve ses cinq étapes. Les offres commerciales conservent leur parcours à quatre étapes. Changer de type depuis Facturation ouvre le contrat correspondant et conserve le navire sélectionné.

« Contrat d’Affrètement » est renommé « Contrat d’Affrètement à Temps ». La nouvelle variante « Contrat d’Affrètement Coque Nue » partage exactement son formulaire, ses valeurs par défaut, ses rubriques et son modèle PDF. Seuls l’intitulé du contrat et le nom du fichier PDF diffèrent. Les clauses restent identiques en attendant les différences métier à fournir ultérieurement.

Les anciens libellés « Contrat d’Affrètement » sont reconnus comme des contrats à temps. Les anciens contrats « Affrètement à temps » sans le préfixe « Contrat d’ » continuent d’utiliser BIMCO, comme auparavant dans l’éditeur.

Le champ projet `contractType` conserve la variante choisie. Les deux variantes utilisent le modèle documentaire et le type de stockage existant `bareboat_charter`, ainsi que les champs historiques `bareboat_*`. Le dialogue d’émission et le PDF reprennent le titre de la variante sélectionnée, y compris depuis le dossier projet. Le classement des navires et la lecture de leurs certificats sont conservés.

Aucune migration de base de données ni variable de configuration supplémentaire n’est nécessaire. Validation : tests des formulaires, de l’émission documentaire, de la compatibilité des anciens libellés et de l’égalité des mises en page PDF hors titre ; contrôle visuel et compilation de production.
