/** Source-only localisation. Never applied to stored user tiddlers or JSON data. */
export function translateSource(text,dictionary,titles=[]){
 const protectedParts=[];
 const protect=s=>'\uE000'+(protectedParts.push(s)-1)+'\uE001';
 // Keep paths, canonical link targets and macro/variable identifiers exact.
 text=text.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g,(_,label,target)=>'[['+label+'|'+protect(target)+']]');
 for(const title of [...titles].sort((a,b)=>b.length-a.length))if(title.length>6)text=text.split(title).join(protect(title));
 text=text.replace(/\$:\/[^\s<>"'\[\]{}]+|\$\([^)]*\)\$|<<[\w_-]+(?=\s|>>)|\\define\s+[\w_-]+/g,protect);
 const keys=Object.keys(dictionary).sort((a,b)=>b.length-a.length);
 const escaped=keys.map(k=>k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
 const re=new RegExp('(?<![\\p{L}\\p{N}_/])(?:'+escaped.join('|')+')(?![\\p{L}\\p{N}_/])','gu');
 text=text.replace(re,key=>dictionary[key]);
 for(let i=0;i<5&&text.includes('\uE000');i++)text=text.replace(/\uE000(\d+)\uE001/g,(_,i)=>protectedParts[Number(i)]);
 return text;
}
export function nativeVariants(rows,title,english,namespace){
 const original=rows[title];if(!original||english===original.text)return;
 const da=namespace+'/da/'+title,en=namespace+'/en/'+title;
 for(const [name,text]of [[da,original.text],[en,english]])rows[name]={title:name,type:original.type||'text/vnd.tiddlywiki',text};
 const filter='[{$:/language}prefix[$:/languages/da]then['+da+']else['+en+']]';
 rows[title]={...original,text:'\\import '+filter+'\n<$transclude $tiddler={{{ '+filter+' }}} $mode="block"/> '};
}
