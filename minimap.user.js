// ==UserScript==
// @name         Ottoman
// @namespace    https://tampermonkey.net/
// @version      1.2.5
// @description  ToamTest
// @author       anon
// @match        https://pixelzone.io/*
// @match        http://pixelzone.io/*
// @homepage     https://github.com/tenispe/minimap/
// @updateURL   https://raw.githubusercontent.com/tenispe/minimap/master/minimap.user.js
// @downloadURL  https://raw.githubusercontent.com/tenispe/minimap/master/minimap.user.js
// @grant        none
// ==/UserScript==
/*Based on OTTOMAN

Instructions

Use Tampermonkey plugin to inject this into the game. Add a script, paste in the code.

Images and the template list (templates.json) need to be on a https: server. Github is possibly
the easiest option, if you get the Github windows client for updating it. Use Commit from your
local folder, followed by "Push origin".

Template images should be png, and must use the exact 16 palette colors. Bit depth does not matter.
Transparent pngs are supported. Inexact colors will skip and spam the console.

baseTemplateUrl is read from a cookie, and prompted for if missing. You don't need to edit this
script to change it. Console:
setCookie("baseTemplateUrl", "https://path-here/")

Keys:
Q-[ and A-G : select color
H : Show and hide the minimap. This also reloads your template images after update.
+/- numpad: zoom minimap
X : Hide one of three UI elements, per keypress. Top link box and captcha logo are always hidden.

Minimap starts hidden. The script is intended to load in light mode for multiple tabs. Turn
pixelzone sounds off. Bot uses sounds for: Started ok, Captcha, Error (see console, F12).

Useful console commands:
listTemplates()
setCookie("baseTemplateUrl", "")
*/

// Default location of template images and templates.json. Is user input and stored in a cookie.
var baseTemplateUrl = 'https://raw.githubusercontent.com/tenispe/minimap/master/';
var vers = "Minimap: none";
var range = 6; //margin for showing the map window

var x, y, zoomlevel, zooming_out, zooming_in, zoom_time, x_window, y_window, coorDOM, gameWindow;
var toggle_show, toggle_follow, counter, image_list, needed_templates, mousemoved;
var minimap,	minimap_board, minimap_cursor, minimap_box, minimap_text;
var ctx_minimap, ctx_minimap_board, ctx_minimap_cursor;
//Regular Expression to get coordinates out of URL
var re_url = /\?p=([-\d]+),([-\d]+)/;
var timerDiv;

Number.prototype.between = function(a, b) {
	var min = Math.min.apply(Math, [a, b]);
	var max = Math.max.apply(Math, [a, b]);
	return this > min && this < max;
};

