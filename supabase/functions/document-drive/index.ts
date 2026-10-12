import { createClient } from '@supabase/supabase-js';
import { createDocumentDriveHandler } from './handler.ts';
import { createGoogleDriveReader } from './googleDrive.ts';

const url=Deno.env.get('SUPABASE_URL')!;
const anonKey=Deno.env.get('SUPABASE_ANON_KEY')!;
const getEnv=(name: string)=>Deno.env.get(name);
const reader=createGoogleDriveReader(getEnv);
const extraOrigins=(getEnv('SEAPILOT_ALLOWED_ORIGINS')||'').split(',').map(v=>v.trim()).filter(Boolean);
Deno.serve(createDocumentDriveHandler({
  publicFunctionUrl:new URL('/functions/v1/document-drive',url).toString(),
  userClient:authorization=>createClient(url,anonKey,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}}),
  readDrive:reader,
  validateDrive:reader.validate,
  signingSecret:()=>getEnv('GOOGLE_DRIVE_SIGNING_SECRET'),
  ...(extraOrigins.length?{allowedOrigins:['https://sea-pilot-ten.vercel.app','https://sea-pilot-bbtm-app.vercel.app','http://localhost:5173','http://127.0.0.1:5173',...extraOrigins]}:{}),
}));
