import fs from 'node:fs';
import italian from '../src/i18n/italian-source.js';
const keys=JSON.parse(fs.readFileSync('src/i18n/ui-keys.json','utf8'));
const folded=new Map(Object.entries(italian).map(([key,value])=>[key.trim().toLowerCase(),value]));
const preserved = new Set(['ADC','RPE','RPE ','EUR ',' EUR ','LifeOS','Vault','W','kg x ',' kg × ','h','min','s','app','req ',' ×{v0}','+1h','Autosave','Importance ','recent','today','total','updated ','Project ','Template ','Template exercise ','Edit expense ',' / refreshing']);
const missing=[];
const translations={...italian};
for(const key of keys) {
  let value=italian[key] ?? folded.get(key.trim().toLowerCase());
  if(value!==undefined) {
    if(key.trim()===key.trim().toUpperCase() && /[A-Z]/.test(key))value=value.toUpperCase();
    if(key.trim()===key.trim().toLowerCase() && /^[a-z]/.test(key.trim()))value=value.charAt(0).toLowerCase()+value.slice(1);
    translations[key]=key.match(/^\s*/)[0]+value.trim()+key.match(/\s*$/)[0];
  } else if(preserved.has(key))translations[key]=key;
  else missing.push(key);
}
if(missing.length){console.log(JSON.stringify(missing,null,2));process.exitCode=1;}
const output=JSON.stringify(translations,null,2)+'\n';
if(process.argv.includes('--check')){if(fs.readFileSync('src/i18n/it.json','utf8').replaceAll('\r\n','\n')!==output)throw new Error('Italian dictionary drift');}
else fs.writeFileSync('src/i18n/it.json',output);