window.addEventListener('load', function() {
  var i, t = getCookie("baseTemplateUrl");
  if(!t) {
    t = prompt("Location of template images and templates.json\nhttps: is required. Stores in a cookie.", baseTemplateUrl);
    if(t) setCookie("baseTemplateUrl", t);
    else t = "";
  }
  baseTemplateUrl = t;

  console.log(vers+". TemplateUrl", baseTemplateUrl);
  console.log("Try: listTemplates() and keys H, QWERTYUIOP[ ASDFG, X");
  gameWindow = document.getElementById("canvas");
  //DOM element of the displayed X, Y
  coorDOM = document.getElementById("coords");
  //coordinates of the middle of the window
  x_window = y_window = 0;
  //coordinates of cursor
  x = y = 0;
  //list of all available templates
  window.template_list = null;
  zoomlevel = 14;
  //toggle options
  toggle_show = false;
  toggle_follow = true; //if minimap is following window, x_window = x and y_window = y;
  zooming_in = zooming_out = false;
  zoom_time = 100;
  //array with all loaded template-images
  window.image_list = [];
  counter = 0;
  //templates which are needed in the current area
  needed_templates = null;
  //Cachebreaker to force image refresh. Set it to eg. 1
  window.cachebreaker = "";
  timerDiv = document.getElementById("timer");
  minimap_box = document.getElementById("minimap-box");
  minimap_text = document.getElementById("minimap-text");

  var div = document.createElement('div');
  div.setAttribute('class', 'post block bc2');
  div.innerHTML = '<style>.grecaptcha-badge,#message{display: none;}</style>\n' +
    '<div id="minimapbg" style="background-color:rgba(0,0,0,0.2); border-radius:12px; position:absolute; right:6px; bottom:6px; z-index:1;">' +
    '<div class="posy unselectable" id="posyt" style="background-size:100%; color:#fff; text-align:center; line-height:32px; vertical-align:middle; width:auto; height:auto; padding:6px 8px;">' +
    '<div id="minimap-text"></div>' +
    '<div id="minimap-title" style="line-height: 15px; font-size: 0.9em;">' + vers + '</div>' +
    '<div id="minimap-box" style="position: relative;width:390px;height:280px">' +
    '<canvas id="minimap" style="width: 100%; height: 100%;z-index:1;position:absolute;top:0;left:0;"></canvas>' +
    '<canvas id="minimap-board" style="width: 100%; height: 100%;z-index:2;position:absolute;top:0;left:0;"></canvas>' +
    '<canvas id="minimap-cursor" style="width: 100%; height: 100%;z-index:3;position:absolute;top:0;left:0;"></canvas>' +
    '</div><div id="minimap-config" style="line-height:15px;">' +
    '	<span id="hide-map" style="cursor:pointer;">Hide' +
    '	</span> | <span id="follow-mouse" style="cursor:pointer;">Follow' +
    '	</span> | Zoom: <span id="zoom-plus" style="cursor:pointer;font-weight:bold;">&nbsp;+&nbsp;</span>/' +
    '	<span id="zoom-minus" style="cursor:pointer;font-weight:bold;">&nbsp;-&nbsp;</span>' +
    '</div>' +
    '</div>';
  document.body.appendChild(div);
  minimap = document.getElementById("minimap");
  minimap_board = document.getElementById("minimap-board");
  minimap_cursor = document.getElementById("minimap-cursor");
  minimap.width = minimap.offsetWidth;
  minimap_board.width = minimap_board.offsetWidth;
  minimap_cursor.width = minimap_cursor.offsetWidth;
  minimap.height = minimap.offsetHeight;
  minimap_board.height = minimap_board.offsetHeight;
  minimap_cursor.height = minimap_cursor.offsetHeight;
  ctx_minimap = minimap.getContext("2d");
  ctx_minimap_board = minimap_board.getContext("2d");
  ctx_minimap_cursor = minimap_cursor.getContext("2d");

  //No Antialiasing when scaling!
  ctx_minimap.mozImageSmoothingEnabled = false;
  ctx_minimap.webkitImageSmoothingEnabled = false;
  ctx_minimap.msImageSmoothingEnabled = false;
  ctx_minimap.imageSmoothingEnabled = false;

  toggleShow(toggle_show);
  drawBoard();
  drawCursor();

  //Show message
  setTimeout(function() {
    gameWindow.nextElementSibling.className="fadeIn";
    gameWindow.nextElementSibling.style.display="block";
    timerDiv.innerText = "Before you can paint, you must pan and zoom";
    timerDiv.style.width = "60%";
  }, 500);
  setTimeout(function() {
    gameWindow.nextElementSibling.style.display="none";
    timerDiv.style.width = "50px";
  }, 8000);

  /*document.getElementById("minimapbg").onclick = function () {
		toggleShow()
	};*/
  document.getElementById("hide-map").onclick = function () {
    toggleShow(false);
  };
  minimap_text.onclick = function () {
    toggleShow(true);
  };
  document.getElementById("follow-mouse").onclick = function () {
    toggle_follow = !toggle_follow;
  };
  document.getElementById("zoom-plus").addEventListener('mousedown', function (e) {
    e.preventDefault();
    zooming_in = true;
    zooming_out = false;
    zoomIn();
  }, false);
  document.getElementById("zoom-minus").addEventListener('mousedown', function (e) {
    e.preventDefault();
    zooming_out = true;
    zooming_in = false;
    zoomOut();
  }, false);
  document.getElementById("zoom-plus").addEventListener('mouseup', function (e) {
    zooming_in = false;
  }, false);
  document.getElementById("zoom-minus").addEventListener('mouseup', function (e) {
    zooming_out = false;
  }, false);

  gameWindow.addEventListener('mouseup', function (evt) {
    if (!toggle_show) return;
    if (!toggle_follow) setTimeout(getCenter, 100);
  }, false);

  gameWindow.addEventListener('mousemove', function (evt) {
    if (!toggle_show || !coorDOM) return;
    var coordsXY = coorDOM.innerHTML.split(/\s?[xy:]+/);
    //console.log(coordsXY);
    var x_new = parseInt(coordsXY[1]);
    var y_new = parseInt(coordsXY[2]);
    //console.log('at',x_new, y_new);
    if (x != x_new || y != y_new) {
      x = x_new;
      y = y_new;
      if (toggle_follow) {
        x_window = x;
        y_window = y;
      } else {
        drawCursor();
      }
      mousemoved = 1;
    }
  }, false);

  updateloop();

  //mousemove heavy work
  setInterval(function() {
    if(mousemoved) {
      mousemoved = 0;
      loadTemplates();
    }
  }, 110);

}, false);

