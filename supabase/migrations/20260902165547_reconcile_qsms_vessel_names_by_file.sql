-- The initial Graph inventory used drive item identifiers as reconciliation
-- keys. Restore Navire lookups by the unique original file name retained on
-- every imported row. The list identifier prevents matching SeaPilot records.

with source_vessel (file_name, vessel_name) as (
  values
    ('Document Unique Evaluation des Risques Professionnels - SUROIT.docx', 'SUROIT'),
    ('Document Unique Evaluation des Risques Professionnels - LE ROZEL - NORTEKMED.docx', 'LE ROZEL'),
    ('Document Unique Evaluation des Risques Professionnels - GOURY.docx', 'GOURY'),
    ('FOR-DUERP 04 - DUERP - KROKDUR.docx', 'KROKDUR'),
    ('Manuel de Sécurité et des Limites Opérationnelles - GOURY.docx', 'GOURY'),
    ('Manuel de Sécurité et des Limites Opérationnelles - LE ROZEL.docx', 'LE ROZEL'),
    ('Manuel d''Exploitation - GOURY.docx', 'GOURY'),
    ('Document Unique Evaluation des Risques Professionnels - Personnel Sédentaire.docx', 'Armement - Cherbourg'),
    ('Procédure d''exécution de travaux - Nettoyage du Chenal.docx', 'LE ROZEL'),
    ('Document Unique Evaluation des Risques Professionnels - LE ROZEL - CNPE Flamanville.docx', 'LE ROZEL'),
    ('Courbe de Déviation Compas - GOURY.docx', 'GOURY'),
    ('Courbe de Déviation Compas - LE ROZEL.docx', 'LE ROZEL'),
    ('Document Unique Evaluation des Risques Professionnels - LE ROZEL - Courseulles.docx', 'LE ROZEL'),
    ('Démarrage et arrêt de KROKDUR.docx', 'KROKDUR'),
    ('Document Unique Evaluation des Risques Professionnels - HOLENN EUSA.docx', 'HOLENN EUSA'),
    ('Démarrage du HOLENN EUSA.docx', 'HOLENN EUSA'),
    ('Checklist démarrage du HOLENN EUSA.docx', 'HOLENN EUSA'),
    ('Inventaire du matériel nautique et d’armement – HOLENN EUSA.docx', 'HOLENN EUSA'),
    ('Inventaire du matériel nautique et d’armement – HIRONDELLE DE LA MANCHE.docx', 'HIRONDELLE DE LA MANCHE'),
    ('Document Unique Evaluation des Risques Professionnels - KROKDUR.docx', 'KROKDUR'),
    ('Courbe de Déviation Compas - KROKDUR.docx', 'KROKDUR'),
    ('Manuel de Sécurité et des Limites Opérationnelles - KROKDUR.docx', 'KROKDUR'),
    ('Courbe de Déviation Compas - HIRONDELLE DE LA MANCHE.docx', 'HIRONDELLE DE LA MANCHE'),
    ('Manuel de Sécurité et des Limites Opérationnelles - HIRONDELLE DE LA MANCHE.docx', 'HIRONDELLE DE LA MANCHE'),
    ('Plan de Stockage - YARD - LE HAVRE.docx', 'YARD - Le Havre'),
    ('P254 -Nivelage Bougainville.docx', 'LANDEMER'),
    ('Document Unique Evaluation des Risques Professionnels - LANDEMER.docx', 'LANDEMER'),
    ('Manuel de Sécurité et des Limites Opérationnelles - LANDEMER.docx', 'LANDEMER'),
    ('Courbe de Déviation Compas - LANDEMER.docx', 'LANDEMER'),
    ('Document Unique Evaluation des Risques Professionnels - LE ROZEL.docx', 'LE ROZEL'),
    ('Inventaire du matériel nautique et d’armement – LANDEMER.docx', 'LANDEMER'),
    ('RAMS - Lutte contre les pollutions d''hydrocarbures - KROKDUR - Thomsea T2.docx', 'KROKDUR'),
    ('RAMS - Lutte contre les pollutions d''hydrocarbures - GOURY - Thomsea T2.docx', 'KROKDUR'),
    ('Manuel de Sécurité et des Limites Opérationnelles - SUROIT.docx', 'SUROIT')
)
update public.procedures as procedure
set vessel_name = source_vessel.vessel_name
from source_vessel
where procedure.sharepoint_list_id = '958cf50b-779a-4002-811c-0ed8bb41f7b5'
  and procedure.source_file_name = source_vessel.file_name
  and procedure.vessel_name is distinct from source_vessel.vessel_name;

with published_vessel (file_name, vessel_name) as (
  values
    ('Nivelage Quai BOUGAINVILLE.pdf', 'LANDEMER'),
    ('Manuel d’Exploitation - GOURY.pdf', 'GOURY'),
    ('Démarrage et arrêt de KROKDUR.pdf', 'KROKDUR'),
    ('Démarrage du HOLENN EUSA.pdf', 'HOLENN EUSA'),
    ('Checklist démarrage du HOLENN EUSA.pdf', 'HOLENN EUSA'),
    ('Inventaire du matériel nautique et d’armement – HOLENN EUSA.pdf', 'HOLENN EUSA'),
    ('Plan de Stockage - YARD - LE HAVRE.pdf', 'YARD - Le Havre'),
    ('Courbe de Déviation Compas - GOURY.pdf', 'GOURY'),
    ('Courbe de Déviation Compas - HIRONDELLE DE LA MANCHE.pdf', 'HIRONDELLE DE LA MANCHE'),
    ('Courbe de Déviation Compas - KROKDUR.pdf', 'KROKDUR'),
    ('Courbe de Déviation Compas - LANDEMER.pdf', 'LANDEMER'),
    ('Courbe de Déviation Compas - LE ROZEL.pdf', 'LE ROZEL'),
    ('Document Unique Evaluation des Risques Professionnels - GOURY.pdf', 'GOURY'),
    ('Document Unique Evaluation des Risques Professionnels - SUROIT.pdf', 'SUROIT'),
    ('Document Unique Evaluation des Risques Professionnels - Personnel Sédentaire.pdf', 'Armement - Cherbourg'),
    ('Procédure d''exécution de travaux - Nettoyage du Chenal – CNPE de Flamanville.pdf', 'LE ROZEL'),
    ('Manuel de Sécurité et des Limites Opérationnelles - GOURY.pdf', 'GOURY'),
    ('Lutte contre les pollutions d’hydrocarbures - GOURY - THOMSEA T2.pdf', 'KROKDUR'),
    ('Lutte contre les pollutions d’hydrocarbures - KROKDUR - THOMSEA T2.pdf', 'KROKDUR')
)
update public.published_procedures as publication
set vessel_name = published_vessel.vessel_name
from published_vessel
where publication.sharepoint_list_id = '1a9cd5f9-77a6-45fc-8705-d35005729774'
  and publication.file_name = published_vessel.file_name
  and publication.vessel_name is distinct from published_vessel.vessel_name;
