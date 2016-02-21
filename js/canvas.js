var canvas = document.getElementById('bg-noise');
var gl = canvas.getContext('webgl', {
  preserveDrawingBuffer: true
});
var width;
var height;

var shaders;
var noise;
var particles;

var noiseOffset = 0;
var colorOffset = 0;

var particleConfig = {
  num: 10000,
  speed: 11
};

var colorConfig = {
  function: 'noise',
  scheme: 'cubehelix',
  speed: 60
};

var fieldConfig = {
  function: 'angle',
  baseAngle: 36,
  angleRange: 36
};

var noiseConfig = {
  octaves: 1,
  frequency: 1,
  falloff: 0.92,
  speed: 10
};

var glConfig = {
  mode: 'LINES',
  pointSize: 1,
  lineWidth: 1,
  preserve: true
};

var gui = new dat.GUI();
gui.close();
dat.GUI.toggleHide();

gui.add({
  Restart: init
}, 'Restart');

var particlesFolder = gui.addFolder('Particles');
particlesFolder.add(particleConfig, 'num');
particlesFolder.add(particleConfig, 'speed', 0, 100);

var colorFolder = gui.addFolder('Color');
colorFolder.add(colorConfig, 'function', ['noise', 'angle']);
colorFolder.add(colorConfig, 'scheme', ['hsl', 'cubehelix']);
colorFolder.add(colorConfig, 'speed', 0, 100);

var fieldFolder = gui.addFolder('Field');
fieldFolder.add(fieldConfig, 'function', ['angle', 'curl', 'grad']).onFinishChange(function(value) {
  if (value === 'angle') {
    baseAngleController = fieldFolder.add(fieldConfig, 'baseAngle', 0, 360);
    angleRangeController = fieldFolder.add(fieldConfig, 'angleRange', 0, 180);
  } else {
    if (baseAngleController) fieldFolder.remove(baseAngleController);
    if (angleRangeController) fieldFolder.remove(angleRangeController);
    baseAngleController = null;
    angleRangeController = null;
  }
});
var baseAngleController = fieldFolder.add(fieldConfig, 'baseAngle', 0, 360);
var angleRangeController = fieldFolder.add(fieldConfig, 'angleRange', 0, 180);

var noiseFolder = gui.addFolder('Noise');
noiseFolder.add(noiseConfig, 'octaves', 1, 10).step(1);
noiseFolder.add(noiseConfig, 'frequency', 0.5, 10);
noiseFolder.add(noiseConfig, 'falloff', 0, 1);
noiseFolder.add(noiseConfig, 'speed', 0, 100);

var glFolder = gui.addFolder('WebGL');
glFolder.add(glConfig, 'mode', ['LINES', 'POINTS', 'TRIANGLES']);
glFolder.add(glConfig, 'pointSize', 1, 10);
glFolder.add(glConfig, 'lineWidth', 1, 10);
glFolder.add(glConfig, 'preserve');

// Different methods for mapping (x, y, z) -> noise scalar -> 2D displacement vector.
var fieldFunctions = (function() {
  var out = {
    x: 0,
    y: 0
  };
  var ep = 1e-8;
  var hep = ep / 2;

  return {
    // Maps the noise scalar to a unit vector depending on configuration angles.
    angle: function(noise, x, y, z) {
      var scale = getNoise(noise, x, y, z);
      var angle = fieldConfig.baseAngle + scale * fieldConfig.angleRange;
      angle *= Math.PI / 180;

      out.x = Math.cos(angle);
      out.y = Math.sin(angle);

      return out;
    },
    // The gradient of getNoise, excluding z.
    grad: function(noise, x, y, z) {
      var dx = (getNoise(noise, x + hep, y, z) - getNoise(noise, x - hep, y, z)) / ep;
      var dy = (getNoise(noise, x, y + hep, z) - getNoise(noise, x, y - hep, z)) / ep;
      
      var mag = dx * dx + dy * dy
      if (mag < 0.01) {
        mag = Math.sqrt(mag);
        dx *= 0.1 / mag;
        dy *= 0.1 / mag;
      }

      out.x = dx;
      out.y = dy;

      return out;
    },
    // If f(x, y, z) = (0, 0, getNoise(x, y, z)), returns the curl of f.
    curl: function(noise, x, y, z) {
      var dx = (getNoise(noise, x + hep, y, z) - getNoise(noise, x - hep, y, z)) / ep;
      var dy = (getNoise(noise, x, y + hep, z) - getNoise(noise, x, y - hep, z)) / ep;
      
      var mag = dx * dx + dy * dy
      if (mag < 0.01) {
        mag = Math.sqrt(mag);
        dx *= 0.1 / mag;
        dy *= 0.1 / mag;
      }

      out.x = -dy;
      out.y = dx;

      return out;
    }
  }
})();

