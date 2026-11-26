/*\
title: $:/plugins/huwiki/musescore-import/percussion.js
type: application/javascript
module-type: library
\*/
(function(){
'use strict';
// A percussion token is an engraving position, never a pitched MIDI note.
// Keep its GM sound explicit through ABCJS's supported %%percmap directive.
var LETTERS='CDEFGAB',PREFIXES=['','=', '^','_', '^^','__'];
var DEFINITIONS=[
 [35,'F','normal','Acoustic bass drum',1],[36,'=F','normal','Bass drum',1],
 [37,'^c','x','Side stick'],[38,'c','normal','Snare'],[39,'_c','x','Hand clap'],[40,'=c','normal','Electric snare'],
 [41,'G','normal','Low floor tom'],[42,'g','x','Closed hi-hat'],[43,'A','normal','High floor tom'],[44,'D','x','Pedal hi-hat',1],
 [45,'B','normal','Low tom'],[46,'^g','x','Open hi-hat'],[47,'d','normal','Low-mid tom'],[48,'e','normal','High-mid tom'],
 [49,'a','x','Crash cymbal'],[50,'f','normal','High tom'],[51,'^f','x','Ride cymbal'],[52,'b','x','Chinese cymbal'],
 [53,'=f','harmonic','Ride bell'],[54,'^e','harmonic','Tambourine'],[55,'^a','x','Splash cymbal'],[56,'_f','triangle','Cowbell'],
 [57,'=a','x','Crash cymbal 2'],[58,'^B','harmonic','Vibraslap'],[59,'_d','x','Ride cymbal 2'],
 [60,'d','normal','High bongo'],[61,'B','normal','Low bongo'],[62,'c','x','Mute high conga'],[63,'e','normal','Open high conga'],[64,'A','normal','Low conga'],
 [65,'d','normal','High timbale'],[66,'B','normal','Low timbale'],[67,'g','triangle','High agogo'],[68,'f','triangle','Low agogo'],
 [69,'g','x','Cabasa'],[70,'g','x','Maracas'],[71,'e','normal','Short whistle'],[72,'c','normal','Long whistle'],
 [73,'c','x','Short guiro'],[74,'A','x','Long guiro'],[75,'c','x','Claves'],[76,'e','normal','High wood block'],[77,'c','normal','Low wood block'],
 [78,'e','harmonic','Mute cuica'],[79,'c','harmonic','Open cuica'],[80,'a','triangle','Mute triangle'],[81,'a','triangle','Open triangle']
];
var STANDARD=Object.create(null);DEFINITIONS.forEach(function(row){STANDARD[row[0]]={sound:row[0],token:row[1],head:row[2],name:row[3],voice:row[4]||0};});
function gm(value){var n=Number(value);return Number.isInteger(n)&&n>=35&&n<=81?n:null;}
function tokenPitch(token){
 var match=/^[=^_]*([A-Ga-g])([,']*)$/.exec(String(token||''));if(!match)return null;
 var pitch=LETTERS.indexOf(match[1].toUpperCase())+(match[1]===match[1].toLowerCase()?7:0);
 for(var i=0;i<match[2].length;i++)pitch+=match[2][i]==="'"?7:-7;
 return pitch;
}
function tokenAt(pitch){
 var octave=Math.floor(pitch/7),letter=LETTERS[((pitch%7)+7)%7];
 return octave>=1?letter.toLowerCase()+"'".repeat(octave-1):letter+','.repeat(-octave);
}
function head(value,fallback){
 var text=String(value==null?'':value).toLowerCase().replace(/[ _]/g,'-');
 if(!text)return fallback||'normal';
 if(/^(?:normal|0)$/.test(text))return 'normal';
 if(/^(?:x|cross|plus|cross-circle|circle-x|xcircle|circled-x|1)$/.test(text))return 'x';
 if(/^(?:diamond|harmonic)$/.test(text))return 'harmonic';
 if(/triangle/.test(text))return 'triangle';
 if(/^(?:slash|slashed|rhythm)$/.test(text))return 'rhythm';
 return fallback||'normal';
}
function standard(pitch){
 var found=STANDARD[gm(pitch)];if(!found)return null;
 var result=Object.assign({},found);result.line=10-tokenPitch(result.token);if(result.sound===46)result.decoration='open';return result;
}
function definition(pitch,custom){
 var result=standard(pitch);if(!result)return null;custom=custom||{};
 var displayStep=String(custom.displayStep||custom.step||'').toUpperCase(),displayOctave=Number(custom.displayOctave===undefined?custom.octave:custom.displayOctave);
 var line=Number(custom.line),position=Number.isFinite(line)&&custom.line!==undefined&&custom.line!==null&&custom.line!==''?10-line:null;
 if(position===null&&LETTERS.indexOf(displayStep)>=0&&displayStep.length===1&&Number.isInteger(displayOctave))position=LETTERS.indexOf(displayStep)+7*(displayOctave-4);
 if(position!==null&&Number.isInteger(position)&&position>=-28&&position<=42){result.token=tokenAt(position);result.line=10-position;result.customPosition=true;}
 if(custom.head!==undefined||custom.notehead!==undefined||custom.noteHead!==undefined)result.head=head(custom.head===undefined?(custom.notehead===undefined?custom.noteHead:custom.notehead):custom.head,result.head);
 if(Number.isInteger(Number(custom.voice))&&Number(custom.voice)>=0&&Number(custom.voice)<=3)result.voice=Number(custom.voice);
 if(custom.name)result.name=String(custom.name);
 return result;
}
function createMap(notes,definitions){
 var collected=Object.create(null),warnings=[],byPitch=Object.create(null),used=Object.create(null),directives=[];
 (notes||[]).forEach(function(note){var object=note&&typeof note==='object'?note:null,n=gm(object?object.pitch:note);if(n===null){warnings.push('Trommelyd uden for GM-standarden er bevaret som oprindelig node: '+String(object?object.pitch:note));return;}
  if(!collected[n])collected[n]=Object.assign({},definitions&&definitions[n]||{},object&&object.drum||{},object&&object.percussion&&typeof object.percussion==='object'?object.percussion:{});
 });
 Object.keys(collected).map(Number).sort(function(a,b){return a-b;}).forEach(function(sound){
  var result=definition(sound,collected[sound]),preferred=result.token,position=tokenPitch(preferred),base=tokenAt(position),prefix=/^[=^_]*/.exec(preferred)[0];
  var alternatives=[prefix].concat(PREFIXES.filter(function(value){return value!==prefix;})),token=null;
  for(var i=0;i<alternatives.length;i++){var candidate=alternatives[i]+base;if(!used[candidate]){token=candidate;break;}}
  // A rare large custom kit may put more than six sounds on the same step.
  // Retain unique playback mappings using the nearest available staff position.
  for(var distance=1;!token&&distance<=12;distance++)for(var sign=1;sign>=-1&&!token;sign-=2){var alternate=tokenAt(position+sign*distance);for(var j=0;j<PREFIXES.length;j++){var shifted=PREFIXES[j]+alternate;if(!used[shifted]){token=shifted;result.line=10-tokenPitch(shifted);warnings.push('Percussion display position adjusted for '+result.name+' to keep its sound mapping unique.');break;}}}
  result.token=token;used[token]=true;byPitch[sound]=result;directives.push('%%percmap '+token+' '+sound+' '+result.head);
 });
 return {byPitch:byPitch,directives:directives,warnings:warnings};
}
function isPercussion(staff,voice){return !!(staff&&staff.percussion||voice&&voice.percussion||staff&&staff.clef==='perc'||voice&&voice.clef==='perc');}
function staffGroups(selected){
 var groups=[],byStaff=Object.create(null);
 (selected||[]).forEach(function(item,index){var staff=item.st||item.staff||{},voice=item.v||item.voice||{},id=String(index+1);
  if(!isPercussion(staff,voice)){groups.push({voices:[id]});return;}
  var key=String(staff.percussionGroup||staff.partId||staff.id||'percussion-'+index),group=byStaff[key];
  if(!group){group={voices:[]};byStaff[key]=group;groups.push(group);}group.voices.push(id);
 });
 return groups.map(function(group){return group.voices.length>1?'('+group.voices.join(' ')+')':group.voices[0];}).join(' ');
}
exports.standard=standard;exports.definition=definition;exports.createMap=createMap;exports.staffGroups=staffGroups;exports.isPercussion=isPercussion;exports.tokenPitch=tokenPitch;exports.tokenAt=tokenAt;exports.head=head;
})();
