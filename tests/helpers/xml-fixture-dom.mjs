// A fixture-only DOM adapter keeps these parser integration tests dependency free.
// Production uses the browser DOMParser; its native DOM is also smoke-tested.
class FixtureElement {
 constructor(name,attributes={}){this.localName=name;this.attributes=attributes;this.children=[];}
 get firstElementChild(){return this.children.find(x=>x instanceof FixtureElement)||null;}
 get nextElementSibling(){const peers=this.parent?.children||[],at=peers.indexOf(this);return peers.slice(at+1).find(x=>x instanceof FixtureElement)||null;}
 get textContent(){return this.children.map(x=>typeof x==="string"?x:x.textContent).join("");}
 getAttribute(name){return this.attributes[name]??null;}
 getElementsByTagName(name){return this.children.flatMap(x=>x instanceof FixtureElement?[...(x.localName===name?[x]:[]),...x.getElementsByTagName(name)]:[]);}
}
const unescape=s=>s.replace(/&(?:amp|lt|gt|quot|apos);/g,c=>({"&amp;":"&","&lt;":"<","&gt;":">","&quot;":"\"","&apos;":"'"})[c]);
export class FixtureDOMParser {
 parseFromString(source){
  const doc=new FixtureElement("#document"),stack=[doc];
  for(const token of source.match(/<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<[^>]*>|[^<]+/g)||[]){
   if(token.startsWith("<?")||token.startsWith("<!--"))continue;
   if(token.startsWith("</")){stack.pop();continue;}
   if(token.startsWith("<![CDATA[")){stack.at(-1).children.push(token.slice(9,-3));continue;}
   if(token.startsWith("<")){
    const name=token.match(/^<([^\s/>]+)/)?.[1];if(!name)throw Error("Invalid fixture XML");
    const attributes={};for(const match of token.matchAll(/([^\s=]+)\s*=\s*(["'])(.*?)\2/g))attributes[match[1]]=unescape(match[3]);
    const element=new FixtureElement(name,attributes);element.parent=stack.at(-1);element.parent.children.push(element);
    if(!token.endsWith("/>"))stack.push(element);
   }else stack.at(-1).children.push(unescape(token));
  }
  doc.documentElement=doc.firstElementChild;return doc;
 }
}
