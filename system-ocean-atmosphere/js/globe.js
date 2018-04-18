'use strict';

var Globe = (function() {
  function Globe(options) {
    var defaults = {
      el: '#globe',
      viewAngle: 45,
      near: 0.01,
      far: 1000,
      radius: 0.5,
      videoOffset: 0.0
    };
    this.opt = $.extend({}, defaults, options);
    this.init();
  }

  function lonLatToVector3(lng, lat, radius) {
    var out = new THREE.Vector3();

    lng = UTIL.radians(lng);
    lat = UTIL.radians(lat);

    //flips the Y axis
    lat = Math.PI / 2 - lat;

    // distribute to sphere
    out.set(
      Math.sin(lat) * Math.sin(lng) * radius,
      Math.cos(lat) * radius,
      Math.sin(lat) * Math.cos(lng) * radius
    );

    return out;
  }

  // http://stackoverflow.com/questions/27409074
  function objectToScreen(obj, camera, w, h){
    var v3 = new THREE.Vector3();
    var hw = w / 2;
    var hh = h / 2;

    camera.updateMatrixWorld();
    obj.updateMatrixWorld();
    v3.setFromMatrixPosition(obj.matrixWorld);
    v3.project(camera);

    var x = (v3.x * hw) + hw;
    var y = (-v3.y * hh) + hh;

    return new THREE.Vector2(x, y);
  }

  Globe.prototype.init = function(){
    var el = this.opt.el;
    this.$document = $(document);
    this.$el = $(el);
    this.$el.append($('<h2>'+this.opt.title+'</h2>'));

    this.rotateX = 0.5;
    this.rotateY = 0.5;

    this.initScene();
    this.loadGeojson(this.opt.geojson);
    this.loadVideo();
  };

  Globe.prototype.initScene = function() {
    var _this = this;
    var w = this.$el.width();
    var h = this.$el.height();
    var radius = this.opt.radius;

    // init renderer
    this.renderer = new THREE.WebGLRenderer({alpha: true, antialias: true});
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setSize(w, h);
    this.$el.append(this.renderer.domElement);

    // init scene
    this.scene = new THREE.Scene();

    // init camera
    var viewAngle = this.opt.viewAngle;
    var aspect = w / h;
    var near = this.opt.near;
    var far = this.opt.far;
    this.camera = new THREE.PerspectiveCamera(viewAngle, w / h, near, far);
    this.camera.position.z = radius * 4.5;

    // master container, rotate to the angle of the Earth's tilt
    this.container = new THREE.Object3D();
    this.container.rotation.z = -23.43703 * Math.PI / 180;

    // containers for x and y rotations
    this.xContainer = new THREE.Object3D();
    this.yContainer = new THREE.Object3D();

    this.annotationReference = new THREE.Object3D();
    // this.annotationReference = new THREE.Mesh(new THREE.SphereGeometry(0.01, 64, 64), new THREE.MeshBasicMaterial());

    this.xContainer.add(this.annotationReference);
    this.yContainer.add(this.xContainer);
    this.container.add(this.yContainer);
    this.scene.add(this.container);

    // init controls
    // this.controls = new THREE.OrbitControls(this.camera, $("#globes")[0]);
  };

  Globe.prototype.ended = function(){
    return this.video.ended;
  };

  Globe.prototype.getProgress = function(){
    var progress = 0;
    var video = this.video;
    if (video && video.duration) {
      progress = video.currentTime / video.duration;
    }
    return progress;
  };

  Globe.prototype.isLoaded = function(){
    return this.video && this.video.duration;
  };

  Globe.prototype.loadEarth = function() {
    var radius = this.opt.radius;

    // load video texture
    var tex = new THREE.VideoTexture(this.video);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.format = THREE.RGBFormat;
    tex.repeat.set(1, 0.5);
    tex.offset.set(0, this.opt.videoOffset);
    // tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();

    // init globe
    var geo = new THREE.SphereGeometry(radius, 64, 64);
    var mat = new THREE.MeshBasicMaterial({map: tex, overdraw: true});
    var earth = new THREE.Mesh(geo, mat);

    earth.material.map.needsUpdate = true;
    earth.rotation.y = -Math.PI/2;

    // add north arrow
    var dir = new THREE.Vector3(0, 1, 0);
    var origin = new THREE.Vector3(0, 0, 0);
    var length = radius * 1.5;
    var hex = 0x00ff00;
    var northArrow = new THREE.ArrowHelper(dir, origin, length, hex);
    earth.add(northArrow);

    // add south arrow
    dir = new THREE.Vector3(0, -1, 0);
    hex = 0xff0000;
    var southArrow = new THREE.ArrowHelper(dir, origin, length, hex);
    earth.add(southArrow);

    this.xContainer.add(earth);

    this.onRotate("vertical", this.rotateY);
    this.onRotate("horizontal", this.rotateX);
  };

  Globe.prototype.loadGeojson = function(geojsonData){
    var opt = {
      color: this.opt.geojsonLineColor
    };
    var radius = this.opt.radius * 1.001;

    drawThreeGeo(geojsonData, radius, 'sphere', opt, this.xContainer);
  };

  Globe.prototype.loadVideo = function(){
    var _this = this;
    var promise = $.Deferred();

    // add video element to document
    var $video = $('<video id="video" webkit-playsinline style="display: none" autoplay loop crossorigin="anonymous"></video>');
    _.each(this.opt.videos, function(v){
      $video.append($('<source src="'+v.url+'" type="'+v.type+'">'));
    });
    $('body').append($video);
    this.video = $video[0];

    // wait for video to load, then load earth
    this.video.addEventListener('loadeddata', function() {
      console.log('Video loaded');
      promise.resolve();
      _this.loadEarth();
    }, false);

    return promise;
  };

  Globe.prototype.onResize = function(){
    var w = this.$el.width();
    var h = this.$el.height();

    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  Globe.prototype.onRotate = function(axis, value){
    var container;
    var range;
    var angle;

    if (axis === "vertical") {
      this.rotateY = value;
      container = this.yContainer;
      range = this.opt.rotateY;
      angle = UTIL.lerp(range[0], range[1], 1.0-value);
      container.rotation.x = angle * Math.PI / 180;

    } else {
      this.rotateX = value;
      container = this.xContainer;
      range = this.opt.rotateX;
      angle = UTIL.lerp(range[0], range[1], value);
      container.rotation.y = angle * Math.PI / 180;
    }

    if (this.currentAnnotation) {
      this.renderAnnotation();
    }
  };

  Globe.prototype.render = function(yearProgress){

    this.renderer.render(this.scene, this.camera);
    // this.controls.update();
  };

  Globe.prototype.renderAnnotation = function(){
    if (!this.currentAnnotation) return false;

    var w = this.renderer.context.canvas.width;
    var h = this.renderer.context.canvas.height;
    var v2 = objectToScreen(this.annotationReference, this.camera, w, h);
    this.$document.trigger("annotation.position.update", [this.opt.el, v2.x, v2.y]);
  };

  Globe.prototype.updateAnnotation = function(annotation){
    if (annotation && annotation.globeEl !== this.opt.el
      || annotation && !annotation.arrow) return false;

    this.currentAnnotation = annotation;
    if (annotation) {
      var lat = annotation.lat;
      var lon = annotation.lon;
      var v3 = lonLatToVector3(lon, lat, this.opt.radius);
      this.annotationReference.position.copy(v3);
    }
    this.renderAnnotation();
  };

  return Globe;

})();
