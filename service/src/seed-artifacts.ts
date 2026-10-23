import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { Writer } from './seed-data.ts';

function triangleGlb(): Buffer {
  const binary = Buffer.alloc(36);
  [0,0,0,1,0,0,0,1,0].forEach((value,i) => binary.writeFloatLE(value,i*4));
  const document = {asset:{version:'2.0',generator:'Kratos semilla'},scene:0,
    scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0}}]}],
    buffers:[{byteLength:36}],bufferViews:[{buffer:0,byteOffset:0,byteLength:36,target:34962}],
    accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]}]};
  const raw = Buffer.from(JSON.stringify(document));
  const json = Buffer.alloc(Math.ceil(raw.length/4)*4,0x20); raw.copy(json);
  const header = Buffer.alloc(20);
  header.write('glTF'); header.writeUInt32LE(2,4); header.writeUInt32LE(28+json.length+binary.length,8);
  header.writeUInt32LE(json.length,12); header.writeUInt32LE(0x4e4f534a,16);
  const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(binary.length); binHeader.writeUInt32LE(0x004e4942,4);
  return Buffer.concat([header,json,binHeader,binary]);
}
export function artifactRows(db: DatabaseSync, put: Writer): void {
  const file = db.prepare('pragma database_list').all().find(r => r.name==='main')!.file as string;
  const root = file ? join(dirname(file),'artifacts') : null;
  const files = ['modelo-demo.glb','captura-01.png','captura-02.png','informe-demo.txt'];
  if (root) {
    mkdirSync(root,{recursive:true});
    writeFileSync(join(root,files[0]),triangleGlb());
    const captures = join(import.meta.dirname,'../../docs/capturas-hito0');
    copyFileSync(join(captures,'intercambio.png'),join(root,files[1]));
    copyFileSync(join(captures,'atendiendo.png'),join(root,files[2]));
    writeFileSync(join(root,files[3]),'Informe de ejemplo Kratos\nPrueba de recorrido: passed\nPrueba de colisiones: failed\n');
  }
  files.forEach((path,i) => put('artifacts',`seed-artifact-0${i+1}`,{
    taskId:'seed-task-09',runId:null,kind:['model','screenshot','screenshot','report'][i],path,
    previewPath:i===0 ? files[1] : null,provenance:{source:'semilla local',synthetic:true},license:'MIT',
  }));
  ['passed','failed'].forEach((result,i) => put('test_runs',`seed-test-0${i+1}`,{
    taskId:'seed-task-09',runId:null,commit:'0000000000000000000000000000000000000000',
    engineVersion:'5.8',map:'Demo',config:'Development',result,reportPath:files[3],
  }));
}
