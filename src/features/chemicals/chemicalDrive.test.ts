// @vitest-environment node
import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { connectLocalDrive, localDriveRequest } from '../documents/localDriveLauncher';
import { hasDocumentBlobFile } from '../documents/documentBlobStorage';
import { chemicalFileHash, createChemicalDrive } from './chemicalDrive';
import { blankChemical, type ChemicalAttachment, type ChemicalProduct } from './chemicalModel';
import { addChemicalAttachment, fetchChemicalWorkspace } from './chemicalQueries';

vi.mock('../documents/localDriveLauncher', async original => ({
  ...await original<typeof import('../documents/localDriveLauncher')>(),
  connectLocalDrive: vi.fn(), localDriveRequest: vi.fn(),
  blobBase64: async (file: Blob) => Buffer.from(await file.arrayBuffer()).toString('base64'),
}));
vi.mock('../documents/documentBlobStorage', async original => ({ ...await original<typeof import('../documents/documentBlobStorage')>(), hasDocumentBlobFile: vi.fn() }));
const product = { ...blankChemical(1), id:'00000000-0000-4000-8000-000000000001', company_id:1 } as ChemicalProduct;
const id = '00000000-0000-4000-8000-000000000002';
const folder = `GOURY - c1-v1/${product.id}`;
const connection = { url:'http://127.0.0.1:50000/session', expiresAt:Date.now()+100000, version:'2.2.0' };
const rpc = vi.fn();
const upload = vi.fn();
const download = vi.fn();
const createSignedUrl = vi.fn();
const storageFrom = vi.fn(() => ({ upload, download, createSignedUrl }));
const client = { rpc, storage: { from: storageFrom } } as unknown as SupabaseClient;
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(connectLocalDrive).mockResolvedValue(connection);
  rpc.mockResolvedValue({data:{directory:'Produits Chimiques',folder},error:null});
  vi.mocked(hasDocumentBlobFile).mockResolvedValue(false);
  upload.mockResolvedValue({ data: { path: id }, error: null });
});
describe('chemical Google Drive files', () => {
  it.each(['2.6.0', '2.10.0'])('keeps chemical files available with launcher %s', async version => {
    vi.mocked(connectLocalDrive).mockResolvedValueOnce({ ...connection, version });
    await expect(createChemicalDrive(client).connect()).resolves.toBeUndefined();
  });
  it('uploads to the authorized product before saving metadata without a Windows launcher', async () => {
    const file = new File(['FDS'], 'FDS été.PDF', {type:'application/pdf'});
    const path = `${folder}/${id}-FDS_ete.pdf`;
    const result = await createChemicalDrive(client).write(product,id,file);
    expect(rpc).toHaveBeenCalledWith('chemical_drive_scope',{target_product:product.id});
    expect(storageFrom).toHaveBeenCalledWith('chemical-drive');
    expect(upload).toHaveBeenCalledWith(id, file, { contentType: 'application/pdf', upsert: false, metadata: { product_id: product.id, file_name: file.name } });
    expect(result).toEqual({drive_path:path,sha256:await chemicalFileHash(new TextEncoder().encode('FDS'))});
    upload.mockResolvedValue({ data: null, error: new Error('Transfert non confirmé') });
    await expect(createChemicalDrive(client).write(product,id,file)).rejects.toThrow('Transfert non confirmé');
    expect(connectLocalDrive).not.toHaveBeenCalled();
    expect(localDriveRequest).not.toHaveBeenCalled();
  });
  it('reads migrated bytes and obtains a fresh URL for each opening without Windows', async () => {
    vi.mocked(hasDocumentBlobFile).mockResolvedValue(true);
    const attachment = { id } as ChemicalAttachment;
    const blob = new Blob(['FDS'], { type: 'application/pdf' });
    download.mockResolvedValue({ data: blob, error: null });
    createSignedUrl.mockResolvedValueOnce({ data: { signedUrl: 'https://example/fresh1' }, error: null })
      .mockResolvedValueOnce({ data: { signedUrl: 'https://example/fresh2' }, error: null });
    const store = createChemicalDrive(client);
    expect(await store.read(attachment)).toBe(blob);
    expect(await store.createSignedUrl!(attachment)).toBe('https://example/fresh1');
    expect(await store.createSignedUrl!(attachment)).toBe('https://example/fresh2');
    expect(createSignedUrl).toHaveBeenCalledTimes(2);
    expect(createSignedUrl).toHaveBeenLastCalledWith(id, 120);
    expect(connectLocalDrive).not.toHaveBeenCalled();
  });
  it('fails closed on a Blob scope refusal or failed URL instead of opening a desktop copy', async () => {
    const denied = { code: '42501', message: 'Document inaccessible' };
    vi.mocked(hasDocumentBlobFile).mockRejectedValueOnce(denied);
    await expect(createChemicalDrive(client).read({ id } as ChemicalAttachment)).rejects.toBe(denied);
    vi.mocked(hasDocumentBlobFile).mockResolvedValue(true);
    createSignedUrl.mockResolvedValue({ data: null, error: denied });
    await expect(createChemicalDrive(client).createSignedUrl!({ id } as ChemicalAttachment)).rejects.toBe(denied);
    expect(connectLocalDrive).not.toHaveBeenCalled();
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
    await expect(addChemicalAttachment(db,store,product,new File(['FDS'],'file.pdf'),'fds')).rejects.toThrow('enregistré dans SeaPilot');
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
