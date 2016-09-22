/**
 * file: gitcli.js
 * path: /modules/git/lib/
 * reason: git cli interface to nodejs
 */
var async = require('async'),
    log = require('tracer').colorConsole(),
    exec = require('child_process').exec,
    path = require('path');

  /**
   * Doing git add and git commit
   * @param  {string}   projectPath String of project path
   * @param  {String}   message     String of commit message
   * @param  {function} cback       Callback function
   * @return {void}                 Return piped to callback
   */
  function gitCommit (projectPath, message, cback) {
    var filename = './' + path.basename(projectPath),
        gitpath = path.join(path.dirname(projectPath), '.git'),
        projectDir = path.dirname(projectPath);

    async.waterfall([
      function add (callback) {
        exec('git add --all .', {cwd: projectDir}, function (err, stdout, stderr) {
          if (err) {
            callback(err, stderr);
          } else {
            callback(null);
          }
        });
      },

      function commit (callback) {
        exec('git commit -a -m "' + message + '"', {cwd: projectDir}, function (err, stdout, stderr) {
          if (err) {
            if (stdout.indexOf('nothing to commit') != -1) {
              callback (null, stdout);
            } else {
              callback (err, stderr);
            }
          } else {
            callback (null, stdout);
          }
        });
      }
    ], cback);
  }

exports = module.exports = {

  /**
   * Fetch gitlog
   * @param  {String}   projectPath String of project path
   * @param  {String}   gitparam    String of git log parameter
   * @param  {function} cback       Callback function
   * @return {void}                 Return piped to callback
   */
  log: function getLog (projectPath, gitparam, cback) {
    var filename = './' + path.basename(projectPath),
        gitpath = path.dirname(projectPath);

    log.debug(projectPath);

    async.waterfall([
      function start (callback) {
        var cmd = 'git log --pretty=format:\'{"hash": "%H", "commiterName": "%cN", "commiterEmail": "%cE", "timestamp": %ct, "date": "%cd", "subject": "\%s", "body": "%b"},\' | tr -d "\\n"' + gitparam;
        log.debug(cmd);
        log.debug(path.dirname(projectPath));
        exec(cmd, { cwd: path.dirname(projectPath) }, function (err, stdout, stderr) {
          if (err) {
            callback(err, stderr);
          } else {
            callback(null, stdout);
          }
        });
      },

      function parseLog (log, callback) {
        log = '[' + log.substring(0, log.length - 1) + ']';
        log = JSON.parse(log);
        callback(null, log);
      }
    ], cback);
  },
  commit: gitCommit,

  /**
   * Doing init first and then git add and git commit
   * @param  {string}   projectPath String of project path
   * @param  {String}   message     String of commit message
   * @param  {function} cback       Callback function
   * @return {void}                 Return piped to callback
   */
  initCommit: function initCommit (projectPath, message, cback) {
    var filename = './' + path.basename(projectPath),
        gitpath = path.join(path.dirname(projectPath), '.git'),
        projectDir = path.dirname(projectPath);

    async.waterfall([
      function start (callback) {
        exec('git init .', {cwd: projectDir}, function (err, stdout, stderr){
          if (err) {
            callback(err, stderr);
          } else {
            callback(null, stdout);
          }
        });
      },

      function add (stdout, callback) {
        gitCommit(projectPath, message, callback);
      }
    ], cback);
  }
}
