-- Restore the structured SharePoint project and vessel lookup values that were
-- omitted by the original QSMS document copy. Scope the correction to the two
-- historical libraries so SeaPilot-created records remain untouched.

with source_scope (sharepoint_item_id, project_name, vessel_name) as (
  values
    ('3', 'NOY', null),
    ('5', 'NOY', null),
    ('24', 'ETPO', 'SUROIT'),
    ('27', 'NORTEKMED', 'LE ROZEL'),
    ('36', 'P144', 'GOURY'),
    ('37', 'SINAY', 'KROKDUR'),
    ('39', null, 'GOURY'),
    ('40', null, 'LE ROZEL'),
    ('41', 'P144', 'GOURY'),
    ('42', null, 'Armement - Cherbourg'),
    ('56', 'FLA', 'LE ROZEL'),
    ('57', 'FLA', 'LE ROZEL'),
    ('59', 'FLA', null),
    ('60', 'FLA', null),
    ('61', 'RH', null),
    ('62', 'BBTM', null),
    ('66', null, 'GOURY'),
    ('67', null, 'LE ROZEL'),
    ('75', 'COU', 'LE ROZEL'),
    ('78', null, 'KROKDUR'),
    ('83', 'BBTM', 'HOLENN EUSA'),
    ('89', null, 'HOLENN EUSA'),
    ('91', null, 'HOLENN EUSA'),
    ('94', null, 'HOLENN EUSA'),
    ('96', null, 'HIRONDELLE DE LA MANCHE'),
    ('99', 'COU', 'KROKDUR'),
    ('100', null, 'KROKDUR'),
    ('101', null, 'KROKDUR'),
    ('108', null, 'HIRONDELLE DE LA MANCHE'),
    ('109', null, 'HIRONDELLE DE LA MANCHE'),
    ('114', null, 'YARD - Le Havre'),
    ('131', 'P254', 'LANDEMER'),
    ('136', null, 'LANDEMER'),
    ('137', null, 'LANDEMER'),
    ('138', null, 'LANDEMER'),
    ('142', 'NORTEKMED', 'LE ROZEL'),
    ('147', null, 'LANDEMER'),
    ('150', null, 'KROKDUR'),
    ('153', null, 'KROKDUR'),
    ('181', null, 'SUROIT')
)
update public.procedures as procedure
set project_name = source_scope.project_name,
    vessel_name = source_scope.vessel_name
from source_scope
where procedure.sharepoint_list_id = '958cf50b-779a-4002-811c-0ed8bb41f7b5'
  and procedure.sharepoint_item_id = source_scope.sharepoint_item_id
  and (procedure.project_name, procedure.vessel_name)
      is distinct from (source_scope.project_name, source_scope.vessel_name);

with published_scope (sharepoint_item_id, project_name, vessel_name) as (
  values
    ('25', 'FLA', null),
    ('26', 'FLA', null),
    ('31', 'P254', 'LANDEMER'),
    ('32', 'P144', 'GOURY'),
    ('35', null, 'KROKDUR'),
    ('36', null, 'HOLENN EUSA'),
    ('37', null, 'HOLENN EUSA'),
    ('38', null, 'HOLENN EUSA'),
    ('41', null, 'YARD - Le Havre'),
    ('51', null, 'GOURY'),
    ('52', null, 'HIRONDELLE DE LA MANCHE'),
    ('53', null, 'KROKDUR'),
    ('54', null, 'LANDEMER'),
    ('55', null, 'LE ROZEL'),
    ('72', 'BBTM', null),
    ('73', 'P144', 'GOURY'),
    ('74', 'ETPO', 'SUROIT'),
    ('75', null, 'Armement - Cherbourg'),
    ('77', 'FLA', 'LE ROZEL'),
    ('79', null, 'GOURY'),
    ('85', null, 'KROKDUR'),
    ('87', null, 'KROKDUR')
)
update public.published_procedures as publication
set project_name = published_scope.project_name,
    vessel_name = published_scope.vessel_name
from published_scope
where publication.sharepoint_list_id = '1a9cd5f9-77a6-45fc-8705-d35005729774'
  and publication.sharepoint_item_id = published_scope.sharepoint_item_id
  and (publication.project_name, publication.vessel_name)
      is distinct from (published_scope.project_name, published_scope.vessel_name);
