import type { SupabaseClient } from '@supabase/supabase-js';
import { base64Url, fromBase64Url, isDriveDocument, DriveAccessError, type DriveDocument } from './googleDrive.ts';

interface Dependencies {
  userClient: (authorization: string)=>SupabaseClient;
  readDrive: (document: DriveDocument)=>Promise<Response>;
  validateDrive?: (document: DriveDocument)=>Promise<DriveDocument>;
  signingSecret: ()=>string|undefined;
  allowedOrigins?: string[];
  now?: ()=>number;
}
interface Ticket {
  v: 1;
  uid: string;
  bucket: string;
  path: string;
  document: DriveDocument;
  fileName: string;
  attachment: boolean;
  exp: number;
}
const encoder=new TextEncoder();
const DEFAULT_ORIGINS=['https://sea-pilot-ten.vercel.app','https://sea-pilot-bbtm-app.vercel.app','http://localhost:5173','http://127.0.0.1:5173'];
const safeName=(name: unknown): name is string=>typeof name==='string' && name.length>0 && name.length<=255 && !/[/\\\u0000-\u001f\u007f]/.test(name);
const validLocation=(bucket: unknown,path: unknown): boolean=>typeof bucket==='string' && /^[a-z0-9][a-z0-9-]{0,99}$/.test(bucket)
  && typeof path==='string' && path.length>0 && path.length<=2000 && !/(^\/|(^|\/)\.\.?(\/|$)|[\u0000-\u001f\u007f])/.test(path);

export function createDocumentDriveHandler({userClient,readDrive,validateDrive,signingSecret,allowedOrigins=DEFAULT_ORIGINS,now=Date.now}: Dependencies) {
  const signingKey=async () => {
    const secret=signingSecret();
    if (!secret || secret.length<32) throw new DriveAccessError(503,'Signature des liens Google Drive non configurée.');
    return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
  };
  return async (request: Request): Promise<Response> => {
    const origin=request.headers.get('origin')||'';
    const cors: Record<string,string>={'Cache-Control':'no-store','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods':'POST, GET, OPTIONS','Access-Control-Expose-Headers':'Content-Disposition, Content-Type',Vary:'Origin'};
    if (origin && allowedOrigins.includes(origin)) cors['Access-Control-Allow-Origin']=origin;
    const json=(status: number,body: Record<string,unknown>)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json; charset=utf-8'}});
    if (origin && !allowedOrigins.includes(origin)) return json(403,{error:'Origine non autorisée.'});
    if (request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
    try {
      let document: DriveDocument, fileName: string, attachment=false;
      if (request.method==='GET') {
        const raw=new URL(request.url).searchParams.get('ticket')||'';
        if (raw.length>8000 || raw.split('.').length!==2) return json(401,{error:'Lien Google Drive invalide ou expiré.'});
        const [payload,signature]=raw.split('.');
        let ticket: Ticket;
        try {
          if (!await crypto.subtle.verify('HMAC',await signingKey(),fromBase64Url(signature),encoder.encode(payload))) return json(401,{error:'Lien Google Drive invalide ou expiré.'});
          ticket=JSON.parse(new TextDecoder().decode(fromBase64Url(payload)));
        } catch (error) {
          if (error instanceof DriveAccessError) throw error;
          return json(401,{error:'Lien Google Drive invalide ou expiré.'});
        }
        const seconds=Math.floor(now()/1000);
        if (!ticket || ticket.v!==1 || !Number.isSafeInteger(ticket.exp) || ticket.exp<=seconds || ticket.exp>seconds+120
          || typeof ticket.uid!=='string' || !ticket.uid || !validLocation(ticket.bucket,ticket.path)
          || !isDriveDocument(ticket.document) || !safeName(ticket.fileName) || typeof ticket.attachment!=='boolean') {
          return json(401,{error:'Lien Google Drive invalide ou expiré.'});
        }
        document=ticket.document; fileName=ticket.fileName; attachment=ticket.attachment;
      } else if (request.method==='POST') {
        const authorization=request.headers.get('authorization')||'';
        if (!/^Bearer \S+$/i.test(authorization)) return json(401,{error:'Connexion SeaPilot requise.'});
        const body=await request.text();
        if (body.length>4000) return json(400,{error:'Requête invalide.'});
        let input: {operation?: string;bucket?: string;path?: string;expiresIn?: number;download?: boolean|string};
        try { input=JSON.parse(body); } catch { return json(400,{error:'Requête invalide.'}); }
        if (!input || !['url','download'].includes(input.operation||'') || !validLocation(input.bucket,input.path)
          || (input.expiresIn!==undefined && (!Number.isFinite(input.expiresIn) || input.expiresIn<=0))
          || (input.download!==undefined && typeof input.download!=='boolean' && !safeName(input.download))) return json(400,{error:'Référence invalide.'});
        const client=userClient(authorization);
        const user=await client.auth.getUser();
        if (user.error || !user.data.user) return json(401,{error:'Session SeaPilot expirée.'});
        const mapping=await client.rpc('document_drive_lookup',{target_bucket:input.bucket,target_path:input.path});
        if (mapping.error) return json(mapping.error.code==='42501'?403:500,{error:'Document inaccessible pour ce profil.'});
        if (!mapping.data) return json(404,{error:'Correspondance Google Drive introuvable.'});
        if (!isDriveDocument(mapping.data)) return json(422,{error:'Correspondance Google Drive non vérifiée.'});
        document=mapping.data;
        fileName=typeof input.download==='string'?input.download:document.file_name;
        attachment=input.download===true || typeof input.download==='string';
        if (input.operation==='url') {
          // Do not issue an apparently usable URL for a missing Google server
          // configuration or a document whose verified metadata has changed.
          const key=await signingKey();
          if (validateDrive) document=await validateDrive(document);
          if (!attachment) fileName=document.file_name;
          const ticket: Ticket={v:1,uid:user.data.user.id,bucket:input.bucket!,path:input.path!,document,fileName,attachment,
            exp:Math.floor(now()/1000)+Math.max(1,Math.min(120,Math.floor(input.expiresIn||120)))};
          const payload=base64Url(encoder.encode(JSON.stringify(ticket)));
          const signature=base64Url(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(payload))));
          const url=new URL(request.url); url.search=''; url.searchParams.set('ticket',`${payload}.${signature}`);
          return json(200,{signedUrl:url.toString()});
        }
      } else return json(405,{error:'Méthode non autorisée.'});
      const media=await readDrive(document);
      if (!attachment && media.headers.get('X-SeaPilot-File-Name')) {
        const currentName=decodeURIComponent(media.headers.get('X-SeaPilot-File-Name')!);
        if (safeName(currentName)) fileName=currentName;
      }
      // Never forward Google credentials, redirects, cookies or other upstream headers.
      const asciiName=fileName.replace(/[^\x20-\x7e]|[";]/g,'_');
      const encodedName=encodeURIComponent(fileName).replace(/[!'()*]/g,c=>`%${c.charCodeAt(0).toString(16).toUpperCase()}`);
      return new Response(media.body,{status:200,headers:{...cors,
        // functions-js recognizes binary Word/Excel responses only as octet-stream.
        'Content-Type':request.method==='POST'?'application/octet-stream':media.headers.get('Content-Type')||document.mime_type,
        'Content-Disposition':`${attachment?'attachment':'inline'}; filename="${asciiName}"; filename*=UTF-8''${encodedName}`,
        'X-Content-Type-Options':'nosniff',
      }});
    } catch (error) {
      return error instanceof DriveAccessError?json(error.status,{error:error.message}):json(502,{error:'Accès Google Drive temporairement indisponible.'});
    }
  };
}
