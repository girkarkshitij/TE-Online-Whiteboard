(function () { 
	var MIN_PENCIL_INTERVAL_MS = Tools.server_config.MAX_EMIT_COUNT_PERIOD / Tools.server_config.MAX_EMIT_COUNT;

	var AUTO_FINGER_WHITEOUT = Tools.server_config.AUTO_FINGER_WHITEOUT;
	var hasUsedStylus = false;

	var curLineId = "",
		lastTime = performance.now(); //The time at which the last point was drawn

	function PointMessage(x, y) {
		this.type = 'child';
		this.parent = curLineId;
		this.x = x;
		this.y = y;
	}

	function handleAutoWhiteOut(evt) {
		if (evt.touches && evt.touches[0] && evt.touches[0].touchType == "stylus") {
			if (hasUsedStylus && Tools.curTool.secondary.active) {
				Tools.change("Pencil");
			}
			hasUsedStylus = true;
		}
		if (evt.touches && evt.touches[0] && evt.touches[0].touchType == "direct") {
			if (hasUsedStylus && !Tools.curTool.secondary.active) {
				Tools.change("Pencil");
			}
		}
	}

	function startLine(x, y, evt) {
		evt.preventDefault();

		if (AUTO_FINGER_WHITEOUT) handleAutoWhiteOut(evt);

		curLineId = Tools.generateUID("l"); //"l" -> line

		Tools.drawAndSend({
			'type': 'line',
			'id': curLineId,
			'color': (pencilTool.secondary.active ? "#ffffff" : Tools.getColor()),
			'size': Tools.getSize(),
			'opacity': (pencilTool.secondary.active ? 1 : Tools.getOpacity()),
		});

		continueLine(x, y);
	}

	function continueLine(x, y, evt) {
		if (curLineId !== "" && performance.now() - lastTime > MIN_PENCIL_INTERVAL_MS) {
			Tools.drawAndSend(new PointMessage(x, y));
			lastTime = performance.now();
		}
		if (evt) evt.preventDefault();
	}

	function stopLineAt(x, y) {
		continueLine(x, y);
		stopLine();
	}

	function stopLine() {
		curLineId = "";
	}

	var renderingLine = {};
	function draw(data) {
		Tools.drawingEvent = true;
		switch (data.type) {
			case "line":
				renderingLine = createLine(data);
				break;
			case "child":
				var line = (renderingLine.id === data.parent) ? renderingLine : svg.getElementById(data.parent);
				if (!line) {
					console.error("Pencil: Hmmm... I received a point of a line that has not been created (%s).", data.parent);
					line = renderingLine = createLine({ "id": data.parent }); //create a new line in order not to loose the points
				}
				addPoint(line, data.x, data.y);
				break;
			case "endline":
				break;
			default:
				console.error("Pencil: Draw instruction with unknown type. ", data);
				break;
		}
	}

	var pathDataCache = {};
	function getPathData(line) {
		var pathData = pathDataCache[line.id];
		if (!pathData) {
			pathData = line.getPathData();
			pathDataCache[line.id] = pathData;
		}
		return pathData;
	}

	var svg = Tools.svg;

	function addPoint(line, x, y) {
		var pts = getPathData(line);
		pts = wboPencilPoint(pts, x, y);
		line.setPathData(pts);
	}

	function createLine(lineData) {
		var line = svg.getElementById(lineData.id) || Tools.createSVGElement("path");
		line.id = lineData.id;
		line.setAttribute("stroke", lineData.color || "black");
		line.setAttribute("stroke-width", lineData.size || 10);
		line.setAttribute("opacity", Math.max(0.1, Math.min(1, lineData.opacity)) || 1);
		Tools.drawingArea.appendChild(line);
		return line;
	}

	var drawingSize = -1;
	var whiteOutSize = -1;

	function restoreDrawingSize() {
		whiteOutSize = Tools.getSize();
		if (drawingSize != -1) {
			Tools.setSize(drawingSize);
		}
	}

	function restoreWhiteOutSize() {
		drawingSize = Tools.getSize();
		if (whiteOutSize != -1) {
			Tools.setSize(whiteOutSize);
		}
	}

	function toggleSize() {
		if (pencilTool.secondary.active) {
			restoreWhiteOutSize();
		} else {
			restoreDrawingSize();
		}
	}

	var pencilTool = {
		"name": "Pencil",
		"shortcut": "p",
		"listeners": {
			"press": startLine,
			"move": continueLine,
			"release": stopLineAt,
		},
		"draw": draw,
		"onstart": function(oldTool) {
			//Reset stylus
			hasUsedStylus = false;
		},
		"secondary": {
			"name": "White-out",
			"icon": "tools/pencil/whiteout_tape.svg",
			"active": false,
			"switch": function() {
				stopLine();
				toggleSize();
			},
		},
		"onstart": function() {
			if (pencilTool.secondary.active) {
				restoreWhiteOutSize();
			}
		},
		"onquit": function() {
			if (pencilTool.secondary.active) {
				restoreDrawingSize();
			}
		},
		"mouseCursor": "url('tools/pencil/cursor.svg'), crosshair",
		"icon": "tools/pencil/icon.svg",
		"stylesheet": "tools/pencil/pencil.css",
	};
	Tools.add(pencilTool);

})(); 
