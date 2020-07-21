"use strict";
var vec3 = window.vec3;
var quat = window.quat;
var Fury = window.Fury;
var debug = false;

// glMatrix extension
quat.rotate = (function() {
	var i = quat.create();
	return function(out, q, rad, axis) {
		quat.setAxisAngle(i, axis, rad);
		return quat.multiply(out, i, q);
	};
})();

var resolutionFactor = 1; // Lower this for low-spec devices
var cameraRatio = 16 / 9;
var updateCanvasSize = function() {
	// Remove any scaling of width / height as a result of using CSS to size the canvas
	var glCanvas = document.getElementById("fury");
	glCanvas.width = resolutionFactor * glCanvas.clientWidth;
	glCanvas.height = resolutionFactor * glCanvas.clientHeight;
	cameraRatio = glCanvas.clientWidth / glCanvas.clientHeight;
	if (camera && camera.ratio) {
    	camera.ratio = cameraRatio;
	}
};
window.addEventListener('resize', updateCanvasSize);
updateCanvasSize();

Fury.init("fury");
var Input = Fury.Input;

var vertexColorShader = Fury.Shader.create({
	vsSource: [
	"attribute vec3 aVertexPosition;",
	"attribute vec3 aVertexColor;",

    "uniform mat4 uMVMatrix;",
    "uniform mat4 uPMatrix;",
    
    "varying vec4 vColor;",

    "void main(void) {",
        "gl_Position = uPMatrix * uMVMatrix * vec4(aVertexPosition, 1.0);",
        "vColor = vec4(aVertexColor, 1.0);", 
    "}"].join('\n'),
	fsSource: [
	"precision mediump float;",

    "varying vec4 vColor;",

    "void main(void) {",
        "gl_FragColor = vColor;",
    "}"].join('\n'),
	attributeNames: [ "aVertexPosition", "aVertexColor" ],
	uniformNames: [ "uMVMatrix", "uPMatrix" ],
	textureUniformNames: [ ],
	pMatrixUniformName: "uPMatrix",
	mvMatrixUniformName: "uMVMatrix",
	bindMaterial: function(material) {
		this.enableAttribute("aVertexPosition");
		this.enableAttribute("aVertexColor");
	},
	bindBuffers: function(mesh) {
		this.setAttribute("aVertexPosition", mesh.vertexBuffer);
		this.setAttribute("aVertexColor", mesh.colorBuffer);
		this.setIndexedAttribute(mesh.indexBuffer);
	}
});

var vertexColorMaterial = Fury.Material.create({ shader : vertexColorShader });

// Create Camera & Scene
var rotateRate = 0.1 * Math.PI, maxRotatePerFrame = 0.2 * rotateRate;
var zoomRate = 16;
var initalRotation = quat.create();
var camera = Fury.Camera.create({ near: 0.1, far: 10000.0, fov: 45.0, ratio: cameraRatio, position: vec3.fromValues(10.0, 10.0, 20.0), rotation: quat.fromValues(-0.232, 0.24, 0.06, 0.94) });
var scene = Fury.Scene.create({ camera: camera });
var meshes = [];

var lastTime = Date.now();

var generateLineMesh = function(points, colors, closed) {
    var vertices = [];
    var vertexColors = [];
    var indices = [];
    for (var i = 0, l = points.length; i < l; i++) {
        vertices.push(points[i][0], points[i][1], points[i][2]);
        vertexColors.push(colors[i][0], colors[i][1], colors[i][2]);
        if (closed || i + 1 < l) {
            indices.push(i, (i+1)%l);
        }
    }
    var mesh = Fury.Mesh.create({ vertices: vertices, indices: indices, renderMode: "lines" });
    mesh.vertexColors = vertexColors;
    mesh.colorBuffer = Fury.Renderer.createBuffer(vertexColors, 3);
    return mesh;
};

var addLineToScene = function(points, colors, closed) {
    var mesh = generateLineMesh(points, colors, closed);
    meshes.push(mesh);
    scene.add({ material: vertexColorMaterial, mesh: mesh });
};

var generateCurvePoints = function(p0, p1, p2, p3, startColor, endColor, samples) {
    var points = [];
    var colors = [];
    var sampleSize = 1 / (samples - 1);
    for(var i = 0; i < samples - 1; i++) {
        points.push(Beizer.cubic(p0, p1, p2, p3, i * sampleSize));
        let color = [];
        vec3.lerp(color, startColor, endColor, i * sampleSize);
        colors.push(color);
    }
    points.push(Beizer.cubic(p0, p1, p2, p3, 1));
    colors.push(endColor);
    return { points: points, colors: colors };
};

