(function hand() { 
	var selected = null;
	var last_sent = 0;


	function startMovingElement(x, y, evt) {
		evt.preventDefault();
		if (!evt.target || !Tools.drawingArea.contains(evt.target)) return;
		var tmatrix = get_translate_matrix(evt.target);
		selected = { x: x - tmatrix.e, y: y - tmatrix.f, elem: evt.target };
	}

	function moveElement(x, y) {
		if (!selected) return;
		var deltax = x - selected.x;
		var deltay = y - selected.y;
		var msg = { type: "update", id: selected.elem.id, deltax: deltax, deltay: deltay };
		var now = performance.now();
		if (now - last_sent > 70) {
			last_sent = now;
			Tools.drawAndSend(msg);
		} else {
			draw(msg);
		}
	}

	function get_translate_matrix(elem) {
		var translate = null;
		for (var i = 0; i < elem.transform.baseVal.numberOfItems; ++i) {
			var baseVal = elem.transform.baseVal[i];
			if (baseVal.type === SVGTransform.SVG_TRANSFORM_TRANSLATE || baseVal.type === SVGTransform.SVG_TRANSFORM_MATRIX) {
				translate = baseVal;
				break;
			}
		}
		if (translate == null) {
			translate = elem.transform.baseVal.createSVGTransformFromMatrix(Tools.svg.createSVGMatrix());
			elem.transform.baseVal.appendItem(translate);
		}
		return translate.matrix;
	}

	function draw(data) {
		switch (data.type) {
			case "update":
				var elem = Tools.svg.getElementById(data.id);
				if (!elem) throw new Error("Mover: Tried to move an element that does not exist.");
				var tmatrix = get_translate_matrix(elem);
				tmatrix.e = data.deltax || 0;
				tmatrix.f = data.deltay || 0;
				break;

			default:
				throw new Error("Mover: 'move' instruction with unknown type. ", data);
		}
	}

	function startHand(x, y, evt, isTouchEvent) {
		if (!isTouchEvent) {
			selected = {
				x: document.documentElement.scrollLeft + evt.clientX,
				y: document.documentElement.scrollTop + evt.clientY,
			}
		}
	}
	function moveHand(x, y, evt, isTouchEvent) {
		if (selected && !isTouchEvent) { //Let the browser handle touch to scroll
			window.scrollTo(selected.x - evt.clientX, selected.y - evt.clientY);
		}
	}

	function press(x, y, evt, isTouchEvent) {
		if (!handTool.secondary.active) startHand(x, y, evt, isTouchEvent);
		else startMovingElement(x, y, evt, isTouchEvent);
	}


	function move(x, y, evt, isTouchEvent) {
		if (!handTool.secondary.active) moveHand(x, y, evt, isTouchEvent);
		else moveElement(x, y, evt, isTouchEvent);
	}

	function release(x, y, evt, isTouchEvent) {
		move(x, y, evt, isTouchEvent);
		selected = null;
	}

	function switchTool() {
		selected = null;
	}

	var handTool = { //The new tool
		"name": "Hand",
		"shortcut": "h",
		"listeners": {
			"press": press,
			"move": move,
			"release": release,
		},
		"secondary": {
			"name": "Mover",
			"icon": "tools/hand/mover.svg",
			"active": false,
			"switch": switchTool,
		},
		"draw": draw,
		"icon": "tools/hand/hand.svg",
		"mouseCursor": "move",
		"showMarker": true,
	};
	Tools.add(handTool);
	Tools.change("Hand"); // Use the hand tool by default
})();
