var Tools = {};

Tools.i18n = (function i18n() {
  var translations = JSON.parse(document.getElementById('translations').text);
  return {
    t: function translate(s) {
      var key = s.toLowerCase().replace(/ /g, '_');
      return translations[key] || s;
    },
  };
})();

Tools.server_config = JSON.parse(document.getElementById('configuration').text);

Tools.board = document.getElementById('board');
Tools.svg = document.getElementById('canvas');
Tools.drawingArea = Tools.svg.getElementById('drawingArea');

Tools.curTool = null;
Tools.drawingEvent = true;
Tools.showMarker = true;
Tools.showOtherCursors = true;
Tools.showMyCursor = true;

Tools.isIE = /MSIE|Trident/.test(window.navigator.userAgent);

Tools.socket = null;
Tools.connect = function () {
  var self = this;

  if (self.socket) {
    self.socket.destroy();
    delete self.socket;
    self.socket = null;
  }

  this.socket = io.connect('', {
    path: window.location.pathname.split('/boards/')[0] + '/socket.io',
    reconnection: true,
    reconnectionDelay: 100,
    timeout: 1000 * 60 * 20, 
  });

  this.socket.on('broadcast', function (msg) {
    handleMessage(msg).finally(function afterload() {
      var loadingEl = document.getElementById('loadingMessage');
      loadingEl.classList.add('hidden');
    });
  });

  this.socket.on('reconnect', function onReconnection() {
    Tools.socket.emit('joinboard', Tools.boardName);
  });
};

Tools.connect();

Tools.boardName = (function () {
  var path = window.location.pathname.split('/');
  return decodeURIComponent(path[path.length - 1]);
})();

Tools.socket.emit('getboard', Tools.boardName);

function saveBoardNametoLocalStorage() {
  var boardName = Tools.boardName;
  if (boardName.toLowerCase() === 'anonymous') return;
  var recentBoards,
    key = 'recent-boards';
  try {
    recentBoards = JSON.parse(localStorage.getItem(key));
    if (!Array.isArray(recentBoards)) throw new Error('Invalid type');
  } catch (e) {
    recentBoards = [];
    console.log('Board history loading error', e);
  }
  recentBoards = recentBoards.filter(function (name) {
    return name !== boardName;
  });
  recentBoards.unshift(boardName);
  recentBoards = recentBoards.slice(0, 20);
  localStorage.setItem(key, JSON.stringify(recentBoards));
}
window.addEventListener('pageshow', saveBoardNametoLocalStorage);