var Beizer = (function() {
    // Bézier Curves
    // https://en.wikipedia.org/wiki/B%C3%A9zier_curve#Specific_cases
    var exports = {};
    
    exports.quadratic = function(p0, p1, p2, t) {
        return [
            (1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
            (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1],
            (1 - t) * (1 - t) * p0[2] + 2 * (1 - t) * t * p1[2] + t * t * p2[2]
        ];
    };
    
    exports.cubic = function(p0, p1, p2, p3, t) {
        return  [ 
            (1 - t)*(1 - t)*(1 - t)*p0[0] + 3*(1 - t)*(1 - t)*t*p1[0] + 3*(1-t)*t*t*p2[0] + t*t*t*p3[0],
            (1 - t)*(1 - t)*(1 - t)*p0[1] + 3*(1 - t)*(1 - t)*t*p1[1] + 3*(1-t)*t*t*p2[1] + t*t*t*p3[1],
            (1 - t)*(1 - t)*(1 - t)*p0[2] + 3*(1 - t)*(1 - t)*t*p1[2] + 3*(1-t)*t*t*p2[2] + t*t*t*p3[2]
        ];
    };
    
    exports.cubicFirst = function(p0, p1, p2, p3, t) {
        return [
            3*(1 - t)*(1 - t)*(p1[0] - p0[0]) + 6*(1-t)*t*(p2[0] - p1[0]) + 3 * t * t * (p3[0] - p2[0]),
            3*(1 - t)*(1 - t)*(p1[1] - p0[1]) + 6*(1-t)*t*(p2[1] - p1[1]) + 3 * t * t * (p3[1] - p2[1]),
            3*(1 - t)*(1 - t)*(p1[2] - p0[2]) + 6*(1-t)*t*(p2[2] - p1[2]) + 3 * t * t * (p3[2] - p2[2])
        ];
    };
    
    exports.cubicSecond = function(p0, p1, p2, p3, t) {
        return [
            6 * (1 - t) * (p2[0] - 2*p1[0] + p0[0]) + 6 * t * (p3[0] - 2*p2[0] + p1[0]),
            6 * (1 - t) * (p2[1] - 2*p1[1] + p0[1]) + 6 * t * (p3[1] - 2*p2[1] + p1[1]),
            6 * (1 - t) * (p2[2] - 2*p1[2] + p0[2]) + 6 * t * (p3[2] - 2*p2[2] + p1[2])
        ];
    };
    
    return exports;
})();

var clearMeshes = function() {
	if(meshes.length > 0) {
		for(var i = 0, l = meshes.length; i < l; i++) {
			meshes[i].remove();
		}
		meshes.length = 0;
	}
};

var setClearColor = function(r, g, b) {
	Fury.Renderer.clearColor(r/255, g/255, b/255, 1.0);
};

var TrackPoint = (function() {
    var exports = {};
    
    var colors = [ [1.0, 0.0, 0.0], [0.0, 0.0, 1.0], [0.0, 1.0, 0.0] ];
    var nextColorIndex = 0;
    
    var proto = { 
        // Note: full magnitude used in both control cases
        // to keep curvature consistent
        findControl1: function(next) {
            var result = [];
            vec3.add(result, this.position, this.forward);
            return result;
        },
        findControl2: function(next) {
            var result = [];
            vec3.subtract(result, next.position, next.forward);
            return result;
        }
    };
    
    exports.create = function(position, forward, up) {
        var trackPoint = Object.create(proto);
        
        trackPoint.position = position;
        trackPoint.forward = forward;
        if (up) {
            trackPoint.up = up;
        } else {
            trackPoint.up = [0,1,0];
        }
        trackPoint.color = colors[nextColorIndex];
        
        nextColorIndex = (nextColorIndex + 1) % colors.length;
        
        return trackPoint;
    };
    
    return exports;
})();

var createTestTrack = function() {
    var trackPoints = [];
    
    trackPoints.push(TrackPoint.create([0,0,0], [0,0,10]));
    trackPoints.push(TrackPoint.create([-10,20,20], [-10,0,0], [0, 1, -0.5]));
    trackPoints.push(TrackPoint.create([-20,10,10], [0,0,-10], [-0.5,1,0]));
    trackPoints.push(TrackPoint.create([-30,0,10], [-5,0,5], [0.25,1,0]));
    trackPoints.push(TrackPoint.create([-40,0,20], [-10,0,0], [0,1,-0.5]));
    trackPoints.push(TrackPoint.create([-50,0,0], [5,0,-5], [0.5, 1, 0]));
    trackPoints.push(TrackPoint.create([-40,-10,-10], [10,0,0]));
    trackPoints.push(TrackPoint.create([-25,-5,-5], [5,0,0]));
    trackPoints.push(TrackPoint.create([-10,0,-10], [10,0,0]));

    return trackPoints;
};

var awake = function() {
	// Note this needs to happen after materials loaded so that when they are copied the textures have loaded.dw
	// Perhaps textures should be stored at the Fury (Fury.Engine) level and thus loading callbacks will provide the texture to all materials
	// who have that texture id and this will work even if they've been copied prior to texture load
	// More sensible would giving Fury this awake / update functionality so we don't need to write it each time.
    
    var trackPoints = createTestTrack();

    var showLines = true;

    for (var i = 0, l = trackPoints.length; i < l; i++) {
        var current = trackPoints[i];
        var next = trackPoints[(i + 1)%l];

        current.points = generateCurvePoints(current.position, current.findControl1(next), current.findControl2(next), next.position, current.color, next.color, 30);
        
        /*if (showLines) {
            current.mesh = generateLineMesh(current.points.points, current.points.colors); 
            meshes.push(current.mesh);
            scene.add({ material: vertexColorMaterial, mesh: current.mesh });
        }*/
        
        var white = [1,1,1]; // TODO: a list of colors please
        var up = [0, 1, 0];
        var lp0 = [], lp1 = [], lp2 = [], lp3 = [], coffset = [], noffset = [];
        coffset = vec3.cross(coffset, current.forward, current.up);
        coffset = vec3.normalize(coffset, coffset);
        coffset = vec3.scale(coffset, coffset, 1);
        
        noffset = vec3.cross(noffset, next.forward, next.up);
        noffset = vec3.normalize(noffset, noffset);
        noffset = vec3.scale(noffset, noffset, 1);
        
        vec3.subtract(lp0, current.position, coffset);
        vec3.subtract(lp1, current.findControl1(next), coffset);
        vec3.subtract(lp2, current.findControl2(next), noffset);
        vec3.subtract(lp3, next.position, noffset);
        
        current.leftPoints = generateCurvePoints(lp0, lp1, lp2, lp3, white, white, 30); 
        
        if (showLines) {
            current.leftMesh = generateLineMesh(current.leftPoints.points, current.leftPoints.colors);
            meshes.push(current.leftMesh);
            scene.add({ material: vertexColorMaterial, mesh: current.leftMesh });
        }
        
        var rp0 = [], rp1 = [], rp2 = [], rp3 = [];
        vec3.add(rp0, current.position, coffset);
        vec3.add(rp1, current.findControl1(next), coffset);
        vec3.add(rp2, current.findControl2(next), noffset);    // Change to using next.findControlPrev ? so make it cler the control point is based on next
        vec3.add(rp3, next.position, noffset);
        
        current.rightPoints = generateCurvePoints(rp0, rp1, rp2, rp3, white, white, 30);
        
        if (showLines) {
            current.rightMesh = generateLineMesh(current.rightPoints.points, current.rightPoints.colors);
            meshes.push(current.rightMesh);
            scene.add({ material: vertexColorMaterial, mesh: current.rightMesh });
        }
        
        var append = function(a, b) {
            for(let i = 0; i < b.length; i++) {
                a.push(b[i]);
            }
        };
        
        var vertices = [];
        var colors = [];
        var indices = [];
        var index = 0;
        for (var j = 0; j < 30; j++) {
            // Vertex Diagram
            // 3  4  5      <- j == 1
            // 0  1  2      <- j == 0
            append(vertices, current.leftPoints.points[j]);
            append(vertices, current.points.points[j]);
            append(vertices, current.rightPoints.points[j]);
            append(colors, current.points.colors[j]);
            append(colors, current.points.colors[j]);
            append(colors, current.points.colors[j]);
            
            if (j > 0) {
                var backLeft = 3*(j-1);
                var backCentre = 3*(j-1)+1;
                var backRight = 3*(j-1)+2;
                var forwardLeft = 3*j;
                var forwardCentre = 3*j + 1;
                var forwardRight = 3*j + 2;
                // Top Faces
                indices.push(backLeft, forwardLeft, forwardCentre);
                indices.push(backLeft, forwardCentre, backCentre);
                indices.push(backCentre, forwardCentre, forwardRight);
                indices.push(backCentre, forwardRight, backRight);
                
                // Bottom Faces
                indices.push(backLeft, forwardCentre, forwardLeft);
                indices.push(backLeft, backCentre, forwardCentre);
                indices.push(backCentre, forwardRight, forwardCentre);
                indices.push(backCentre, backRight, forwardRight);
            }
        }
        var mesh = Fury.Mesh.create({ vertices: vertices, indices: indices });
        mesh.vertexColors = colors;
        mesh.colorBuffer = Fury.Renderer.createBuffer(colors, 3);
        meshes.push(mesh);
        scene.add({ mesh: mesh, material: vertexColorMaterial });
        
    }

    // TODO: Some kind of inspector to change control points and regenerate mesh would be nice...
    // Ability to inject another track point without affecting the existing shape

	setClearColor(0, 0, 0);

    lastTime = Date.now();
	scene.render();
	window.requestAnimationFrame(loop);
};

var handleInput = function(elapsed) {
    cameraInput(elapsed);
};

// TODO: on lose focus pause loop

var loop = function() {
	var elapsed = Date.now() - lastTime;
	lastTime += elapsed;
	elapsed /= 1000;

    // TODO: Picking... can has raycast?

	handleInput(elapsed);
	scene.render();
	window.requestAnimationFrame(loop);
};

// Start Free Fly Camera
var localx = vec3.create();
var localy = vec3.create();
var localz = vec3.create();
var unitx = vec3.fromValues(1,0,0);
var unity = vec3.fromValues(0,1,0);
var unitz = vec3.fromValues(0,0,1);
var prevX = 0;
var prevY = 0;

// https://en.wikipedia.org/wiki/Conversion_between_quaternions_and_Euler_angles
var getRoll = function(q) {
    // Note: glMatrix is x,y,z,w where as wiki assumes w,x,y,z!
    let sinr_cosp = 2 * (q[3] * q[0] + q[1] * q[2]);
    let cosr_cosp = 1 - 2 * (q[0] * q[0] + q[1] * q[1]);
    return Math.atan(sinr_cosp / cosr_cosp);
    // If you want to know sector you need atan2(sinr_cosp, cosr_cosp)
    // but we don't in this case.
};

var cameraInput = function(elapsed) {
	var q = camera.rotation;
	var p = camera.position;
	vec3.transformQuat(localx, unitx, q);
	vec3.transformQuat(localy, unity, q);
	vec3.transformQuat(localz, unitz, q);

	var mousePos = Input.MousePosition;
	var deltaX = mousePos[0] - prevX;
	var deltaY = mousePos[1] - prevY;
	prevX = mousePos[0];
	prevY = mousePos[1];

	if (Input.mouseDown(2)) {
	    let xRotation = deltaX*rotateRate*elapsed;
	    if (Math.abs(xRotation) > maxRotatePerFrame) {
            xRotation = Math.sign(xRotation) * maxRotatePerFrame;
	    }
	    let yRotation = deltaY*rotateRate*elapsed;
	    if (Math.abs(yRotation) > maxRotatePerFrame) {
	        yRotation = Math.sign(yRotation) * maxRotatePerFrame;
	    }
		quat.rotate(q, q, -xRotation, unity);

		let roll = getRoll(q);
		let clampAngle = 10 * Math.PI/180;
	    if (Math.sign(roll) == Math.sign(yRotation) || Math.abs(roll - yRotation) < 0.5*Math.PI - clampAngle) {
    		quat.rotateX(q, q, -yRotation);
	    }
	}

	if(Input.keyDown("w")) {
		vec3.scaleAndAdd(p, p, localz, -zoomRate*elapsed);
	}
	if(Input.keyDown("s")) {
		vec3.scaleAndAdd(p, p, localz, zoomRate*elapsed);
	}
	if(Input.keyDown("a")) {
		vec3.scaleAndAdd(p, p, localx, -zoomRate*elapsed);
	}
	if(Input.keyDown("d")) {
		vec3.scaleAndAdd(p, p, localx, zoomRate*elapsed);
	}
	if (Input.keyDown("q")) {
		vec3.scaleAndAdd(p, p, localy, -zoomRate*elapsed);
	}
	if (Input.keyDown("e")) {
		vec3.scaleAndAdd(p, p, localy, zoomRate*elapsed);
	}
};

// End Free Fly Camera


// TODO: Load any images etc before calling awake
awake();
