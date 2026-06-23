const ALPHANUMERIC = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
const VERSION_SIZE = 21;
const DATA_CODEWORDS = 19;
const ECC_CODEWORDS = 7;
const MASK_PATTERN = 0;

function appendBits(bits, value, length) {
  for (let index = length - 1; index >= 0; index -= 1) {
    bits.push((value >>> index) & 1);
  }
}

function encodeAlphanumeric(text) {
  const value = String(text || "").toUpperCase();
  const bits = [];
  appendBits(bits, 0x2, 4);
  appendBits(bits, value.length, 9);

  for (let index = 0; index < value.length; index += 2) {
    const first = ALPHANUMERIC.indexOf(value[index]);
    if (first < 0) throw new Error("二维码内容包含不支持的字符");
    if (index + 1 < value.length) {
      const second = ALPHANUMERIC.indexOf(value[index + 1]);
      if (second < 0) throw new Error("二维码内容包含不支持的字符");
      appendBits(bits, first * 45 + second, 11);
    } else {
      appendBits(bits, first, 6);
    }
  }

  const capacity = DATA_CODEWORDS * 8;
  appendBits(bits, 0, Math.min(4, capacity - bits.length));
  while (bits.length % 8) bits.push(0);

  const codewords = [];
  for (let index = 0; index < bits.length; index += 8) {
    let valueByte = 0;
    for (let offset = 0; offset < 8; offset += 1) valueByte = (valueByte << 1) | bits[index + offset];
    codewords.push(valueByte);
  }
  for (let pad = 0; codewords.length < DATA_CODEWORDS; pad += 1) {
    codewords.push(pad % 2 === 0 ? 0xec : 0x11);
  }
  return codewords;
}

const EXP = [];
const LOG = [];

function initGalois() {
  let value = 1;
  for (let index = 0; index < 255; index += 1) {
    EXP[index] = value;
    LOG[value] = index;
    value <<= 1;
    if (value & 0x100) value ^= 0x11d;
  }
  for (let index = 255; index < 512; index += 1) EXP[index] = EXP[index - 255];
}

initGalois();

function multiply(a, b) {
  if (!a || !b) return 0;
  return EXP[LOG[a] + LOG[b]];
}

function multiplyPoly(left, right) {
  const result = new Array(left.length + right.length - 1).fill(0);
  left.forEach((leftValue, leftIndex) => {
    right.forEach((rightValue, rightIndex) => {
      result[leftIndex + rightIndex] ^= multiply(leftValue, rightValue);
    });
  });
  return result;
}

function reedSolomonGenerator(degree) {
  let result = [1];
  for (let index = 0; index < degree; index += 1) {
    result = multiplyPoly(result, [1, EXP[index]]);
  }
  return result.slice(1);
}

function reedSolomonRemainder(data, degree) {
  const generator = reedSolomonGenerator(degree);
  const result = new Array(degree).fill(0);
  data.forEach((codeword) => {
    const factor = codeword ^ result.shift();
    result.push(0);
    generator.forEach((coefficient, index) => {
      result[index] ^= multiply(coefficient, factor);
    });
  });
  return result;
}

function emptyMatrix() {
  const matrix = [];
  const reserved = [];
  for (let y = 0; y < VERSION_SIZE; y += 1) {
    matrix.push(new Array(VERSION_SIZE).fill(false));
    reserved.push(new Array(VERSION_SIZE).fill(false));
  }
  return { matrix, reserved };
}

function setModule(state, x, y, value, reserve) {
  if (x < 0 || y < 0 || x >= VERSION_SIZE || y >= VERSION_SIZE) return;
  state.matrix[y][x] = Boolean(value);
  if (reserve) state.reserved[y][x] = true;
}

function drawFinder(state, left, top) {
  for (let dy = -1; dy <= 7; dy += 1) {
    for (let dx = -1; dx <= 7; dx += 1) {
      const x = left + dx;
      const y = top + dy;
      if (x < 0 || y < 0 || x >= VERSION_SIZE || y >= VERSION_SIZE) continue;
      const separator = dx === -1 || dx === 7 || dy === -1 || dy === 7;
      const border = dx === 0 || dx === 6 || dy === 0 || dy === 6;
      const center = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
      setModule(state, x, y, !separator && (border || center), true);
    }
  }
}

