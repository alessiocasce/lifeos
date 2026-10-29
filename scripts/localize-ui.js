// Range-based JSX codemod: translates interface literals, never record values.
import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';
const files=['src/App.jsx',...['src/components','src/tabs'].flatMap(dir=>fs.readdirSync(dir).filter(n=>n.endsWith('.jsx')).map(n=>`${dir}/${n}`))];
const textual=new Set(['aria-label','title','label','placeholder','eyebrow','subtitle','description','emptyLabel','buttonLabel','alt']);
const keys=new Set();
for(const file of files) {
  const source=fs.readFileSync(file,'utf8');
  const ast=parse(source,{sourceType:'module',plugins:['jsx','importAttributes']});
  const collect=node=>{if(!node || typeof node!=='object')return;
    if(node.type==='CallExpression' && node.callee.name==='t' && node.arguments[0]?.type==='StringLiteral')keys.add(node.arguments[0].value);
    for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(collect);else if(value?.type)collect(value);}
  }; collect(ast);
  const edits=[];
  const quote=value=>JSON.stringify(value);
  const translated=value=>{keys.add(value);return `t(${quote(value)})`;};
  const eligible=value=>typeof value==='string' && /[a-zA-Z]/.test(value) && value.trim().length>0;
  const edit=(node,text)=>edits.push({start:node.start,end:node.end,text});
  const rendered=node=>{
    if(!node)return;
    if(node.type==='StringLiteral' && eligible(node.value))edit(node,translated(node.value));
    else if(node.type==='ConditionalExpression'){rendered(node.consequent);rendered(node.alternate);}
    else if(node.type==='LogicalExpression')rendered(node.right);
    else if(node.type==='BinaryExpression' && node.operator==='+'){rendered(node.left);rendered(node.right);}
    else if(node.type==='TemplateLiteral') {
      let key='';const values=[];node.quasis.forEach((part,i)=>{key+=part.value.cooked;if(i<node.expressions.length){key+=`{v${i}}`;values.push(`v${i}: ${source.slice(node.expressions[i].start,node.expressions[i].end)}`);}});
      if(eligible(key)){keys.add(key);edit(node,`t(${quote(key)}, { ${values.join(', ')} })`);}
    }
  };
  const walk=(node,parent)=>{
    if(!node || typeof node!=='object')return;
    if(node.type==='JSXText') {
      const lines=node.value.replaceAll('\t',' ').split(/\r?\n/);let text='';
      lines.forEach((line,i)=>{let s=line;if(i>0)s=s.replace(/^ +/,'');if(i<lines.length-1)s=s.replace(/ +$/,'');if(s){text+=s;if(i<lines.length-1 && lines.slice(i+1).some(x=>x.trim()))text+=' ';}});
      if(eligible(text))edit(node,`{${translated(text)}}`);return;
    }
    if(node.type==='JSXAttribute') {
      if(textual.has(node.name.name)) {
        if(node.value?.type==='StringLiteral' && eligible(node.value.value)) edit(node.value,`{${translated(node.value.value)}}`);
        else if(node.value?.type==='JSXExpressionContainer')rendered(node.value.expression);
      }
      // Other attributes include enum values, class names and data, not UI prose.
      if(node.value?.type==='JSXExpressionContainer' && ['JSXElement','JSXFragment'].includes(node.value.expression.type))walk(node.value.expression,node);
      return;
    }
    if(node.type==='JSXExpressionContainer') {
      rendered(node.expression);
      const expression=node.expression;
      if(expression?.type==='MemberExpression' && expression.property.name==='label' && parent?.type!=='JSXAttribute') edit(expression,`t(${source.slice(expression.start,expression.end)})`);
      if(expression?.type==='Identifier' && /Error$/.test(expression.name) && parent?.type!=='JSXAttribute')edit(expression,`t(${expression.name})`);
      if(expression?.type==='Identifier' && ['notice','message','label'].includes(expression.name) && ['AuthScreen.jsx','SettingsTab.jsx','Shell.jsx'].includes(path.basename(file)))edit(expression,`t(${expression.name})`);
    }
    if(node.type==='ObjectProperty' && ['label','description'].includes(node.key.name) && node.value.type==='StringLiteral' && eligible(node.value.value))keys.add(node.value.value);
    if(node.type==='CallExpression' && (node.callee.name==='t')) { if(node.arguments[0]?.type==='StringLiteral')keys.add(node.arguments[0].value); return; }
    if(node.type==='CallExpression' && (/^set.*(Error|Message|Notice)$/.test(node.callee.name || '') || node.callee.name==='setMessage' || node.callee.name==='setNotice' || node.callee.property?.name==='confirm'))rendered(node.arguments[0]);
    if(node.type==='NewExpression' && node.callee.name==='Error')rendered(node.arguments[0]);
    for(const [key,value] of Object.entries(node)) {
      if(['loc','start','end','extra','comments'].includes(key))continue;
      if(Array.isArray(value))value.forEach(child=>{if(child?.type)walk(child,node);});else if(value?.type)walk(value,node);
    }
  };
  walk(ast,null);
  // Literal ranges visited through both the render walker and AST have one edit.
  const unique=[...new Map(edits.map(e=>[`${e.start}:${e.end}`,e])).values()].sort((a,b)=>b.start-a.start);
  let next=source;
  for(const e of unique)next=next.slice(0,e.start)+e.text+next.slice(e.end);
  if(unique.length && !/import\s*\{[^}]*\bt\b[^}]*\}\s*from ['"][^'"]*i18n/.test(next)) next=`import { t } from '${file==='src/App.jsx'?'./i18n':'../i18n'}';\n`+next;
  if(process.argv.includes('--write') && unique.length)fs.writeFileSync(file,next);
}
fs.writeFileSync('src/i18n/ui-keys.json',JSON.stringify([...keys].sort(),null,2)+'\n');
console.log(`Interface keys: ${keys.size}`);
