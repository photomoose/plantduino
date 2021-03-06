﻿/*
* Gulp Common - Microsoft Sample Code - Copyright (c) 2016 - Licensed MIT
*/
'use strict';
var os = require('os');
var fs = require('fs');
var path = require('path');
var request = require('request');
var unzip = require('unzip');
var simssh = require('simple-ssh');
var scp2 = require('scp2')
var gulpTaskBI = require('./biHelper.js').gulpTaskBI;
var args = require('get-gulp-args')();
var chalk = require('chalk');

var config;

/**
 * Uploads files to the device
 * @param {string[]} sourceFileList - List of local files
 * @param {string[]} targetFileList - List of files at destination
 * @param {callback} cb - Callback
 */
function uploadFilesViaScp(sourceFileList, targetFileList, cb) {
  if (sourceFileList.length == 0) {
    if (cb) cb();
    return;
  }

  var scpOptions = {
    host: config.device_host_name_or_ip_address,
    username: config.device_user_name,
    path: targetFileList[0]
  };

  var sshKey = findSshKey();

  if (sshKey) {
    scpOptions.privateKey = sshKey;
  } else if (config.device_password) {
    scpOptions.password = config.device_password;
  } else {
    var err = new Error("No password or SSH key defined");
    err.stack = err.message;
    cb(err);
    return;
  }

  scp2.scp(sourceFileList[0], scpOptions, function (err) {
    if (err) {
      if (cb) {
        err.stack = "SCP file transfer failed (" + err + ")";
        cb(err);

        // clear callback, SCP2 seems to be calling error callback twice, and that looks ugly
        cb = null;
      }
    } else {
      process.stdout.write(' SCP: ' + chalk.bgWhite.blue(' ' + sourceFileList[0] + ' ') + '\n');

      sourceFileList.splice(0, 1);
      targetFileList.splice(0, 1);
      uploadFilesViaScp(sourceFileList, targetFileList, cb);
    }
  });
}

/**
 * Executes command locally
 * @param {string} cmd - Command to be executed
 * @param {boolean} verbose - If true, command output will be printed to stdout
 * @param {callback} cb - Callback on completion
 */
function localExecCmd(cmd, verbose, cb) {
  try {
    var args = cmd.split(' ');
    cmd = args.splice(0, 1);
    var cp = require('child_process').spawn(cmd[0], args);

    var stdout = '';
    cp.stdout.on('data', function (data) {
      if (verbose) process.stdout.write(String(data));
      stdout += String(data);
    });

    var stderr = '';
    cp.stderr.on('data', function (data) {
      if (verbose) process.stdout.write(String(data));
      stderr += String(data);
    });

    cp.on('close', function (code) {

      if (cb) {
        if (0 == code) {
          cb();
        } else {
          var message = `External command failed\nFailed command: ${cmd}\n` +
            (stdout ? `stdout: ${stdout}` : '') +
            (stderr ? `stderr: ${stderr}` : '');
          var e = new Error(message);
          e.stack = e.message;
          cb(e);
        }
      }
    });
  } catch (e) {
    e.stack = "ERROR: " + e;
    if (cb) cb(e);
  }
}

/**
 * Executes sequence of commands locally
 * @param {string[]} cmds - List of commands to be executed
 * @param {boolean} verbose - If true, command output will be printed to stdout
 * @param {callback} cb - Callback on completion
 */
function localExecCmds(cmds, verbose, cb) {

  // check if there are any commands to execute
  if (cmds.length == 0) {
    if (cb) cb();
    return;
  }

  // execute first command
  localExecCmd(cmds.splice(0, 1)[0], verbose, function (e) {
    if (e) {
      if (cb) cb(e);
      return;
    }

    // continue with remaining commands
    localExecCmds(cmds, verbose, cb);
  })
}

/**
 * Clone repository locally
 * @param {string}    url       - URL of git repository to clone
 * @param {string}    folder    - Destination folder
 * @param {boolean}   verbose   - If true, command output will be printed to stdout
 * @param {callback}  cb        - Callback on completion
 */
