insert into public.fleet_certificates (
  company_id, vessel_id, vessel_name, category_key, category_label, document_title,
  title, status, expires_on, planned_on, alarm_on, provider_name, visit_location,
  renewal_notes, original_file_name, file_name, source_label, storage_bucket,
  storage_path, mime_type, file_size_bytes, sharepoint_site_url, sharepoint_list_id,
  sharepoint_list_title, sharepoint_file_ref, sharepoint_encoded_abs_url,
  sharepoint_drive_id, sharepoint_drive_item_id, source_created_at, source_modified_at,
  is_active_fleet, workflow_status
)
values
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'ECREHOUEL'),
      'ECREHOUEL',
      '01-registre-international-francais',
      '01 - Registre International Français',
      'Acte de Francisation',
      'Acte de Francisation',
      case
        when '2034-07-25'::date < current_date then 'expired'
        when '2034-07-25'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2034-07-25',
      null,
      '2034-04-25',
      'Registre International Français',
      null,
      null,
      'ECR - Acte de Francisation.pdf',
      'ECR - Acte de Francisation.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/ECR/legacy/001-ECR-Acte-de-Francisation.pdf',
      'application/pdf',
      229481,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/ECR - Acte de Francisation.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/ECR - Acte de Francisation.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHLZ4JIROKZDHBHZZSUDRDTELLEK',
      '2025-03-20T06:46:09Z',
      '2024-09-09T08:11:15Z',
      false,
      case
        when null::date is not null then 'planned'
        when '2034-07-25'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'GOURY'),
      'GOURY',
      '01-registre-international-francais',
      '01 - Registre International Français',
      'Acte de Francisation',
      'Acte de Francisation',
      case
        when null::date < current_date then 'expired'
        when null::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      null,
      null,
      null,
      'Registre International Français',
      null,
      null,
      'GRY - Acte de Francisation.pdf',
      'GRY - Acte de Francisation.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/GRY/legacy/002-GRY-Acte-de-Francisation.pdf',
      'application/pdf',
      631418,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/GRY - Acte de Francisation.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/GRY - Acte de Francisation.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHIDZZLKDCMV2NALAE376SR5KJKA',
      '2025-03-19T20:12:21Z',
      '2024-04-15T09:46:41Z',
      true,
      case
        when null::date is not null then 'planned'
        when null::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'GOURY'),
      'GOURY',
      '01-registre-international-francais',
      '01 - Registre International Français',
      'Permis d''Armement',
      'Permis d''Armement',
      case
        when null::date < current_date then 'expired'
        when null::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      null,
      null,
      null,
      'Registre International Français',
      null,
      null,
      'GRY - Permis d''Armement.pdf',
      'GRY - Permis d''Armement.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/GRY/legacy/003-GRY-Permis-d-Armement.pdf',
      'application/pdf',
      309280,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/GRY - Permis d''Armement.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/GRY - Permis d''Armement.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHLAZMD7IMWNZBDIXRDUTETXWARU',
      '2025-03-19T20:12:27Z',
      '2024-09-28T07:29:44Z',
      true,
      case
        when null::date is not null then 'planned'
        when null::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'GOURY'),
      'GOURY',
      '02-centre-de-securite-des-navires',
      '02 - Centre de Sécurité des Navires',
      'Permis de Navigation',
      'Permis de Navigation',
      case
        when '2027-05-29'::date < current_date then 'expired'
        when '2027-05-29'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2027-05-29',
      null,
      '2027-03-01',
      'CSN - LE HAVRE - Secrétariat',
      null,
      null,
      'GRY - Permis de Navigation.pdf',
      'GRY - Permis de Navigation.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/GRY/legacy/004-GRY-Permis-de-Navigation.pdf',
      'application/pdf',
      234021,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/GRY - Permis de Navigation.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/GRY - Permis de Navigation.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHLNIY53PN3XKJHIM54A4C4HD4KO',
      '2025-06-18T06:07:41Z',
      '2026-05-29T13:08:25Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2027-05-29'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'GOURY'),
      'GOURY',
      '03-societe-de-classification-dnv',
      '03 - Société de Classification - DNV',
      'Certificat de Franc-Bord',
      'Certificat de Franc-Bord',
      case
        when '2029-06-17'::date < current_date then 'expired'
        when '2029-06-17'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2029-06-17',
      '2026-05-19',
      '2029-03-17',
      'DNV France SARL',
      null,
      null,
      'GRY - Certificat de Franc-Bord.pdf',
      'GRY - Certificat de Franc-Bord.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/GRY/legacy/005-GRY-Certificat-de-Franc-Bord.pdf',
      'application/pdf',
      147776,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/GRY - Certificat de Franc-Bord.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/GRY - Certificat de Franc-Bord.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHNZ5YN6VHJ26JFKIX5IAGIYYNIY',
      '2025-03-19T20:12:21Z',
      '2026-04-05T21:36:04Z',
      true,
      case
        when '2026-05-19'::date is not null then 'planned'
        when '2029-06-17'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'GOURY'),
      'GOURY',
      '03-societe-de-classification-dnv',
      '03 - Société de Classification - DNV',
      'Certificat de Classification',
      'Certificat de Classification',
      case
        when '2027-05-19'::date < current_date then 'expired'
        when '2027-05-19'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2027-05-19',
      null,
      '2027-02-19',
      'DNV France SARL',
      null,
      null,
      'GRY - Certificat de Classification.pdf',
      'GRY - Certificat de Classification.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/GRY/legacy/006-GRY-Certificat-de-Classification.pdf',
      'application/pdf',
      180022,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/GRY - Certificat de Classification.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/GRY - Certificat de Classification.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHO2T2BHYCQT6RD2SH3HGWOE2QDQ',
      '2025-07-07T12:58:13Z',
      '2026-05-20T06:53:30Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2027-05-19'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'GOURY'),
      'GOURY',
      '03-societe-de-classification-dnv',
      '03 - Société de Classification - DNV',
      'Survey Statement - Certificat Classification - 2026',
      'Survey Statement - Certificat Classification - 2026',
      case
        when '2026-08-31'::date < current_date then 'expired'
        when '2026-08-31'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2026-08-31',
      null,
      '2026-05-31',
      'DNV France SARL',
      null,
      null,
      'GRY - Survey Statement - Certificat Classification - 2026.pdf',
      'GRY - Survey Statement - Certificat Classification - 2026.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/GRY/legacy/007-GRY-Survey-Statement-Certificat-Classification-2026.pdf',
      'application/pdf',
      312948,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/GRY - Survey Statement - Certificat Classification - 2026.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/GRY - Survey Statement - Certificat Classification - 2026.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHLBT7O2EZNBS5EICKD7EAQQZVRX',
      '2025-07-07T12:58:51Z',
      '2026-05-20T06:53:17Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2026-08-31'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'GOURY'),
      'GOURY',
      '04-assurance',
      '04 - Assurance',
      'GRY - Assurance P&I',
      'GRY - Assurance P&I',
      case
        when '2027-01-01'::date < current_date then 'expired'
        when '2027-01-01'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2027-01-01',
      null,
      '2026-10-01',
      'HOWDEN FRANCE SAS',
      null,
      null,
      'GRY - Assurance P&I.pdf',
      'GRY - Assurance P&I.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/GRY/legacy/008-GRY-Assurance-P-et-I.pdf',
      'application/pdf',
      68241,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/GRY - Assurance P&I.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/GRY - Assurance P&I.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHNSVXPITD23INEZSQVU5G5O75K4',
      '2026-03-18T12:46:57Z',
      '2026-03-26T21:57:32Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2027-01-01'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'GOURY'),
      'GOURY',
      '04-assurance',
      '04 - Assurance',
      'H&M',
      'H&M',
      case
        when null::date < current_date then 'expired'
        when null::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      null,
      null,
      null,
      null,
      null,
      null,
      'GRY - H&M.pdf',
      'GRY - H&M.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/GRY/legacy/009-GRY-H-et-M.pdf',
      'application/pdf',
      189908,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/GRY - H&M.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/GRY - H&M.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHKIT6BHUPEBSZG3HELGR6FDGKES',
      '2026-03-26T21:00:51Z',
      '2025-12-26T08:12:05Z',
      true,
      case
        when null::date is not null then 'planned'
        when null::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'GOURY'),
      'GOURY',
      '05-safety-plan',
      '05 - Safety Plan',
      'Safety Plan',
      'Safety Plan',
      case
        when null::date < current_date then 'expired'
        when null::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      null,
      null,
      null,
      null,
      null,
      null,
      'GRY - Safety Plan.pdf',
      'GRY - Safety Plan.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/GRY/legacy/010-GRY-Safety-Plan.pdf',
      'application/pdf',
      1561255,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/GRY - Safety Plan.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/GRY - Safety Plan.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHI6J5ZAZIBZD5ALZDZVWLNZVCS4',
      '2025-03-19T20:12:22Z',
      '2024-06-16T14:50:43Z',
      true,
      case
        when null::date is not null then 'planned'
        when null::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'GOURY'),
      'GOURY',
      '06-incendie',
      '06 - Incendie',
      'Certificat Visite ARI & Combinaison Immersion',
      'Certificat Visite ARI & Combinaison Immersion',
      case
        when '2026-06-03'::date < current_date then 'expired'
        when '2026-06-03'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2026-06-03',
      '2026-05-05',
      '2026-03-03',
      'SERVAUX - LE HAVRE - Radeaux',
      null,
      null,
      'GRY - Certificat Visite ARI & Combinaison Immersion.pdf',
      'GRY - Certificat Visite ARI & Combinaison Immersion.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/GRY/legacy/011-GRY-Certificat-Visite-ARI-et-Combinaison-Immersion.pdf',
      'application/pdf',
      176781,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/GRY - Certificat Visite ARI & Combinaison Immersion.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/GRY - Certificat Visite ARI & Combinaison Immersion.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHMKT5XEGET5V5ALLUH5NJ6ZHQOM',
      '2025-06-18T06:07:42Z',
      '2025-06-18T06:00:13Z',
      true,
      case
        when '2026-05-05'::date is not null then 'planned'
        when '2026-06-03'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'GOURY'),
      'GOURY',
      '06-incendie',
      '06 - Incendie',
      'Visite Extinction Fixe - 2026',
      'Visite Extinction Fixe - 2026',
      case
        when '2027-05-05'::date < current_date then 'expired'
        when '2027-05-05'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2027-05-05',
      null,
      '2027-02-05',
      'SERVAUX - LE HAVRE - Incendie - MOU',
      null,
      null,
      'GRY - Visite Extinction Fixe - 2026.pdf',
      'GRY - Visite Extinction Fixe - 2026.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/GRY/legacy/012-GRY-Visite-Extinction-Fixe-2026.pdf',
      'application/pdf',
      187865,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/GRY - Visite Extinction Fixe - 2026.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/GRY - Visite Extinction Fixe - 2026.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHNENUVJTXJ64FGIE4BB6XJYBDJX',
      '2026-05-11T12:37:26Z',
      '2026-05-06T12:20:24Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2027-05-05'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'GOURY'),
      'GOURY',
      '06-incendie',
      '06 - Incendie',
      'Visite Extinction Portatif - 2026',
      'Visite Extinction Portatif - 2026',
      case
        when '2027-05-05'::date < current_date then 'expired'
        when '2027-05-05'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2027-05-05',
      null,
      '2027-02-05',
      'SERVAUX - LE HAVRE - Incendie - MOU',
      null,
      null,
      'GRY - Visite Extinction Portatif - 2026.pdf',
      'GRY - Visite Extinction Portatif - 2026.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/GRY/legacy/013-GRY-Visite-Extinction-Portatif-2026.pdf',
      'application/pdf',
      155397,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/GRY - Visite Extinction Portatif - 2026.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/GRY - Visite Extinction Portatif - 2026.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHKNEWFYFTHPJVB2A52P3CNU5C7H',
      '2026-05-11T12:37:33Z',
      '2026-05-06T12:20:02Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2027-05-05'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'GOURY'),
      'GOURY',
      '07-lsa',
      '07 - LSA',
      'Certificat VFI - challenger 300N',
      'Certificat VFI - challenger 300N',
      case
        when '2027-04-16'::date < current_date then 'expired'
        when '2027-04-16'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2027-04-16',
      null,
      '2027-01-16',
      'SERVAUX - LE HAVRE - Incendie - XLE',
      null,
      null,
      'GRY - Certificat VFI - challenger 300N.pdf',
      'GRY - Certificat VFI - challenger 300N.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/GRY/legacy/014-GRY-Certificat-VFI-challenger-300N.pdf',
      'application/pdf',
      577788,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/GRY - Certificat VFI - challenger 300N.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/GRY - Certificat VFI - challenger 300N.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHLK4BC5FW6TFNFZXW2YNUKVAZNT',
      '2026-04-22T07:01:09Z',
      '2026-05-11T12:43:35Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2027-04-16'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'GOURY'),
      'GOURY',
      '07-lsa',
      '07 - LSA',
      'Visite Radeau XDC8GF84G818 - 2026',
      'Visite Radeau XDC8GF84G818 - 2026',
      case
        when '2027-04-11'::date < current_date then 'expired'
        when '2027-04-11'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2027-04-11',
      null,
      '2027-01-11',
      'SERVAUX - LE HAVRE - Radeaux',
      null,
      null,
      'GRY - Visite Radeau XDC8GF84G818 - 2026.pdf',
      'GRY - Visite Radeau XDC8GF84G818 - 2026.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/GRY/legacy/015-GRY-Visite-Radeau-XDC8GF84G818-2026.pdf',
      'application/pdf',
      756671,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/GRY - Visite Radeau XDC8GF84G818 - 2026.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/GRY - Visite Radeau XDC8GF84G818 - 2026.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHPU6Q5TYTR7ERCYIZZP4O42U2BG',
      '2026-05-11T12:42:02Z',
      '2026-04-11T08:24:17Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2027-04-11'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'GOURY'),
      'GOURY',
      '07-lsa',
      '07 - LSA',
      'Visite Radeau XDC8GF85G818 - 2026',
      'Visite Radeau XDC8GF85G818 - 2026',
      case
        when '2027-04-22'::date < current_date then 'expired'
        when '2027-04-22'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2027-04-22',
      null,
      '2027-01-22',
      'SERVAUX - LE HAVRE - Radeaux',
      null,
      null,
      'GRY - Visite Radeau XDC8GF85G818 - 2026.pdf',
      'GRY - Visite Radeau XDC8GF85G818 - 2026.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/GRY/legacy/016-GRY-Visite-Radeau-XDC8GF85G818-2026.pdf',
      'application/pdf',
      754724,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/GRY - Visite Radeau XDC8GF85G818 - 2026.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/GRY - Visite Radeau XDC8GF85G818 - 2026.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHPAXBSNI2FJUJAL2NRUO5MTBNIW',
      '2026-05-11T12:42:02Z',
      '2026-04-22T12:32:17Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2027-04-22'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'GOURY'),
      'GOURY',
      '08-grue-et-bossoir',
      '08 - Grue & Bossoir',
      'Load Test - 06-2024',
      'Load Test - 06-2024',
      case
        when '2029-06-04'::date < current_date then 'expired'
        when '2029-06-04'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2029-06-04',
      null,
      '2029-03-04',
      'MACOR LSA SERVICE - Le Havre Agency',
      null,
      null,
      'GRY - Load Test - 06-2024.pdf',
      'GRY - Load Test - 06-2024.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/GRY/legacy/017-GRY-Load-Test-06-2024.pdf',
      'application/pdf',
      791485,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/GRY - Load Test - 06-2024.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/GRY - Load Test - 06-2024.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHKF2H2OU3SEGVAJVARDGS6SMAEI',
      '2025-03-19T20:12:25Z',
      '2026-04-05T21:37:38Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2029-06-04'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'GOURY'),
      'GOURY',
      '08-grue-et-bossoir',
      '08 - Grue & Bossoir',
      ' Certificat Visite Bossoir - FERRI S1872 - 2026',
      ' Certificat Visite Bossoir - FERRI S1872 - 2026',
      case
        when '2027-05-05'::date < current_date then 'expired'
        when '2027-05-05'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2027-05-05',
      null,
      '2027-02-05',
      'MACOR LSA SERVICE - Le Havre Agency',
      'Dieppe - Quai du Maroc',
      null,
      'GRY -  Certificat Visite Bossoir - FERRI S1872 - 2026.pdf',
      'GRY -  Certificat Visite Bossoir - FERRI S1872 - 2026.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/GRY/legacy/018-GRY-Certificat-Visite-Bossoir-FERRI-S1872-2026.pdf',
      'application/pdf',
      2481365,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/GRY -  Certificat Visite Bossoir - FERRI S1872 - 2026.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/GRY -  Certificat Visite Bossoir - FERRI S1872 - 2026.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHKO5ODAC4JBAFDISOTFRW4GAYEX',
      '2025-12-04T08:55:53Z',
      '2026-05-11T12:59:58Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2027-05-05'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'GOURY'),
      'GOURY',
      '08-grue-et-bossoir',
      '08 - Grue & Bossoir',
      'Registre des Apparaux de Levage - 2026',
      'Registre des Apparaux de Levage - 2026',
      case
        when '2027-03-24'::date < current_date then 'expired'
        when '2027-03-24'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2027-03-24',
      null,
      '2026-12-24',
      'BBTM',
      null,
      null,
      'GRY - Registre des Apparaux de Levage - 2026.pdf',
      'GRY - Registre des Apparaux de Levage - 2026.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/GRY/legacy/019-GRY-Registre-des-Apparaux-de-Levage-2026.pdf',
      'application/pdf',
      570425,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/GRY - Registre des Apparaux de Levage - 2026.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/GRY - Registre des Apparaux de Levage - 2026.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHLI4A274M4FUFDYCY535QMZZU47',
      '2026-03-29T00:09:12Z',
      '2026-03-27T08:33:09Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2027-03-24'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'GOURY'),
      'GOURY',
      '08-grue-et-bossoir',
      '08 - Grue & Bossoir',
      'Certificat Visite Grue - GUERRA 225010 - 2026',
      'Certificat Visite Grue - GUERRA 225010 - 2026',
      case
        when '2027-05-05'::date < current_date then 'expired'
        when '2027-05-05'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2027-05-05',
      null,
      '2027-02-05',
      'MACOR LSA SERVICE - Le Havre Agency',
      null,
      null,
      'GRY - Certificat Visite Grue - GUERRA 225010 - 2026.PDF',
      'GRY - Certificat Visite Grue - GUERRA 225010 - 2026.PDF',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/GRY/legacy/020-GRY-Certificat-Visite-Grue-GUERRA-225010-2026.PDF',
      'application/pdf',
      1986476,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/GRY - Certificat Visite Grue - GUERRA 225010 - 2026.PDF',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/GRY - Certificat Visite Grue - GUERRA 225010 - 2026.PDF?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHIK2UC3XQFJDZDIWNGZD2YIUQXT',
      '2026-05-11T12:19:05Z',
      '2026-05-11T13:06:43Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2027-05-05'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'GOURY'),
      'GOURY',
      '08-grue-et-bossoir',
      '08 - Grue & Bossoir',
      'Certificat coupee GOURY',
      'Certificat coupee GOURY',
      case
        when '2027-06-28'::date < current_date then 'expired'
        when '2027-06-28'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2027-06-28',
      null,
      '2027-03-28',
      'MACOR LSA SERVICE - Le Havre Agency',
      null,
      null,
      'GRY - Certificat coupee GOURY - 2027.pdf',
      'GRY - Certificat coupee GOURY - 2027.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/GRY/legacy/021-GRY-Certificat-coupee-GOURY-2027.pdf',
      'application/pdf',
      700583,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/GRY - Certificat coupee GOURY - 2027.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/GRY - Certificat coupee GOURY - 2027.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHKRBGUGQP7GX5FZQCENP2ZE3ZXL',
      '2026-07-31T11:11:48Z',
      '2026-07-31T10:23:34Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2027-06-28'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'GOURY'),
      'GOURY',
      '09-anfr',
      '09 - ANFR',
      'Licence Radio',
      'Licence Radio',
      case
        when '2026-12-31'::date < current_date then 'expired'
        when '2026-12-31'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2026-12-31',
      null,
      '2026-10-01',
      'Agence Nationale des Fréquences (ANFR)',
      null,
      null,
      'GRY - Licence Radio.pdf',
      'GRY - Licence Radio.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/GRY/legacy/022-GRY-Licence-Radio.pdf',
      'application/pdf',
      143587,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/GRY - Licence Radio.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/GRY - Licence Radio.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHIP37KSZ2ES4BEY7OZ5GZ4FQ6F7',
      '2025-12-08T15:04:44Z',
      '2025-12-08T08:18:42Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2026-12-31'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'GOURY'),
      'GOURY',
      '09-anfr',
      '09 - ANFR',
      'Rapport Visite Radio',
      'Rapport Visite Radio',
      case
        when '2027-05-19'::date < current_date then 'expired'
        when '2027-05-19'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2027-05-19',
      null,
      '2027-02-19',
      'Agence Nationale des Fréquences (ANFR)',
      null,
      '5 Remarques',
      'GRY - Rapport Visite Radio.pdf',
      'GRY - Rapport Visite Radio.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/GRY/legacy/023-GRY-Rapport-Visite-Radio.pdf',
      'application/pdf',
      1226993,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/GRY - Rapport Visite Radio.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/GRY - Rapport Visite Radio.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHIE6O7Q7IUIKFCIAVRVZPGTY4W6',
      '2026-03-26T23:31:09Z',
      '2026-05-26T13:17:54Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2027-05-19'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'GOURY'),
      'GOURY',
      '10-dotation-medicale',
      '10 - Dotation Médicale',
      'Attestation Pharmacie Dotation Médicale',
      'Attestation Pharmacie Dotation Médicale',
      case
        when '2027-03-25'::date < current_date then 'expired'
        when '2027-03-25'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2027-03-25',
      null,
      '2026-12-25',
      'Pharmacie du Pollet',
      null,
      null,
      'GRY - Attestation Pharmacie Dotation Médicale.pdf',
      'GRY - Attestation Pharmacie Dotation Médicale.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/GRY/legacy/024-GRY-Attestation-Pharmacie-Dotation-Medicale.pdf',
      'application/pdf',
      181357,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/GRY - Attestation Pharmacie Dotation Médicale.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/GRY - Attestation Pharmacie Dotation Médicale.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHLM5LEH3QOLGRCYF5RYJLED53BK',
      '2026-03-26T15:54:39Z',
      '2026-04-05T21:37:38Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2027-03-25'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'GOURY'),
      'GOURY',
      '11-analyse-eau',
      '11 - Analyse Eau',
      'Analyse Eau - D1',
      'Analyse Eau - D1',
      case
        when '2026-04-07'::date < current_date then 'expired'
        when '2026-04-07'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2026-04-07',
      '2026-04-07',
      '2026-01-07',
      'AgroQual',
      null,
      'Tous les 6 mois',
      'GRY - Analyse Eau - D1.pdf',
      'GRY - Analyse Eau - D1.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/GRY/legacy/025-GRY-Analyse-Eau-D1.pdf',
      'application/pdf',
      15385,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/GRY - Analyse Eau - D1.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/GRY - Analyse Eau - D1.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHPNAZLNJCA6WRFYBXG7AZ7YXWOM',
      '2026-03-18T09:48:57Z',
      '2026-03-18T09:48:28Z',
      true,
      case
        when '2026-04-07'::date is not null then 'planned'
        when '2026-04-07'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'GOURY'),
      'GOURY',
      '11-analyse-eau',
      '11 - Analyse Eau',
      'Analyse Eau - D2',
      'Analyse Eau - D2',
      case
        when '2026-04-07'::date < current_date then 'expired'
        when '2026-04-07'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2026-04-07',
      null,
      '2026-01-07',
      'AgroQual',
      null,
      'Tous les 5 ans',
      'GRY - Analyse Eau - D2.pdf',
      'GRY - Analyse Eau - D2.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/GRY/legacy/026-GRY-Analyse-Eau-D2.pdf',
      'application/pdf',
      15385,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/GRY - Analyse Eau - D2.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/GRY - Analyse Eau - D2.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHOGLULSQ7UZ6FDZ35MPVCBQCI44',
      '2026-03-29T00:01:09Z',
      '2026-03-18T09:48:28Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2026-04-07'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'GOURY'),
      'GOURY',
      '11-analyse-eau',
      '11 - Analyse Eau',
      'Analyse Eau - Legionelle - 2026',
      'Analyse Eau - Legionelle - 2026',
      case
        when '2027-04-07'::date < current_date then 'expired'
        when '2027-04-07'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2027-04-07',
      null,
      '2027-01-07',
      'AgroQual',
      null,
      'Legionella non détectées.