function reserveFormat(state) {
  const coords = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8],
    [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
    [20, 8], [19, 8], [18, 8], [17, 8], [16, 8], [15, 8], [14, 8], [13, 8],
    [8, 20], [8, 19], [8, 18], [8, 17], [8, 16], [8, 15], [8, 14]
  ];
  coords.forEach(([x, y]) => {
    state.reserved[y][x] = true;
  });
}

function drawFunctionPatterns(state) {
  drawFinder(state, 0, 0);
  drawFinder(state, VERSION_SIZE - 7, 0);
  drawFinder(state, 0, VERSION_SIZE - 7);

  for (let index = 8; index < VERSION_SIZE - 8; index += 1) {
    const dark = index % 2 === 0;
    setModule(state, index, 6, dark, true);
    setModule(state, 6, index, dark, true);
  }
  setModule(state, 8, 13, true, true);
  reserveFormat(state);
}

function maskBit(x, y) {
  return (x + y) % 2 === 0;
}

function placeData(state, codewords) {
  const bits = [];
  codewords.forEach((codeword) => appendBits(bits, codeword, 8));
  let bitIndex = 0;
  let upward = true;

  for (let right = VERSION_SIZE - 1; right >= 1; right -= 2) {
    if (right === 6) right -= 1;
    for (let vertical = 0; vertical < VERSION_SIZE; vertical += 1) {
      const y = upward ? VERSION_SIZE - 1 - vertical : vertical;
      for (let offset = 0; offset < 2; offset += 1) {
        const x = right - offset;
        if (state.reserved[y][x]) continue;
        const bit = bitIndex < bits.length ? bits[bitIndex] : 0;
        bitIndex += 1;
        setModule(state, x, y, Boolean(bit) !== maskBit(x, y), false);
      }
    }
    upward = !upward;
  }
}

function formatBits() {
  const data = (1 << 3) | MASK_PATTERN;
  let remainder = data;
  for (let index = 0; index < 10; index += 1) {
    remainder = (remainder << 1) ^ (((remainder >>> 9) & 1) ? 0x537 : 0);
  }
  return ((data << 10) | (remainder & 0x3ff)) ^ 0x5412;
}

function drawFormatBits(state) {
  const bits = formatBits();
  const getBit = (index) => ((bits >>> index) & 1) === 1;

  for (let index = 0; index <= 5; index += 1) setModule(state, 8, index, getBit(index), true);
  setModule(state, 8, 7, getBit(6), true);
  setModule(state, 8, 8, getBit(7), true);
  setModule(state, 7, 8, getBit(8), true);
  for (let index = 9; index < 15; index += 1) setModule(state, 14 - index, 8, getBit(index), true);

  for (let index = 0; index < 8; index += 1) setModule(state, VERSION_SIZE - 1 - index, 8, getBit(index), true);
  for (let index = 8; index < 15; index += 1) setModule(state, 8, VERSION_SIZE - 15 + index, getBit(index), true);
  setModule(state, 8, 13, true, true);
}

function createMatrix(text) {
  const data = encodeAlphanumeric(text);
  const ecc = reedSolomonRemainder(data, ECC_CODEWORDS);
  const state = emptyMatrix();
  drawFunctionPatterns(state);
  placeData(state, data.concat(ecc));
  drawFormatBits(state);
  return state.matrix;
}

function drawCanvas(canvasId, text, options) {
  const matrix = createMatrix(text);
  const size = options && options.size ? options.size : 220;
  const quiet = 4;
  const count = matrix.length + quiet * 2;
  const moduleSize = Math.floor(size / count);
  const offset = Math.floor((size - moduleSize * matrix.length) / 2);
  const ctx = wx.createCanvasContext(canvasId, options && options.component);

  ctx.setFillStyle("#ffffff");
  ctx.fillRect(0, 0, size, size);
  ctx.setFillStyle("#10233f");
  matrix.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) ctx.fillRect(offset + x * moduleSize, offset + y * moduleSize, moduleSize, moduleSize);
    });
  });
  ctx.draw();
  return matrix;
}

module.exports = {
  createMatrix,
  drawCanvas,
  reedSolomonGenerator
};
