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

var packPrefix = "AniMus/Translations/";
exports.packTitle = function(wiki) {
 var selected = wiki && wiki.getTiddlerText("$:/language", "");
 var locale = /^\$:\/languages\/([a-z]{2,8}(?:-[a-z0-9]+)*)$/i.exec(selected || "");
 return locale ? packPrefix + locale[1] : "";
};

// Look up fixed editor labels at render time. Never translate a user's input.
exports.translator = function(wiki) {
 var title = exports.packTitle(wiki);
 var candidate = title && wiki.getTiddlerData && wiki.getTiddlerData(title, null);
 var data = candidate && typeof candidate === "object" && !Array.isArray(candidate) ? candidate : null;
 function text(english) {
  var value = data && Object.prototype.hasOwnProperty.call(data, english) && data[english];
  return typeof value === "string" && value.trim() ? value : english;
 }
 text.labels = function(labels) {
  if(!data)return labels;
  var translated = {};
  Object.keys(labels).forEach(function(key){
   var value = labels[key];
   translated[key] = value && typeof value === "object" ? text.labels(value) : text(value);
  });
  return translated;
 };
 return text;
};
