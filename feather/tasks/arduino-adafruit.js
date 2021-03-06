﻿/*
* Gulp Common - Microsoft Sample Code - Copyright (c) 2016 - Licensed MIT
*/
'use strict';

/**
 * Main entry point for all Arduino Adafruit SAMD configurations.
 * @param {object} gulp     - Gulp instance
 * @param {object} options  - Arduino specific options
 */
function initTasks(gulp, options) {

  // set board options
  options.board.package = 'adafruit';
  options.board.arch = 'samd';
  options.board.packageUrl = 'https://adafruit.github.io/arduino-board-index/package_adafruit_index.json';

  // add adafruit specific libraries
  options.libraries.push('WiFi101');
  options.libraries.push('RTCZero');
  options.libraries.push('NTPClient');
  options.libraries.push('AzureIoTHub');
  options.libraries.push('AzureIoTUtility');
  options.libraries.push('AzureIoTProtocol_HTTP');
  options.libraries.push('AzureIoTProtocol_MQTT');

  // init base arduino tasks
  require('./arduino.js')(gulp, options);
}

module.exports = initTasks;
