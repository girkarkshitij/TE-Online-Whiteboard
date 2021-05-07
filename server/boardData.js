const fs = require('./fs_promises.js'),
  log = require('./log.js').log,
  path = require('path'),
  config = require('./configuration.js'),
  Mutex = require('async-mutex').Mutex;

class BoardData {
  constructor(name) {
    this.name = name;
    /** @type {{[name: string]: BoardElem}} */
    this.board = {};
    this.file = path.join(
      config.HISTORY_DIR,
      'board-' + encodeURIComponent(name) + '.json'
    );
    this.lastSaveDate = Date.now();
    this.users = new Set();
    this.saveMutex = new Mutex();
  }

  set(id, data) {
    data.time = Date.now();
    this.validate(data);
    this.board[id] = data;
    this.delaySave();
  }

  addChild(parentId, child) {
    var obj = this.board[parentId];
    if (typeof obj !== 'object') return false;
    if (Array.isArray(obj._children)) obj._children.push(child);
    else obj._children = [child];

    this.validate(obj);
    this.delaySave();
    return true;
  }

  update(id, data, create) {
    delete data.type;
    delete data.tool;

    var obj = this.board[id];
    if (typeof obj === 'object') {
      for (var i in data) {
        obj[i] = data[i];
      }
    } else if (create || obj !== undefined) {
      this.board[id] = data;
    }
    this.delaySave();
  }

  delete(id) {
    delete this.board[id];
    this.delaySave();
  }

  get(id) {
    return this.board[id];
  }

  getAll(id) {
    return Object.entries(this.board)
      .filter(([i]) => !id || i > id)
      .map(([_, elem]) => elem);
  }

  delaySave() {
    if (this.saveTimeoutId !== undefined) clearTimeout(this.saveTimeoutId);
    this.saveTimeoutId = setTimeout(this.save.bind(this), config.SAVE_INTERVAL);
    if (Date.now() - this.lastSaveDate > config.MAX_SAVE_DELAY)
      setTimeout(this.save.bind(this), 0);
  }

  async save() {
    // The mutex prevents multiple save operation to happen simultaneously
    this.saveMutex.runExclusive(this._unsafe_save.bind(this));
  }

  async _unsafe_save() {
    this.lastSaveDate = Date.now();
    this.clean();
    var file = this.file;
    var tmp_file = backupFileName(file);
    var board_txt = JSON.stringify(this.board);
    if (board_txt === '{}') {
      try {
        await fs.promises.unlink(file);
        log('removed empty board', { name: this.name });
      } catch (err) {
        if (err.code !== 'ENOENT') {
          log('board deletion error', { err: err.toString() });
        }
      }
    } else {
      try {
        await fs.promises.writeFile(tmp_file, board_txt, { flag: 'wx' });
        await fs.promises.rename(tmp_file, file);
        log('saved board', {
          name: this.name,
          size: board_txt.length,
          delay_ms: Date.now() - this.lastSaveDate,
        });
      } catch (err) {
        log('board saving error', {
          err: err.toString(),
          tmp_file: tmp_file,
        });
        return;
      }
    }
  }

  clean() {
    var board = this.board;
    var ids = Object.keys(board);
    if (ids.length > config.MAX_ITEM_COUNT) {
      var toDestroy = ids
        .sort(function (x, y) {
          return (board[x].time | 0) - (board[y].time | 0);
        })
        .slice(0, -config.MAX_ITEM_COUNT);
      for (var i = 0; i < toDestroy.length; i++) delete board[toDestroy[i]];
      log('cleaned board', { removed: toDestroy.length, board: this.name });
    }
  }

  validate(item) {
    if (item.hasOwnProperty('size')) {
      item.size = parseInt(item.size) || 1;
      item.size = Math.min(Math.max(item.size, 1), 50);
    }
    if (item.hasOwnProperty('x') || item.hasOwnProperty('y')) {
      item.x = parseFloat(item.x) || 0;
      item.x = Math.min(Math.max(item.x, 0), config.MAX_BOARD_SIZE);
      item.x = Math.round(10 * item.x) / 10;
      item.y = parseFloat(item.y) || 0;
      item.y = Math.min(Math.max(item.y, 0), config.MAX_BOARD_SIZE);
      item.y = Math.round(10 * item.y) / 10;
    }
    if (item.hasOwnProperty('opacity')) {
      item.opacity = Math.min(Math.max(item.opacity, 0.1), 1) || 1;
      if (item.opacity === 1) delete item.opacity;
    }
    if (item.hasOwnProperty('_children')) {
      if (!Array.isArray(item._children)) item._children = [];
      if (item._children.length > config.MAX_CHILDREN)
        item._children.length = config.MAX_CHILDREN;
      for (var i = 0; i < item._children.length; i++) {
        this.validate(item._children[i]);
      }
    }
  }

  static async load(name) {
    var boardData = new BoardData(name),
      data;
    try {
      data = await fs.promises.readFile(boardData.file);
      boardData.board = JSON.parse(data);
      for (const id in boardData.board) boardData.validate(boardData.board[id]);
      log('disk load', { board: boardData.name });
    } catch (e) {
      if (e.code === 'ENOENT') {
        log('empty board creation', { board: boardData.name });
      } else {
        log('board load error', {
          board: name,
          error: e.toString(),
          stack: e.stack,
        });
      }
      boardData.board = {};
      if (data) {
        var backup = backupFileName(boardData.file);
        log('Writing the corrupted file to ' + backup);
        try {
          await fs.promises.writeFile(backup, data);
        } catch (err) {
          log('Error writing ' + backup + ': ' + err);
        }
      }
    }
    return boardData;
  }
}

function backupFileName(baseName) {
  var date = new Date().toISOString().replace(/:/g, '');
  return baseName + '.' + date + '.bak';
}

module.exports.BoardData = BoardData;