window.listTemplates = function () {
  var ttlpx = 0;
  var mdstr = "";
  Object.keys(template_list).map(function (index, ele) {
    var eles = template_list[index];
		if(!eles.name) return;
    var z = eles.width>300 ? 2 : eles.width>100 ? 4 : 8;
    mdstr += '\n#### ' + index + ' ' + eles.width + 'x' + eles.height + ' ' + baseTemplateUrl + eles.name;
    mdstr += ' https://pixelzone.io/?p=' + Math.floor(eles.x + eles.width / 2) + ',' + Math.floor(eles.y + eles.height / 2) + ','+z+'\n';
    ttlpx += eles.width * eles.height;
  });
  mdstr = '### Total pixel count: ' + ttlpx + '\n' + mdstr;
  console.log(mdstr);
}

function updateloop() {
  //console.log("Updating Template List");
  // Get JSON of available templates
  var xmlhttp = new XMLHttpRequest();
  var url = baseTemplateUrl + "templates.json?" + new Date().getTime();
  xmlhttp.onreadystatechange = function () {
    if (this.readyState == 4) {
      if(this.status == 200) {
        window.template_list = JSON.parse(this.responseText);
        if (!toggle_follow) getCenter();
      }
      if(this.status == 0 || this.status > 399) setCookie("baseTemplateUrl", "");
   }
  };
  xmlhttp.open("GET", url, true);
  xmlhttp.send();

  //console.log("Refresh got forced.");
  image_list = [];
  loadTemplates();

  setTimeout(updateloop, 60000)
}

function toggleShow(newValue) {
  if(newValue === undefined) toggle_show = !toggle_show;
  else toggle_show = newValue;
  minimap_box = document.getElementById("minimap-box");
  minimap_text = document.getElementById("minimap-text");
  if (toggle_show) {
    minimap_box.style.display = "block";
    minimap_text.style.display = "none";
    document.getElementById("minimap-config").style.display = "block";
    loadTemplates();
  } else {
    minimap_box.style.display = "none";
    minimap_text.innerHTML = "Show Minimap";
    minimap_text.style.display = "block";
    minimap_text.style.cursor = "pointer";
    document.getElementById("minimap-config").style.display = "none";
  }
  document.getElementsByClassName("grecaptcha-badge")[0].style.display = "none";
}

function zoomIn() {
  if (!zooming_in) return;
  zoomlevel = zoomlevel * 1.2;
  if (zoomlevel > 45) {
    zoomlevel = 45;
    return;
  }
  drawBoard();
  drawCursor();
  loadTemplates();
  setTimeout(zoomIn, zoom_time);
}

function zoomOut() {
  if (!zooming_out) return;
  zoomlevel = zoomlevel / 1.2;
  if (zoomlevel < 1) {
    zoomlevel = 1;
    return;
  }
  drawBoard();
  drawCursor();
  loadTemplates();
  setTimeout(zoomOut, zoom_time);
}

