// ABCJS can return null when relocating a chord tone to another string.
// Keep the tone and an unknown fret so tabs.finish can solve the complete chord.
const original='return{num:o+c,str:r,note:t}}return null}function c(e,t)';
const corrected='return{num:o+c,str:r,note:t}}return{num:"?",str:r,note:t}}function c(e,t)';
export function patchTabCollisions(source){
 if(source.includes(corrected))return source;
 if(source.split(original).length!==2)throw Error('Unrecognized ABCJS TAB chord relocation code');
 return source.replace(original,corrected);
}
