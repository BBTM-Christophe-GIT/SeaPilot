// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createDocumentDriveHandler } from '../functions/document-drive/handler';
import { base64Url, fromBase64Url, createGoogleDriveReader, DriveAccessError, type DriveDocument } from '../functions/document-drive/googleDrive';

const document: DriveDocument={drive_file_id:'verified_drive_file_123',drive_path:'Flotte/Navire/fixture.pdf',file_name:'Certificat été.pdf',mime_type:'application/pdf',bytes:7,sha256:'a'.repeat(64),verified_at:'2026-10-12T00:00:00Z'};
const secret='s'.repeat(48);
function setup({user=true,allowed=true,mapping: value=document,signing=secret}:{user?:boolean;allowed?:boolean;mapping?:DriveDocument|null;signing?:string}={}) {
  let clock=Date.parse('2026-10-12T12:00:00Z');
  const rpc=vi.fn().mockResolvedValue({data:value,error:allowed?null:{code:'42501'}});
  const getUser=vi.fn().mockResolvedValue({data:{user:user?{id:'fixture-user'}:null},error:null});
  const readDrive=vi.fn().mockImplementation(async()=>new Response('%PDF-x\n',{headers:{'Content-Type':'application/pdf','Set-Cookie':'upstream-secret','Location':'https://foreign.test'}}));
  const handler=createDocumentDriveHandler({userClient:()=>({rpc,auth:{getUser}}) as never,readDrive,signingSecret:()=>signing,now:()=>clock});
  const request=(input: Record<string,unknown>={},authorization='Bearer fixture',origin?:string)=>new Request('https://instance.supabase.co/functions/v1/document-drive',{
    method:'POST',headers:{Authorization:authorization,...(origin?{Origin:origin}:{})},body:JSON.stringify({operation:'url',bucket:'fleet-certificates',path:'1/navire/file.pdf',...input}),
  });
  return {rpc,getUser,readDrive,handler,request,advance:(ms:number)=>{clock+=ms;}};
}

