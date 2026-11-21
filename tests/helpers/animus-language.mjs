import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

export const languageTitle = '$:/plugins/huwiki/musical/language.js';
export const language = {};
runInNewContext(readFileSync(new URL('../../plugins/musical/src/language.js', import.meta.url), 'utf8'), {exports: language});
