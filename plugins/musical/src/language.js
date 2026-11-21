/*\
title: $:/plugins/huwiki/musical/language.js
type: application/javascript
module-type: library
\*/
"use strict";

exports.isDanish = function(wiki) {
 var selected = wiki && wiki.getTiddlerText("$:/language", "");
 return /(?:^|\/)da(?:[-_]|$)/i.test(selected || "");
};

// Only a production that supplies display names opts into translation.
// IDs, editable field values and names missing from its dictionary stay intact.
exports.projectLabels = function(wiki, title) {
 var film = wiki && wiki.getTiddler && wiki.getTiddler(title);
 var field = exports.isDanish(wiki) ? "animus-labels-da" : "animus-labels-en";
 var dictionary = film && film.fields && film.fields[field];
 var names = dictionary && wiki.getTiddlerData(dictionary, null);
 return function(value) {
  return names && Object.prototype.hasOwnProperty.call(names, value) ? names[value] : value;
 };
};