// Different methods for mapping (x, y, z) -> rgb.
var colorFunctions = (function() {
  function hslToRgb(h, s, l) {
    var C = (1 - Math.abs(2 * l - 1)) * s;
    var m = l - C * 0.5;
    var X = C * (1 - Math.abs(h / 60 % 2 - 1));
    var r = 0;
    var g = 0;
    var b = 0;
    if (0 <= h && h < 60) {
      r = C;
      g = X;
    } else if (60 <= h && h < 120) {
      r = X;
      g = C;
    } else if (120 <= h && h < 180) {
      g = C;
      b = X;
    } else if (180 <= h && h < 240) {
      g = X;
      b = C;
    } else if (240 <= h && h < 300) {
      r = X;
      b = C;
    } else if (300 <= h && h < 360) {
      r = C;
      b = X;
    }

    return {
      r: r,
      g: g,
      b: b
    };
  }

  function cubehelix(start, lambda, hue) {
    var phi = 2 * Math.PI * (start / 3 + lambda * 4);
    var a = hue * lambda * (1 - lambda) / 2;

    var cp = Math.cos(phi);
    var sp = Math.sin(phi);

    var r = lambda + a * (cp * -0.14861 + sp * 1.78277);
    var g = lambda + a * (cp * -0.29227 + sp * -0.90649);
    var b = lambda + a * (cp * 1.97294 + sp * 0);

    return {
      r: r,
      g: g,
      b: b
    };
  }

  var hslScheme = Array(1000);
  var cubehelixScheme = Array(1000);
  for (var i = 0; i < 1000; i++) {
    hslScheme[i] = hslToRgb(360 * i / 1000, 1, 0.5);
    cubehelixScheme[i] = cubehelix(0.5, 0.15 + 0.6 * i / 1000, 1.5);
  }

  var schemes = {
    hsl: hslScheme,
    cubehelix: cubehelixScheme
  };

  return {
    angle: function(noise, x, y, z) {
      var scheme = schemes[colorConfig.scheme];
      var theta = Math.atan2(y, x);
      theta /= Math.PI;
      theta = (theta + 1) / 2;
      theta += z;
      theta = theta > 1 ? theta - 1 : theta;
      return scheme[((z / 10 + theta * scheme.length) | 0) % scheme.length];
    },
    noise: function(noise, x, y, z) {
      var scheme = schemes[colorConfig.scheme];
      var n = noise.noise3D(x, y, z);
      n = (n + 1) / 2;
      return scheme[n * scheme.length | 0];
    }
  };
})();

function createShader(source, type) {
  var shader;
  if (type === 'fragment') {
    shader = gl.createShader(gl.FRAGMENT_SHADER);
  } else if (type === 'vertex') {
    shader = gl.createShader(gl.VERTEX_SHADER);
  } else throw new Error('Invalid shader type');

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    alert(gl.getShaderInfoLog(shader));
    return null;
  }

  return shader;
}

function initShaders() {
  var vertexShaderSource = `
    attribute vec2 a_position;
    attribute vec4 a_color;
    uniform float u_pointSize;
    varying vec4 v_color;
    void main(void) {
      gl_PointSize = u_pointSize;
      gl_Position = vec4(a_position, 0.0, 1.0);
      v_color = a_color;
    }
  `;

  var fragmentShaderSource = `
    precision mediump float;
    varying vec4 v_color;
    void main(void) {
      gl_FragColor = v_color;
    }
  `;

  var vertexShader = createShader(vertexShaderSource, 'vertex');
  var fragmentShader = createShader(fragmentShaderSource, 'fragment');

  var program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  var a_position = gl.getAttribLocation(program, 'a_position');
  var a_color = gl.getAttribLocation(program, 'a_color');
  var u_pointSize = gl.getUniformLocation(program, 'u_pointSize');

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    alert('Could not link shaders');
  }

  return {
    program,
    a_position,
    a_color,
    u_pointSize
  };
}