function localClone(url, folder, verbose, cb) {
  if (folderExistsSync(folder)) {
    console.log('Repo ' + url + ' was already cloned...');
    if (cb) cb();
  } else {
    localExecCmd('git clone ' + url + ' ' + folder, verbose, cb);
  }
}

/**
 * Execute command via SSH
 * @param {string}    cmd       - command to be executed
 * @param {object}    options   - options
 * @param {callback}  cb        - Callback on completion
 */
function sshExecCmd(cmd, options, cb) {
  var sshOptions = {
    host: config.device_host_name_or_ip_address,
    user: config.device_user_name,
    timeout: 30000
  };

  if (options.baseDir) {
    sshOptions.baseDir = options.baseDir;
  }

  var sshKey = findSshKey();

  if (sshKey) {
    sshOptions.key = sshKey;
  } else if (config.device_password) {
    sshOptions.pass = config.device_password;
  } else {
    var err = new Error('No password or SSH key defined\nFailed command: ' + cmd);
    err.stack = err.message;
    cb(err);
    return;
  }

  var ssh = new simssh(sshOptions);

  ssh.on('error', function (e) {
    // when we pass error via deferred.reject, stack will be displayed
    // as it is just string, we can just replace it with message
    e.stack = 'ERROR: ' + e.message + '\nFailed command: ' + cmd;
    console.log('ERROR OCCURED');
    cb(e);
  });

  if (options && options.sshPrintCommands) {
    process.stdout.write(' SSH: ' + chalk.bgWhite.blue(' ' + cmd + ' ') + '\n');
  }

  ssh.exec(cmd, {
    pty: true,
    out: function (o) {
      if (options && options.verbose) {
        process.stdout.write(o);
      }
    },
    exit: function (code, stdout, stderr) {
      var succeeded = true;
      if (code != 0 || (options && options.marker && stdout.indexOf(options.marker) < 0)) {
        succeeded = false;
      }

      if (succeeded) {
        if (cb) cb();
      } else {
        if (cb) {
          var message = `SSH command hasn\'t completed successfully.\nFailed command: ${cmd}\n` +
            (stdout ? `stdout: ${stdout}` : '') +
            (stderr ? `stderr: ${stderr}` : '');
          var e = new Error(message);
          e.stack = message;
          cb(e);
        }
      }
    }
  }).start();
}

/**
 * Execute commands via SSH
 * @param {string[]}    cmds    - list of commands to be executed
 * @param {object}    options   - options
 * @param {callback}  cb        - Callback on completion
 */
function sshExecCmds(cmds, options, cb) {
  // check if there are any commands to execute
  if (cmds.length == 0) {
    if (cb) cb();
    return;
  }

  // execute first command
  sshExecCmd(cmds.splice(0, 1)[0], options, function (e) {
    if (e) {
      if (cb) cb(e);
      return;
    }

    // continue with remaining commands
    sshExecCmds(cmds, options, cb);
  })
}

/**
 * Delete folder recursively and synchronously.
 * @param {string}    path      - folder to be deleted
 */
