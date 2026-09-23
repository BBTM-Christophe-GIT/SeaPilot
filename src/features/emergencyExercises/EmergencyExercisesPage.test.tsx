import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { EmergencyExercisesPage } from './EmergencyExercisesPage';
import { createExercisePreviewClient } from './emergencyExercisesPreview';
import { fetchExerciseReport } from './emergencyExercisesQueries';
import { downloadExercisePdf } from './emergencyExercisesPdf';
vi.mock('../../lib/supabaseClient', () => ({supabase:{}}));
vi.mock('./emergencyExercisesPdf', () => ({downloadExercisePdf:vi.fn(async()=>{})}));
const mount = (client:SupabaseClient) => render(<MemoryRouter><EmergencyExercisesPage client={client}/></MemoryRouter>);
describe('emergency register interface', () => {
  it('shows one button per vessel in descending length order and filters with the retained vessel ID', async () => {
    const base = createExercisePreviewClient();
    const vessels = [
      { id: 6, name: 'HIRONDELLE DE LA MANCHE', iconUrl: null },
      { id: 1, name: 'LE ROZEL', iconUrl: null, lengthOverall: '19,2' },
      { id: 57, name: '  Hirondelle  de la Manche ', iconUrl: null },
      { id: 3, name: 'GOURY', iconUrl: null, lengthOverall: '30.62 m' },
      { id: 2, name: 'SUROIT', iconUrl: null, lengthOverall: '18,60' },
    ];
    const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
      const response = await base.rpc(name, args);
      if (name === 'emergency_exercises_people') response.data = { ...response.data, vessels };
      if (name === 'emergency_exercises_report') response.data = { ...response.data, vessel: vessels.find((v) => v.id === args?.target_vessel_id) || null };
      return response;
    });
    mount({ rpc } as unknown as SupabaseClient);
    await screen.findByRole('heading', { name: /Toute la flotte/ });
    const filter = within(screen.getByRole('navigation', { name: 'Filtrer les exercices par navire' }));
    const buttons = filter.getAllByRole('button');
    expect(buttons.map((button) => button.textContent?.trim().toUpperCase())).toEqual([
      'FLOTTE', 'GOURY', 'LE ROZEL', 'SUROIT', 'HIRONDELLE DE LA MANCHE',
    ]);
    fireEvent.click(buttons[4]);
    await screen.findByRole('heading', { name: /HIRONDELLE DE LA MANCHE/i });
    expect(rpc).toHaveBeenLastCalledWith('emergency_exercises_report', expect.objectContaining({ target_vessel_id: 6 }));
    expect(vessels).toHaveLength(5);
  });
  it('starts with the fleet and active sailors, filters by vessel, and exports the selected sailor/year/scope', async () => {
    const client=createExercisePreviewClient(), spy=vi.spyOn(client,'rpc'); mount(client);
    await screen.findByRole('heading',{name:/Toute la flotte/},{timeout:5000});
    expect(screen.getByRole('button',{name:'Flotte'})).toHaveAttribute('aria-pressed','true');
    expect(screen.getByLabelText('Filtrer les marins')).toHaveValue('current');
    expect(screen.queryByRole('option',{name:'Camille DURAND'})).not.toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Exporter le PDF'})).toBeDisabled();
    fireEvent.click(screen.getByRole('button',{name:'SUROIT'}));
    await screen.findByRole('heading',{name:/SUROIT/});
    fireEvent.change(screen.getByLabelText('Collaborateur'),{target:{value:'1'}});
    await screen.findByRole('heading',{name:/Alex MARTIN/});
    fireEvent.click(screen.getByRole('button',{name:'Exporter le PDF'}));
    await waitFor(()=>expect(downloadExercisePdf).toHaveBeenCalledWith(expect.objectContaining({person:expect.objectContaining({id:1}),vessel:expect.objectContaining({id:2}),year:new Date().getFullYear()})));
    await screen.findByText('Le carnet PDF a été téléchargé.');
    fireEvent.change(screen.getByLabelText('Filtrer les marins'),{target:{value:'former'}});
    await screen.findByRole('heading',{name:/SUROIT/});
    expect(screen.getByRole('option',{name:'Camille DURAND'})).toBeInTheDocument();
    expect(screen.queryByRole('option',{name:'Alex MARTIN'})).not.toBeInTheDocument();
    expect(spy).toHaveBeenLastCalledWith('emergency_exercises_report',expect.objectContaining({target_person_id:null,target_vessel_id:2,target_population:'former'}));
  });
  it.each(['watch','self'] as const)('uses the server-provided %s roster without the office personnel filter',async(scope)=>{
    const base=createExercisePreviewClient();
    const client={rpc:async(name:string,args?:Record<string,unknown>)=>{
      const response=await base.rpc(name,args);
      if(name==='emergency_exercises_people') response.data={...response.data,scope,people:response.data.people.slice(0,1)};
      return response;
    }} as unknown as SupabaseClient;
    mount(client);
    await screen.findByRole('heading',{name:scope==='self'?/Alex MARTIN/:/Ma bordée/});
    expect(screen.queryByLabelText('Filtrer les marins')).not.toBeInTheDocument();
    expect(screen.queryByRole('option',{name:'Camille DURAND'})).not.toBeInTheDocument();
    if(scope==='self')expect(screen.getByLabelText('Collaborateur')).toBeDisabled();
    else expect(screen.getByLabelText('Collaborateur')).toBeEnabled();
  });
  it('does not display a stale response or export it after the year changes',async()=>{
    const base=createExercisePreviewClient(); let resolveOld:((value:unknown)=>void)|undefined;
    const client={rpc:(name:string,args?:Record<string,unknown>)=> name==='emergency_exercises_report' && args?.target_year===2024
      ? new Promise(resolve=>{resolveOld=resolve;}) : base.rpc(name,args)} as unknown as SupabaseClient;
    mount(client); await screen.findByRole('heading',{name:/Toute la flotte/});
    fireEvent.change(screen.getByLabelText('Collaborateur'),{target:{value:'1'}});
    await screen.findByRole('heading',{name:/Alex MARTIN/});
    fireEvent.change(screen.getByLabelText('Année'),{target:{value:'2024'}});
    expect(screen.getByRole('button',{name:'Exporter le PDF'})).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Année'),{target:{value:'2023'}});
    await screen.findByRole('heading',{name:'Alex MARTIN · 2023'});
    await act(async()=>resolveOld?.(await base.rpc('emergency_exercises_report',{target_person_id:1,target_year:2024})));
    expect(screen.getByRole('heading',{name:'Alex MARTIN · 2023'})).toBeInTheDocument();
    expect(screen.getByText('Aucun exercice déclaré pour cette sélection.')).toBeInTheDocument();
  });
  it('shows server errors and rejects a response for another selected person',async()=>{
    const client={rpc:async()=>({data:null,error:{message:'Accès refusé'}})} as unknown as SupabaseClient;
    mount(client); expect(await screen.findByRole('alert')).toHaveTextContent('Accès refusé');
    await expect(fetchExerciseReport(createExercisePreviewClient(),999,2026,null,'current')).rejects.toThrow(/ne correspond pas/);
  });
});
