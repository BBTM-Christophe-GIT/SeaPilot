// Public preview uses only public portal URLs, never the real meeting or vessel links.
export const PREVIEW_LINK_CATEGORIES = ['Classification & conformité', 'Documents & signature', 'Fournisseurs & partenaires', 'Opérations & flotte', 'Réunions Teams'].map((name, index) => ({ id: `category-${index}`, name }));
export const PREVIEW_USEFUL_LINKS = [
  ['SupplHi · Portail fournisseurs', 'https://vendor.supplhi.com/', 2],
  ['Offshare · LEMS', 'https://offshare.lems-fr.com/', 2],
  ['Bureau Veritas · MOVE', 'https://move.bureauveritas.com/', 0],
  ['Veracity · DNV', 'https://www.veracity.com/', 0],
  ['DNV · Portail maritime', 'https://services.veracity.com/', 0],
  ['Offshore Energy Manager', 'https://www.offshoreenergymanager.com/', 3],
  ['IMCA · eCMID', 'https://database.ecmid.com/', 0],
  ['OMI · Publications', 'https://imo-epublications.org/', 1],
  ['Marad · Administration du navire', 'https://www.marad.online/', 3],
  ['Nomade · Ports de Normandie', 'https://nomade.portsdenormandie.fr/', 3],
  ['Docusign · Documents', 'https://apps.docusign.com/', 1],
  ['Oracle · Construction & Engineering', 'https://constructionandengineering.oraclecloud.com/', 2],
  ['Open-es', 'https://openes.io/', 2],
  ['Teams · Réunion 1', 'https://teams.microsoft.com/', 4],
  ['Teams · Réunion 2', 'https://teams.microsoft.com/', 4],
].map(([title, url, category], index) => ({ id: `link-${index}`, title, url, category_id: `category-${category}` }));