Tools.HTML = {
  template: new Minitpl('#tools > .tool'),
  addShortcut: function addShortcut(key, callback) {
    window.addEventListener('keydown', function (e) {
      if (e.key === key && !e.target.matches('input[type=text], textarea')) {
        callback();
      }
    });
  },
  addTool: function (toolName, toolIcon, toolIconHTML, toolShortcut, oneTouch) {
    var callback = function () {
      Tools.change(toolName);
    };
    this.addShortcut(toolShortcut, function () {
      Tools.change(toolName);
      document.activeElement.blur && document.activeElement.blur();
    });
    return this.template.add(function (elem) {
      elem.addEventListener('click', callback);
      elem.id = 'toolID-' + toolName;
      elem.getElementsByClassName('tool-name')[0].textContent = Tools.i18n.t(
        toolName
      );
      var toolIconElem = elem.getElementsByClassName('tool-icon')[0];
      toolIconElem.src = toolIcon;
      toolIconElem.alt = toolIcon;
      if (oneTouch) elem.classList.add('oneTouch');
      elem.title =
        Tools.i18n.t(toolName) +
        ' (' +
        Tools.i18n.t('keyboard shortcut') +
        ': ' +
        toolShortcut +
        ')' +
        (Tools.list[toolName].secondary
          ? ' [' + Tools.i18n.t('click_to_toggle') + ']'
          : '');
      if (Tools.list[toolName].secondary) {
        elem.classList.add('hasSecondary');
        var secondaryIcon = elem.getElementsByClassName('secondaryIcon')[0];
        secondaryIcon.src = Tools.list[toolName].secondary.icon;
        toolIconElem.classList.add('primaryIcon');
      }
    });
  },
  changeTool: function (oldToolName, newToolName) {
    var oldTool = document.getElementById('toolID-' + oldToolName);
    var newTool = document.getElementById('toolID-' + newToolName);
    if (oldTool) oldTool.classList.remove('curTool');
    if (newTool) newTool.classList.add('curTool');
  },
  toggle: function (toolName, name, icon) {
    var elem = document.getElementById('toolID-' + toolName);

    var primaryIcon = elem.getElementsByClassName('primaryIcon')[0];
    var secondaryIcon = elem.getElementsByClassName('secondaryIcon')[0];
    var primaryIconSrc = primaryIcon.src;
    var secondaryIconSrc = secondaryIcon.src;
    primaryIcon.src = secondaryIconSrc;
    secondaryIcon.src = primaryIconSrc;

    elem.getElementsByClassName('tool-icon')[0].src = icon;
    elem.getElementsByClassName('tool-name')[0].textContent = Tools.i18n.t(
      name
    );
  },
  addStylesheet: function (href) {
    var link = document.createElement('link');
    link.href = href;
    link.rel = 'stylesheet';
    link.type = 'text/css';
    document.head.appendChild(link);
  },
  colorPresetTemplate: new Minitpl('#colorPresetSel .colorPresetButton'),
  addColorButton: function (button) {
    var setColor = Tools.setColor.bind(Tools, button.color);
    if (button.key) this.addShortcut(button.key, setColor);
    return this.colorPresetTemplate.add(function (elem) {
      elem.addEventListener('click', setColor);
      elem.id = 'color_' + button.color.replace(/^#/, '');
      elem.style.backgroundColor = button.color;
      if (button.key) {
        elem.title = Tools.i18n.t('keyboard shortcut') + ': ' + button.key;
      }
    });
  },
};

Tools.list = {};

Tools.isBlocked = function toolIsBanned(tool) {
  if (tool.name.includes(','))
    throw new Error('Tool Names must not contain a comma');
  return Tools.server_config.BLOCKED_TOOLS.includes(tool.name);
};

Tools.register = function registerTool(newTool) {
  if (Tools.isBlocked(newTool)) return;

  if (newTool.name in Tools.list) {
    console.log(
      "Tools.add: The tool '" +
        newTool.name +
        "' is already" +
        'in the list. Updating it...'
    );
  }

  Tools.applyHooks(Tools.toolHooks, newTool);

  Tools.list[newTool.name] = newTool;

  if (newTool.onSizeChange) Tools.sizeChangeHandlers.push(newTool.onSizeChange);

  var pending = Tools.pendingMessages[newTool.name];
  if (pending) {
    console.log("Drawing pending messages for '%s'.", newTool.name);
    var msg;
    while ((msg = pending.shift())) {
      newTool.draw(msg, false);
    }
  }
};

Tools.add = function (newTool) {
  if (Tools.isBlocked(newTool)) return;

  Tools.register(newTool);

  if (newTool.stylesheet) {
    Tools.HTML.addStylesheet(newTool.stylesheet);
  }

  Tools.HTML.addTool(
    newTool.name,
    newTool.icon,
    newTool.iconHTML,
    newTool.shortcut,
    newTool.oneTouch
  );
};

Tools.change = function (toolName) {
  var newTool = Tools.list[toolName];
  var oldTool = Tools.curTool;
  if (!newTool)
    throw new Error('Trying to select a tool that has never been added!');
  if (newTool === oldTool) {
    if (newTool.secondary) {
      newTool.secondary.active = !newTool.secondary.active;
      var props = newTool.secondary.active ? newTool.secondary : newTool;
      Tools.HTML.toggle(newTool.name, props.name, props.icon);
      if (newTool.secondary.switch) newTool.secondary.switch();
    }
    return;
  }
  if (!newTool.oneTouch) {
    var curToolName = Tools.curTool ? Tools.curTool.name : '';
    try {
      Tools.HTML.changeTool(curToolName, toolName);
    } catch (e) {
      console.error('Unable to update the GUI with the new tool. ' + e);
    }
    Tools.svg.style.cursor = newTool.mouseCursor || 'auto';
    Tools.board.title = Tools.i18n.t(newTool.helpText || '');

    if (Tools.curTool !== null) {
      if (newTool === Tools.curTool) return;

      Tools.removeToolListeners(Tools.curTool);

      Tools.curTool.onquit(newTool);
    }

    Tools.addToolListeners(newTool);
    Tools.curTool = newTool;
  }

  newTool.onstart(oldTool);
};

Tools.addToolListeners = function addToolListeners(tool) {
  for (var event in tool.compiledListeners) {
    var listener = tool.compiledListeners[event];
    var target = listener.target || Tools.board;
    target.addEventListener(event, listener, { passive: false });
  }
};

Tools.removeToolListeners = function removeToolListeners(tool) {
  for (var event in tool.compiledListeners) {
    var listener = tool.compiledListeners[event];
    var target = listener.target || Tools.board;
    target.removeEventListener(event, listener);
    if (Tools.isIE) target.removeEventListener(event, listener, true);
  }
};

(function () {
  function handleShift(active, evt) {
    if (
      evt.keyCode === 16 &&
      Tools.curTool.secondary &&
      Tools.curTool.secondary.active !== active
    ) {
      Tools.change(Tools.curTool.name);
    }
  }
  window.addEventListener('keydown', handleShift.bind(null, true));
  window.addEventListener('keyup', handleShift.bind(null, false));
})();

Tools.send = function (data, toolName) {
  toolName = toolName || Tools.curTool.name;
  var d = data;
  d.tool = toolName;
  Tools.applyHooks(Tools.messageHooks, d);
  var message = {
    board: Tools.boardName,
    data: d,
  };
  Tools.socket.emit('broadcast', message);
};

Tools.drawAndSend = function (data, tool) {
  if (tool == null) tool = Tools.curTool;
  tool.draw(data, true);
  Tools.send(data, tool.name);
};

Tools.pendingMessages = {};

function messageForTool(message) {
  var name = message.tool,
    tool = Tools.list[name];

  if (tool) {
    Tools.applyHooks(Tools.messageHooks, message);
    tool.draw(message, false);
  } else {
    if (!Tools.pendingMessages[name]) Tools.pendingMessages[name] = [message];
    else Tools.pendingMessages[name].push(message);
  }

  if (
    message.tool !== 'Hand' &&
    message.deltax != null &&
    message.deltay != null
  ) {
    messageForTool({
      tool: 'Hand',
      type: 'update',
      deltax: message.deltax || 0,
      deltay: message.deltay || 0,
      id: message.id,
    });
  }
}

function batchCall(fn, args) {
  var BATCH_SIZE = 1024;
  if (args.length === 0) {
    return Promise.resolve();
  } else {
    var batch = args.slice(0, BATCH_SIZE);
    var rest = args.slice(BATCH_SIZE);
    return Promise.all(batch.map(fn))
      .then(function () {
        return new Promise(requestAnimationFrame);
      })
      .then(batchCall.bind(null, fn, rest));
  }
}

function handleMessage(message) {
  if (!message.tool && !message._children) {
    console.error('Received a badly formatted message (no tool). ', message);
  }
  if (message.tool) messageForTool(message);
  if (message._children) return batchCall(handleMessage, message._children);
  else return Promise.resolve();
}

Tools.unreadMessagesCount = 0;
Tools.newUnreadMessage = function () {
  Tools.unreadMessagesCount++;
  updateDocumentTitle();
};

window.addEventListener('focus', function () {
  Tools.unreadMessagesCount = 0;
  updateDocumentTitle();
});

function updateDocumentTitle() {
  document.title =
    (Tools.unreadMessagesCount ? '(' + Tools.unreadMessagesCount + ') ' : '') +
    Tools.boardName +
    ' | WBO';
}

(function () {
  var scrollTimeout,
    lastStateUpdate = Date.now();

  window.addEventListener('scroll', function onScroll() {
    var scale = Tools.getScale();
    var x = document.documentElement.scrollLeft / scale,
      y = document.documentElement.scrollTop / scale;

    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(function updateHistory() {
      var hash =
        '#' + (x | 0) + ',' + (y | 0) + ',' + Tools.getScale().toFixed(1);
      if (
        Date.now() - lastStateUpdate > 5000 &&
        hash !== window.location.hash
      ) {
        window.history.pushState({}, '', hash);
        lastStateUpdate = Date.now();
      } else {
        window.history.replaceState({}, '', hash);
      }
    }, 100);
  });

  function setScrollFromHash() {
    var coords = window.location.hash.slice(1).split(',');
    var x = coords[0] | 0;
    var y = coords[1] | 0;
    var scale = parseFloat(coords[2]);
    resizeCanvas({ x: x, y: y });
    Tools.setScale(scale);
    window.scrollTo(x * scale, y * scale);
  }

  window.addEventListener('hashchange', setScrollFromHash, false);
  window.addEventListener('popstate', setScrollFromHash, false);
  window.addEventListener('DOMContentLoaded', setScrollFromHash, false);
})();

function resizeCanvas(m) {
  var x = m.x | 0,
    y = m.y | 0;
  var MAX_BOARD_SIZE = Tools.server_config.MAX_BOARD_SIZE || 65536;
  if (x > Tools.svg.width.baseVal.value - 2000) {
    Tools.svg.width.baseVal.value = Math.min(x + 2000, MAX_BOARD_SIZE);
  }
  if (y > Tools.svg.height.baseVal.value - 2000) {
    Tools.svg.height.baseVal.value = Math.min(y + 2000, MAX_BOARD_SIZE);
  }
}

function updateUnreadCount(m) {
  if (document.hidden && ['child', 'update'].indexOf(m.type) === -1) {
    Tools.newUnreadMessage();
  }
}

Tools.messageHooks = [resizeCanvas, updateUnreadCount];

Tools.scale = 1.0;
var scaleTimeout = null;
Tools.setScale = function setScale(scale) {
  var fullScale =
    Math.max(window.innerWidth, window.innerHeight) /
    Tools.server_config.MAX_BOARD_SIZE;
  var minScale = Math.max(0.1, fullScale);
  var maxScale = 10;
  if (isNaN(scale)) scale = 1;
  scale = Math.max(minScale, Math.min(maxScale, scale));
  Tools.svg.style.willChange = 'transform';
  Tools.svg.style.transform = 'scale(' + scale + ')';
  clearTimeout(scaleTimeout);
  scaleTimeout = setTimeout(function () {
    Tools.svg.style.willChange = 'auto';
  }, 1000);
  Tools.scale = scale;
  return scale;
};
Tools.getScale = function getScale() {
  return Tools.scale;
};

Tools.toolHooks = [
  function checkToolAttributes(tool) {
    if (typeof tool.name !== 'string') throw 'A tool must have a name';
    if (typeof tool.listeners !== 'object') {
      tool.listeners = {};
    }
    if (typeof tool.onstart !== 'function') {
      tool.onstart = function () {};
    }
    if (typeof tool.onquit !== 'function') {
      tool.onquit = function () {};
    }
  },
  function compileListeners(tool) {
    var listeners = tool.listeners;

    var compiled = tool.compiledListeners || {};
    tool.compiledListeners = compiled;

    function compile(listener) {
      return function listen(evt) {
        var x = evt.pageX / Tools.getScale(),
          y = evt.pageY / Tools.getScale();
        return listener(x, y, evt, false);
      };
    }

    function compileTouch(listener) {
      return function touchListen(evt) {
        if (evt.changedTouches.length === 1) {
          var touch = evt.changedTouches[0];
          var x = touch.pageX / Tools.getScale(),
            y = touch.pageY / Tools.getScale();
          return listener(x, y, evt, true);
        }
        return true;
      };
    }

    function wrapUnsetHover(f, toolName) {
      return function unsetHover(evt) {
        document.activeElement &&
          document.activeElement.blur &&
          document.activeElement.blur();
        return f(evt);
      };
    }

    if (listeners.press) {
      compiled['mousedown'] = wrapUnsetHover(
        compile(listeners.press),
        tool.name
      );
      compiled['touchstart'] = wrapUnsetHover(
        compileTouch(listeners.press),
        tool.name
      );
    }
    if (listeners.move) {
      compiled['mousemove'] = compile(listeners.move);
      compiled['touchmove'] = compileTouch(listeners.move);
    }
    if (listeners.release) {
      var release = compile(listeners.release),
        releaseTouch = compileTouch(listeners.release);
      compiled['mouseup'] = release;
      if (!Tools.isIE) compiled['mouseleave'] = release;
      compiled['touchleave'] = releaseTouch;
      compiled['touchend'] = releaseTouch;
      compiled['touchcancel'] = releaseTouch;
    }
  },
];

Tools.applyHooks = function (hooks, object) {
  hooks.forEach(function (hook) {
    hook(object);
  });
};

// Utility functions

Tools.generateUID = function (prefix, suffix) {
  var uid = Date.now().toString(36); //Create the uids in chronological order
  uid += Math.round(Math.random() * 36).toString(36); //Add a random character at the end
  if (prefix) uid = prefix + uid;
  if (suffix) uid = uid + suffix;
  return uid;
};

Tools.createSVGElement = function createSVGElement(name, attrs) {
  var elem = document.createElementNS(Tools.svg.namespaceURI, name);
  if (typeof attrs !== 'object') return elem;
  Object.keys(attrs).forEach(function (key, i) {
    elem.setAttributeNS(null, key, attrs[key]);
  });
  return elem;
};

Tools.positionElement = function (elem, x, y) {
  elem.style.top = y + 'px';
  elem.style.left = x + 'px';
};

Tools.colorPresets = [
  { color: '#001f3f', key: '1' },
  { color: '#FF4136', key: '2' },
  { color: '#0074D9', key: '3' },
  { color: '#FF851B', key: '4' },
  { color: '#FFDC00', key: '5' },
  { color: '#3D9970', key: '6' },
  { color: '#91E99B', key: '7' },
  { color: '#90468b', key: '8' },
  { color: '#7FDBFF', key: '9' },
  { color: '#AAAAAA', key: '0' },
  { color: '#E65194' },
];

Tools.color_chooser = document.getElementById('chooseColor');

Tools.setColor = function (color) {
  Tools.color_chooser.value = color;
};

Tools.getColor = (function color() {
  var color_index = (Math.random() * Tools.colorPresets.length) | 0;
  var initial_color = Tools.colorPresets[color_index].color;
  Tools.setColor(initial_color);
  return function () {
    return Tools.color_chooser.value;
  };
})();

Tools.colorPresets.forEach(Tools.HTML.addColorButton.bind(Tools.HTML));

Tools.sizeChangeHandlers = [];
Tools.setSize = (function size() {
  var chooser = document.getElementById('chooseSize');

  function update() {
    var size = Math.max(1, Math.min(50, chooser.value | 0));
    chooser.value = size;
    Tools.sizeChangeHandlers.forEach(function (handler) {
      handler(size);
    });
  }
  update();

  chooser.onchange = chooser.oninput = update;
  return function (value) {
    if (value !== null && value !== undefined) {
      chooser.value = value;
      update();
    }
    return parseInt(chooser.value);
  };
})();

Tools.getSize = function () {
  return Tools.setSize();
};

Tools.getOpacity = (function opacity() {
  var chooser = document.getElementById('chooseOpacity');
  var opacityIndicator = document.getElementById('opacityIndicator');

  function update() {
    opacityIndicator.setAttribute('opacity', chooser.value);
  }
  update();

  chooser.onchange = chooser.oninput = update;
  return function () {
    return Math.max(0.1, Math.min(1, chooser.value));
  };
})();

Tools.svg.width.baseVal.value = document.body.clientWidth;
Tools.svg.height.baseVal.value = document.body.clientHeight;
