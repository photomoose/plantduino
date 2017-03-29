'use strict';

var gulp = require('gulp-help')(require('gulp'), {
  hideEmpty: true
});

require('./tasks/arduino-adafruit-samd-feather-m0.js')(gulp, {
  app: ['app.ino', 'config.h']
});