Périodicité 1 fois / an : Arrêté du 1er février 2010 relatif à la surveillance des légionelles dans les installations de production, de stockage et de distribution d''eau chaude sanitaire.
NOR : SASP1002960A
',
      'GOURY - Analyse Eau - Legionelle - 2026.pdf',
      'GOURY - Analyse Eau - Legionelle - 2026.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/GRY/legacy/027-GOURY-Analyse-Eau-Legionelle-2026.pdf',
      'application/pdf',
      211418,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/GOURY - Analyse Eau - Legionelle - 2026.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/GOURY - Analyse Eau - Legionelle - 2026.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHL6TNOGWIPXORHKKS4YQZCMS5KO',
      '2026-04-22T07:05:44Z',
      '2026-04-20T16:18:43Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2027-04-07'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'GOURY'),
      'GOURY',
      '12-dossier-de-stabilite',
      '12 - Dossier de Stabilité',
      'Dossier de Stabilité',
      'Dossier de Stabilité',
      case
        when null::date < current_date then 'expired'
        when null::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      null,
      null,
      null,
      'COPREXMA',
      null,
      null,
      'GRY - Dossier de Stabilité.pdf',
      'GRY - Dossier de Stabilité.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/GRY/legacy/028-GRY-Dossier-de-Stabilite.pdf',
      'application/pdf',
      3662674,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/GRY - Dossier de Stabilité.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/GRY - Dossier de Stabilité.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHL4PWCFGLE3VFHYXYASE7VHVDWS',
      '2025-03-19T20:12:22Z',
      '2018-05-11T11:26:46Z',
      true,
      case
        when null::date is not null then 'planned'
        when null::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'GOURY'),
      'GOURY',
      '13-amiante',
      '13 - Amiante',
      'Certificat Amiante',
      'Certificat Amiante',
      case
        when null::date < current_date then 'expired'
        when null::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      null,
      null,
      null,
      null,
      null,
      null,
      'GRY - Certificat Amiante.pdf',
      'GRY - Certificat Amiante.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/GRY/legacy/029-GRY-Certificat-Amiante.pdf',
      'application/pdf',
      139992,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/GRY - Certificat Amiante.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/GRY - Certificat Amiante.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHJVLZZNGIKKDVE3XHXRJT7BWUQT',
      '2025-03-19T20:12:20Z',
      '2018-03-23T17:46:46Z',
      true,
      case
        when null::date is not null then 'planned'
        when null::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'GOURY'),
      'GOURY',
      '14-ecmid',
      '14 - eCMID',
      'eCMID',
      'eCMID',
      case
        when '2027-05-26'::date < current_date then 'expired'
        when '2027-05-26'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2027-05-26',
      null,
      '2027-02-26',
      'RICHARD MARINE CONSULTING',
      'Dieppe - Quai du Maroc',
      null,
      'GRY - eCMID.pdf',
      'GRY - eCMID.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/GRY/legacy/030-GRY-eCMID.pdf',
      'application/pdf',
      679501,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/GRY - eCMID.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/GRY - eCMID.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHO23KUTT7CSPRG2NYD43KW2PUYA',
      '2025-06-11T08:42:15Z',
      '2026-05-28T07:26:39Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2027-05-26'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'HIRONDELLE DE LA MANCHE'),
      'HIRONDELLE DE LA MANCHE',
      '01-registre-international-francais',
      '01 - Registre International Français',
      'Acte de Francisation',
      'Acte de Francisation',
      case
        when null::date < current_date then 'expired'
        when null::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      null,
      null,
      null,
      'Registre International Français',
      null,
      null,
      'HRI - Acte de Francisation.pdf',
      'HRI - Acte de Francisation.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/HIR/legacy/031-HRI-Acte-de-Francisation.pdf',
      'application/pdf',
      102672,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/HRI - Acte de Francisation.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/HRI - Acte de Francisation.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHNAS2ON5V57KZALG46RPLANBRHM',
      '2025-03-20T06:45:12Z',
      '2025-02-01T08:45:12Z',
      true,
      case
        when null::date is not null then 'planned'
        when null::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'HIRONDELLE DE LA MANCHE'),
      'HIRONDELLE DE LA MANCHE',
      '01-registre-international-francais',
      '01 - Registre International Français',
      'Permis d''Armement',
      'Permis d''Armement',
      case
        when null::date < current_date then 'expired'
        when null::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      null,
      null,
      null,
      'Registre International Français',
      null,
      null,
      'HRI - Permis d''Armement.pdf',
      'HRI - Permis d''Armement.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/HIR/legacy/032-HRI-Permis-d-Armement.pdf',
      'application/pdf',
      2349593,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/HRI - Permis d''Armement.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/HRI - Permis d''Armement.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHMASOK4UNS23RH2CM74KYFTD7PL',
      '2025-03-20T06:45:12Z',
      '2025-01-13T16:55:16Z',
      true,
      case
        when null::date is not null then 'planned'
        when null::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'HIRONDELLE DE LA MANCHE'),
      'HIRONDELLE DE LA MANCHE',
      '02-centre-de-securite-des-navires',
      '02 - Centre de Sécurité des Navires',
      'Rapport de visite - Hirondelle de la Manche - 2026',
      'Rapport de visite - Hirondelle de la Manche - 2026',
      case
        when null::date < current_date then 'expired'
        when null::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      null,
      null,
      null,
      'CSN - LE HAVRE - Secrétariat',
      null,
      null,
      'Visite Périodique - Hirondelle de la Manche - 11 02 2026.pdf',
      'Visite Périodique - Hirondelle de la Manche - 11 02 2026.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/HIR/legacy/033-Visite-Periodique-Hirondelle-de-la-Manche-11-02-2026.pdf',
      'application/pdf',
      52439,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/Visite Périodique - Hirondelle de la Manche - 11 02 2026.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/Visite Périodique - Hirondelle de la Manche - 11 02 2026.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHO3IL7L234KLFDZFEXTFJBY3QW4',
      '2026-03-09T08:04:22Z',
      '2026-02-12T13:17:41Z',
      true,
      case
        when null::date is not null then 'planned'
        when null::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'HIRONDELLE DE LA MANCHE'),
      'HIRONDELLE DE LA MANCHE',
      '02-centre-de-securite-des-navires',
      '02 - Centre de Sécurité des Navires',
      'Permis de Navigation - 2027',
      'Permis de Navigation - 2027',
      case
        when '2027-02-11'::date < current_date then 'expired'
        when '2027-02-11'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2027-02-11',
      null,
      '2026-11-11',
      'CSN - LE HAVRE - Secrétariat',
      null,
      null,
      'HRI - Permis de Navigation - 2027.pdf',
      'HRI - Permis de Navigation - 2027.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/HIR/legacy/034-HRI-Permis-de-Navigation-2027.pdf',
      'application/pdf',
      234478,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/HRI - Permis de Navigation - 2027.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/HRI - Permis de Navigation - 2027.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHPIALYWYOFJTVAKB6QUAATNGUQ3',
      '2026-06-25T11:31:59Z',
      '2026-06-25T10:14:54Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2027-02-11'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'HIRONDELLE DE LA MANCHE'),
      'HIRONDELLE DE LA MANCHE',
      '04-assurance',
      '04 - Assurance',
      'P&I HIRONDELLE',
      'P&I HIRONDELLE',
      case
        when '2027-01-01'::date < current_date then 'expired'
        when '2027-01-01'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2027-01-01',
      null,
      '2026-10-01',
      'HOWDEN FRANCE SAS',
      null,
      null,
      'HIR - P&I HIRONDELLE.pdf',
      'HIR - P&I HIRONDELLE.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/HIR/legacy/035-HIR-P-et-I-HIRONDELLE.pdf',
      'application/pdf',
      64126,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/HIR - P&I HIRONDELLE.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/HIR - P&I HIRONDELLE.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHMUTLS7LA6ZOVE3WYNYIC2UZ5UV',
      '2026-03-18T12:46:57Z',
      '2026-04-05T21:38:11Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2027-01-01'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'HIRONDELLE DE LA MANCHE'),
      'HIRONDELLE DE LA MANCHE',
      '06-incendie',
      '06 - Incendie',
      'Extincteurs AB',
      'Extincteurs AB',
      case
        when '2027-03-01'::date < current_date then 'expired'
        when '2027-03-01'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2027-03-01',
      null,
      '2026-12-01',
      'SERVAUX - LE HAVRE - Incendie - XLE',
      null,
      null,
      'HIR - Extincteurs AB.pdf',
      'HIR - Extincteurs AB.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/HIR/legacy/036-HIR-Extincteurs-AB.pdf',
      'application/pdf',
      175405,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/HIR - Extincteurs AB.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/HIR - Extincteurs AB.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHLJTUBUHO4UKFBZK7OGSDBR375R',
      '2026-03-26T16:20:28Z',
      '2021-12-09T08:24:33Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2027-03-01'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'HIRONDELLE DE LA MANCHE'),
      'HIRONDELLE DE LA MANCHE',
      '06-incendie',
      '06 - Incendie',
      'Extincteurs ABC',
      'Extincteurs ABC',
      case
        when '2027-03-01'::date < current_date then 'expired'
        when '2027-03-01'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2027-03-01',
      null,
      '2026-12-01',
      'SERVAUX - LE HAVRE - Incendie - XLE',
      null,
      null,
      'HIR - Extincteurs ABC.pdf',
      'HIR - Extincteurs ABC.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/HIR/legacy/037-HIR-Extincteurs-ABC.pdf',
      'application/pdf',
      294685,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/HIR - Extincteurs ABC.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/HIR - Extincteurs ABC.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHL4QGEKA5WNPBELP53DRLAPKBJM',
      '2026-03-26T16:20:29Z',
      '2020-12-10T15:43:09Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2027-03-01'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'HIRONDELLE DE LA MANCHE'),
      'HIRONDELLE DE LA MANCHE',
      '07-lsa',
      '07 - LSA',
      'Radeaux de sauvetage',
      'Radeaux de sauvetage',
      case
        when '2027-06-11'::date < current_date then 'expired'
        when '2027-06-11'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2027-06-11',
      null,
      '2027-03-11',
      'Nautic Service Sauvetage',
      null,
      null,
      'HRI - Radeaux de sauvetage - 2026.png',
      'HRI - Radeaux de sauvetage - 2026.png',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/HIR/legacy/038-HRI-Radeaux-de-sauvetage-2026.png',
      'image/png',
      1078853,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/HRI - Radeaux de sauvetage - 2026.png',
      null,
      null,
      null,
      null,
      null,
      true,
      case
        when null::date is not null then 'planned'
        when '2027-06-11'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'HIRONDELLE DE LA MANCHE'),
      'HIRONDELLE DE LA MANCHE',
      '09-anfr',
      '09 - ANFR',
      'Rapport Visite Radio',
      'Rapport Visite Radio',
      case
        when null::date < current_date then 'expired'
        when null::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      null,
      null,
      null,
      null,
      null,
      null,
      'HRI - Rapport Visite Radio.pdf',
      'HRI - Rapport Visite Radio.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/HIR/legacy/039-HRI-Rapport-Visite-Radio.pdf',
      'application/pdf',
      121827,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/HRI - Rapport Visite Radio.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/HRI - Rapport Visite Radio.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHJGXTW3IMNXJBG3MJSFXY7FUQDQ',
      '2025-03-20T06:45:13Z',
      '2025-03-06T15:26:47Z',
      true,
      case
        when null::date is not null then 'planned'
        when null::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'HIRONDELLE DE LA MANCHE'),
      'HIRONDELLE DE LA MANCHE',
      '09-anfr',
      '09 - ANFR',
      'Licence Radio',
      'Licence Radio',
      case
        when '2026-12-31'::date < current_date then 'expired'
        when '2026-12-31'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2026-12-31',
      null,
      '2026-10-01',
      'Agence Nationale des Fréquences (ANFR)',
      null,
      null,
      'HIR - Licence Radio.pdf',
      'HIR - Licence Radio.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/HIR/legacy/040-HIR-Licence-Radio.pdf',
      'application/pdf',
      143065,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/HIR - Licence Radio.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/HIR - Licence Radio.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHPPMI4VKM6N3ZFYJ6UYDOPU4MLT',
      '2025-12-08T15:04:45Z',
      '2025-12-08T08:19:18Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2026-12-31'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'HIRONDELLE DE LA MANCHE'),
      'HIRONDELLE DE LA MANCHE',
      '10-dotation-medicale',
      '10 - Dotation Médicale',
      'REGISTRE DES EQUIPEMENTS DE SECURITE - HIRONDELLE',
      'REGISTRE DES EQUIPEMENTS DE SECURITE - HIRONDELLE',
      case
        when null::date < current_date then 'expired'
        when null::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      null,
      null,
      null,
      null,
      null,
      null,
      'CX-7-HRI - REGISTRE DES EQUIPEMENTS DE SECURITE - HIRONDELLE.xlsx',
      'CX-7-HRI - REGISTRE DES EQUIPEMENTS DE SECURITE - HIRONDELLE.xlsx',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/HIR/legacy/041-CX-7-HRI-REGISTRE-DES-EQUIPEMENTS-DE-SECURITE-HIRONDELLE.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      40354,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/CX-7-HRI - REGISTRE DES EQUIPEMENTS DE SECURITE - HIRONDELLE.xlsx',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/CX-7-HRI - REGISTRE DES EQUIPEMENTS DE SECURITE - HIRONDELLE.xlsx?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHMJVX4PZU4SBJE3EOVGXWLYMST6',
      '2025-03-20T06:45:14Z',
      '2025-12-03T10:37:36Z',
      true,
      case
        when null::date is not null then 'planned'
        when null::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'HIRONDELLE DE LA MANCHE'),
      'HIRONDELLE DE LA MANCHE',
      '14-ecmid',
      '14 - eCMID',
      'eCMID - 2026',
      'eCMID - 2026',
      case
        when '2027-03-26'::date < current_date then 'expired'
        when '2027-03-26'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2027-03-26',
      null,
      '2026-12-26',
      'RICHARD MARINE CONSULTING',
      null,
      null,
      'HRI - eCMID - 2026.pdf',
      'HRI - eCMID - 2026.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/HIR/legacy/042-HRI-eCMID-2026.pdf',
      'application/pdf',
      669486,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/HRI - eCMID - 2026.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/HRI - eCMID - 2026.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHIOJKMVCMSIP5F24MCREVDAEWWR',
      '2026-03-31T08:33:58Z',
      '2026-04-05T21:38:42Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2027-03-26'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'HOLENN EUSA'),
      'HOLENN EUSA',
      '01-registre-international-francais',
      '01 - Registre International Français',
      'Acte de Francisation',
      'Acte de Francisation',
      case
        when null::date < current_date then 'expired'
        when null::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      null,
      null,
      null,
      'Registre International Français',
      null,
      null,
      'HE - Acte de Francisation.pdf',
      'HE - Acte de Francisation.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/HE/legacy/043-HE-Acte-de-Francisation.pdf',
      'application/pdf',
      141086,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/HE - Acte de Francisation.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/HE - Acte de Francisation.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHJQONQE552STVBYD35MXDEWGY2H',
      '2025-03-20T06:45:10Z',
      '2023-12-13T09:45:04Z',
      true,
      case
        when null::date is not null then 'planned'
        when null::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'HOLENN EUSA'),
      'HOLENN EUSA',
      '01-registre-international-francais',
      '01 - Registre International Français',
      'Permis d''Armement',
      'Permis d''Armement',
      case
        when null::date < current_date then 'expired'
        when null::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      null,
      null,
      null,
      'Registre International Français',
      null,
      null,
      'HE - Permis d''Armement.pdf',
      'HE - Permis d''Armement.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/HE/legacy/044-HE-Permis-d-Armement.pdf',
      'application/pdf',
      2272161,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/HE - Permis d''Armement.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/HE - Permis d''Armement.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHIJAOTR2YK4OFFI2WKWHCZSEK32',
      '2025-03-20T06:45:12Z',
      '2024-11-27T10:55:27Z',
      true,
      case
        when null::date is not null then 'planned'
        when null::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'HOLENN EUSA'),
      'HOLENN EUSA',
      '02-centre-de-securite-des-navires',
      '02 - Centre de Sécurité des Navires',
      'Permis de Navigation',
      'Permis de Navigation',
      case
        when null::date < current_date then 'expired'
        when null::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      null,
      null,
      null,
      null,
      null,
      null,
      'HE - Permis de Navigation.pdf',
      'HE - Permis de Navigation.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/HE/legacy/045-HE-Permis-de-Navigation.pdf',
      'application/pdf',
      234218,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/HE - Permis de Navigation.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/HE - Permis de Navigation.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHIEBKPEM6TEXJG2FXZU64Y52KJG',
      '2025-03-20T06:45:11Z',
      '2022-05-06T14:14:26Z',
      true,
      case
        when null::date is not null then 'planned'
        when null::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'HOLENN EUSA'),
      'HOLENN EUSA',
      '04-assurance',
      '04 - Assurance',
      'Assurance P&I',
      'Assurance P&I',
      case
        when '2027-01-01'::date < current_date then 'expired'
        when '2027-01-01'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2027-01-01',
      null,
      '2026-10-01',
      'HOWDEN FRANCE SAS',
      null,
      null,
      'HE - Assurance P&I.pdf',
      'HE - Assurance P&I.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/HE/legacy/046-HE-Assurance-P-et-I.pdf',
      'application/pdf',
      63609,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/HE - Assurance P&I.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/HE - Assurance P&I.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHJ7DYTXCFGZAVBLWDH3O3B3WCDC',
      '2026-03-18T12:46:57Z',
      '2026-04-05T21:42:36Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2027-01-01'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'HOLENN EUSA'),
      'HOLENN EUSA',
      '06-incendie',
      '06 - Incendie',
      'Visite Extinction Fixe & Portatif',
      'Visite Extinction Fixe & Portatif',
      case
        when null::date < current_date then 'expired'
        when null::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      null,
      null,
      null,
      null,
      null,
      null,
      'HE - Visite Extinction Fixe & Portatif.pdf',
      'HE - Visite Extinction Fixe & Portatif.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/HE/legacy/047-HE-Visite-Extinction-Fixe-et-Portatif.pdf',
      'application/pdf',
      2263835,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/HE - Visite Extinction Fixe & Portatif.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/HE - Visite Extinction Fixe & Portatif.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHLFIGQ4ITPBPBB2DZCXTE6L64SH',
      '2025-03-20T06:45:10Z',
      '2024-02-29T18:41:10Z',
      true,
      case
        when null::date is not null then 'planned'
        when null::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'HOLENN EUSA'),
      'HOLENN EUSA',
      '06-incendie',
      '06 - Incendie',
      'Certificat extincteurs 2026',
      'Certificat extincteurs 2026',
      case
        when '2027-07-31'::date < current_date then 'expired'
        when '2027-07-31'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2027-07-31',
      null,
      '2027-05-01',
      'SERVAUX - LE HAVRE - Incendie - XLE',
      null,
      null,
      'HE - Certificat extincteurs 2026 - 2027.pdf',
      'HE - Certificat extincteurs 2026 - 2027.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/HE/legacy/048-HE-Certificat-extincteurs-2026-2027.pdf',
      'application/pdf',
      824198,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/HE - Certificat extincteurs 2026 - 2027.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/HE - Certificat extincteurs 2026 - 2027.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHOUXYUJP3CJKVEZY2L7E7P6GKPC',
      '2026-08-08T07:20:26Z',
      '2026-08-08T07:20:26Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2027-07-31'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'HOLENN EUSA'),
      'HOLENN EUSA',
      '07-lsa',
      '07 - LSA',
      'Certificat Radeau',
      'Certificat Radeau',
      case
        when '2026-11-20'::date < current_date then 'expired'
        when '2026-11-20'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2026-11-20',
      null,
      '2026-08-20',
      'SERVAUX - LE HAVRE - Radeaux',
      null,
      null,
      'HE - Certificat Radeau.pdf',
      'HE - Certificat Radeau.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/HE/legacy/049-HE-Certificat-Radeau.pdf',
      'application/pdf',
      502739,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/HE - Certificat Radeau.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/HE - Certificat Radeau.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHIRN6GG7C25ZVCLM56MJ4D65K6N',
      '2026-03-27T09:21:47Z',
      '2026-05-26T08:25:13Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2026-11-20'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'HOLENN EUSA'),
      'HOLENN EUSA',
      '08-grue-et-bossoir',
      '08 - Grue & Bossoir',
      'Registre des apparaux de levage - 2025',
      'Registre des apparaux de levage - 2025',
      case
        when '2026-10-23'::date < current_date then 'expired'
        when '2026-10-23'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2026-10-23',
      null,
      '2026-07-23',
      'BBTM - Contrôle Interne des Apparaux de Levage',
      null,
      null,
      'HE - Registre des apparaux de levage - 2025.pdf',
      'HE - Registre des apparaux de levage - 2025.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/HE/legacy/050-HE-Registre-des-apparaux-de-levage-2025.pdf',
      'application/pdf',
      1363797,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/HE - Registre des apparaux de levage - 2025.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/HE - Registre des apparaux de levage - 2025.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHMUGXQ37HI4FZAISTJHOQY3G6IV',
      '2026-05-23T22:59:12Z',
      '2026-05-23T23:00:00Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2026-10-23'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'HOLENN EUSA'),
      'HOLENN EUSA',
      '09-anfr',
      '09 - ANFR',
      'Licence Radio',
      'Licence Radio',
      case
        when '2026-12-31'::date < current_date then 'expired'
        when '2026-12-31'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2026-12-31',
      null,
      '2026-10-01',
      'Agence Nationale des Fréquences (ANFR)',
      null,
      null,
      'HE - Licence Radio.pdf',
      'HE - Licence Radio.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/HE/legacy/051-HE-Licence-Radio.pdf',
      'application/pdf',
      143032,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/HE - Licence Radio.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/HE - Licence Radio.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHMFB3IKBGC3NRH2UZ4MUD6JUDCF',
      '2025-12-08T15:04:45Z',
      '2025-12-08T08:18:17Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2026-12-31'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'KROKDUR'),
      'KROKDUR',
      '01-registre-international-francais',
      '01 - Registre International Français',
      'Acte de Francisation',
      'Acte de Francisation',
      case
        when null::date < current_date then 'expired'
        when null::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      null,
      null,
      null,
      null,
      null,
      null,
      'KDR - Acte de Francisation.pdf',
      'KDR - Acte de Francisation.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/KDR/legacy/052-KDR-Acte-de-Francisation.pdf',
      'application/pdf',
      1658891,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/KDR - Acte de Francisation.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/KDR - Acte de Francisation.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHLCQWUFTHLMIFH2DLWZF5VYMADE',
      '2025-03-20T06:45:14Z',
      '2021-02-19T09:57:26Z',
      true,
      case
        when null::date is not null then 'planned'
        when null::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'KROKDUR'),
      'KROKDUR',
      '01-registre-international-francais',
      '01 - Registre International Français',
      'Permis d''Armement',
      'Permis d''Armement',
      case
        when null::date < current_date then 'expired'
        when null::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      null,
      null,
      null,
      'Registre International Français',
      null,
      null,
      'KDR - Permis d''Armement.pdf',
      'KDR - Permis d''Armement.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/KDR/legacy/053-KDR-Permis-d-Armement.pdf',
      'application/pdf',
      213637,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/KDR - Permis d''Armement.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/KDR - Permis d''Armement.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHNUVYHJEIKPSNE2PTMARMOWMECU',
      '2025-03-20T06:45:16Z',
      '2021-05-29T07:07:01Z',
      true,
      case
        when null::date is not null then 'planned'
        when null::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'KROKDUR'),
      'KROKDUR',
      '02-centre-de-securite-des-navires',
      '02 - Centre de Sécurité des Navires',
      'Permis de Navigation',
      'Permis de Navigation',
      case
        when null::date < current_date then 'expired'
        when null::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      null,
      null,
      null,
      'CSN - LE HAVRE - Secrétariat',
      null,
      null,
      'KDR - Permis de Navigation.pdf',
      'KDR - Permis de Navigation.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/KDR/legacy/054-KDR-Permis-de-Navigation.pdf',
      'application/pdf',
      234911,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/KDR - Permis de Navigation.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/KDR - Permis de Navigation.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHOP7WRYLUPIZJF2QVMZUH3347DS',
      '2025-03-20T06:45:15Z',
      '2023-10-19T09:31:36Z',
      true,
      case
        when null::date is not null then 'planned'
        when null::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'KROKDUR'),
      'KROKDUR',
      '02-centre-de-securite-des-navires',
      '02 - Centre de Sécurité des Navires',
      'KROKDUR - 2025',
      'KROKDUR - 2025',
      case
        when null::date < current_date then 'expired'
        when null::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      null,
      null,
      null,
      'CSN - LE HAVRE - Secrétariat',
      null,
      null,
      'Rapport de Visite Périodique - KROKDUR - 2025.pdf',
      'Rapport de Visite Périodique - KROKDUR - 2025.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/KDR/legacy/055-Rapport-de-Visite-Periodique-KROKDUR-2025.pdf',
      'application/pdf',
      3334794,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/Rapport de Visite Périodique - KROKDUR - 2025.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/Rapport de Visite Périodique - KROKDUR - 2025.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHKZCS2R72EDEVCLOOLSEA3GGQE4',
      '2026-03-06T13:16:05Z',
      '2026-04-05T21:38:42Z',
      true,
      case
        when null::date is not null then 'planned'
        when null::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'KROKDUR'),
      'KROKDUR',
      '02-centre-de-securite-des-navires',
      '02 - Centre de Sécurité des Navires',
      'KROKDUR - 24 04 2025',
      'KROKDUR - 24 04 2025',
      case
        when null::date < current_date then 'expired'
        when null::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      null,
      null,
      null,
      'CSN - LE HAVRE - Secrétariat',
      null,
      null,
      'Visite Périodique - KROKDUR - 24 04 2025.pdf',
      'Visite Périodique - KROKDUR - 24 04 2025.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/KDR/legacy/056-Visite-Periodique-KROKDUR-24-04-2025.pdf',
      'application/pdf',
      3334794,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/Visite Périodique - KROKDUR - 24 04 2025.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/Visite Périodique - KROKDUR - 24 04 2025.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHIE3FYWHYNFGVGY66Q5JXDTGACJ',
      '2026-03-09T08:04:25Z',
      '2026-04-05T21:38:42Z',
      true,
      case
        when null::date is not null then 'planned'
        when null::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'KROKDUR'),
      'KROKDUR',
      '02-centre-de-securite-des-navires',
      '02 - Centre de Sécurité des Navires',
      'Certificat de Franc-Bord',
      'Certificat de Franc-Bord',
      case
        when '2027-04-16'::date < current_date then 'expired'
        when '2027-04-16'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2027-04-16',
      null,
      '2027-01-16',
      'CSN - LE HAVRE - Secrétariat',
      null,
      null,
      'KDR - Certificat de Franc-Bord.pdf',
      'KDR - Certificat de Franc-Bord.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/KDR/legacy/057-KDR-Certificat-de-Franc-Bord.pdf',
      'application/pdf',
      496661,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/KDR - Certificat de Franc-Bord.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/KDR - Certificat de Franc-Bord.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHMGBTJYD5FEN5EYC2LKNFHXCKLX',
      '2026-03-27T09:25:57Z',
      '2025-04-18T16:34:35Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2027-04-16'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'KROKDUR'),
      'KROKDUR',
      '04-assurance',
      '04 - Assurance',
      'Assurance P&I',
      'Assurance P&I',
      case
        when '2027-01-01'::date < current_date then 'expired'
        when '2027-01-01'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2027-01-01',
      null,
      '2026-10-01',
      'HOWDEN FRANCE SAS',
      null,
      null,
      'KDR - Assurance P&I.pdf',
      'KDR - Assurance P&I.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/KDR/legacy/058-KDR-Assurance-P-et-I.pdf',
      'application/pdf',
      68452,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/KDR - Assurance P&I.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/KDR - Assurance P&I.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHPS7SOASB4PGZG22NVK2CITWBVY',
      '2026-03-18T12:46:58Z',
      '2026-04-05T21:42:36Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2027-01-01'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'KROKDUR'),
      'KROKDUR',
      '05-safety-plan',
      '05 - Safety Plan',
      'Safety Plan',
      'Safety Plan',
      case
        when null::date < current_date then 'expired'
        when null::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      null,
      null,
      null,
      null,
      null,
      null,
      'KDR - Safety Plan.pdf',
      'KDR - Safety Plan.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/KDR/legacy/059-KDR-Safety-Plan.pdf',
      'application/pdf',
      4137372,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/KDR - Safety Plan.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/KDR - Safety Plan.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHN7HZRP62YLTFBJAQOVO2X7ZPZR',
      '2025-03-20T06:45:14Z',
      '2024-12-01T11:09:14Z',
      true,
      case
        when null::date is not null then 'planned'
        when null::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'KROKDUR'),
      'KROKDUR',
      '06-incendie',
      '06 - Incendie',
      'Visite Extinction Fixe & Portatif',
      'Visite Extinction Fixe & Portatif',
      case
        when null::date < current_date then 'expired'
        when null::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      null,
      null,
      null,
      null,
      null,
      null,
      'KDR - Visite Extinction Fixe & Portatif.pdf',
      'KDR - Visite Extinction Fixe & Portatif.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/KDR/legacy/060-KDR-Visite-Extinction-Fixe-et-Portatif.pdf',
      'application/pdf',
      6985334,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/KDR - Visite Extinction Fixe & Portatif.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/KDR - Visite Extinction Fixe & Portatif.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHO4BAD2TLSPO5BLYEHMMYMMN6S7',
      '2025-03-20T06:45:17Z',
      '2024-12-12T11:34:23Z',
      true,
      case
        when null::date is not null then 'planned'
        when null::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'KROKDUR'),
      'KROKDUR',
      '07-lsa',
      '07 - LSA',
      'Visite Radeaux',
      'Visite Radeaux',
      case
        when null::date < current_date then 'expired'
        when null::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      null,
      null,
      null,
      'Nautic Service Sauvetage',
      null,
      null,
      'KDR - Visite Radeaux.pdf',
      'KDR - Visite Radeaux.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/KDR/legacy/061-KDR-Visite-Radeaux.pdf',
      'application/pdf',
      4906417,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/KDR - Visite Radeaux.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/KDR - Visite Radeaux.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHNNMUCPPHR2MNAKN7YMVGG4JUAK',
      '2025-03-20T06:45:16Z',
      '2024-11-20T10:31:34Z',
      true,
      case
        when null::date is not null then 'planned'
        when null::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'KROKDUR'),
      'KROKDUR',
      '07-lsa',
      '07 - LSA',
      'Certificat radeaux KROKDUR',
      'Certificat radeaux KROKDUR',
      case
        when '2027-07-17'::date < current_date then 'expired'
        when '2027-07-17'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2027-07-17',
      null,
      '2027-04-17',
      'Nautic Service Sauvetage',
      null,
      null,
      'KDR - Certificat radeaux KROKDUR - 2027.pdf',
      'KDR - Certificat radeaux KROKDUR - 2027.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/KDR/legacy/062-KDR-Certificat-radeaux-KROKDUR-2027.pdf',
      'application/pdf',
      1774029,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/KDR - Certificat radeaux KROKDUR - 2027.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/KDR - Certificat radeaux KROKDUR - 2027.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHNHTU6FNT54XBHLM2JROY3KA3OA',
      '2026-07-31T11:08:36Z',
      '2026-07-31T11:08:36Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2027-07-17'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'KROKDUR'),
      'KROKDUR',
      '08-grue-et-bossoir',
      '08 - Grue & Bossoir',
      'Rapport Essais Grue et Equipements de Levage',
      'Rapport Essais Grue et Equipements de Levage',
      case
        when null::date < current_date then 'expired'
        when null::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      null,
      null,
      null,
      null,
      null,
      null,
      'KDR - Rapport Essais Grue et Equipements de Levage.pdf',
      'KDR - Rapport Essais Grue et Equipements de Levage.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/KDR/legacy/063-KDR-Rapport-Essais-Grue-et-Equipements-de-Levage.pdf',
      'application/pdf',
      124688,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/KDR - Rapport Essais Grue et Equipements de Levage.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/KDR - Rapport Essais Grue et Equipements de Levage.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHOEDZVZ6CNUZFDICPDGY23SRN3W',
      '2025-03-20T06:45:16Z',
      '2023-01-10T12:45:39Z',
      true,
      case
        when null::date is not null then 'planned'
        when null::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'KROKDUR'),
      'KROKDUR',
      '08-grue-et-bossoir',
      '08 - Grue & Bossoir',
      'Certificat Grue - Load Test - 26-05-2025',
      'Certificat Grue - Load Test - 26-05-2025',
      case
        when '2030-05-26'::date < current_date then 'expired'
        when '2030-05-26'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2030-05-26',
      null,
      '2030-02-26',
      null,
      null,
      null,
      'KDR - Certificat Grue - Load Test - 26-05-2025.pdf',
      'KDR - Certificat Grue - Load Test - 26-05-2025.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/KDR/legacy/064-KDR-Certificat-Grue-Load-Test-26-05-2025.pdf',
      'application/pdf',
      3487953,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/KDR - Certificat Grue - Load Test - 26-05-2025.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/KDR - Certificat Grue - Load Test - 26-05-2025.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHMUX6FKZPNOAZHK7OOEZC2Q3YIT',
      '2026-03-27T15:35:48Z',
      '2025-10-24T12:20:13Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2030-05-26'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'KROKDUR'),
      'KROKDUR',
      '08-grue-et-bossoir',
      '08 - Grue & Bossoir',
      'Certificat Visite Grue - GUERRA M65.20A2 - 2026',
      'Certificat Visite Grue - GUERRA M65.20A2 - 2026',
      case
        when '2027-05-06'::date < current_date then 'expired'
        when '2027-05-06'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2027-05-06',
      null,
      '2027-02-06',
      'MACOR LSA SERVICE - Le Havre Agency',
      null,
      null,
      'KDR - Certificat Visite Grue - GUERRA M65.20A2 - 2026.PDF',
      'KDR - Certificat Visite Grue - GUERRA M65.20A2 - 2026.PDF',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/KDR/legacy/065-KDR-Certificat-Visite-Grue-GUERRA-M65.20A2-2026.PDF',
      'application/pdf',
      2006028,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/KDR - Certificat Visite Grue - GUERRA M65.20A2 - 2026.PDF',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/KDR - Certificat Visite Grue - GUERRA M65.20A2 - 2026.PDF?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHNR6QPRMH3HSZDLMZNBF5FWHMMA',
      '2026-05-11T12:27:51Z',
      '2026-05-11T13:02:57Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2027-05-06'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'KROKDUR'),
      'KROKDUR',
      '08-grue-et-bossoir',
      '08 - Grue & Bossoir',
      'Registre des apparaux de levage - 2025',
      'Registre des apparaux de levage - 2025',
      case
        when '2026-10-29'::date < current_date then 'expired'
        when '2026-10-29'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2026-10-29',
      null,
      '2026-07-29',
      'BBTM - Contrôle Interne des Apparaux de Levage',
      null,
      null,
      'KDR - Registre des apparaux de levage - 2025.pdf',
      'KDR - Registre des apparaux de levage - 2025.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/KDR/legacy/066-KDR-Registre-des-apparaux-de-levage-2025.pdf',
      'application/pdf',
      1360663,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/KDR - Registre des apparaux de levage - 2025.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/KDR - Registre des apparaux de levage - 2025.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHIAQBCLF7A5HVGZXMP4INK7ZPHN',
      '2026-05-23T22:55:31Z',
      '2026-05-23T22:58:21Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2026-10-29'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'KROKDUR'),
      'KROKDUR',
      '08-grue-et-bossoir',
      '08 - Grue & Bossoir',
      'Examen à fond - Apparaux de levage - 2025',
      'Examen à fond - Apparaux de levage - 2025',
      case
        when '2026-12-18'::date < current_date then 'expired'
        when '2026-12-18'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2026-12-18',
      null,
      '2026-09-18',
      'BBTM - Contrôle Interne des Apparaux de Levage',
      null,
      null,
      'KDR - Examen à fond - Apparaux de levage - 2025.pdf',
      'KDR - Examen à fond - Apparaux de levage - 2025.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/KDR/legacy/067-KDR-Examen-a-fond-Apparaux-de-levage-2025.pdf',
      'application/pdf',
      1435657,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/KDR - Examen à fond - Apparaux de levage - 2025.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/KDR - Examen à fond - Apparaux de levage - 2025.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHMW7DXSSEHMPVGJ7DH3WQMKHKYA',
      '2026-05-23T22:55:32Z',
      '2026-05-23T22:58:38Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2026-12-18'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'KROKDUR'),
      'KROKDUR',
      '09-anfr',
      '09 - ANFR',
      'Rapport Visite Radio',
      'Rapport Visite Radio',
      case
        when null::date < current_date then 'expired'
        when null::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      null,
      null,
      null,
      null,
      null,
      null,
      'KDR - Rapport Visite Radio.pdf',
      'KDR - Rapport Visite Radio.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/KDR/legacy/068-KDR-Rapport-Visite-Radio.pdf',
      'application/pdf',
      1724320,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/KDR - Rapport Visite Radio.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/KDR - Rapport Visite Radio.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHP6HLTRUDDZHVF3FJBHDMRJJ3FQ',
      '2025-03-20T06:45:17Z',
      '2024-12-05T10:56:43Z',
      true,
      case
        when null::date is not null then 'planned'
        when null::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'KROKDUR'),
      'KROKDUR',
      '09-anfr',
      '09 - ANFR',
      'Licence Radio',
      'Licence Radio',
      case
        when '2026-12-31'::date < current_date then 'expired'
        when '2026-12-31'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2026-12-31',
      null,
      '2026-10-01',
      'Agence Nationale des Fréquences (ANFR)',
      null,
      null,
      'KDR - Licence Radio.pdf',
      'KDR - Licence Radio.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/KDR/legacy/069-KDR-Licence-Radio.pdf',
      'application/pdf',
      143082,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/KDR - Licence Radio.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/KDR - Licence Radio.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHKTW5DKYRFKD5E2UHE4KEKCQVKZ',
      '2025-12-08T15:04:44Z',
      '2025-12-08T08:20:00Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2026-12-31'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'KROKDUR'),
      'KROKDUR',
      '12-dossier-de-stabilite',
      '12 - Dossier de Stabilité',
      'Dossier de Stabilité',
      'Dossier de Stabilité',
      case
        when null::date < current_date then 'expired'
        when null::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      null,
      null,
      null,
      null,
      null,
      null,
      'KDR - Dossier de Stabilité.pdf',
      'KDR - Dossier de Stabilité.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/KDR/legacy/070-KDR-Dossier-de-Stabilite.pdf',
      'application/pdf',
      665292,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/KDR - Dossier de Stabilité.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/KDR - Dossier de Stabilité.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHJDBCRKULO2WZDYNJFJBDRIEBE5',
      '2025-03-20T06:45:14Z',
      '2023-06-24T11:49:47Z',
      true,
      case
        when null::date is not null then 'planned'
        when null::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'KROKDUR'),
      'KROKDUR',
      '13-amiante',
      '13 - Amiante',
      'Dossier Amiante',
      'Dossier Amiante',
      case
        when null::date < current_date then 'expired'
        when null::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      null,
      null,
      null,
      'SOCOTEC DIAGNOSTIQUE ',
      null,
      null,
      'KDR - Dossier Amiante.pdf',
      'KDR - Dossier Amiante.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/KDR/legacy/071-KDR-Dossier-Amiante.pdf',
      'application/pdf',
      1536397,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/KDR - Dossier Amiante.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/KDR - Dossier Amiante.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHPPGMCSHBHRKJGYBFB6K4A2NVRR',
      '2026-06-24T14:06:00Z',
      '2026-06-17T08:27:58Z',
      true,
      case
        when null::date is not null then 'planned'
        when null::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'KROKDUR'),
      'KROKDUR',
      '14-ecmid',
      '14 - eCMID',
      'eCMID - 2026',
      'eCMID - 2026',
      case
        when null::date < current_date then 'expired'
        when null::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      null,
      null,
      null,
      'RICHARD MARINE CONSULTING',
      null,
      null,
      'KDR - eCMID - 2026.pdf',
      'KDR - eCMID - 2026.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/KDR/legacy/072-KDR-eCMID-2026.pdf',
      'application/pdf',
      701777,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/KDR - eCMID - 2026.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/KDR - eCMID - 2026.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHKOUWWV4RPNLJCKVYQQUSVPZPP7',
      '2026-03-18T12:55:47Z',
      '2026-04-05T21:39:14Z',
      true,
      case
        when null::date is not null then 'planned'
        when null::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'LANDEMER'),
      'LANDEMER',
      '07-lsa',
      '07 - LSA',
      'Certificats radeaux LANDEMER',
      'Certificats radeaux LANDEMER',
      case
        when '2027-02-07'::date < current_date then 'expired'
        when '2027-02-07'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2027-02-07',
      null,
      '2026-11-07',
      'Nautic Service Sauvetage',
      null,
      null,
      'LDM - Certificats radeaux LANDEMER - 2027.pdf',
      'LDM - Certificats radeaux LANDEMER - 2027.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/LDM/legacy/073-LDM-Certificats-radeaux-LANDEMER-2027.pdf',
      'application/pdf',
      17715723,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/LDM - Certificats radeaux LANDEMER - 2027.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/LDM - Certificats radeaux LANDEMER - 2027.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHLTACRAG4WEENEYYGDSNFE2MJUR',
      '2026-07-31T11:13:36Z',
      '2026-07-31T10:12:29Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2027-02-07'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'LANDEMER'),
      'LANDEMER',
      '09-anfr',
      '09 - ANFR',
      'Rapport Visite Radio - 2026',
      'Rapport Visite Radio - 2026',
      case
        when '2026-06-11'::date < current_date then 'expired'
        when '2026-06-11'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2026-06-11',
      null,
      '2026-03-11',
      'Agence Nationale des Fréquences (ANFR)',
      null,
      null,
      'LDM - Rapport Visite Radio - 2026.png',
      'LDM - Rapport Visite Radio - 2026.png',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/LDM/legacy/074-LDM-Rapport-Visite-Radio-2026.png',
      'image/png',
      989378,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/LDM - Rapport Visite Radio - 2026.png',
      null,
      null,
      null,
      null,
      null,
      true,
      case
        when null::date is not null then 'planned'
        when '2026-06-11'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'LANDEMER'),
      'LANDEMER',
      '09-anfr',
      '09 - ANFR',
      'Licence Radio',
      'Licence Radio',
      case
        when '2027-01-31'::date < current_date then 'expired'
        when '2027-01-31'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2027-01-31',
      null,
      '2026-10-31',
      'Agence Nationale des Fréquences (ANFR)',
      null,
      null,
      'LDM - Licence Radio - 2027.PDF',
      'LDM - Licence Radio - 2027.PDF',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/LDM/legacy/075-LDM-Licence-Radio-2027.PDF',
      'application/pdf',
      462590,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/LDM - Licence Radio - 2027.PDF',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/LDM - Licence Radio - 2027.PDF?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHNMI3LP4GIVXBHK3TBGSEUHO7SW',
      '2026-06-25T12:13:57Z',
      '2026-06-25T10:33:54Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2027-01-31'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'LE ROZEL'),
      'LE ROZEL',
      '01-registre-international-francais',
      '01 - Registre International Français',
      'Acte de Francisation',
      'Acte de Francisation',
      case
        when null::date < current_date then 'expired'
        when null::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      null,
      null,
      null,
      'Registre International Français',
      null,
      null,
      'RZL - Acte de Francisation.pdf',
      'RZL - Acte de Francisation.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/RZL/legacy/076-RZL-Acte-de-Francisation.pdf',
      'application/pdf',
      1364535,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/RZL - Acte de Francisation.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/RZL - Acte de Francisation.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHMUTH6JNEZF5JGKUTZ5Y64665QV',
      '2025-03-20T06:45:04Z',
      '2022-04-12T15:11:30Z',
      true,
      case
        when null::date is not null then 'planned'
        when null::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'LE ROZEL'),
      'LE ROZEL',
      '01-registre-international-francais',
      '01 - Registre International Français',
      'Permis d''Armement',
      'Permis d''Armement',
      case
        when null::date < current_date then 'expired'
        when null::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      null,
      null,
      null,
      'Registre International Français',
      null,
      null,
      'RZL - Permis d''Armement.pdf',
      'RZL - Permis d''Armement.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/RZL/legacy/077-RZL-Permis-d-Armement.pdf',
      'application/pdf',
      325895,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/RZL - Permis d''Armement.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/RZL - Permis d''Armement.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHKIP4FO2AR65JCZKRQTFPIXQ6Q2',
      '2025-03-20T06:45:09Z',
      '2022-10-03T14:38:21Z',
      true,
      case
        when null::date is not null then 'planned'
        when null::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'LE ROZEL'),
      'LE ROZEL',
      '02-centre-de-securite-des-navires',
      '02 - Centre de Sécurité des Navires',
      'Permis de Navigation',
      'Permis de Navigation',
      case
        when null::date < current_date then 'expired'
        when null::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      null,
      null,
      null,
      'CSN - LE HAVRE - Secrétariat',
      null,
      null,
      'RZL - Permis de Navigation.pdf',
      'RZL - Permis de Navigation.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/RZL/legacy/078-RZL-Permis-de-Navigation.pdf',
      'application/pdf',
      236238,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/RZL - Permis de Navigation.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/RZL - Permis de Navigation.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHOBBGURARAH6NAJZQBJVB42ZHE6',
      '2025-03-20T06:45:08Z',
      '2023-06-14T07:54:25Z',
      true,
      case
        when null::date is not null then 'planned'
        when null::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'LE ROZEL'),
      'LE ROZEL',
      '03-societe-de-classification-bv',
      '03 - Société de Classification - BV',
      'Certificat de Classe',
      'Certificat de Classe',
      case
        when '2027-10-14'::date < current_date then 'expired'
        when '2027-10-14'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2027-10-14',
      null,
      '2027-07-14',
      'BUREAU VERITAS - E.JEAN',
      null,
      null,
      'RZL - Certificat de Classe.pdf',
      'RZL - Certificat de Classe.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/RZL/legacy/079-RZL-Certificat-de-Classe.pdf',
      'application/pdf',
      158630,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/RZL - Certificat de Classe.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/RZL - Certificat de Classe.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHLX36AV433BEBDIBA3LXP7P242L',
      '2026-03-27T09:24:32Z',
      '2023-01-10T12:30:10Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2027-10-14'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'LE ROZEL'),
      'LE ROZEL',
      '03-societe-de-classification-bv',
      '03 - Société de Classification - BV',
      'Certificat de Franc-Bord',
      'Certificat de Franc-Bord',
      case
        when '2027-10-14'::date < current_date then 'expired'
        when '2027-10-14'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2027-10-14',
      null,
      '2027-07-14',
      'BUREAU VERITAS - E.JEAN',
      null,
      null,
      'RZL - Certificat de Franc-Bord.pdf',
      'RZL - Certificat de Franc-Bord.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/RZL/legacy/080-RZL-Certificat-de-Franc-Bord.pdf',
      'application/pdf',
      178296,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/RZL - Certificat de Franc-Bord.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/RZL - Certificat de Franc-Bord.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHI374LO4HYWAFD3UUUDZG44BIRL',
      '2026-03-27T09:44:23Z',
      '2022-10-14T14:45:01Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2027-10-14'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'LE ROZEL'),
      'LE ROZEL',
      '04-assurance',
      '04 - Assurance',
      'ASSURANCE P&I - LE ROZEL',
      'ASSURANCE P&I - LE ROZEL',
      case
        when '2027-01-01'::date < current_date then 'expired'
        when '2027-01-01'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2027-01-01',
      null,
      '2026-10-01',
      'HOWDEN FRANCE SAS',
      null,
      null,
      'B-4-RZL - ASSURANCE P&I - LE ROZEL.pdf',
      'B-4-RZL - ASSURANCE P&I - LE ROZEL.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/RZL/legacy/081-B-4-RZL-ASSURANCE-P-et-I-LE-ROZEL.pdf',
      'application/pdf',
      71245,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/B-4-RZL - ASSURANCE P&I - LE ROZEL.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/B-4-RZL - ASSURANCE P&I - LE ROZEL.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHOU4IN4G6DVPJGZ3XJWXHRWCGNH',
      '2026-03-18T12:46:58Z',
      '2026-04-05T21:39:14Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2027-01-01'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'LE ROZEL'),
      'LE ROZEL',
      '04-assurance',
      '04 - Assurance',
      'H&M',
      'H&M',
      case
        when '2027-01-01'::date < current_date then 'expired'
        when '2027-01-01'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2027-01-01',
      null,
      '2026-10-01',
      'HOWDEN FRANCE SAS',
      null,
      null,
      'RZL - H&M - 2027.pdf',
      'RZL - H&M - 2027.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/RZL/legacy/082-RZL-H-et-M-2027.pdf',
      'application/pdf',
      190630,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/RZL - H&M - 2027.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/RZL - H&M - 2027.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHLV24DGKUOS7BAIAPI3E5UBXKZI',
      '2026-07-23T13:45:58Z',
      '2025-12-24T13:29:42Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2027-01-01'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'LE ROZEL'),
      'LE ROZEL',
      '05-safety-plan',
      '05 - Safety Plan',
      'Safety Plan',
      'Safety Plan',
      case
        when null::date < current_date then 'expired'
        when null::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      null,
      null,
      null,
      null,
      null,
      null,
      'RZL - Safety Plan.pdf',
      'RZL - Safety Plan.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/RZL/legacy/083-RZL-Safety-Plan.pdf',
      'application/pdf',
      256245,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/RZL - Safety Plan.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/RZL - Safety Plan.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHJAY7SDVZ6J5JDZA3KNXRDAZTDZ',
      '2025-08-25T13:42:48Z',
      '2022-05-30T15:22:32Z',
      true,
      case
        when null::date is not null then 'planned'
        when null::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'LE ROZEL'),
      'LE ROZEL',
      '06-incendie',
      '06 - Incendie',
      'Certificat Appareil Respiratoire Individuel',
      'Certificat Appareil Respiratoire Individuel',
      case
        when '2027-01-21'::date < current_date then 'expired'
        when '2027-01-21'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2027-01-21',
      null,
      '2026-10-21',
      'SERVAUX - LE HAVRE - Incendie - XLE',
      null,
      null,
      'RZL - Certificat Appareil Respiratoire Individuel.pdf',
      'RZL - Certificat Appareil Respiratoire Individuel.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/RZL/legacy/084-RZL-Certificat-Appareil-Respiratoire-Individuel.pdf',
      'application/pdf',
      998098,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/RZL - Certificat Appareil Respiratoire Individuel.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/RZL - Certificat Appareil Respiratoire Individuel.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHJMK3NIPCMMYBGZTR6MAJWZJ6H3',
      '2026-03-27T09:23:24Z',
      '2026-01-23T13:02:43Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2027-01-21'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'LE ROZEL'),
      'LE ROZEL',
      '06-incendie',
      '06 - Incendie',
      'Certificat Extinction Fixe & Portatif',
      'Certificat Extinction Fixe & Portatif',
      case
        when '2027-01-21'::date < current_date then 'expired'
        when '2027-01-21'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2027-01-21',
      null,
      '2026-10-21',
      'SERVAUX - LE HAVRE - Incendie - XLE',
      null,
      null,
      'RZL - Certificat Extinction Fixe & Portatif.pdf',
      'RZL - Certificat Extinction Fixe & Portatif.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/RZL/legacy/085-RZL-Certificat-Extinction-Fixe-et-Portatif.pdf',
      'application/pdf',
      618690,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/RZL - Certificat Extinction Fixe & Portatif.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/RZL - Certificat Extinction Fixe & Portatif.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHN27RHSL67JZJDKKU4Z2DUYM5T5',
      '2026-03-27T09:40:44Z',
      '2026-01-23T13:01:59Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2027-01-21'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'LE ROZEL'),
      'LE ROZEL',
      '07-lsa',
      '07 - LSA',
      'Radeau 11928 et HRU - 2027',
      'Radeau 11928 et HRU - 2027',
      case
        when '2027-05-12'::date < current_date then 'expired'
        when '2027-05-12'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2027-05-12',
      null,
      '2027-02-12',
      'Nautic Service Sauvetage',
      null,
      null,
      'RZL - Radeau 11928 et HRU - 2027.pdf',
      'RZL - Radeau 11928 et HRU - 2027.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/RZL/legacy/086-RZL-Radeau-11928-et-HRU-2027.pdf',
      'application/pdf',
      1175016,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/RZL - Radeau 11928 et HRU - 2027.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/RZL - Radeau 11928 et HRU - 2027.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHLFAQ5ANKDHMNEKI5ZVQZNAIQPC',
      '2025-05-18T12:18:41Z',
      '2026-05-25T09:31:53Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2027-05-12'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'LE ROZEL'),
      'LE ROZEL',
      '07-lsa',
      '07 - LSA',
      'Radeau 11916 et HRU - 2027',
      'Radeau 11916 et HRU - 2027',
      case
        when '2027-04-24'::date < current_date then 'expired'
        when '2027-04-24'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2027-04-24',
      null,
      '2027-01-24',
      'Nautic Service Sauvetage',
      null,
      null,
      'RZL - Radeau 11916 et HRU - 2027.pdf',
      'RZL - Radeau 11916 et HRU - 2027.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/RZL/legacy/087-RZL-Radeau-11916-et-HRU-2027.pdf',
      'application/pdf',
      813750,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/RZL - Radeau 11916 et HRU - 2027.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/RZL - Radeau 11916 et HRU - 2027.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHNLMU6N4RRCXBHYDJLZJTNCIZBX',
      '2026-04-23T06:35:01Z',
      '2026-05-25T13:13:20Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2027-04-24'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'LE ROZEL'),
      'LE ROZEL',
      '07-lsa',
      '07 - LSA',
      'Certificat VFI 300N Le Rozel',
      'Certificat VFI 300N Le Rozel',
      case
        when '2027-08-04'::date < current_date then 'expired'
        when '2027-08-04'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2027-08-04',
      null,
      '2027-05-04',
      'SERVAUX',
      null,
      null,
      'RZL - Certificat VFI 300N Le Rozel - 2027.pdf',
      'RZL - Certificat VFI 300N Le Rozel - 2027.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/RZL/legacy/088-RZL-Certificat-VFI-300N-Le-Rozel-2027.pdf',
      'application/pdf',
      752167,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/RZL - Certificat VFI 300N Le Rozel - 2027.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/RZL - Certificat VFI 300N Le Rozel - 2027.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHN6O2MEMVRP6FEITWGVOMQA4WQM',
      '2026-08-07T07:49:01Z',
      '2026-08-06T14:09:46Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2027-08-04'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'LE ROZEL'),
      'LE ROZEL',
      '08-grue-et-bossoir',
      '08 - Grue & Bossoir',
      'Load Test - 01-2025',
      'Load Test - 01-2025',
      case
        when null::date < current_date then 'expired'
        when null::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      null,
      null,
      null,
      'MACOR LSA SERVICE - Le Havre Agency',
      null,
      null,
      'RZL - Load Test - 01-2025.pdf',
      'RZL - Load Test - 01-2025.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/RZL/legacy/089-RZL-Load-Test-01-2025.pdf',
      'application/pdf',
      3523297,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/RZL - Load Test - 01-2025.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/RZL - Load Test - 01-2025.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHI5FUOGSRX3KBHJ4REMXM4BZUXD',
      '2025-03-20T06:45:08Z',
      '2025-01-30T17:42:25Z',
      true,
      case
        when null::date is not null then 'planned'
        when null::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'LE ROZEL'),
      'LE ROZEL',
      '08-grue-et-bossoir',
      '08 - Grue & Bossoir',
      'Registre des Apparaux de Levage',
      'Registre des Apparaux de Levage',
      case
        when '2027-01-06'::date < current_date then 'expired'
        when '2027-01-06'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2027-01-06',
      null,
      '2026-10-06',
      'BUREAU VERITAS - E.JEAN',
      null,
      null,
      'RZL - Registre des Apparaux de Levage.pdf',
      'RZL - Registre des Apparaux de Levage.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/RZL/legacy/090-RZL-Registre-des-Apparaux-de-Levage.pdf',
      'application/pdf',
      561200,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/RZL - Registre des Apparaux de Levage.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/RZL - Registre des Apparaux de Levage.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHKLLYC2V24NUVCJM73ZLP4WZXWU',
      '2026-03-27T15:52:34Z',
      '2026-01-16T09:46:26Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2027-01-06'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'LE ROZEL'),
      'LE ROZEL',
      '08-grue-et-bossoir',
      '08 - Grue & Bossoir',
      'Contrôle Interne des Remorques - 2025',
      'Contrôle Interne des Remorques - 2025',
      case
        when '2026-11-19'::date < current_date then 'expired'
        when '2026-11-19'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2026-11-19',
      null,
      '2026-08-19',
      'BBTM - Contrôle Interne des Apparaux de Levage',
      null,
      null,
      'RZL - Contrôle Interne des Remorques - 2025.pdf',
      'RZL - Contrôle Interne des Remorques - 2025.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/RZL/legacy/091-RZL-Controle-Interne-des-Remorques-2025.pdf',
      'application/pdf',
      529536,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/RZL - Contrôle Interne des Remorques - 2025.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/RZL - Contrôle Interne des Remorques - 2025.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHPPGJIATQOZWVBZGSHSM6DLWBJG',
      '2026-05-07T09:23:03Z',
      '2026-05-07T09:19:56Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2026-11-19'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'LE ROZEL'),
      'LE ROZEL',
      '08-grue-et-bossoir',
      '08 - Grue & Bossoir',
      'Contrôle Interne des Apparaux de Levage - 2025',
      'Contrôle Interne des Apparaux de Levage - 2025',
      case
        when '2026-11-25'::date < current_date then 'expired'
        when '2026-11-25'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2026-11-25',
      null,
      '2026-08-25',
      'BBTM - Contrôle Interne des Apparaux de Levage',
      null,
      null,
      'RZL - Contrôle Interne des Apparaux de Levage - 2025.pdf',
      'RZL - Contrôle Interne des Apparaux de Levage - 2025.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/RZL/legacy/092-RZL-Controle-Interne-des-Apparaux-de-Levage-2025.pdf',
      'application/pdf',
      592386,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/RZL - Contrôle Interne des Apparaux de Levage - 2025.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/RZL - Contrôle Interne des Apparaux de Levage - 2025.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHMKTIS5ESVNA5GLXAXJO6DP6WQS',
      '2026-05-07T09:53:27Z',
      '2026-05-07T09:50:44Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2026-11-25'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'LE ROZEL'),
      'LE ROZEL',
      '09-anfr',
      '09 - ANFR',
      'Licence Radio',
      'Licence Radio',
      case
        when '2026-12-31'::date < current_date then 'expired'
        when '2026-12-31'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2026-12-31',
      null,
      '2026-10-01',
      'Agence Nationale des Fréquences (ANFR)',
      null,
      null,
      'RZL - Licence Radio.pdf',
      'RZL - Licence Radio.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/RZL/legacy/093-RZL-Licence-Radio.pdf',
      'application/pdf',
      143367,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/RZL - Licence Radio.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/RZL - Licence Radio.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHLACSDWAFWGKRG2FQ6WENWZP3EP',
      '2025-12-08T15:04:15Z',
      '2025-12-08T08:20:31Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2026-12-31'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'LE ROZEL'),
      'LE ROZEL',
      '09-anfr',
      '09 - ANFR',
      'Rapport Visite Radio',
      'Rapport Visite Radio',
      case
        when '2029-05-11'::date < current_date then 'expired'
        when '2029-05-11'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2029-05-11',
      null,
      '2029-02-11',
      'Agence Nationale des Fréquences (ANFR)',
      null,
      null,
      'RZL - Rapport Visite Radio.pdf',
      'RZL - Rapport Visite Radio.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/RZL/legacy/094-RZL-Rapport-Visite-Radio.pdf',
      'application/pdf',
      587247,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/RZL - Rapport Visite Radio.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/RZL - Rapport Visite Radio.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHK6CKZ2K2KI2VCYHX5OERYZ7AFQ',
      '2026-05-11T14:46:47Z',
      '2026-05-11T14:34:26Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2029-05-11'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'LE ROZEL'),
      'LE ROZEL',
      '12-dossier-de-stabilite',
      '12 - Dossier de Stabilité',
      'Dossier de Stabilité',
      'Dossier de Stabilité',
      case
        when null::date < current_date then 'expired'
        when null::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      null,
      null,
      null,
      null,
      null,
      null,
      'RZL - Dossier de Stabilité.pdf',
      'RZL - Dossier de Stabilité.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/RZL/legacy/095-RZL-Dossier-de-Stabilite.pdf',
      'application/pdf',
      7818241,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/RZL - Dossier de Stabilité.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/RZL - Dossier de Stabilité.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHLKSNY756BX2VDZX2ZBDCYM2MUJ',
      '2025-03-20T06:45:08Z',
      '2022-06-03T14:25:42Z',
      true,
      case
        when null::date is not null then 'planned'
        when null::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'LE ROZEL'),
      'LE ROZEL',
      '13-amiante',
      '13 - Amiante',
      'Dossier Amiante',
      'Dossier Amiante',
      case
        when null::date < current_date then 'expired'
        when null::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      null,
      null,
      null,
      null,
      null,
      null,
      'RZL - Dossier Amiante.pdf',
      'RZL - Dossier Amiante.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/RZL/legacy/096-RZL-Dossier-Amiante.pdf',
      'application/pdf',
      11540356,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/RZL - Dossier Amiante.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/RZL - Dossier Amiante.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHPDAHAKGJWPLFDKFKBQU5TKPQ6Q',
      '2025-03-20T06:45:07Z',
      '2022-07-20T14:33:55Z',
      true,
      case
        when null::date is not null then 'planned'
        when null::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'LE ROZEL'),
      'LE ROZEL',
      '14-ecmid',
      '14 - eCMID',
      'eCMID',
      'eCMID',
      case
        when '2027-05-04'::date < current_date then 'expired'
        when '2027-05-04'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2027-05-04',
      null,
      '2027-02-04',
      'RICHARD MARINE CONSULTING',
      null,
      null,
      'RZL - eCMID.pdf',
      'RZL - eCMID.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/RZL/legacy/097-RZL-eCMID.pdf',
      'application/pdf',
      599194,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/RZL - eCMID.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/RZL - eCMID.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHM4NWOEDVAMQ5HJEPG2WBYXCX22',
      '2025-06-20T06:58:46Z',
      '2026-05-13T21:43:22Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2027-05-04'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'SUROIT'),
      'SUROIT',
      '01-registre-international-francais',
      '01 - Registre International Français',
      'Acte de Francisation',
      'Acte de Francisation',
      case
        when null::date < current_date then 'expired'
        when null::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      null,
      null,
      null,
      'Registre International Français',
      null,
      null,
      'SUR - Acte de Francisation.pdf',
      'SUR - Acte de Francisation.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/SUR/legacy/098-SUR-Acte-de-Francisation.pdf',
      'application/pdf',
      653483,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/SUR - Acte de Francisation.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/SUR - Acte de Francisation.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHKVOGS4OHHTO5FLD4JDHPXVYUL5',
      '2025-03-20T06:45:00Z',
      '2023-12-04T08:14:35Z',
      true,
      case
        when null::date is not null then 'planned'
        when null::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'SUROIT'),
      'SUROIT',
      '01-registre-international-francais',
      '01 - Registre International Français',
      'Permis d''Armement',
      'Permis d''Armement',
      case
        when null::date < current_date then 'expired'
        when null::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      null,
      null,
      null,
      'Registre International Français',
      null,
      null,
      'SUR - Permis d''Armement.pdf',
      'SUR - Permis d''Armement.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/SUR/legacy/099-SUR-Permis-d-Armement.pdf',
      'application/pdf',
      309566,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/SUR - Permis d''Armement.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/SUR - Permis d''Armement.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHJQPBVA6F2OCRELZJDKUUJYHRAR',
      '2025-03-20T06:45:03Z',
      '2023-12-26T10:30:04Z',
      true,
      case
        when null::date is not null then 'planned'
        when null::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'SUROIT'),
      'SUROIT',
      '02-centre-de-securite-des-navires',
      '02 - Centre de Sécurité des Navires',
      'Permis de Navigation',
      'Permis de Navigation',
      case
        when null::date < current_date then 'expired'
        when null::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      null,
      null,
      null,
      null,
      null,
      null,
      'SUR - Permis de Navigation.pdf',
      'SUR - Permis de Navigation.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/SUR/legacy/100-SUR-Permis-de-Navigation.pdf',
      'application/pdf',
      236744,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/SUR - Permis de Navigation.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/SUR - Permis de Navigation.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHNLXMRW7VE4XNHIZKT4KXO6Q56L',
      '2025-03-20T06:45:02Z',
      '2023-09-27T15:28:22Z',
      true,
      case
        when null::date is not null then 'planned'
        when null::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'SUROIT'),
      'SUROIT',
      '02-centre-de-securite-des-navires',
      '02 - Centre de Sécurité des Navires',
      'SUROIT_PV CRS_411-NAV-03e PAUL B.pdf',
      'SUROIT_PV CRS_411-NAV-03e PAUL B.pdf',
      case
        when null::date < current_date then 'expired'
        when null::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      null,
      null,
      null,
      null,
      null,
      null,
      'SUROIT_PV CRS_411-NAV-03e PAUL B.pdf',
      'SUROIT_PV CRS_411-NAV-03e PAUL B.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/SUR/legacy/101-SUROIT_PV-CRS_411-NAV-03e-PAUL-B.pdf',
      'application/pdf',
      5018083,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/SUROIT_PV CRS_411-NAV-03e PAUL B.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/SUROIT_PV CRS_411-NAV-03e PAUL B.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHPSDSIQ5RPQAFDKPFKSKQIBDKWR',
      '2025-03-20T06:45:05Z',
      '2026-04-05T21:39:48Z',
      true,
      case
        when null::date is not null then 'planned'
        when null::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'SUROIT'),
      'SUROIT',
      '03-societe-de-classification-bv',
      '03 - Société de Classification - BV',
      'Certificat de Classification',
      'Certificat de Classification',
      case
        when '2026-07-07'::date < current_date then 'expired'
        when '2026-07-07'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2026-07-07',
      '2026-07-07',
      '2026-04-07',
      'Bureau Veritas - L.DORE',
      'Quai BBTM Rue des Chantiers',
      null,
      'SUR - Certificat de Classification.pdf',
      'SUR - Certificat de Classification.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/SUR/legacy/102-SUR-Certificat-de-Classification.pdf',
      'application/pdf',
      350325,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/SUR - Certificat de Classification.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/SUR - Certificat de Classification.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHIFT34VRIJRYJC2CRHA4SK5X4KC',
      '2025-03-20T06:45:00Z',
      '2024-09-16T06:43:00Z',
      true,
      case
        when '2026-07-07'::date is not null then 'planned'
        when '2026-07-07'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'SUROIT'),
      'SUROIT',
      '03-societe-de-classification-bv',
      '03 - Société de Classification - BV',
      'Certificat de Franc-Bord',
      'Certificat de Franc-Bord',
      case
        when '2028-08-16'::date < current_date then 'expired'
        when '2028-08-16'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2028-08-16',
      null,
      '2028-05-16',
      'Bureau Veritas - L.DORE',
      null,
      null,
      'SUR - Certificat de Franc-Bord.pdf',
      'SUR - Certificat de Franc-Bord.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/SUR/legacy/103-SUR-Certificat-de-Franc-Bord.pdf',
      'application/pdf',
      245949,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/SUR - Certificat de Franc-Bord.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/SUR - Certificat de Franc-Bord.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHK65W6HYOBURFCI6COOPUVT3BFI',
      '2025-03-20T06:45:00Z',
      '2022-04-28T12:44:00Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2028-08-16'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'SUROIT'),
      'SUROIT',
      '04-assurance',
      '04 - Assurance',
      'ASSURANCE P&I - SUROIT',
      'ASSURANCE P&I - SUROIT',
      case
        when '2027-01-01'::date < current_date then 'expired'
        when '2027-01-01'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2027-01-01',
      null,
      '2026-10-01',
      'HOWDEN FRANCE SAS',
      null,
      null,
      'B-4-SUR - ASSURANCE P&I - SUROIT.pdf',
      'B-4-SUR - ASSURANCE P&I - SUROIT.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/SUR/legacy/104-B-4-SUR-ASSURANCE-P-et-I-SUROIT.pdf',
      'application/pdf',
      71975,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/B-4-SUR - ASSURANCE P&I - SUROIT.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/B-4-SUR - ASSURANCE P&I - SUROIT.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHITQI6D3WZ7L5AKXMD2ZSYG7TRC',
      '2026-03-18T12:46:58Z',
      '2026-04-05T21:39:48Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2027-01-01'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'SUROIT'),
      'SUROIT',
      '04-assurance',
      '04 - Assurance',
      'B-5-SUR - H&M - FR',
      'B-5-SUR - H&M - FR',
      case
        when '2026-12-31'::date < current_date then 'expired'
        when '2026-12-31'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2026-12-31',
      null,
      '2026-10-01',
      'HOWDEN FRANCE SAS',
      null,
      null,
      'SUR - B-5-SUR - H&M - FR - 2026.pdf',
      'SUR - B-5-SUR - H&M - FR - 2026.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/SUR/legacy/105-SUR-B-5-SUR-H-et-M-FR-2026.pdf',
      'application/pdf',
      525983,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/SUR - B-5-SUR - H&M - FR - 2026.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/SUR - B-5-SUR - H&M - FR - 2026.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHLC3MUG5H667BCINHESFYONXNTA',
      '2026-08-11T06:45:57Z',
      '2025-12-22T09:56:46Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2026-12-31'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'SUROIT'),
      'SUROIT',
      '05-safety-plan',
      '05 - Safety Plan',
      'Safety Plan',
      'Safety Plan',
      case
        when null::date < current_date then 'expired'
        when null::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      null,
      null,
      null,
      null,
      null,
      null,
      'SUR - Safety Plan.pdf',
      'SUR - Safety Plan.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/SUR/legacy/106-SUR-Safety-Plan.pdf',
      'application/pdf',
      1001034,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/SUR - Safety Plan.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/SUR - Safety Plan.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHKN6Y5ZJPNGPVGYJKZY7Y62NXXF',
      '2025-03-20T06:45:01Z',
      '2009-07-07T13:59:37Z',
      true,
      case
        when null::date is not null then 'planned'
        when null::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'SUROIT'),
      'SUROIT',
      '06-incendie',
      '06 - Incendie',
      'Certificat Extinction Fixe & Portatif',
      'Certificat Extinction Fixe & Portatif',
      case
        when '2027-10-01'::date < current_date then 'expired'
        when '2027-10-01'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2027-10-01',
      null,
      '2027-07-01',
      'SERVAUX - LE HAVRE - Incendie - XLE',
      null,
      null,
      'SUR - Certificat Extinction Fixe & Portatif.pdf',
      'SUR - Certificat Extinction Fixe & Portatif.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/SUR/legacy/107-SUR-Certificat-Extinction-Fixe-et-Portatif.pdf',
      'application/pdf',
      1536298,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/SUR - Certificat Extinction Fixe & Portatif.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/SUR - Certificat Extinction Fixe & Portatif.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHPE6ILLXLVOURDKMB54LT4HH7ND',
      '2026-03-27T09:25:50Z',
      '2025-10-06T09:51:36Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2027-10-01'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'SUROIT'),
      'SUROIT',
      '07-lsa',
      '07 - LSA',
      'Visite VFI - 2024',
      'Visite VFI - 2024',
      case
        when '2025-01-27'::date < current_date then 'expired'
        when '2025-01-27'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2025-01-27',
      null,
      '2024-10-27',
      'SERVAUX - LE HAVRE - Radeaux',
      null,
      null,
      'SUR - Visite VFI - 2024.pdf',
      'SUR - Visite VFI - 2024.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/SUR/legacy/108-SUR-Visite-VFI-2024.pdf',
      'application/pdf',
      2015344,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/SUR - Visite VFI - 2024.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/SUR - Visite VFI - 2024.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHIRMQGXGZV2SBAKNMICK4BOJ2HE',
      '2025-12-04T10:09:06Z',
      '2025-12-04T10:08:03Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2025-01-27'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'SUROIT'),
      'SUROIT',
      '07-lsa',
      '07 - LSA',
      'Certificat Radeau',
      'Certificat Radeau',
      case
        when '2026-07-24'::date < current_date then 'expired'
        when '2026-07-24'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2026-07-24',
      null,
      '2026-04-24',
      'Nautic Service Sauvetage',
      null,
      null,
      'SUR - Certificat Radeau.pdf',
      'SUR - Certificat Radeau.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/SUR/legacy/109-SUR-Certificat-Radeau.pdf',
      'application/pdf',
      928805,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/SUR - Certificat Radeau.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/SUR - Certificat Radeau.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHOAOQAZBCPPTZALW333ZLTRI5AH',
      '2026-03-27T09:25:58Z',
      '2025-07-31T15:38:23Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2026-07-24'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'SUROIT'),
      'SUROIT',
      '07-lsa',
      '07 - LSA',
      'Certificats radeaux SUROIT',
      'Certificats radeaux SUROIT',
      case
        when '2027-07-23'::date < current_date then 'expired'
        when '2027-07-23'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2027-07-23',
      null,
      '2027-04-23',
      'Nautic Service Sauvetage',
      null,
      null,
      'SUR - Certificats radeaux SUROIT - 2027.pdf',
      'SUR - Certificats radeaux SUROIT - 2027.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/SUR/legacy/110-SUR-Certificats-radeaux-SUROIT-2027.pdf',
      'application/pdf',
      1708540,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/SUR - Certificats radeaux SUROIT - 2027.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/SUR - Certificats radeaux SUROIT - 2027.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHIDW4TCN4K7QNGYT2TEQMCWV6CT',
      '2026-07-31T10:29:29Z',
      '2026-07-31T10:29:31Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2027-07-23'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'SUROIT'),
      'SUROIT',
      '08-grue-et-bossoir',
      '08 - Grue & Bossoir',
      'Examen à fond - Grue - 08-2023',
      'Examen à fond - Grue - 08-2023',
      case
        when '2025-11-15'::date < current_date then 'expired'
        when '2025-11-15'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2025-11-15',
      null,
      '2025-08-15',
      'BUREAU VERITAS - E.JEAN',
      null,
      null,
      'SUR - Examen à fond - Grue - 08-2023.pdf',
      'SUR - Examen à fond - Grue - 08-2023.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/SUR/legacy/111-SUR-Examen-a-fond-Grue-08-2023.pdf',
      'application/pdf',
      267452,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/SUR - Examen à fond - Grue - 08-2023.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/SUR - Examen à fond - Grue - 08-2023.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHKKSXQR2PXO7JA2MNPANMBRCVQ4',
      '2025-03-20T06:45:01Z',
      '2024-01-17T11:52:00Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2025-11-15'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'SUROIT'),
      'SUROIT',
      '08-grue-et-bossoir',
      '08 - Grue & Bossoir',
      'Registre des appareils de levage',
      'Registre des appareils de levage',
      case
        when '2026-07-04'::date < current_date then 'expired'
        when '2026-07-04'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2026-07-04',
      null,
      '2026-04-04',
      'BUREAU VERITAS - E.JEAN',
      null,
      null,
      'SUR - Registre des appareils de levage.pdf',
      'SUR - Registre des appareils de levage.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/SUR/legacy/112-SUR-Registre-des-appareils-de-levage.pdf',
      'application/pdf',
      1800501,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/SUR - Registre des appareils de levage.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/SUR - Registre des appareils de levage.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHKLNT2HVBAZCJBKQX6BNJOHUUUQ',
      '2025-12-03T09:56:09Z',
      '2025-12-03T09:53:07Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2026-07-04'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'SUROIT'),
      'SUROIT',
      '08-grue-et-bossoir',
      '08 - Grue & Bossoir',
      'Registre des remorques - 2026',
      'Registre des remorques - 2026',
      case
        when '2026-11-26'::date < current_date then 'expired'
        when '2026-11-26'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2026-11-26',
      null,
      '2026-08-26',
      'BBTM - Contrôle Interne des Apparaux de Levage',
      null,
      null,
      'SUR - Registre des remorques - 2026.pdf',
      'SUR - Registre des remorques - 2026.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/SUR/legacy/113-SUR-Registre-des-remorques-2026.pdf',
      'application/pdf',
      1289280,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/SUR - Registre des remorques - 2026.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/SUR - Registre des remorques - 2026.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHOXSSTJQHPQFZH3KNP7ZYE5SN5A',
      '2026-05-23T22:40:41Z',
      '2026-05-23T22:45:03Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2026-11-26'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'SUROIT'),
      'SUROIT',
      '08-grue-et-bossoir',
      '08 - Grue & Bossoir',
      'Registre des apparaux de levage - 2026',
      'Registre des apparaux de levage - 2026',
      case
        when '2027-01-22'::date < current_date then 'expired'
        when '2027-01-22'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2027-01-22',
      null,
      '2026-10-22',
      'BBTM - Contrôle Interne des Apparaux de Levage',
      null,
      null,
      'SUR - Registre des apparaux de levage - 2026.pdf',
      'SUR - Registre des apparaux de levage - 2026.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/SUR/legacy/114-SUR-Registre-des-apparaux-de-levage-2026.pdf',
      'application/pdf',
      1379147,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/SUR - Registre des apparaux de levage - 2026.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/SUR - Registre des apparaux de levage - 2026.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHIYZEQVZBXV2VAJDSH3K4ENTAYG',
      '2026-05-23T22:40:40Z',
      '2026-05-23T22:43:19Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2027-01-22'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'SUROIT'),
      'SUROIT',
      '08-grue-et-bossoir',
      '08 - Grue & Bossoir',
      'Examen à fond - Apparaux de levage - 2025',
      'Examen à fond - Apparaux de levage - 2025',
      case
        when '2026-12-18'::date < current_date then 'expired'
        when '2026-12-18'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2026-12-18',
      null,
      '2026-09-18',
      'BBTM - Contrôle Interne des Apparaux de Levage',
      null,
      null,
      'SUR - Examen à fond - Apparaux de levage - 2025.pdf',
      'SUR - Examen à fond - Apparaux de levage - 2025.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/SUR/legacy/115-SUR-Examen-a-fond-Apparaux-de-levage-2025.pdf',
      'application/pdf',
      1435994,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/SUR - Examen à fond - Apparaux de levage - 2025.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/SUR - Examen à fond - Apparaux de levage - 2025.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHLIXJEXUIYVKZC3PFBNV4SF7NET',
      '2026-05-23T22:40:40Z',
      '2026-05-23T22:44:35Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2026-12-18'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'SUROIT'),
      'SUROIT',
      '09-anfr',
      '09 - ANFR',
      'Rapport Visite Radio',
      'Rapport Visite Radio',
      case
        when '2026-12-30'::date < current_date then 'expired'
        when '2026-12-30'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2026-12-30',
      null,
      '2026-09-30',
      'Agence Nationale des Fréquences (ANFR)',
      null,
      null,
      'SUR - Rapport Visite Radio.pdf',
      'SUR - Rapport Visite Radio.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/SUR/legacy/116-SUR-Rapport-Visite-Radio.pdf',
      'application/pdf',
      1684342,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/SUR - Rapport Visite Radio.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/SUR - Rapport Visite Radio.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHM5HTCKNBKTIFAYLZXNUU6RWTMW',
      '2025-03-20T06:45:04Z',
      '2024-12-30T15:25:52Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2026-12-30'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'SUROIT'),
      'SUROIT',
      '13-amiante',
      '13 - Amiante',
      'Certificat Amiante',
      'Certificat Amiante',
      case
        when null::date < current_date then 'expired'
        when null::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      null,
      null,
      null,
      null,
      null,
      null,
      'SUR - Certificat Amiante.pdf',
      'SUR - Certificat Amiante.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/SUR/legacy/117-SUR-Certificat-Amiante.pdf',
      'application/pdf',
      9757090,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/SUR - Certificat Amiante.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/SUR - Certificat Amiante.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHNGLNQBLZY62VBYBDESQRRJTIST',
      '2025-03-20T06:45:02Z',
      '2024-05-28T17:09:47Z',
      true,
      case
        when null::date is not null then 'planned'
        when null::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'SUROIT'),
      'SUROIT',
      '14-ecmid',
      '14 - eCMID',
      'eCMID - 2024',
      'eCMID - 2024',
      case
        when null::date < current_date then 'expired'
        when null::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      null,
      null,
      null,
      'RICHARD MARINE CONSULTING',
      null,
      null,
      'SUR - eCMID - 2024.pdf',
      'SUR - eCMID - 2024.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/SUR/legacy/118-SUR-eCMID-2024.pdf',
      'application/pdf',
      4954163,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/SUR - eCMID - 2024.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/SUR - eCMID - 2024.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHIQ4ZC4NJCPJBGLZL2XXA5HUU2H',
      '2025-03-20T06:45:02Z',
      '2026-04-05T21:40:19Z',
      true,
      case
        when null::date is not null then 'planned'
        when null::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'SUROIT'),
      'SUROIT',
      '14-ecmid',
      '14 - eCMID',
      'eCMID - 2025',
      'eCMID - 2025',
      case
        when '2026-05-21'::date < current_date then 'expired'
        when '2026-05-21'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2026-05-21',
      null,
      '2026-02-21',
      'RICHARD MARINE CONSULTING',
      null,
      null,
      'SUR - eCMID - 2025.pdf',
      'SUR - eCMID - 2025.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/SUR/legacy/119-SUR-eCMID-2025.pdf',
      'application/pdf',
      6158601,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/SUR - eCMID - 2025.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/SUR - eCMID - 2025.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHJLHDPTAR2AKZCZCMASZKBBLPAJ',
      '2025-12-04T09:58:00Z',
      '2026-04-05T21:40:19Z',
      true,
      case
        when null::date is not null then 'planned'
        when '2026-05-21'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    ),