function deleteFolderRecursivelySync(path) {
  if (fs.existsSync(path)) {
    fs.readdirSync(path).forEach(function (file) {
      var curPath = path + "/" + file;
      if (fs.lstatSync(curPath).isDirectory()) { // recurse
        deleteFolderRecursivelySync(curPath);
      } else { // delete file
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(path);
  }
}

/**
 * Checks of file exists synchronously.
 * @param {string}    path      - File to be checked
 * @returns {boolean}
 */
function fileExistsSync(path) {
  try {
    return fs.statSync(path).isFile();
  } catch (e) {
    return false;
  }
}

/**
 * Checks if folder exists synchronously.
 * @param {string}    path      - Folder to be checked
 * @returns {boolean}
 */
function folderExistsSync(path) {
  try {
    return fs.statSync(path).isDirectory();
  } catch (e) {
    return false;
  }
}

/**
 * Downloads file.
 * @param {string}    url     - Source file URL
 * @param {string}    target  - Target file path
 * @param {callback}  cb
 */
function download(url, target, cb) {
  var stream = request(url).pipe(fs.createWriteStream(target));

  stream.on('error', function (err) {
    err.stack = err.message;
    cb(err);
  });

  stream.on('close', function () {
    if (cb) cb();
  });
}

/**
 * Downloads file.
 * @param {string}    srcZipUrl     - Source file URL
 * @param {string}    targetZipPath - Target file path
 * @param {string}    unzipFolder   - Target folder for unzipping
 * @param {callback}  cb
 */
function downloadAndUnzip(srcZipUrl, targetZipPath, unzipFolder, cb) {
  download(srcZipUrl, targetZipPath, function (err) {
    if (err) {
      if (cb) cb(err);
    } else {
      var extractStream = fs.createReadStream(targetZipPath).pipe(unzip.Extract({ path: unzipFolder }));
      extractStream.on('error', function (err) {
        err.stack = err.message;
        if (cb) cb(err);
      });
      extractStream.on('close', function () {
        if (cb) cb();
      });
    }
  })

}

/**
 * Downloads and installs archive or git repository, depending on URL type.
 * Archive/repository will be by default unpacked/cloned into default tools
 * directory with deafult name.
 *
 * @param {string} url      - archive / respository URL
 * @param {object} options  - options
 * @param {callback}  cb    - callback
 */
function localRetrieve(url, options, cb) {
  var filename = url.split('/').slice(-1)[0];

  var folder = (options && options.folder) ? options.folder : '';

  // extract expected folder name from filename if not given in options
  if (folder == '') {
    folder = filename.slice(0, filename.lastIndexOf('.'));

    if (folder.endsWith('.tar')) {
      folder = folder.slice(0, folder.indexOf('.tar'));
    }
  }

  var filePath = path.join(getToolsFolder(), filename);

  if (folderExistsSync(getToolsFolder() + '/' + folder)) {
    console.log(" ... package '" + filename + "' already installed...");
    cb();
    return;
  }

  if (filename.endsWith('.git')) {
    localClone(url, getToolsFolder() + '/' + folder, args.verbose, cb);
  } else {
    download(url, filePath, function (err) {
      if (err) {
        if (cb) cb(err);
      } else {
        if (process.platform == 'darwin') {

          // for OS X use open command to uncompress all the archives
          localExecCmd(`ditto -xk ${filePath} ${path.dirname(filePath)}`, args.verbose, cb);
          return;

        } else if (filename.endsWith('.zip')) {

          // for all zip archives on Windows and Ubuntu we will use node module
          var extractStream = fs.createReadStream(filePath).pipe(unzip.Extract({ path: getToolsFolder() }));
          extractStream.on('error', function (err) {
            err.stack = err.message;
            if (cb) cb(err);
          });
          extractStream.on('close', function () {
            if (cb) cb();
          });
          return;

        } else if (process.platform == 'linux') {
          var cmds;

          // Ubuntu specific stuff, just use tar to uncompress all the other archives
          if (filename.endsWith('.tar.gz')) {

            cmds = [
              'sudo tar xvz --file=' + filePath + ' -C ' + getToolsFolder(),
              'sudo rm ' + filePath];

            localExecCmds(cmds, args.verbose, cb)
            return;

          } else if (filename.endsWith('.tar.xz')) {

            cmds = [
              'sudo apt-get update',
              'sudo apt-get install -y wget xz-utils',
              'sudo tar xJ --file=' + filePath + ' -C ' + getToolsFolder(),
              'sudo rm ' + filePath];

            localExecCmds(cmds, args.verbose, cb)
            return;
          }
        }

        // format is not supported yet on current platform
        cb(new Error('Archive format not supported'));
      }
    });
  }
}

/**
 * Get tools folder for host operating system
 * @returns {string}
 */
function getToolsFolder() {
  var folder = path.join(process.cwd(), '.tools');

  if (!folderExistsSync(folder)) {
    fs.mkdirSync(folder);
  }

  return folder;
}

/**
 * Finds SSH key
 * @returns {string}
 */
function findSshKey() {
  if (config.device_key_path) {

    // if no directory we have only filename and assume it's in ~/.ssh
    let p = path.dirname(config.device_key_path) === '.' ?
      path.join(process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'], '.ssh', config.device_key_path) :
      path.resolve(config.device_key_path);

    if (fileExistsSync(p)) {
      return fs.readFileSync(p, { encoding: 'ascii' });
    }
  }

  return false;
}

/**
 * Loads combined config
 * @param {string} postfix  - postfix appended to global config filename
 * @returns {object}
 */
function readCombinedConfig(postfix) {
  var config = {};
  var globalConfig = readGlobalConfig(postfix);
  var localConfig = readLocalConfig();
  var combinedConfig = Object.assign(config, globalConfig, localConfig);
  return combinedConfig;
}

/**
 * Get loaded config
 * @returns {object}
 */
function getConfig() {
  return config;
}

/**
 * Loads selected config from user folder
 * @param {string} postfix  - postfix appended to config filename
 * @returns {object}
 */
function readGlobalConfig(postfix) {
  var filename = getToolsFolder() + '/config-' + postfix + '.json';

  if (fileExistsSync(filename)) {
    return require(filename);
  }

  return {};
}

/**
 * Load config.json from current folder
 */
function readLocalConfig() {
  var filename = process.cwd() + '/config.json';

  if (fileExistsSync(filename)) {
    return require(filename);
  }

  return {};
}

/**
 * Writes selected config to user folder
 * @param {string} postfix  - postfix appended to config filename
 * @param {object} config   - config object
 */
function writeGlobalConfig(postfix, config) {
  fs.writeFileSync(getToolsFolder() + '/config-' + postfix + '.json', JSON.stringify(config, null, 2));
}

/**
 * Updates or creates global config file
 * @param {string} postfix    - postfix appended to config filename
 * @param {object} template   - config template
 * @returns {object}
 */
function updateGlobalConfig(postfix, template) {
  var configFilePath = getToolsFolder() + '/config-' + postfix + '.json';
  console.log('Create / update global config file at ' + configFilePath);

  var oldConfig = readGlobalConfig(postfix);
  var newConfig = Object.assign(template, oldConfig);
  writeGlobalConfig(postfix, newConfig);

  return newConfig;
}

/**
 * Writes app/config.h file (for C and Arduino)
 */
function writeConfigH() {
  var headerContent = '';
  if (config.macros) {
    for(var i = 0; i < config.macros.length; i++) {
      var item = config.macros[i];
      if(typeof item.value === 'number' || typeof item.value === 'boolean') {
        headerContent = `${headerContent}#define ${item.key} ${item.value}${os.EOL}`;
      } else {
        headerContent = `${headerContent}#define ${item.key} "${item.value}"${os.EOL}`;
      }
    }
  }
  if (config.iot_device_connection_string) {
    headerContent = `${headerContent}static const char* connectionString = "${config.iot_device_connection_string}";`;
  }
  if (config.hasOwnProperty('wifi_ssid') && config.hasOwnProperty('wifi_password')) {
    headerContent =
      `${headerContent}${os.EOL}static const char* ssid="${config.wifi_ssid}";${os.EOL}static const char* pass="${config.wifi_password}";`;
  }
  if (config.hasOwnProperty('ntp_source')) {
      headerContent =`${headerContent}${os.EOL}static const char* ntpSource="${config.ntp_source}";`;
  }

  fs.writeFileSync('./app/config.h', headerContent);
}

function getDeviceConnectionString(postfix) {
  return readGlobalConfig(postfix).iot_device_connection_string;
}

function getDeviceId(postfix) {
  var connectionString = postfix ? getDeviceConnectionString(postfix) : config.iot_device_connection_string;
  var elements = connectionString.split(';');
  var dict = {};
  for (var i = 0; i < elements.length; i++) {
    var kvp = elements[i].split('=');
    dict[kvp[0]] = kvp[1];
  }
  return dict.DeviceId;
}

module.exports = function (options) {
  if (options) {
    config = readCombinedConfig(options.configPostfix);
  }

  return {
    uploadFilesViaScp,
    localExecCmd,
    localExecCmds,
    localClone,
    localRetrieve,
    sshExecCmd,
    sshExecCmds,
    deleteFolderRecursivelySync,
    fileExistsSync,
    folderExistsSync,
    downloadAndUnzip,
    download,
    gulpTaskBI,
    getToolsFolder,
    writeConfigH,
    updateGlobalConfig,
    getConfig,
    getDeviceConnectionString,
    getDeviceId
  }
}
