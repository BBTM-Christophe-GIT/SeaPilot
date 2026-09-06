import type { SupabaseClient } from '@supabase/supabase-js';
import { CheckCircle2, LockKeyhole, Save, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ServiceNoteRichTextEditor } from '../serviceNotes/ServiceNoteRichTextEditor';
import { KpiChart } from './KpiOverview';
import { saveKpiSocialGovernanceSettings, type QhseReportSnapshot, type QhseSocialGovernanceProposal } from './qhseReportData';

const THEME_LABELS: Record<QhseSocialGovernanceProposal['theme'], string> = {
  governance: 'Gouvernance',
  social: 'Social',
  environment: 'Environnement',
  other: 'Autres',
};

export function SocialGovernancePanel({ client, snapshot, year, loading, onSaved }: {
  client: SupabaseClient;
  snapshot: QhseReportSnapshot | null;
  year: number;
  loading: boolean;
  onSaved(): void;
}) {
  const aggregate = snapshot?.socialGovernance;
  const data = aggregate?.byYear?.[String(year)] || aggregate;
  const proposals = useMemo(() => (data?.proposals || []).filter((item) => item.year === year), [data?.proposals, year]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [commentHtml, setCommentHtml] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setSelectedKeys(proposals.filter((item) => item.selected).map((item) => item.key));
    setCommentHtml(data?.comments.find((item) => item.year === year)?.html || '');
    setMessage(''); setError('');
  }, [data?.comments, proposals, year]);

  const radar = data ? {
    id: 'governance-wellbeing', title: 'Bien-être dans l’entreprise', kind: 'radar' as const,
    labels: data.radar.map((item) => item.label), maxValue: 4, unit: 'Score de 1 à 4',
    subtitle: '4 = Très satisfait · 1 = Insatisfait',
    series: [{ label: 'Satisfaction moyenne', values: data.radar.map((item) => item.responseCount ? item.value : null), color: [26, 173, 87] as [number, number, number] }],
  } : null;

  async function save() {
    setSaving(true); setError(''); setMessage('');
    try {
      await saveKpiSocialGovernanceSettings(client, { year, selectedResponseKeys: selectedKeys, generalCommentHtml: commentHtml });
      setMessage('Sélection et commentaire enregistrés pour le rapport Social et Gouvernance.');
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Impossible d’enregistrer la configuration du KPI.');
    } finally { setSaving(false); }
  }

  return <section className="kpi-social-governance" aria-busy={loading}>
    <header><div><span>Indicateur RSE</span><h2>Social et Gouvernance</h2><p>Données agrégées des entretiens {year} et du registre confidentiel des événements.</p></div><div className="kpi-social-badges"><span><ShieldCheck size={15} />{data?.reviewCount || 0} entretien(s)</span><span><LockKeyhole size={15} />{data?.discriminationCount || 0} signalement(s)</span></div></header>
    <div className="kpi-social-grid">
      <article className="kpi-social-radar"><div><h3>Bien-être dans l’entreprise</h3><small>{data?.respondentCount || 0} collaborateur(s) ayant partagé leurs réponses</small></div>{radar ? <KpiChart chart={radar} /> : <p>Données non disponibles.</p>}</article>
      <article className="kpi-social-proposals"><div><h3>Propositions d’amélioration</h3><small>{data?.canConfigure ? 'Cochez les réponses management à publier pour chaque thème.' : 'Réponses retenues par la Direction.'}</small></div>
        {(['governance', 'social', 'environment', 'other'] as const).map((theme) => {
          const items = proposals.filter((item) => item.theme === theme);
          return <fieldset key={theme}><legend>{THEME_LABELS[theme]}</legend>{items.length ? items.map((item) => <label key={item.key}><input checked={data?.canConfigure ? selectedKeys.includes(item.key) : item.selected} disabled={!data?.canConfigure} onChange={(event) => setSelectedKeys((current) => event.target.checked ? [...current, item.key] : current.filter((key) => key !== item.key))} type="checkbox" /><span>{item.text}</span></label>) : <p>Aucune réponse management disponible.</p>}</fieldset>;
        })}
      </article>
    </div>
    {data?.canConfigure ? <article className="kpi-social-comment"><header><div><h3>Commentaire Général de la Direction</h3><small>Visible dans le PDF « Social et Gouvernance ».</small></div></header><ServiceNoteRichTextEditor ariaLabel="Commentaire Général de la Direction" onChange={setCommentHtml} placeholder="Ajoutez l’analyse et les orientations de la Direction…" toolbarLabel="Mise en forme du commentaire de la Direction" value={commentHtml} /><footer><button className="kpi-button" disabled={saving} onClick={() => void save()} type="button"><Save size={16} />{saving ? 'Enregistrement…' : 'Enregistrer pour le rapport'}</button></footer></article> : null}
    {message ? <p className="kpi-social-message is-success"><CheckCircle2 size={16} />{message}</p> : null}
    {error ? <p className="kpi-social-message is-error" role="alert">{error}</p> : null}
  </section>;
}
