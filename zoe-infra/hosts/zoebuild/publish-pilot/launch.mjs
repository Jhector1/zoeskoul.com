import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { workerSmokeCommand } from './tanstackWorkerRuntimePolicy.ts';
// Reuse the existing trusted, binding-free config policy. Never launch generated
// wrangler configuration directly, or use user packages/commands from a workspace.
const metadata=readFileSync('/workspace/dist/server/wrangler.json');
if(metadata.length>64*1024) throw Error('Pilot metadata too large');
const artifact={files:[{path:'server/wrangler.json',encoding:'base64',data:metadata.toString('base64')}]};
const [cmd,...args]=workerSmokeCommand(artifact);
const child=spawn(cmd,args,{stdio:'inherit',cwd:'/tmp'});
for(const signal of ['SIGTERM','SIGINT']) process.on(signal,()=>child.kill(signal));
child.on('error',()=>{process.exitCode=1});
child.on('exit',(code)=>{process.exitCode=code===0?0:1});