describe('Drive access broker',()=>{
  it('requires a verified user before any reference lookup or file access',async()=>{
    const t=setup({user:false}); expect((await t.handler(t.request())).status).toBe(401); expect(t.rpc).not.toHaveBeenCalled(); expect(t.readDrive).not.toHaveBeenCalled();
    const a=setup(); expect((await a.handler(a.request({},''))).status).toBe(401); expect(a.getUser).not.toHaveBeenCalled();
  });
  it('keeps denied mappings distinct from missing legacy files and never reads content',async()=>{
    const t=setup({allowed:false}); expect((await t.handler(t.request())).status).toBe(403); expect(t.readDrive).not.toHaveBeenCalled();
    const missing=setup({mapping:null}); expect((await missing.handler(missing.request())).status).toBe(404);
  });
  it('signs a short capability with the real document and sanitized download name',async()=>{
    const t=setup(); const response=await t.handler(t.request({expiresIn:900,download:'Certificat remis.pdf'}));
    expect(response.status).toBe(200); const {signedUrl}=await response.json();
    expect(signedUrl).not.toContain('Bearer'); expect(signedUrl).not.toContain(secret);
    const file=await t.handler(new Request(signedUrl)); expect(file.status).toBe(200); expect(await file.text()).toBe('%PDF-x\n');
    expect(file.headers.get('content-type')).toBe('application/pdf'); expect(file.headers.get('content-disposition')).toContain('attachment;');
    expect(file.headers.get('content-disposition')).toContain('Certificat%20remis.pdf'); expect(file.headers.get('set-cookie')).toBeNull(); expect(file.headers.get('location')).toBeNull();
    t.advance(120_000); expect((await t.handler(new Request(signedUrl))).status).toBe(401);
  });
  it('rejects forged, tampered and unbounded tickets without calling Drive',async()=>{
    const t=setup(); expect((await t.handler(new Request('https://instance.test?ticket=forged.capability'))).status).toBe(401);
    const {signedUrl}=await (await t.handler(t.request())).json(); const url=new URL(signedUrl);
    const ticket=url.searchParams.get('ticket')!; const [payload,signature]=ticket.split('.');
    const parsed=JSON.parse(new TextDecoder().decode(fromBase64Url(payload))); parsed.document.drive_file_id='foreign_drive_123';
    url.searchParams.set('ticket',`${base64Url(new TextEncoder().encode(JSON.stringify(parsed)))}.${signature}`);
    expect((await t.handler(new Request(url))).status).toBe(401); expect(t.readDrive).not.toHaveBeenCalled();
  });
  it('returns binary Word/Excel downloads compatible with functions-js',async()=>{
    const t=setup({mapping:{...document,mime_type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',file_name:'Classeur.xlsx'}});
    const response=await t.handler(t.request({operation:'download'})); expect(response.status).toBe(200); expect(response.headers.get('content-type')).toBe('application/octet-stream');
    expect(t.rpc).toHaveBeenCalledWith('document_drive_lookup',{target_bucket:'fleet-certificates',target_path:'1/navire/file.pdf'});
  });
  it('rejects malicious paths, unsafe filenames and foreign origins',async()=>{
    const t=setup();
    for (const input of [{path:'../private.pdf'},{bucket:'https://foreign.test'},{download:'bad\r\nInjected: header.pdf'},{expiresIn:-1}]) expect((await t.handler(t.request(input))).status).toBe(400);
    expect((await t.handler(t.request({},'Bearer fixture','https://foreign.test'))).status).toBe(403); expect(t.rpc).not.toHaveBeenCalled();
  });
  it('fails explicitly when signing or Google access is not configured',async()=>{
    const t=setup({signing:''}); expect((await t.handler(t.request())).status).toBe(503);
    const unconfigured=createGoogleDriveReader(()=>undefined); await expect(unconfigured(document)).rejects.toMatchObject({status:503});
  });
  it('propagates a verified Drive failure without fabricating a Storage fallback',async()=>{
    const t=setup(); t.readDrive.mockRejectedValue(new DriveAccessError(409,'Document modifié.'));
    expect((await t.handler(t.request({operation:'download'}))).status).toBe(409);
  });
});

describe('Google Drive reader',()=>{
  const env=(name:string)=>({GOOGLE_DRIVE_CLIENT_ID:'fixture-client',GOOGLE_DRIVE_CLIENT_SECRET:'fixture-secret',GOOGLE_DRIVE_REFRESH_TOKEN:'fixture-refresh'} as Record<string,string>)[name];
  const token=()=>new Response(JSON.stringify({access_token:'google-test-token',expires_in:3600}));
  const metadata=(extra:Record<string,unknown>={})=>new Response(JSON.stringify({id:document.drive_file_id,name:document.file_name,mimeType:document.mime_type,size:String(document.bytes),...extra}));
  it('prefers the private Vercel broker, sends only its server credential and reuses a short token',async()=>{
    const broker='https://sea-pilot-ten.vercel.app/api/google-drive-token'; const brokerSecret='b'.repeat(64);
    const getEnv=(name:string)=>({GOOGLE_DRIVE_TOKEN_BROKER_URL:broker,GOOGLE_DRIVE_TOKEN_BROKER_SECRET:brokerSecret,GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON:'malformed-unused-json'} as Record<string,string>)[name]||env(name);
    const send=vi.fn().mockResolvedValueOnce(Response.json({access_token:'broker-readonly-token',expires_in:600})).mockImplementation(async()=>metadata());
    const reader=createGoogleDriveReader(getEnv,send); await reader.validate(document); await reader.validate(document);
    expect(send.mock.calls[0][0]).toBe(broker); expect(send.mock.calls[0][1]).toMatchObject({method:'POST',redirect:'error',headers:{Authorization:`Bearer ${brokerSecret}`}});
    expect(send.mock.calls[0][1].body).toBeUndefined(); expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls[1][1].headers.Authorization).toBe('Bearer broker-readonly-token');
  });
  it.each(['https://foreign.vercel.app/api/google-drive-token','http://sea-pilot-ten.vercel.app/api/google-drive-token',
    'https://sea-pilot-ten.vercel.app/api/other','https://secret@sea-pilot-ten.vercel.app/api/google-drive-token',
    'https://sea-pilot-ten.vercel.app/api/google-drive-token?redirect=1','https://sea-pilot-ten.vercel.app:444/api/google-drive-token'])
    ('refuses an unsafe broker URL without sending credentials: %s',async(url)=>{
      const send=vi.fn(); await expect(createGoogleDriveReader(name=>name==='GOOGLE_DRIVE_TOKEN_BROKER_URL'?url:name==='GOOGLE_DRIVE_TOKEN_BROKER_SECRET'?'b'.repeat(64):env(name),send).validate(document)).rejects.toMatchObject({status:503}); expect(send).not.toHaveBeenCalled();
    });
  it('never falls back to OAuth when the broker fails or returns an unsafe token',async()=>{
    const getEnv=(name:string)=>({GOOGLE_DRIVE_TOKEN_BROKER_URL:'https://sea-pilot-ten.vercel.app/api/google-drive-token',GOOGLE_DRIVE_TOKEN_BROKER_SECRET:'b'.repeat(64)} as Record<string,string>)[name]||env(name);
    for (const reply of [{access_token:'broker-token',expires_in:601},{access_token:'wrong\nheader',expires_in:600},{error:'sensitive Google message'}]) {
      const send=vi.fn().mockResolvedValue(Response.json(reply)); await expect(createGoogleDriveReader(getEnv,send).validate(document)).rejects.toThrow('Autorisation serveur Google Drive indisponible.'); expect(send).toHaveBeenCalledTimes(1);
    }
  });
  it('uses fixed endpoints, verifies metadata and streams bytes without exposing credentials',async()=>{
    const send=vi.fn().mockResolvedValueOnce(token()).mockResolvedValueOnce(metadata()).mockResolvedValueOnce(new Response('%PDF-x\n',{headers:{'Content-Type':'application/pdf'}}));
    const reader=createGoogleDriveReader(env,send); expect(await (await reader(document)).text()).toBe('%PDF-x\n');
    expect(send.mock.calls[0][0]).toBe('https://oauth2.googleapis.com/token'); expect(send.mock.calls[2][0]).toContain('?alt=media&supportsAllDrives=true');
  });
  it.each([{size:'104857601'},{mimeType:'text/html'},{trashed:true},{id:'wrong_drive_id'}])('refuses an invalid current Drive document: %j',async(extra)=>{
    const send=vi.fn().mockResolvedValueOnce(token()).mockResolvedValueOnce(metadata(extra));
    await expect(createGoogleDriveReader(env,send)(document)).rejects.toMatchObject({status:409}); expect(send).toHaveBeenCalledTimes(2);
  });
  it('serves the current version after an authorized Drive edit changes its size and name',async()=>{
    const contents='%PDF-1.7\nnew-version';
    const send=vi.fn().mockResolvedValueOnce(token()).mockResolvedValueOnce(metadata({size:String(contents.length),name:'Current version.pdf'}))
      .mockResolvedValueOnce(new Response(contents,{headers:{'Content-Type':'application/pdf'}}));
    const response=await createGoogleDriveReader(env,send)(document);
    expect(await response.text()).toBe(contents); expect(response.headers.get('X-SeaPilot-File-Name')).toBe('Current%20version.pdf');
  });
  it('accepts case variants of the XLSM MIME without changing the binary format',async()=>{
    const workbook={...document,mime_type:'application/vnd.ms-excel.sheet.macroEnabled.12',file_name:'Planning.xlsm'};
    const send=vi.fn().mockResolvedValueOnce(token()).mockResolvedValueOnce(metadata({mimeType:'application/vnd.ms-excel.sheet.macroEnabled.12',name:'Planning.xlsm'}))
      .mockResolvedValueOnce(new Response('workbook'.slice(0,7),{headers:{'Content-Type':'application/vnd.ms-excel.sheet.macroEnabled.12'}}));
    const response=await createGoogleDriveReader(env,send)(workbook); expect(await response.text()).toBe('workboo');
  });
  it('rejects a stream truncated or enlarged after the metadata read',async()=>{
    const send=vi.fn().mockResolvedValueOnce(token()).mockResolvedValueOnce(metadata()).mockResolvedValueOnce(new Response('too long body',{headers:{'Content-Type':'application/pdf'}}));
    const response=await createGoogleDriveReader(env,send)(document); await expect(response.text()).rejects.toThrow('La version Drive a changé');
  });
  it('authenticates a service account as a reader and keeps credentials off response bodies',async()=>{
    const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
    const pkcs8=await crypto.subtle.exportKey('pkcs8',keys.privateKey);
    const privateKey=`-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...new Uint8Array(pkcs8)))}\n-----END PRIVATE KEY-----`;
    const account={client_email:'fixture-reader@fixture.iam.gserviceaccount.com',private_key:privateKey};
    const send=vi.fn().mockResolvedValueOnce(token()).mockResolvedValueOnce(metadata()).mockResolvedValueOnce(new Response('%PDF-x\n',{headers:{'Content-Type':'application/pdf'}}));
    const response=await createGoogleDriveReader(name=>name==='GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON'?JSON.stringify(account):undefined,send)(document);
    expect(await response.text()).toBe('%PDF-x\n');
    const form=send.mock.calls[0][1].body as URLSearchParams;
    const assertion=form.get('assertion')!; const claims=JSON.parse(new TextDecoder().decode(fromBase64Url(assertion.split('.')[1])));
    expect(claims.scope).toBe('https://www.googleapis.com/auth/drive.readonly'); expect(claims.aud).toBe('https://oauth2.googleapis.com/token');
    expect(claims.iss).toBe(account.client_email);
    expect(await crypto.subtle.verify('RSASSA-PKCS1-v1_5',keys.publicKey,fromBase64Url(assertion.split('.')[2]),new TextEncoder().encode(assertion.split('.').slice(0,2).join('.')))).toBe(true);
  });
  it('rejects content-type replacement and invalid mappings before serving bytes',async()=>{
    const send=vi.fn().mockResolvedValueOnce(token()).mockResolvedValueOnce(metadata()).mockResolvedValueOnce(new Response('<html>',{headers:{'Content-Type':'text/html'}}));
    await expect(createGoogleDriveReader(env,send)(document)).rejects.toMatchObject({status:409});
    const untouched=vi.fn(); await expect(createGoogleDriveReader(env,untouched)({...document,drive_file_id:'https://foreign.test'})).rejects.toMatchObject({status:422}); expect(untouched).not.toHaveBeenCalled();
  });
  it('never reports upstream OAuth secret-bearing errors to a caller',async()=>{
    const send=vi.fn().mockResolvedValue(new Response(JSON.stringify({error_description:'fixture-refresh fixture-secret'}),{status:400}));
    await expect(createGoogleDriveReader(env,send)(document)).rejects.toThrow('Autorisation serveur Google Drive indisponible.');
  });
});
