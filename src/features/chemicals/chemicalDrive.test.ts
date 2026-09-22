// @vitest-environment node
import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { connectLocalDrive, localDriveRequest } from '../documents/localDriveLauncher';
import { chemicalFileHash, createChemicalDrive } from './chemicalDrive';
import { blankChemical, type ChemicalAttachment, type ChemicalProduct } from './chemicalModel';
import { addChemicalAttachment, fetchChemicalWorkspace } from './chemicalQueries';

vi.mock('../documents/localDriveLauncher', () => ({
  connectLocalDrive: vi.fn(), localDriveRequest: vi.fn(),
  blobBase64: async (file: Blob) => Buffer.from(await file.arrayBuffer()).toString('base64'),
}));
const product = { ...blankChemical(1), id:'00000000-0000-4000-8000-000000000001', company_id:1 } as ChemicalProduct;
const id = '00000000-0000-4000-8000-000000000002';
const folder = `GOURY - c1-v1/${product.id}`;
const connection = { url:'http://127.0.0.1:50000/session', expiresAt:Date.now()+100000, version:'2.2.0' };
const rpc = vi.fn();
const client = { rpc } as unknown as SupabaseClient;
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(connectLocalDrive).mockResolvedValue(connection);
  rpc.mockResolvedValue({data:{directory:'Produits Chimiques',folder},error:null});
});
describe('chemical Google Drive files', () => {
  it('writes in the authorized product folder and verifies the receipt before saving metadata', async () => {
    const file = new File(['FDS'], 'FDS été.PDF', {type:'application/pdf'});
    const path = `${folder}/${id}-FDS_ete.pdf`;
    vi.mocked(localDriveRequest).mockResolvedValue({path,bytes:3});
    const result = await createChemicalDrive(client).write(product,id,file);
    expect(rpc).toHaveBeenCalledWith('chemical_drive_scope',{target_product:product.id});
    expect(localDriveRequest).toHaveBeenCalledWith(client,connection,expect.objectContaining({action:'write',module:'chemicals',productId:product.id,path,base64:'RkRT'}));
    expect(result).toEqual({drive_path:path,sha256:await chemicalFileHash(new TextEncoder().encode('FDS'))});
    vi.mocked(localDriveRequest).mockResolvedValue({path,bytes:2});
    await expect(createChemicalDrive(client).write(product,id,file)).rejects.toThrow('ne correspond pas');
  });
  it('refuses an old launcher and a denied product scope without sending a file', async () => {
    vi.mocked(connectLocalDrive).mockResolvedValue({...connection,version:'2.1.0'});
    await expect(createChemicalDrive(client).connect()).rejects.toThrow('Installez le lanceur');
    vi.mocked(connectLocalDrive).mockResolvedValue(connection);
    rpc.mockResolvedValue({error:new Error('Accès refusé'),data:null});
    await expect(createChemicalDrive(client).write(product,id,new File(['x'],'a.pdf'))).rejects.toThrow('Accès refusé');
    expect(localDriveRequest).not.toHaveBeenCalled();
  });
  it('reads only the registered attachment and rejects changed bytes or paths', async () => {
    const bytes = new TextEncoder().encode('FDS');
    const attachment = {id,product_id:product.id,drive_path:`${folder}/${id}-FDS.pdf`,size_bytes:3,mime_type:'application/pdf',sha256:await chemicalFileHash(bytes)} as ChemicalAttachment;
    const receipt = {path:attachment.drive_path,bytes:3,base64:'RkRT'};
    vi.mocked(localDriveRequest).mockResolvedValue(receipt);
    expect(await (await createChemicalDrive(client).read(attachment)).text()).toBe('FDS');
    expect(localDriveRequest).toHaveBeenCalledWith(client,connection,{action:'read',module:'chemicals',productId:product.id,attachmentId:id,path:attachment.drive_path});
    for (const invalid of [{...receipt,base64:'YmFk'}, {...receipt,path:'other.pdf'}, {...receipt,bytes:1}]) {
      vi.mocked(localDriveRequest).mockResolvedValue(invalid);
      await expect(createChemicalDrive(client).read(attachment)).rejects.toThrow('a changé');
    }
  });
  it('preserves the Drive file and reports its location when metadata registration fails', async () => {
    const store = {connect:vi.fn(),write:vi.fn().mockResolvedValue({drive_path:'GOURY/product/file.pdf',sha256:'a'.repeat(64)}),read:vi.fn()};
    const db = {from:() => ({insert:() => ({select:() => ({single:async () => ({data:null,error:{message:'Network'}})})})})} as unknown as SupabaseClient;
    await expect(addChemicalAttachment(db,store,product,new File(['FDS'],'file.pdf'),'fds')).rejects.toThrow('Google Drive : Produits Chimiques/GOURY/product/file.pdf');
    expect(store.write).toHaveBeenCalledTimes(1);
  });
  it('loads inventory beyond the API row cap for complete exports', async () => {
    const rows = Array.from({length:1501},(_,i) => ({...product,id:String(i)}));
    const ranges: number[] = [];
    const db = {rpc:async () => ({data:[],error:null}),from:(table:string) => {
      let start=0,end=749;
      const chain = {select:() => chain,order:() => chain,is:() => chain,range:(a:number,b:number) => {start=a;end=b;ranges.push(a);return chain;},then:(resolve:(value:unknown) => void) => resolve({data:table==='chemical_products'?rows.slice(start,end+1):[],error:null})};
      return chain;
    }} as unknown as SupabaseClient;
    expect((await fetchChemicalWorkspace(db)).products).toHaveLength(1501);
    expect(ranges).toContain(1500);
  });
});
