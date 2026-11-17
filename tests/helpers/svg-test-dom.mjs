// Minimal SVG/event surface for direct-edit regression tests. Matrix and
// bounding-box calculations are independent of the production editor code.
export class Matrix {
 constructor(a=1,b=0,c=0,d=1,e=0,f=0){Object.assign(this,{a,b,c,d,e,f});}
 multiply(m){return new Matrix(this.a*m.a+this.c*m.b,this.b*m.a+this.d*m.b,this.a*m.c+this.c*m.d,this.b*m.c+this.d*m.d,this.a*m.e+this.c*m.f+this.e,this.b*m.e+this.d*m.f+this.f);}
 inverse(){const det=this.a*this.d-this.b*this.c;if(Math.abs(det)<1e-12)throw Error('Singular test matrix');return new Matrix(this.d/det,-this.b/det,-this.c/det,this.a/det,(this.c*this.f-this.d*this.e)/det,(this.b*this.e-this.a*this.f)/det);}
 point({x,y}){return {x:this.a*x+this.c*y+this.e,y:this.b*x+this.d*y+this.f};}
}
export function matrixFor(text){let matrix=new Matrix();for(const [,name,values] of String(text||'').matchAll(/([a-zA-Z]+)\(([^)]*)\)/g)){
 const v=values.trim().split(/[ ,]+/).map(Number),a=(v[0]||0)*Math.PI/180;let next=new Matrix();
 if(name==='matrix')next=new Matrix(...v);
 if(name==='translate')next=new Matrix(1,0,0,1,v[0]||0,v[1]||0);
 if(name==='scale')next=new Matrix(v[0],0,0,v[1]??v[0]);
 if(name==='rotate'){next=new Matrix(Math.cos(a),Math.sin(a),-Math.sin(a),Math.cos(a));if(v.length>1)next=new Matrix(1,0,0,1,v[1],v[2]).multiply(next).multiply(new Matrix(1,0,0,1,-v[1],-v[2]));}
 if(name==='skewX')next=new Matrix(1,0,Math.tan(a),1);
 if(name==='skewY')next=new Matrix(1,Math.tan(a),0,1);
 matrix=matrix.multiply(next);
 }return matrix;
}
function transformed(box,matrix){const p=[[box.x,box.y],[box.x+box.width,box.y],[box.x+box.width,box.y+box.height],[box.x,box.y+box.height]].map(([x,y])=>matrix.point({x,y}));return {x:Math.min(...p.map(q=>q.x)),y:Math.min(...p.map(q=>q.y)),width:Math.max(...p.map(q=>q.x))-Math.min(...p.map(q=>q.x)),height:Math.max(...p.map(q=>q.y))-Math.min(...p.map(q=>q.y))};}
function union(boxes){if(!boxes.length)return {x:0,y:0,width:0,height:0};const x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y));return {x,y,width:Math.max(...boxes.map(b=>b.x+b.width))-x,height:Math.max(...boxes.map(b=>b.y+b.height))-y};}
function simple(node,selector){const tag=/^[\w-]+/.exec(selector)?.[0];if(tag&&node.tagName!==tag.toUpperCase())return false;for(const [,id] of selector.matchAll(/#([\w-]+)/g))if(node.id!==id)return false;for(const [,cls] of selector.matchAll(/\.([\w-]+)/g))if(!node.classList.contains(cls))return false;for(const [,key,,value] of selector.matchAll(/\[([^=\]]+)(=([^\]]+))?\]/g)){const actual=node.getAttribute(key)??node[key];if(value===undefined){if(actual===null||actual===undefined)return false;}else if(String(actual)!==value.replace(/^['"]|['"]$/g,''))return false;}return true;}
export class SvgNode {
 constructor(tag,doc){this.tagName=tag.toUpperCase();this.localName=tag;this.ownerDocument=doc;this.namespaceURI='http://www.w3.org/2000/svg';this.children=[];this.parentNode=null;this.attributes={};this.listeners={};this.className='';this._text='';this._value=undefined;this.hidden=false;this.style={setProperty(name,value){this[name]=String(value);},removeProperty(name){delete this[name];}};
  this.dataset=new Proxy({}, {get:(_t,key)=>this.getAttribute('data-'+String(key).replace(/[A-Z]/g,c=>'-'+c.toLowerCase()))??undefined,set:(_t,key,value)=>{this.setAttribute('data-'+String(key).replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),value);return true;}});
  this.classList={contains:name=>this.className.split(/\s+/).includes(name),add:(...names)=>names.forEach(n=>this.classList.toggle(n,true)),remove:(...names)=>names.forEach(n=>this.classList.toggle(n,false)),toggle:(name,on)=>{let values=this.className.split(/\s+/).filter(Boolean);if(on===undefined)on=!values.includes(name);values=values.filter(v=>v!==name);if(on)values.push(name);this.className=values.join(' ');return on;}};
 }
 get parentElement(){return this.parentNode;}
 get nodeName(){return this.tagName;}
 get firstChild(){return this.children[0]||null;}
 get lastChild(){return this.children.at(-1)||null;}
 get nextSibling(){return this.parentNode?.children[this.parentNode.children.indexOf(this)+1]||null;}
 get childNodes(){return this.children;}
 get isConnected(){return this===this.ownerDocument?.body||!!this.parentNode?.isConnected;}
 get value(){return this._value??(this.tagName==='SELECT'?this.querySelector('option')?.value||'':this.attributes.value||'');}
 set value(value){this._value=String(value);}
 get textContent(){return this._text+this.children.map(n=>n.textContent).join('');}
 set textContent(value){for(const child of this.children)child.parentNode=null;this.children=[];this._text=String(value);}
 appendChild(child){if(child.parentNode)child.remove();child.parentNode=this;this.children.push(child);return child;}
 append(...children){for(const c of children)this.appendChild(c);}
 insertBefore(child,next){if(!next)return this.appendChild(child);if(child.parentNode)child.remove();const index=this.children.indexOf(next);if(index<0)throw Error('Missing insertion reference');this.children.splice(index,0,child);child.parentNode=this;return child;}
 removeChild(child){if(child.parentNode!==this)throw Error('Not a child');child.remove();return child;}
 replaceChild(child,old){this.insertBefore(child,old);old.remove();return old;}
 replaceChildren(...children){this.textContent='';this.append(...children);}
 remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(n=>n!==this);this.parentNode=null;}
 setAttribute(name,value){this.attributes[name]=String(value);if(name==='class')this.className=String(value);if(name==='id')this.id=String(value);}
 setAttributeNS(_ns,name,value){this.setAttribute(name,value);}
 getAttribute(name){return name==='class'?this.className:this.attributes[name]??null;}
 hasAttribute(name){return this.getAttribute(name)!==null;}
 removeAttribute(name){delete this.attributes[name];}
 addEventListener(type,fn,options){(this.listeners[type]??=[]).push({fn,once:options?.once});}
 removeEventListener(type,fn){this.listeners[type]=(this.listeners[type]||[]).filter(l=>l.fn!==fn);}
 dispatch(type,values={}){const event={type,target:this,currentTarget:this,button:0,pointerId:1,pointerType:'mouse',clientX:0,clientY:0,bubbles:true,defaultPrevented:false,stopped:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped=true;},...values};
  for(let node=this;node;node=node.parentNode){event.currentTarget=node;if(node.disabled)continue;node['on'+type]?.(event);for(const listener of (node.listeners[type]||[]).slice()){listener.fn(event);if(listener.once)node.removeEventListener(type,listener.fn);}if(event.stopped||event.bubbles===false)break;}
  if(!event.stopped)this.ownerDocument?.dispatch(type,event);return event;
 }
 click(){return this.dispatch('click');}
 setPointerCapture(id){this.capturedPointer=id;}
 releasePointerCapture(id){if(this.capturedPointer===id)this.capturedPointer=null;}
 hasPointerCapture(id){return this.capturedPointer===id;}
 focus(){if(this.ownerDocument)this.ownerDocument.activeElement=this;}
 blur(){if(this.ownerDocument?.activeElement===this)this.ownerDocument.activeElement=null;}
 scrollIntoView(){}
 contains(other){return other===this||this.children.some(c=>c.contains(other));}
 matches(selector){return selector.split(',').some(s=>{const tokens=s.trim().replaceAll('>',' ').split(/\s+/);if(!simple(this,tokens.at(-1)))return false;let parent=this.parentNode;for(let i=tokens.length-2;i>=0;i--){while(parent&&!simple(parent,tokens[i]))parent=parent.parentNode;if(!parent)return false;parent=parent.parentNode;}return true;});}
 closest(selector){for(let n=this;n;n=n.parentNode)if(n.matches(selector))return n;return null;}
 querySelectorAll(selector){const found=[];function walk(node){for(const child of node.children){if(child.matches(selector))found.push(child);walk(child);}}walk(this);return found;}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 getBBox(){if(this.box)return {...this.box};const n=(key,fallback=0)=>Number(this.getAttribute(key)??fallback);
  if(this.tagName==='RECT'||this.tagName==='IMAGE')return {x:n('x'),y:n('y'),width:n('width'),height:n('height')};
  if(this.tagName==='CIRCLE')return {x:n('cx')-n('r'),y:n('cy')-n('r'),width:n('r')*2,height:n('r')*2};
  if(this.tagName==='ELLIPSE')return {x:n('cx')-n('rx'),y:n('cy')-n('ry'),width:n('rx')*2,height:n('ry')*2};
  if(this.tagName==='PATH'){const numbers=(this.getAttribute('d')||'').match(/-?\d+(?:\.\d+)?/g)?.map(Number)||[],xs=numbers.filter((_,i)=>i%2===0),ys=numbers.filter((_,i)=>i%2===1);return xs.length&&ys.length?{x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)}:{x:0,y:0,width:0,height:0};}
  if(this.tagName==='TEXT')return {x:n('x'),y:n('y')-12,width:this.textContent.length*7,height:14};
  return union(this.children.filter(c=>c.getAttribute('display')!=='none').map(c=>transformed(c.getBBox(),matrixFor(c.getAttribute('transform')))));
 }
 getScreenCTM(){const parent=this.parentNode?.getScreenCTM?.()||new Matrix();return parent.multiply(this.screenMatrix||new Matrix()).multiply(matrixFor(this.getAttribute('transform')));}
 getCTM(){return this.getScreenCTM();}
 getBoundingClientRect(){const b=transformed(this.getBBox(),this.getScreenCTM());return {x:b.x,y:b.y,left:b.x,top:b.y,right:b.x+b.width,bottom:b.y+b.height,width:b.width||800,height:b.height||450};}
 createSVGPoint(){return {x:0,y:0,matrixTransform(matrix){const p=matrix.point(this);return {x:p.x,y:p.y,matrixTransform:other=>other.point(p)};}};}
}
export function svgDocument(){const listeners={},doc={hidden:false,activeElement:null,documentElement:{lang:'en'},defaultView:{confirm:()=>true},createElement:tag=>new SvgNode(tag,doc),createElementNS:(_ns,tag)=>new SvgNode(tag,doc),createTextNode:text=>{const n=new SvgNode('#text',doc);n.textContent=text;return n;},getElementById:id=>doc.body.querySelector('#'+id),querySelectorAll:s=>doc.body.querySelectorAll(s),querySelector:s=>doc.body.querySelector(s),addEventListener(type,fn){(listeners[type]??=[]).push(fn);},removeEventListener(type,fn){listeners[type]=(listeners[type]||[]).filter(x=>x!==fn);},dispatch(type,event){for(const fn of listeners[type]||[])fn(event);}};doc.body=new SvgNode('body',doc);return doc;}
