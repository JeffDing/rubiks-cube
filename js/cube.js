(function (global) {
  'use strict';

  var COLORS = {
    U: '#f5f6f7',
    D: '#ffd400',
    F: '#00b34a',
    B: '#0057b8',
    R: '#d80027',
    L: '#ff7a00'
  };

  var FACE_NORMAL = {
    U: [0, 1, 0],
    D: [0, -1, 0],
    F: [0, 0, 1],
    B: [0, 0, -1],
    R: [1, 0, 0],
    L: [-1, 0, 0]
  };

  var LETTERS = ['U', 'D', 'F', 'B', 'R', 'L'];

  var OPP = { U: 'D', D: 'U', R: 'L', L: 'R', F: 'B', B: 'F' };

  var ROT = {
    x: [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
    y: [[0, 0, 1], [0, 1, 0], [-1, 0, 0]],
    z: [[0, -1, 0], [1, 0, 0], [0, 0, 1]]
  };

  function transpose(m) {
    return [
      [m[0][0], m[1][0], m[2][0]],
      [m[0][1], m[1][1], m[2][1]],
      [m[0][2], m[1][2], m[2][2]]
    ];
  }

  function matVec(m, v) {
    return [
      m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
      m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
      m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]
    ];
  }

  function matMul(a, b) {
    var r = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (var i = 0; i < 3; i++) {
      for (var j = 0; j < 3; j++) {
        r[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
      }
    }
    return r;
  }

  function axisIndex(axis) {
    return axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  }

  function rotMatrix(axis, dir) {
    var m = ROT[axis];
    return dir > 0 ? m : transpose(m);
  }

  function createState() {
    var cubies = [];
    for (var x = -1; x <= 1; x++) {
      for (var y = -1; y <= 1; y++) {
        for (var z = -1; z <= 1; z++) {
          if (x === 0 && y === 0 && z === 0) continue;
          var stickers = [];
          var coord = [x, y, z];
          for (var li = 0; li < LETTERS.length; li++) {
            var L = LETTERS[li];
            var n = FACE_NORMAL[L];
            var ai = n[0] !== 0 ? 0 : n[1] !== 0 ? 1 : 2;
            if (coord[ai] === n[ai]) {
              stickers.push({ n: n.slice(), color: COLORS[L], face: L });
            }
          }
          cubies.push({
            pos: [x, y, z],
            home: [x, y, z],
            ori: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
            stickers: stickers
          });
        }
      }
    }
    return { cubies: cubies };
  }

  function applyRotation(state, move) {
    var R = rotMatrix(move.axis, move.dir);
    var ai = axisIndex(move.axis);
    for (var i = 0; i < state.cubies.length; i++) {
      var c = state.cubies[i];
      if (c.pos[ai] !== move.layer) continue;
      var p = matVec(R, c.pos);
      var o = matMul(R, c.ori);
      c.pos = [Math.round(p[0]), Math.round(p[1]), Math.round(p[2])];
      for (var r = 0; r < 3; r++) {
        o[r] = [Math.round(o[r][0]), Math.round(o[r][1]), Math.round(o[r][2])];
      }
      c.ori = o;
    }
  }

  function isSolved(state) {
    for (var i = 0; i < state.cubies.length; i++) {
      var c = state.cubies[i];
      var ori = c.ori;
      for (var s = 0; s < c.stickers.length; s++) {
        var n0 = c.stickers[s].n;
        var nw = matVec(ori, n0);
        for (var k = 0; k < 3; k++) {
          if (Math.round(nw[k]) !== n0[k]) return false;
        }
      }
    }
    return true;
  }

  function faceMatrix(state, letter) {
    var n = FACE_NORMAL[letter];
    var base = (letter === 'F' || letter === 'B') ? ['x', 'y']
      : (letter === 'U' || letter === 'D') ? ['x', 'z'] : ['y', 'z'];
    var grid = [[null, null, null], [null, null, null], [null, null, null]];
    function coord(axis, pos) { return axis === 'x' ? pos[0] : axis === 'y' ? pos[1] : pos[2]; }
    for (var i = 0; i < state.cubies.length; i++) {
      var c = state.cubies[i];
      for (var s = 0; s < c.stickers.length; s++) {
        var nw = matVec(c.ori, c.stickers[s].n).map(Math.round);
        if (nw[0] === n[0] && nw[1] === n[1] && nw[2] === n[2]) {
          grid[coord(base[0], c.pos) + 1][coord(base[1], c.pos) + 1] = c.stickers[s].color;
        }
      }
    }
    return grid;
  }

  var STANDARD = {
    U: { axis: 'y', layer: 1, dir: -1 },
    D: { axis: 'y', layer: -1, dir: 1 },
    R: { axis: 'x', layer: 1, dir: -1 },
    L: { axis: 'x', layer: -1, dir: 1 },
    F: { axis: 'z', layer: 1, dir: -1 },
    B: { axis: 'z', layer: -1, dir: 1 }
  };

  function standardMove(letter, inverse) {
    var m = STANDARD[letter];
    return { axis: m.axis, layer: m.layer, dir: inverse ? -m.dir : m.dir };
  }

  function negate(m) {
    return { axis: m.axis, layer: m.layer, dir: -m.dir };
  }

  function scramble(n, rand) {
    rand = rand || Math.random;
    var out = [];
    var prev = null;
    var guard = 0;
    while (out.length < n && guard++ < 2000) {
      var L = LETTERS[Math.floor(rand() * LETTERS.length) % LETTERS.length];
      if (prev && (L === prev || L === OPP[prev])) continue;
      out.push(standardMove(L, rand() < 0.5));
      prev = L;
    }
    return out;
  }

  function solve(history) {
    return history.map(negate).reverse();
  }

  global.RubikCore = {
    COLORS: COLORS,
    FACE_NORMAL: FACE_NORMAL,
    LETTERS: LETTERS,
    createState: createState,
    applyRotation: applyRotation,
    isSolved: isSolved,
    faceMatrix: faceMatrix,
    standardMove: standardMove,
    negate: negate,
    scramble: scramble,
    solve: solve,
    axisIndex: axisIndex
  };
})(window);
