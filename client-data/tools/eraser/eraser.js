(function eraser() { 

	var erasing = false;

	function startErasing(x, y, evt) {
		evt.preventDefault();
		erasing = true;
		erase(x, y, evt);
	}

	var msg = {
		"type": "delete",
		"id": ""
	};

	function inDrawingArea(elem) {
		return Tools.drawingArea.contains(elem);
	}

	function erase(x, y, evt) {
		var target = evt.target;
		if (evt.type === "touchmove") {
			var touch = evt.touches[0];
			target = document.elementFromPoint(touch.clientX, touch.clientY);
		}
		if (erasing && target !== Tools.svg && target !== Tools.drawingArea && inDrawingArea(target)) {
			msg.id = target.id;
			Tools.drawAndSend(msg);
		}
	}

	function stopErasing() {
		erasing = false;
	}

	function draw(data) {
		var elem;
		switch (data.type) {
			case "delete":
				elem = svg.getElementById(data.id);
				if (elem === null) console.error("Eraser: Tried to delete an element that does not exist.");
				else Tools.drawingArea.removeChild(elem);
				break;
			default:
				console.error("Eraser: 'delete' instruction with unknown type. ", data);
				break;
		}
	}

	var svg = Tools.svg;

	Tools.add({ //The new tool
		"name": "Eraser",
		"shortcut": "e",
		"listeners": {
			"press": startErasing,
			"move": erase,
			"release": stopErasing,
		},
		"draw": draw,
		"icon": "tools/eraser/icon.svg",
		"mouseCursor": "crosshair",
		"showMarker": true,
	});

})(); 