function loadTemplates() {
  if (!toggle_show) return;
  if (window.template_list == null) return;
  //console.log('loadTemplates',template_list);

  var x_left = x_window * 1 - minimap.width / zoomlevel / 2;
  var x_right = x_window * 1 + minimap.width / zoomlevel / 2;
  var y_top = y_window * 1 - minimap.height / zoomlevel / 2;
  var y_bottom = y_window * 1 + minimap.height / zoomlevel / 2;
  //console.log("x_left : " + x_left);
  //console.log("x_right : " + x_right);
  //console.log("y_top : " + y_top);
  //console.log("y_bottom : " + y_bottom);
  //console.log(template_list);
  var keys = [];
  for (var k in template_list) keys.push(k);
  needed_templates = [];
  for (var i = 0; i < keys.length; i++) {
    var template = keys[i];
    var temp_x = template_list[template].x;
    var temp_y = template_list[template].y;
    var temp_xr = temp_x + template_list[template].width;
    var temp_yb = temp_y + template_list[template].height;
    // if (temp_xr <= x_left || temp_yb <= y_top || temp_x >= x_right || temp_y >= y_bottom)
    //    continue;
    if (!x_window.between(temp_x-range, temp_xr+range))
      continue;
    if (!y_window.between(temp_y-range, temp_yb+range))
      continue;
    //console.log("Template " + template + " is in range!");
    needed_templates.push(template);
  }
  if (needed_templates.length == 0) {
    if (zooming_in == false && zooming_out == false) {
      minimap_box.style.display = "none";
      minimap_text.style.display = "block";
      minimap_text.innerHTML = "No templates here";
      minimap_text.style.cursor = "auto";
    }
  } else {
    minimap_box.style.display = "block";
    minimap_text.style.display = "none";
    counter = 0;
    for (i = 0; i < needed_templates.length; i++) {
      if (image_list[needed_templates[i]] == null) {
        loadImage(needed_templates[i]);
      } else {
        counter += 1;
        //if last needed image loaded, start drawing
        if (counter == needed_templates.length) drawTemplates();
      }
    }
  }
}

function loadImage(imagename) {
  console.log("    Load image " + imagename, cachebreaker);
  image_list[imagename] = new Image();
  var src = baseTemplateUrl + template_list[imagename].name;
  if (cachebreaker) src += "?" + cachebreaker;
  image_list[imagename].src = src;
  image_list[imagename].onload = function () {
    counter += 1;
    //if last needed image loaded, start drawing
    if (counter == needed_templates.length) drawTemplates();
  }
}

function drawTemplates() {
  ctx_minimap.clearRect(0, 0, minimap.width, minimap.height);
  var x_left = x_window * 1 - minimap.width / zoomlevel / 2;
  var y_top = y_window * 1 - minimap.height / zoomlevel / 2;
  for (var i = 0; i < needed_templates.length; i++) {
    var template = needed_templates[i];
    var xoff = (template_list[template].x * 1 - x_left * 1) * zoomlevel;
    var yoff = (template_list[template].y * 1 - y_top * 1) * zoomlevel;
    var newwidth = zoomlevel * image_list[template].width;
    var newheight = zoomlevel * image_list[template].height;
    var img = image_list[template];
    ctx_minimap.drawImage(img, xoff, yoff, newwidth, newheight);
    //console.log("Drawn!");
  }
}

function drawBoard() {
  ctx_minimap_board.clearRect(0, 0, minimap_board.width, minimap_board.height);
  if (zoomlevel <= 4.6) return;
  ctx_minimap_board.beginPath();
  var bw = minimap_board.width + zoomlevel;
  var bh = minimap_board.height + zoomlevel;
  var xoff_m = (minimap.width / 2) % zoomlevel - zoomlevel;
  var yoff_m = (minimap.height / 2) % zoomlevel - zoomlevel;
  var z = 1 * zoomlevel;
  ctx_minimap_board.lineWidth = 0.2;
  for (var x = 0; x <= bw; x += z) {
    ctx_minimap_board.moveTo(x + xoff_m, yoff_m);
    ctx_minimap_board.lineTo(x + xoff_m, bh + yoff_m);
  }
  for (x = 0; x <= bh; x += z) {
    ctx_minimap_board.moveTo(xoff_m, x + yoff_m);
    ctx_minimap_board.lineTo(bw + xoff_m, x + yoff_m);
  }
  ctx_minimap_board.strokeStyle = "black";
  ctx_minimap_board.stroke();
}

