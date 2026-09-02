-- Projet is a legacy choice column. Projet_LK is the authoritative SharePoint
-- multi-lookup and its display titles are the values shown by SeaPilot.

update public.procedures
set project_name = null
where sharepoint_list_id = '958cf50b-779a-4002-811c-0ed8bb41f7b5'
  and project_name is not null;

with source_project (file_name, project_name) as (
  values
    ('Document Unique Evaluation des Risques Professionnels - SUROIT.docx', 'ETPO'),
    ('Procédure d''exécution de travaux - Nettoyage du Chenal.docx', 'P231 - NETTOYAGE CHENAL CNPEF'),
    ('Fiche Recapitulative - PUITOX - CNPE.pdf', 'P231 - NETTOYAGE CHENAL CNPEF'),
    ('Consigne PUI - Tricastin.pdf', 'P231 - NETTOYAGE CHENAL CNPEF'),
    ('P254 -Nivelage Bougainville.docx', 'P254 - NIVELAGE QUAI BOUGAINVILLE'),
    ('RAMS - Lutte contre les pollutions d''hydrocarbures - KROKDUR - Thomsea T2.docx', 'P145 - OIL SPILL SAIPEM COU'),
    ('RAMS - Lutte contre les pollutions d''hydrocarbures - GOURY - Thomsea T2.docx', 'P144 - GUARD VESSEL EMDT'),
    ('Induction Thomsea.docx', 'P144 - GUARD VESSEL EMDT; P145 - OIL SPILL SAIPEM COU'),
    ('Plan d''Intervention Maritime - PENLY.docx', 'P258 - DCB PENLY'),
    ('Gestion de Crise - Plan d''Urgence Compagnie - PENLY.docx', 'P258 - DCB PENLY'),
    ('Fiches Navires - PENLY.xlsx', 'P258 - DCB PENLY'),
    ('RAMS - Transbordement en mer (old).docx', 'P258 - DCB PENLY'),
    ('RAMS - Soutage en Mer (old).docx', 'P258 - DCB PENLY'),
    ('RAMS - Transbordement en mer.docx', 'P258 - DCB PENLY'),
    ('Soutage en mer.docx', 'P258 - DCB PENLY'),
    ('Approvisionnement, Avitaillement et Transferts vers la Jack-Up JB117.docx', 'P258 - DCB PENLY'),
    ('Plan de Contingence.docx', 'P258 - DCB PENLY'),
    ('PIM - Plan d''Intervention Maritime - PENLY.docx', 'P258 - DCB PENLY')
)
update public.procedures as procedure
set project_name = source_project.project_name
from source_project
where procedure.sharepoint_list_id = '958cf50b-779a-4002-811c-0ed8bb41f7b5'
  and regexp_replace(trim(procedure.source_file_name), '[[:space:]]+', ' ', 'g') = source_project.file_name
  and procedure.project_name is distinct from source_project.project_name;

update public.published_procedures
set project_name = null
where sharepoint_list_id = '1a9cd5f9-77a6-45fc-8705-d35005729774'
  and project_name is not null;

with published_project (file_name, project_name) as (
  values
    ('Consigne PUI - Tricastin.pdf', 'P231 - NETTOYAGE CHENAL CNPEF'),
    ('Fiche Recapitulative - PUITOX - CNPE.pdf', 'P231 - NETTOYAGE CHENAL CNPEF'),
    ('Document Unique Evaluation des Risques Professionnels - SUROIT.pdf', 'ETPO'),
    ('Procédure d''exécution de travaux - Nettoyage du Chenal – CNPE de Flamanville.pdf', 'P231 - NETTOYAGE CHENAL CNPEF'),
    ('Lutte contre les pollutions d’hydrocarbures - GOURY - THOMSEA T2.pdf', 'P144 - GUARD VESSEL EMDT'),
    ('Induction Thomsea.pdf', 'P144 - GUARD VESSEL EMDT; P145 - OIL SPILL SAIPEM COU'),
    ('Lutte contre les pollutions d’hydrocarbures - KROKDUR - THOMSEA T2.pdf', 'P145 - OIL SPILL SAIPEM COU')
)
update public.published_procedures as publication
set project_name = published_project.project_name
from published_project
where publication.sharepoint_list_id = '1a9cd5f9-77a6-45fc-8705-d35005729774'
  and regexp_replace(trim(publication.file_name), '[[:space:]]+', ' ', 'g') = published_project.file_name
  and publication.project_name is distinct from published_project.project_name;