(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = 'YARD - Le Havre'),
      'YARD - Le Havre',
      '08-grue-et-bossoir',
      '08 - Grue & Bossoir',
      'Registre des apparaux de levage - 2026',
      'Registre des apparaux de levage - 2026',
      case
        when '2027-04-22'::date < current_date then 'expired'
        when '2027-04-22'::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      '2027-04-22',
      null,
      '2027-01-22',
      'BBTM - Contrôle Interne des Apparaux de Levage',
      null,
      null,
      'YRD - Registre des apparaux de levage - 2026.pdf',
      'YRD - Registre des apparaux de levage - 2026.pdf',
      'sharepoint-iqy',
      'fleet-certificates',
      '1/YRD/legacy/120-YRD-Registre-des-apparaux-de-levage-2026.pdf',
      'application/pdf',
      1359253,
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      '/sites/QHSE/Certificats Flotte BBTM/YRD - Registre des apparaux de levage - 2026.pdf',
      'https://bbtm668.sharepoint.com/sites/QHSE/Certificats Flotte BBTM/YRD - Registre des apparaux de levage - 2026.pdf?web=1',
      'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw',
      '01TELEIHPRG4QXC5IAWJAL4EIG5ZKSPBQL',
      '2026-05-23T23:00:19Z',
      '2026-05-23T23:02:01Z',
      false,
      case
        when null::date is not null then 'planned'
        when '2027-04-22'::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    )
