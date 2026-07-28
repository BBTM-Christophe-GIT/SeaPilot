-- Verified snapshot of the SharePoint list "Administration - Prestataires - Fournisseurs".
-- Source: list 5e29f7db-a85e-4147-9c54-b00f0e588f7e, read on 2026-07-23.
-- The upsert remains reconcilable by the real SharePoint item identifiers.

drop index if exists public.service_providers_sharepoint_item_unique_idx;
create unique index service_providers_sharepoint_item_unique_idx
  on public.service_providers (sharepoint_list_id, sharepoint_item_id);

with provider_source (
  sharepoint_item_id, name, category, service_type, activity, address, city, phone,
  legal_form, accounting_email, company_email, contact_name, contact_role,
  contact_phone, contact_email, evaluation
) as (
  values
    ('1', 'COURMAR', 'Prestataire de Service', 'Frais de Port', 'Services auxiliaires des transports par eau', '22, Rue Mustel', 'Rouen', null, 'Société A Responsabilité Limitée (sans autre indication)', null, null, null, null, null, null, null),
    ('2', 'ETABLISSEMENTS MARCHAND', 'Prestataire de Service', 'Fuel', 'Commerce de gros (commerce interentreprises) de combustibles et de produits annexes', '14, Avenue Normandie Sussex - BP 70 - 76202 DIEPPE CEDEX', null, '+33 (0)2 32 90 51 51', 'SAS, société par actions simplifiée', 'carburant@etsmarchand.fr', null, null, null, null, null, null),
    ('3', 'SARL HALBOURG ET FILS', 'Prestataire de Service', 'Pompage Eaux / Hydrocarbures', 'Collecte et traitement des eaux usées (37.00Z)', '9, Rue de la Vallée', 'Saint-Pierre-Bénouville', '+33 (0)2 35 83 22 93', 'Société A Responsabilité Limitée (sans autre indication)', null, null, null, null, null, null, null),
    ('4', 'RICHARD MARINE CONSULTING', 'Prestataire de Service', 'Audit IMCA', 'Activités spécialisées, scientifiques et techniques diverses', '9, Route de Gaos Ar Lao, 22300, Ploubezre', null, '+33 (0)6 83 33 21 15', 'SAS, société par actions simplifiée', null, null, 'Ronan RICHARD', 'CEO', '06 83 33 21 15', 'rri@richardmarineconsulting.com', '5'),
    ('5', 'COOPERATIVE MARITIME DE NOIRMOUTIER', 'Prestataire de Service', 'Fuel', 'Commerce de gros (commerce interentreprises) de fournitures et équipements divers pour le commerce et les services', 'PORT DE L HERBAUDIERE RUE DE LA POINTE 85330 NOIRMOUTIER-EN-L''ILE', null, '+33 (0)2 51 39 05 90', 'SA coopérative (d''intérêt) maritime à conseil d''administration', null, null, null, null, null, null, null),
    ('7', 'Chambre de Commerce et d''Industrie de Noirmoutier-en-l''île', 'Prestataire de Service', 'Frais de Port', null, null, null, null, null, null, null, null, null, null, null, null),
    ('8', 'SERVAUX - LE HAVRE - Radeaux', 'Prestataire de Service', 'Visite Radeaux', null, '5 Quai de Guinée, 76600 Le Havre', null, '02 32 74 95 80', null, null, null, 'Yann DUVAL', null, '02 32 74 95 80', 'y.duval@servaux.com', null),
    ('9', 'MACOR LSA SERVICE - Le Havre Agency', 'Prestataire de Service', 'Visite Grue / Bossoir', 'Réparation et maintenance navale', null, null, '+33 (0)4 91 20 39 02', null, null, null, 'Régis MIRC', 'Technical & Safety Manager', '06 72 74 87 96', 'lsaservice@macor.fr', null),
    ('10', 'DNV France SARL', 'Prestataire de Service', 'Visite société de Classification', 'Analyses, essais et inspections techniques', '28-34 28 RUE DU CHATEAU DES RENTIERS 75013 PARIS', null, null, 'Société A Responsabilité Limitée (sans autre indication)', null, null, 'Mathieu BOKOBZA', 'Surveyor and Auditor - Deputy Flag Liaison Officer', '06 59 67 88 32', 'mathieu.bokobza@dnv.com', null),
    ('11', 'Agence Nationale des Fréquences (ANFR)', 'Prestataire de Service', 'Visite ANFR', null, null, null, null, null, null, null, 'Eric PHELIPPEAU', 'Contrôleur de conformité', '0607319076', 'eric.phelippeau@anfr.fr', '5'),
    ('12', 'Éoliennes en Mer de Dieppe-Le Tréport', 'Client', null, null, null, null, null, null, null, null, null, null, null, null, null),
    ('13', 'BBTM', 'Travaux Maritimes', null, null, null, null, null, null, null, null, null, null, null, null, '5'),
    ('14', 'PROLIANS NORMANDIE - Le Havre', 'EPI', 'Matériel - Equipement - EPI - Fournitures', null, '161 Boulevard Amiral MOUCHEZ, 76600 LE HAVRE', null, '0235262800', null, null, null, null, null, null, null, null),
    ('15', 'SIOEN NV', 'EPI', 'Matériel - Equipement - EPI - Fournitures', null, 'Fabriekstraat 23 8850 Ardooie Belgique', null, '+32 (0)51 740 800', null, null, null, null, null, null, null, null),
    ('16', 'ALOTECH', 'EPI', 'T-Shirt', 'Commerce de gros (commerce interentreprises) de fournitures et équipements industriels divers', 'Zone de Kerdroual, 5 rue Fulgence Bienvenue, 56270 Ploemeur', null, '0297475891', 'Société A Responsabilité Limitée (sans autre indication)', null, null, 'Erwan KERMORVANT', 'Chargé d''Affaires Eolien', null, 'wind@alotech.fr', null),
    ('17', 'CHIMIREC VALRECOISE', 'Prestataire de Service', 'Collecte de déchets', null, 'Zone Portuaire 1477 parc des gabions 76700 Gonfreville l''Orcher', null, null, 'SAS, société par actions simplifiée', null, null, 'Aurélie REGLEY', 'Commerciale Sédentaire', '02 35 55 65 62', 'aregley@chimirec.fr', null),
    ('18', 'LTS - Le Treport Shipping Stevedoring', 'Prestataire de Service', 'Frais de Port', 'Entreposage et services auxiliaires des transports', 'Quai Sud, 76470 Le Tréport, France', null, '02 35 50 06 12', 'SAS, société par actions simplifiée', null, null, 'Françoise MARTINEZ', null, '02 35 50 55 45', 'francoise.martinez@letreport-ship.fr', '4'),
    ('19', 'Würth', 'Approvisionnement', 'Matériel - Equipement - EPI - Fournitures', null, null, null, '03 88 64 53 00', 'SAS, société par actions simplifiée', null, null, null, null, null, null, null),
    ('20', 'BUREAU VERITAS - E.JEAN', 'Prestataire de Service', 'Visite société de Classification', null, null, null, null, null, null, null, 'Erwan JEAN', 'Responsable de centre – Expert Naval', '06 83 97 41 92', 'erwan.jean@bureauveritas.com', null),
    ('21', 'HOWDEN FRANCE SAS', 'Prestataire de Service', 'Assurance', 'Activités auxiliaires de services financiers et d’assurance', '13 Rue La Fayette, 75009 Paris', null, '01 55 32 72 00', 'SASU (Société par Actions Simplifiée Unipersonnelle)', null, null, 'Antoine COTY', 'Référent Technique Corps / Howden France', '06 27 38 41 83', 'antoine.coty@howdengroup.com', null),
    ('22', 'ACI 50 - Sarl Segouin', 'Prestataire de Service', 'Visite Equipements Incendie', null, 'ZI du, 7 Rue Colbert, All. du Château de la Mare, 50200 Coutances', null, '02 33 46 50 86', 'Société A Responsabilité Limitée (sans autre indication)', null, null, null, null, null, 'contact@aci50-segouin.fr', '1'),
    ('23', 'Nautic Service Sauvetage', 'Prestataire de Service', 'Visite Radeaux', null, '74 Route des Entreprises ZA Rogerville Oudalle 76430 OUDALLE', null, '02 35 51 75 30', null, null, null, null, null, null, null, null),
    ('24', 'CSN - LE HAVRE - Chef de Centre', 'Prestataire de Service', 'Affaires Maritimes', null, '4 rue du Colonel Fabien BP 34 76083 le Havre', null, '02 35 19 29 89', null, null, null, 'Mathieu FANONNEL', null, '02 35 19 29 91', 'mathieu.fanonnel@developpement-durable.gouv.fr', null),
    ('25', 'CSN - LE HAVRE - Secrétariat', 'Prestataire de Service', 'Affaires Maritimes', null, '4 rue du Colonel Fabien BP 34 76083 le Havre', null, '02 35 19 29 89', null, null, null, 'Gwladys LETERRE', 'Secrétaire', '02 35 19 29 89', 'csn-le-havre.dirm-memn@developpement-durable.gouv.fr', null),
    ('26', 'COPREXMA', 'Prestataire de Service', 'Architecture Navale', null, '2, Rue du Menhir - ZA du GUIRRIC - 29120 PONT L''ABBE', null, '02 98 82 47 71', null, null, null, null, null, null, null, null),
    ('27', 'Herskovits & Tobie', 'Prestataire de Service', 'Architecture Navale', null, '9, rue Jeanne d''Arc - 44000 NANTES', null, null, null, null, null, 'Jérôme LEBEAU', null, '02 40 48 59 49', 'jerome.lebeau@architecture-navale.net', null),
    ('28', 'APAVE', 'Prestataire de Service', 'Visite Grue / Bossoir', null, '235 Route du Mesnil, 76290 Montivilliers', null, '02 32 79 56 46', null, null, null, 'Clément NOEL', null, null, 'clement.noel@apave.com', null),
    ('29', 'SERVAUX - LE HAVRE - Incendie - XLE', 'Prestataire de Service', 'Visite Equipements Incendie', null, '5 Quai de Guinée, 76600 Le Havre', null, '02 32 74 95 80', null, null, null, 'Xavier LECOINTRE', null, '06 80 40 27 18', 'x.lecointre@servaux.com', '5'),
    ('30', 'Régie Dieppoise des Activités Portuaires', 'Prestataire de Service', 'Frais de Port', null, '1, QUAI DU TONKIN - Batiment FERAY - CS 40213 - 76201 DIEPPE cedex', null, '02 32 14 47 17', null, null, null, null, null, null, null, null),
    ('31', 'LABEO', 'Prestataire de Service', 'Analyse Eau', null, null, null, '02 31 47 19 19', null, null, null, null, null, null, null, '1'),
    ('32', 'VDM - REYA', 'Approvisionnement', 'Matériel - Equipement - EPI - Fournitures', null, null, null, '09 71 00 17 72', null, null, null, 'Bertrand', null, '06 12 47 57 01', null, null),
    ('33', 'AgroQual', 'Prestataire de Service', 'Analyse Eau', null, 'Site Normandial, 8 Av. du Pays de Caen, 14460 Colombelles', null, '02 31 38 24 24', null, null, null, 'Delphine DEBRAY', null, '06 03 10 07 53', 'delphine.debray@agroqual.fr', '5'),
    ('34', 'KENT Marine', 'Approvisionnement', 'Matériel - Equipement - EPI - Fournitures', null, null, null, null, null, null, null, null, null, null, null, null),
    ('35', 'Pharmacie du Pollet', 'Approvisionnement', 'Dotation Médicale', null, '34-36, Grande Rue du Pollet', 'Dieppe', '02 35 84 18 85', null, null, null, 'Andreea LHAIBA', 'Pharmacien Titulaire', '02 35 84 18 85', 'pharmaciedupollet@gmail.com', '5'),
    ('36', 'SERVAUX - LE HAVRE - Incendie - MOU', 'Prestataire de Service', 'Visite Equipements Incendie', null, 'Quai de Guinée - Hangar 26 76600 LE HAVRE', null, null, null, null, null, 'Maxime OUIN', 'Chef d''Atelier', '06 34 23 30 61', 'm.ouin@servaux.com', null),
    ('37', 'Registre International Français', 'Prestataire de Service', 'Administration Maritime Française', null, null, null, null, null, null, null, 'Guichet Unique', null, '04 86 94 67 50', 'rif.equipage@mer.gouv.fr', null),
    ('38', 'BBTM - Contrôle Interne des Apparaux de Levage', 'Prestataire de Service', 'Contrôle Interne des Apparaux de Levage', null, null, null, null, null, null, null, 'Antoine MONCEAUX', null, '+33 (0)6 66 65 02 67', 'antoine@bbtm.fr', null),
    ('39', 'SEIMI', 'Approvisionnement', 'Matériel - Equipement - EPI - Fournitures', null, null, null, null, null, null, null, null, null, null, null, null),
    ('40', 'Bureau Veritas - L.DORE', 'Prestataire de Service', 'Visite société de Classification', null, null, null, null, null, null, null, 'Louis DORE', null, null, null, null),
    ('41', 'SOCOTEC DIAGNOSTIQUE', null, 'Visite société de Classification', 'Activités spécialisées, scientifiques et techniques diverses', 'Agence de Caen – Pôle Basse Normandie Z.I. de la Sphère - 267 Rue Marie Curie 14201 HEROUVILLE SAINT CLAIR CEDEX', null, '02 31 46 24 24', null, 'veronique.jouanno@socotec.com', null, 'Alban BUYSSENS', null, '0623570638', 'alban.buyssens@socotec.com', null)
)
insert into public.service_providers (
  company_id, name, category, service_type, activity, address, city, phone,
  legal_form, accounting_email, company_email, contact_name, contact_role,
  contact_phone, contact_email, evaluation, active,
  sharepoint_site_url, sharepoint_list_id, sharepoint_list_title, sharepoint_item_id,
  source_modified_at
)
select
  company.id,
  source.name,
  source.category,
  source.service_type,
  source.activity,
  source.address,
  source.city,
  source.phone,
  source.legal_form,
  source.accounting_email,
  source.company_email,
  source.contact_name,
  source.contact_role,
  source.contact_phone,
  source.contact_email,
  source.evaluation,
  true,
  'https://bbtm668.sharepoint.com/sites/QHSE',
  '5e29f7db-a85e-4147-9c54-b00f0e588f7e',
  'Administration - Prestataires - Fournisseurs',
  source.sharepoint_item_id,
  '2026-07-23T15:05:19Z'::timestamptz
from provider_source source
cross join lateral (
  select id from public.companies order by id limit 1
) company
on conflict (sharepoint_list_id, sharepoint_item_id)
do update set
  name = excluded.name,
  category = excluded.category,
  service_type = excluded.service_type,
  activity = excluded.activity,
  address = excluded.address,
  city = excluded.city,
  phone = excluded.phone,
  legal_form = excluded.legal_form,
  accounting_email = excluded.accounting_email,
  company_email = excluded.company_email,
  contact_name = excluded.contact_name,
  contact_role = excluded.contact_role,
  contact_phone = excluded.contact_phone,
  contact_email = excluded.contact_email,
  evaluation = excluded.evaluation,
  active = true,
  source_modified_at = excluded.source_modified_at,
  updated_at = now();
