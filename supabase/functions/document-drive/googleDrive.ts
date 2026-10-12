export interface DriveDocument {
  drive_file_id: string;
  drive_path: string;
  file_name: string;
  mime_type: string;
  bytes: number;
  sha256: string;
  verified_at: string;
}

export class DriveAccessError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

const FILE_ID = /^[a-zA-Z0-9_-]{10,200}$/;
const DOCUMENT_MIMES = new Set([
  'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.template', 'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel.sheet.macroenabled.12',
]);
const mimeFamily=(mime: string)=>mime==='application/pdf'?'pdf':mime==='application/msword' || mime.includes('wordprocessingml')?'word':mime.includes('excel') || mime.includes('spreadsheetml')?'excel':null;
const canonicalMime=(mime: unknown,name: unknown): string|null=>{
  if (typeof mime!=='string') return null;
  const normalized=mime.split(';')[0].trim().toLowerCase();
  if (DOCUMENT_MIMES.has(normalized)) return normalized;
  // Some imported binary files have a generic MIME in Drive. Only known Office
  // or PDF extensions can restore a document MIME; HTML and native Apps are
  // never served as trusted PDFs or Office files.
  if (normalized==='application/octet-stream' && typeof name==='string') {
    const extension=name.split('.').pop()?.toLowerCase();
    return ({pdf:'application/pdf',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      dotx:'application/vnd.openxmlformats-officedocument.wordprocessingml.template',xls:'application/vnd.ms-excel',
      xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',xlsm:'application/vnd.ms-excel.sheet.macroenabled.12'} as Record<string,string>)[extension||'']||null;
  }
  return null;
};
const encoder = new TextEncoder();
const BROKER_HOSTS = new Set(['sea-pilot-ten.vercel.app', 'sea-pilot-bbtm-app.vercel.app']);

export function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let offset=0; offset<bytes.length; offset+=8192) binary += String.fromCharCode(...bytes.subarray(offset,offset+8192));
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

export function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error('Invalid encoding');
  return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')), c=>c.charCodeAt(0));
}

export function isDriveDocument(value: unknown): value is DriveDocument {
  if (!value || typeof value !== 'object') return false;
  const d = value as DriveDocument;
  return typeof d.drive_file_id==='string' && FILE_ID.test(d.drive_file_id)
    && typeof d.drive_path==='string' && d.drive_path.length>0
    && typeof d.file_name==='string' && d.file_name.length>0 && d.file_name.length<=255 && !/[/\\\u0000-\u001f\u007f]/.test(d.file_name)
    && typeof d.mime_type==='string' && DOCUMENT_MIMES.has(d.mime_type.toLowerCase())
    && Number.isSafeInteger(d.bytes) && d.bytes>0 && d.bytes<=104857600
    && typeof d.sha256==='string' && /^[a-f0-9]{64}$/.test(d.sha256)
    && typeof d.verified_at==='string' && Number.isFinite(Date.parse(d.verified_at));
}

