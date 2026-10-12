import {readFileSync,writeFileSync,mkdirSync,cpSync,rmSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {makeCatalog} from '../src/carrier-catalog.mjs';
import {validateCatalog} from '../src/carrier-planner.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const catalog=makeCatalog(JSON.parse(readFileSync(resolve(root,'data/carrier-inputs.json'),'utf8')));validateCatalog(catalog);
let html=readFileSync(resolve(root,'index.html'),'utf8');
if(!html.includes('const LOCATIONS_DATA')||!html.includes('id="locations-list"')||!html.includes('window.PosteFinderBridge'))throw new Error('Unexpected source app: refuse to rewrite its layout');
if(!html.includes('src="./src/carrier-adapter.js"')){
 const end='</body>';
 if(html.split(end).length!==2)throw new Error('Expected one closing body');
 html=html.replace(end,()=>'<script src="./src/carrier-adapter.js"></script>\n<script type="module" src="./src/carrier-ui.mjs"></script>\n'+end);
}
const out=resolve(root,'dist');rmSync(out,{recursive:true,force:true});mkdirSync(out,{recursive:true});
writeFileSync(resolve(out,'index.html'),html);
cpSync(resolve(root,'firebase-config.js'),resolve(out,'firebase-config.js'));
cpSync(resolve(root,'src'),resolve(out,'src'),{recursive:true});
mkdirSync(resolve(out,'data'),{recursive:true});
writeFileSync(resolve(out,'data/carrier-catalog.json'),JSON.stringify(catalog,null,2)+'\n');
writeFileSync(resolve(out,'_headers'),'/data/carrier-catalog.json\n  Cache-Control: public, max-age=0, must-revalidate\n');
console.log('Static release built in dist. No deployment performed. Audited physical sites:',catalog.sites.length);
