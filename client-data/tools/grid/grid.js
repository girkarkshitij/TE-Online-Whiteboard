(function grid() { 

    var index = 0; //grid off by default
    var states = ["none", "url(#grid)", "url(#dots)"];

    function toggleGrid(evt) {
        index = (index + 1) % states.length;
        gridContainer.setAttributeNS(null, "fill", states[index]);
    }

    function createPatterns() {
        var smallGrid = Tools.createSVGElement("pattern", {
            id: "smallGrid",
            width: "30",
            height: "30",
            patternUnits: "userSpaceOnUse"
        });
        smallGrid.appendChild(
            Tools.createSVGElement("path", {
                d: "M 30 0 L 0 0 0 30",
                fill: "none",
                stroke: "gray",
                'stroke-width': "0.5"
            })
        );
        var grid = Tools.createSVGElement("pattern", {
            id: "grid",
            width: "300",
            height: "300",
            patternUnits: "userSpaceOnUse"
        });
        grid.appendChild(Tools.createSVGElement("rect", {
            width: "300",
            height: "300",
            fill: "url(#smallGrid)"
        }));
        grid.appendChild(
            Tools.createSVGElement("path", {
                d: "M 300 0 L 0 0 0 300",
                fill: "none",
                stroke: "gray", 'stroke-width': "1"
            })
        );
        // dots
        var dots = Tools.createSVGElement("pattern", {
            id: "dots",
            width: "30",
            height: "30",
            x: "-10",
            y: "-10",
            patternUnits: "userSpaceOnUse"
        });
        dots.appendChild(Tools.createSVGElement("circle", {
            fill: "gray",
            cx: "10",
            cy: "10",
            r: "2"
        }));

        var defs = Tools.svg.getElementById("defs");
        defs.appendChild(smallGrid);
        defs.appendChild(grid);
        defs.appendChild(dots);
    }

    var gridContainer = (function init() {
        createPatterns();
        var gridContainer = Tools.createSVGElement("rect", {
            id: "gridContainer",
            width: "100%", height: "100%",
            fill: states[index]
        });
        Tools.svg.insertBefore(gridContainer, Tools.drawingArea);
        return gridContainer;
    })();

    Tools.add({ //The new tool
        "name": "Grid",
        "shortcut": "g",
        "listeners": {},
        "icon": "tools/grid/icon.svg",
        "oneTouch": true,
        "onstart": toggleGrid,
        "mouseCursor": "crosshair",
    });

})(); 