/** Only fixed Google endpoints are contacted; no client-chosen URL or token URI. */
export function createGoogleDriveReader(getEnv: (name: string)=>string|undefined, send: typeof fetch=fetch, now=Date.now) {
  let cached: { token: string; expires: number } | null = null;
  let refreshing: Promise<string> | null = null;
  const token = async (): Promise<string> => {
    if (cached && cached.expires>now()+60_000) return cached.token;
    if (refreshing) return refreshing;
    refreshing = (async () => {
      let body: URLSearchParams;
      const brokerUrl = getEnv('GOOGLE_DRIVE_TOKEN_BROKER_URL');
      const brokerSecret = getEnv('GOOGLE_DRIVE_TOKEN_BROKER_SECRET');
      if (brokerUrl || brokerSecret) {
        let endpoint: URL;
        try { endpoint = new URL(brokerUrl || ''); } catch { throw new DriveAccessError(503,'Configuration du lecteur Google Drive invalide.'); }
        if (endpoint.protocol !== 'https:' || !BROKER_HOSTS.has(endpoint.hostname) || endpoint.port
          || endpoint.pathname !== '/api/google-drive-token' || endpoint.search || endpoint.hash || endpoint.username || endpoint.password
          || !brokerSecret || !/^[\x21-\x7e]{43,256}$/.test(brokerSecret)) throw new DriveAccessError(503,'Configuration du lecteur Google Drive invalide.');
        let response: Response;
        try { response = await send(endpoint.href,{method:'POST',headers:{Authorization:`Bearer ${brokerSecret}`},redirect:'error',signal:AbortSignal.timeout(30_000)}); }
        catch { throw new DriveAccessError(502,'Autorisation serveur Google Drive indisponible.'); }
        const result = await response.json().catch(()=>null);
        if (!response.ok || typeof result?.access_token !== 'string' || !/^[^\s]{1,16384}$/.test(result.access_token)
          || !Number.isInteger(result.expires_in) || result.expires_in <= 0 || result.expires_in > 600) throw new DriveAccessError(503,'Autorisation serveur Google Drive indisponible.');
        cached = {token:result.access_token,expires:now()+result.expires_in*1000};
        return cached.token;
      }
      const accountJson = getEnv('GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON');
      if (accountJson) {
        let account: { client_email?: string; private_key?: string };
        try { account=JSON.parse(accountJson); } catch { throw new DriveAccessError(503,'Configuration Google Drive invalide.'); }
        if (!account || typeof account.client_email!=='string' || !/^[^\s@]+@[^\s@]+$/.test(account.client_email)
          || typeof account.private_key!=='string') throw new DriveAccessError(503,'Configuration Google Drive invalide.');
        const iat = Math.floor(now()/1000);
        const unsigned = `${base64Url(encoder.encode(JSON.stringify({alg:'RS256',typ:'JWT'})))}.${base64Url(encoder.encode(JSON.stringify({
          iss:account.client_email,scope:'https://www.googleapis.com/auth/drive.readonly',aud:'https://oauth2.googleapis.com/token',iat,exp:iat+3600,
        })))}`;
        let signature: ArrayBuffer;
        try {
          const der=Uint8Array.from(atob(account.private_key.replace(/-----[^-]+-----/g,'').replace(/\s/g,'')),c=>c.charCodeAt(0));
          const key=await crypto.subtle.importKey('pkcs8',der,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
          signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,encoder.encode(unsigned));
        } catch { throw new DriveAccessError(503,'Configuration Google Drive invalide.'); }
        body=new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:`${unsigned}.${base64Url(new Uint8Array(signature))}`});
      } else {
        const clientId=getEnv('GOOGLE_DRIVE_CLIENT_ID'), clientSecret=getEnv('GOOGLE_DRIVE_CLIENT_SECRET'), refreshToken=getEnv('GOOGLE_DRIVE_REFRESH_TOKEN');
        if (!clientId || !clientSecret || !refreshToken) throw new DriveAccessError(503,'Accès serveur Google Drive non configuré.');
        body=new URLSearchParams({grant_type:'refresh_token',client_id:clientId,client_secret:clientSecret,refresh_token:refreshToken});
      }
      let response: Response;
      try { response=await send('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,signal:AbortSignal.timeout(30_000)}); }
      catch { throw new DriveAccessError(502,'Google Drive ne répond pas.'); }
      const result=await response.json().catch(()=>null);
      if (!response.ok || typeof result?.access_token!=='string' || !result.access_token || !Number.isFinite(Number(result.expires_in)) || Number(result.expires_in)<=0) {
        throw new DriveAccessError(503,'Autorisation serveur Google Drive indisponible.');
      }
      cached={token:result.access_token,expires:now()+Math.min(Number(result.expires_in),3600)*1000};
      return cached.token;
    })().finally(()=>{refreshing=null;});
    return refreshing;
  };

  const inspect=async (document: DriveDocument) => {
    if (!isDriveDocument(document)) throw new DriveAccessError(422,'Correspondance Google Drive non vérifiée.');
    const authorization=`Bearer ${await token()}`;
    const endpoint=`https://www.googleapis.com/drive/v3/files/${document.drive_file_id}`;
    let metadataResponse: Response;
    try { metadataResponse=await send(`${endpoint}?fields=id,name,mimeType,size,trashed&supportsAllDrives=true`,{headers:{Authorization:authorization},signal:AbortSignal.timeout(30_000)}); }
    catch { throw new DriveAccessError(502,'Google Drive ne répond pas.'); }
    if (!metadataResponse.ok) throw new DriveAccessError(metadataResponse.status===404?404:502,'Document Google Drive indisponible.');
    const metadata=await metadataResponse.json().catch(()=>null);
    const mime=canonicalMime(metadata?.mimeType,metadata?.name);
    const bytes=Number(metadata?.size);
    if (!metadata || metadata.trashed===true || metadata.id!==document.drive_file_id || !mime
      || mimeFamily(mime)!==mimeFamily(document.mime_type.toLowerCase())
      || !Number.isSafeInteger(bytes) || bytes<=0 || bytes>104857600) {
      throw new DriveAccessError(409,'Le document Drive est indisponible ou son format ne correspond plus à la référence vérifiée.');
    }
    const name=typeof metadata.name==='string' && metadata.name.length>0 && metadata.name.length<=255 && !/[/\\\u0000-\u001f\u007f]/.test(metadata.name)?metadata.name:document.file_name;
    // Hash/bytes in the database are the migration proof, not a version lock.
    // Continue to serve the current authorized version of this same Drive ID.
    return {authorization,endpoint,current:{...document,mime_type:mime,bytes,file_name:name}};
  };
  const read=async (document: DriveDocument): Promise<Response> => {
    const {authorization,endpoint,current}=await inspect(document);
    let media: Response;
    try { media=await send(`${endpoint}?alt=media&supportsAllDrives=true`,{headers:{Authorization:authorization},signal:AbortSignal.timeout(120_000)}); }
    catch { throw new DriveAccessError(502,'Téléchargement Google Drive indisponible.'); }
    if (!media.ok || !media.body) throw new DriveAccessError(media.status===404?404:502,'Document Google Drive indisponible.');
    const length=media.headers.get('content-length');
    const mime=(media.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
    if ((length!==null && Number(length)!==current.bytes) || (mime && mime!=='application/octet-stream' && canonicalMime(mime,current.file_name)!==current.mime_type)) {
      await media.body.cancel();
      throw new DriveAccessError(409,'Le document Drive a changé depuis sa vérification.');
    }
    let received=0;
    const bounded=media.body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({
      transform(chunk,controller) {
        received+=chunk.byteLength;
        if (received>current.bytes || received>104857600) throw new DriveAccessError(409,'La version Drive a changé pendant le téléchargement.');
        controller.enqueue(chunk);
      },
      flush() { if (received!==current.bytes) throw new DriveAccessError(409,'Téléchargement Drive incomplet.'); },
    }));
    return new Response(bounded,{headers:{'Content-Type':current.mime_type,'X-SeaPilot-File-Name':encodeURIComponent(current.file_name)}});
  };
  return Object.assign(read,{validate:async (document: DriveDocument): Promise<DriveDocument>=>(await inspect(document)).current});
}