function resetParticle(positions, colors, i, noise) {
  var j = i * 4;
  var k = i * 8;
  positions[j + 2] = 2 * (Math.random() - 0.5);
  positions[j + 3] = 2 * (Math.random() - 0.5);
  positions[j] = positions[j + 2];
  positions[j + 1] = positions[j + 3];

  var x = positions[j];
  var y = positions[j + 1];

  var rgb = colorFunctions[colorConfig.function](noise, x, y, colorOffset);
  colors[k] = rgb.r;
  colors[k + 1] = rgb.g;
  colors[k + 2] = rgb.b;
  colors[k + 3] = 1;
  colors[k + 4] = rgb.r;
  colors[k + 5] = rgb.g;
  colors[k + 6] = rgb.b;
  colors[k + 7] = 1;
}

function createParticles(num, noise) {
  var positions = new Float32Array(num * 4);
  var colors = new Float32Array(num * 8);
  for (var i = 0; i < num; i++) {
    resetParticle(positions, colors, i, noise);
  }

  return {
    positions: positions,
    colors: colors,
    positionBuffer: gl.createBuffer(),
    colorBuffer: gl.createBuffer(),
    num: num
  };
}

function updateParticles(particles, noise, time) {
  var off = 0;
  var positions = particles.positions;
  var colors = particles.colors;
  var stepX = particleConfig.speed / width;
  var stepY = particleConfig.speed / height;
  var fieldFunction = fieldFunctions[fieldConfig.function];

  noiseOffset += noiseConfig.speed / 10000;
  colorOffset += colorConfig.speed / 10000;
  for (var i = 0, j = 0; i < particles.num; i++, j += 4) {
    positions[j + 0] = positions[j + 2];
    positions[j + 1] = positions[j + 3];

    var x = positions[j + 2];
    var y = positions[j + 3];

    var delta = fieldFunction(noise, x, y, noiseOffset);

    positions[j + 2] += delta.x * stepX;
    positions[j + 3] += delta.y * stepY;

    var x = positions[j + 2];
    var y = positions[j + 3];

    if (x > 1 || y > 1 || x < -1 || y < -1) {
      resetParticle(positions, colors, i, noise);
    }
  }
}

function getNoise(noise, x, y, z) {
  var result = 0;
  var amp = 1;
  var maxAmp = 0;
  var octaves = noiseConfig.octaves;
  var falloff = noiseConfig.falloff;
  var freq = noiseConfig.frequency;
  for (var i = 0; i < octaves; i++) {
    result += amp * noise.noise3D(x * freq, y * freq, z * freq);
    maxAmp += amp;
    amp *= falloff;
    freq *= 2;
  }

  result /= maxAmp;

  return result;
}

function draw(shaders, particles) {
  gl.useProgram(shaders.program);

  if (!glConfig.preserve) {
    gl.clearColor(51 / 255, 51 / 255, 51 / 255, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  gl.enableVertexAttribArray(shaders.a_position);
  gl.bindBuffer(gl.ARRAY_BUFFER, particles.positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, particles.positions, gl.STATIC_DRAW);
  gl.vertexAttribPointer(shaders.a_position, 2, gl.FLOAT, false, 0, 0);
  
  gl.enableVertexAttribArray(shaders.a_color);
  gl.bindBuffer(gl.ARRAY_BUFFER, particles.colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, particles.colors, gl.STATIC_DRAW);
  gl.vertexAttribPointer(shaders.a_color, 4, gl.FLOAT, false, 0, 0);

  gl.uniform1f(shaders.u_pointSize, glConfig.pointSize);

  gl.lineWidth(glConfig.lineWidth);
  gl.drawArrays(gl[glConfig.mode], 0, particles.num);

  gl.disableVertexAttribArray(shaders.a_position);
  gl.disableVertexAttribArray(shaders.a_color);
}

function resize() {
  var r = 1;
  width = canvas.width = r * window.innerWidth;
  height = canvas.height = r * window.innerHeight;
  gl.viewport(0, 0, width, height);
  gl.clearColor(51 / 255, 51 / 255, 51 / 255, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
}

function init() {
  resize();
  noise = new SimplexNoise();
  particles = createParticles(Number(particleConfig.num), noise);
}

function playCanvas(time) {
  requestAnimationFrame(playCanvas);
  updateParticles(particles, noise, time);
  draw(shaders, particles);
}

window.onresize = resize;

shaders = initShaders();
init();

/**
 * Inspired by "Noise Abstraction" by Akimitsu Hamamuro
 * http://codepen.io/akm2/details/nImoa/
 *
 */