function drawCursor() {
  var x_left = x_window * 1 - minimap.width / zoomlevel / 2;
  var x_right = x_window * 1 + minimap.width / zoomlevel / 2;
  var y_top = y_window * 1 - minimap.height / zoomlevel / 2;
  var y_bottom = y_window * 1 + minimap.height / zoomlevel / 2;
  ctx_minimap_cursor.clearRect(0, 0, minimap_cursor.width, minimap_cursor.height);
  if (x < x_left || x > x_right || y < y_top || y > y_bottom) return;
  var xoff_c = x - x_left;
  var yoff_c = y - y_top;

  ctx_minimap_cursor.beginPath();
  ctx_minimap_cursor.lineWidth = zoomlevel / 6;
  ctx_minimap_cursor.strokeStyle = "#ff1bfc";
  ctx_minimap_cursor.rect(zoomlevel * xoff_c, zoomlevel * yoff_c, zoomlevel, zoomlevel);
  ctx_minimap_cursor.stroke();
}

function getCenter() {
  var url = window.location.href;
  var m = url.match(re_url);
  if(m) {
    x_window = parseInt(m[1]);
    y_window = parseInt(m[2]);
  }	else {
    x_window = 0;
    y_window = 0;
  }
  //console.log("center: ", x_window, y_window);
  loadTemplates();
}

window.addEventListener('keydown', function(e) {
  switch(e.keyCode) {//e.key is too national
    case 72: //H
      toggleShow();
      break;
    case 81: clickColor(0); break; //black is 1
    case 87: clickColor(1); break; //dark gray is 0
    case 69: clickColor(2); break;
    case 82: clickColor(3); break;
    case 84: clickColor(4); break;
    case 89: clickColor(5); break;
    case 85: clickColor(6); break;
    case 73: clickColor(7); break;
    case 79: clickColor(8); break;
    case 80: clickColor(9); break;
    case 221: clickColor(10); break;
    case 65: clickColor(11); break;
    case 83: clickColor(12); break;
    case 68: clickColor(13); break;
    case 70: clickColor(14); break;
    case 71: clickColor(15); break;
    case 107: //numpad +
      zooming_in = true;
      zooming_out = false;
      zoomIn();
      zooming_in = false;
      break;
    case 109: //numpad -
      zooming_out = true;
      zooming_in = false;
      zoomOut();
      zooming_out = false;
      break;
    case 88: //x: hide more elements
      var menu = gameWindow.nextElementSibling.nextElementSibling.nextElementSibling.nextElementSibling;
      var coords = menu.nextElementSibling.nextElementSibling;
      var playercount = coords.nextElementSibling;
      if(menu.style.display != "none") {
        menu.style.display = "none";
      } else if(playercount.style.display != "none"){ //hide counter
        playercount.style.display = "none";
      } else {
        coords.style.display = "none";
      }
      break;
    default:
      console.log("keydown", e.keyCode, e.key);
  }
});

function clickColor(c) {
  var pal = document.getElementById("palette");
  //https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/MouseEvent
  var e = new MouseEvent("click", {
    bubbles: true,
    offsetX: pal.offsetLeft+4,
    offsetY: pal.offsetTop+4
  });
  var target = pal.childNodes[parseInt(c/8)].childNodes[c % 8];
  target.dispatchEvent(e);
}

window.setCookie = function(name,value) { //you can supply "minutes" as 3rd arg.
  var argv = setCookie.arguments;
  var argc = setCookie.arguments.length;
  var minutes = (argc > 2) ? argv[2] : 720*24*60; //default 720 days
  var date = new Date();
  date.setTime(date.getTime()+(minutes*60*1000));
  var expires = "; expires="+date.toGMTString();
  document.cookie = name+"="+value+expires+"; path=/";
}

function getCookie(name) {
  var value = "; " + document.cookie;
  var parts = value.split("; " + name + "=");
  if (parts.length == 2) return parts.pop().split(";").shift();
}

/* Pixelzone stuff you can use:
Colors.colorsPalette[0..15][0..2]
  Weirdness: darkgray is 0, black is 1
Colors.getColorIdFromRGB([0,0,230])  exact only
Colors.getColorStrFromId(15) = "rgb(0, 0, 230)"

Cookie: lastPaletteColor
*/