on conflict (company_id, original_file_name) where original_file_name is not null
do update set
  vessel_id = excluded.vessel_id,
  vessel_name = excluded.vessel_name,
  category_key = excluded.category_key,
  category_label = excluded.category_label,
  document_title = excluded.document_title,
  title = excluded.title,
  status = excluded.status,
  expires_on = excluded.expires_on,
  planned_on = excluded.planned_on,
  alarm_on = excluded.alarm_on,
  provider_name = excluded.provider_name,
  visit_location = excluded.visit_location,
  renewal_notes = excluded.renewal_notes,
  file_name = excluded.file_name,
  source_label = excluded.source_label,
  storage_bucket = excluded.storage_bucket,
  storage_path = excluded.storage_path,
  mime_type = excluded.mime_type,
  file_size_bytes = excluded.file_size_bytes,
  sharepoint_file_ref = excluded.sharepoint_file_ref,
  sharepoint_encoded_abs_url = excluded.sharepoint_encoded_abs_url,
  sharepoint_drive_id = excluded.sharepoint_drive_id,
  sharepoint_drive_item_id = excluded.sharepoint_drive_item_id,
  source_created_at = excluded.source_created_at,
  source_modified_at = excluded.source_modified_at,
  is_active_fleet = excluded.is_active_fleet,
  workflow_status = excluded.workflow_status,
  updated_at = now();

insert into public.fleet_certificate_versions (
  company_id, certificate_id, version_no, status, original_file_name,
  normalized_file_name, storage_bucket, storage_path, mime_type, file_size_bytes,
  expires_on, is_current, source_label, validated_at
)
select
  certificate.company_id,
  certificate.id,
  1,
  'active',
  certificate.original_file_name,
  certificate.file_name,
  certificate.storage_bucket,
  certificate.storage_path,
  certificate.mime_type,
  certificate.file_size_bytes,
  certificate.expires_on,
  true,
  'sharepoint-iqy',
  now()
from public.fleet_certificates certificate
where certificate.source_label = 'sharepoint-iqy'
  and not exists (
    select 1
    from public.fleet_certificate_versions version
    where version.certificate_id = certificate.id
  );
