var path = require('path'),
    async = require('async'),
    fs = require('fs.extra'),
    git = require('./gitcli'),
    mkdirp = require('mkdirp'),
    basepath = path.resolve('.'),
    log = require('tracer').colorConsole();

function isEmptyObject(obj) {
  for (var key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      return false;
    }
  }
  return true;
}

/**
 * Inventory class constructor
 * @param {Object} config Config object.
 * @param {Object} param findUserByApikey function and other dependencies.
 */
function Inventory (config, param) {
  self = this;
  self.config = config;
  self.mod = param.mod;
  self.apikeyid = param.apikeyid;
  self.findUserByApikey = param.findUserByApikey;
  self.updateInventory = param.updateInventory;
}

function getInventory (self, data, cb) {
  var apikey = self.apikeyid,
      inventory = self.mod.inventory;

  async.waterfall([
    function start(callback) {
      self.updateInventory(data, apikey, function(err, inventories) {
        callback(err, inventories);
      });
    },
    function getInv (inventories, callback) {
      inventory.find({
        '_id': { $in: inventories }
      }, function(err, docs) {
        callback(err, docs);
      });
    },
    function reformInv (docs, callback) {
      async.map(docs, function(item, cback) {
        var fullUrl = self.config.baciro.protocol + '://' + self.config.baciro.host + ':' + self.config.baciro.port;

        var nilaiBalik = {
          iid: item.iid,
          type: item.type,
          createdate: item.createdate,
          url: fullUrl + '/' + path.join('inventory', 'get', apikey, String(item.iid)),
          name: path.basename(item.filename),
          status: item.status,
          rev: item.rev,
        };
        if (item.filename.split('/')[item.filename.split('/').length-3] == apikey) {
          nilaiBalik.project = item.filename.split('/')[item.filename.split('/').length - 2];
        }

        cback(null, nilaiBalik);
      }, function(err, result) {
        callback(err, result);
      });
    },
  ], function finalize (err, result) {
    if (err) { cb(err, result); } else {
      cb(null, result);
    }
  });
}

Inventory.prototype.get = function (cb){
  var self = this;
  self.findUserByApikey(self.apikeyid,function cariUser(err, data){
    if (data){
      getInventory(self, data, function(err, result){
        log.error(err);
        log.info(result);
        cb (err, result);
      });
    }else {
      log.error(err);
      cb (err);
    }
  });
};

Inventory.prototype.getInventory = function (type, name, apikey, cb){
  var self = this;
  self.findUserByApikey(self.apikeyid,function cariUser(err, user){
    if(err){
      cb(err);
    }else{
      if (typeof user.inventories == 'undefined') { // belum ada
        cb('Inventory empty (not exist)');
      }else if (user.inventories.length === 0) {  // kosong
        cb('Inventory empty');
      }else{ // ada dan tidak kosong
        self.mod.inventory.find({ _id: { $in: user.inventories }, type: type }, { filename: 1 }, function infind (err, doc) {
          var dog = doc.filter(function (el) { return el.toObject().filename.match(name); });
          if (dog.length == 1) { // ketemu
            cb(null, dog[0].filename);
          } else {
            cb('Not Found');
          }
        });
      }
    }
  });
};

function realSyncDir (self, apikey, type, callback) {
  var async = require('async'),
      readrec = require('recursive-readdir'),
      inventory = self.mod.inventory,
      findUser = self.findUserByApikey;

  function saveInventory (items, kembali) {
    findUser(apikey, function cariuser(err, elem) {
      if (elem.inventoryDir) {
        if (elem.inventoryDir[apikey]) {
          elem.inventoryDir[apikey][type] = items;
        } else {
          elem.inventoryDir[apikey] = {};
          elem.inventoryDir[apikey][type] = items;
        }
      } else {
        elem.inventoryDir = {};
        elem.inventoryDir[apikey] = {};
        elem.inventoryDir[apikey][type] = items;
      }
      elem.markModified('inventoryDir');
      elem.save(function simpanInv (err) {
        if (err) {
          log.debug('Error fungsi saveInventory : %s ', err);
          kembali(err);
          return;
        } else {
          log.debug('Save inventory berhasil');
          kembali(null);
          return;
        }
      });
    });
  }

  async.waterfall([
    function cariuser(cb) {
      log.info('Cari user dengan apikey: %s', apikey);
      findUser(apikey, function(err, elem) {
        cb(err, elem);
      });
    },
    //get struktur dir dari database
    function getDirDb (elem, cb) {
      var invdir = {};
      if ( typeof elem.inventoryDir == 'undefined') {
        log.debug('Inventory dir tidak ditemukan pada user.');
        // kalau inventory dir tidak ada kirim object kosong.
        cb(null, invdir);
      } else {
        log.debug('Inventory dir ditemukan pada user.');
        if (!elem.inventoryDir[apikey]) {
          elem.inventoryDir[apikey] = {};
        }
        if (elem.inventoryDir[apikey][type]) {
          invdir = elem.inventoryDir[apikey][type];
        } else {
          invdir = elem.inventoryDir[apikey];
          invdir[type] = {};
          invdir = invdir[type];
        }
        cb(null, invdir);
      }
    },
    //baca struktur dir di local
    function bacastrukturdir(invdir, cb){
      invdir = {};
      readrec(path.join(basepath, config.inventory[type]), ['.git'], function readDir(err, files){
        if (err) {
          log.debug('Error pada fungsi callback readrec : %s', err);
          cb(err);
        }else{
          if (files.length !== 0) { // kalau ada isinya
            for (var i = 0; i < files.length; i++) {  // jalankan untuk setiap file.
              // cek dulu inventory apikey match apa enggak
              var apikeyfile = files[i].replace(path.join(basepath,config.inventory[type]), '').split('/')[1];
              if (apikeyfile === apikey) {
                var item = files[i].replace(path.join(basepath,config.inventory[type], apikey), ''), project;
                item = item.substring(1,item.length);
                if (item.split('/').length == 2) { // jalankan untuk yang memiliki pattern project/package
                  log.debug('format e project/package, object : %s', invdir);
                  project = item.split('/')[0];
                  var package = item.split('/')[1].split('.')[0];
                  if (typeof invdir[project] == 'undefined') {
                    invdir[project] = {};
                  }
                  invdir[project][package] = files[i];
                  log.debug('Object out : ', invdir);
                } else {    // jalankan untuk yang memiliki pattern project
                  project = item.split('.')[0];
                  invdir[project] = files[i];
                }
              }
            }
            cb(null, invdir);
          } else {  // kalau gak ada filenya, balikin object plain.
            cb(null, invdir);
          }
        }
      });
    },
    //simpan object invdir ke database
    function savedir(invdir, cb){
      log.info('Baca struktur directory selesai, mulai simpan struktur directory ke database.');
      saveInventory(invdir, function(err) {
        if (err) {
          log.debug(err);
          cb(err);
        } else {
          log.info('Sync Inventory selesai');
          cb(err, invdir);
        }
      });
    }
  ], function (err, result) {
    callback(err, result);
  });
}

Inventory.prototype.syncDir = function syncDirOut (apikey, callback) {
  var self = this;
  function checkSize (obj) {
    var size = 0;
    for (var key in obj) {
      if (obj.hasOwnProperty(key)) {
        size++;
      }
    }
    return size;
  }

  var configsize = checkSize(self.config.inventory),
      types = Object.keys(self.config.inventory),
      results = [];

  // Ini looping untuk fungsi yang pakai callback.
  function loopAsync(i) {
    if (i < configsize) {
      realSyncDir(apikey, types[i], function sdcb (err, result) {
        if (err) {
          results.push({ type: types[i], err: err, result: result });
          loopAsync(i+1);
        } else {
          results.push({ type: types[i], err: err, result: result });
          loopAsync(i+1);
        }
      });
    }
  }

  loopAsync(0);

  if (results.length == configsize) {
    log.info('Sync Inventory selesai.');
    callback(true, results);
  } else {
    log.info('Sync Inventory selesai dengan catatan.');
    callback(false, results);
  }
};

Inventory.prototype.getOne = function(iid, cb){
  if(iid === undefined){
    cb('Inventory ID missin');
  }else {
    var self = this;
    var inventory = self.mod.inventory;
    var apikey = self.apikeyid;
    async.waterfall([
      function start (callback) {
        self.findUserByApikey(apikey, function(err, data) {
          callback(err, data);
        });
      },
      function findI (user, callback) {
        inventory.findOne({iid: iid}, function cariSatuInv (err, data) {
          if (!err && !data) {
            callback('Inventory not found.');
          } else {
            callback(err, data);
          }
        });
      }
    ], function finalize (err, result) {
      if (err) { cb(err); } else {
        cb (null, result);
      }
    });
  }
};

Inventory.prototype.put = function put(type, name, oldPath, apikey, cb){
  var self = this, err;
  var db = self.config.db,
      user = self.mod.user,
      inventory = self.mod.inventory;
  var project = name.split('/')[0];
  var package = name.split('/')[1];

  async.waterfall([
    function cekdir(cb){
      if(self.config.inventory.hasOwnProperty(type)){

        // susun direktori yang akan dicek.
        var tocheck = path.join(basepath,config.inventory[type],apikey),
            newpath;

        // kalau pattern project/package
        if(name.split('/').length == 2){
          tocheck = path.join(tocheck,project);
          // siapkan newpath tujuan.
          newpath = path.join(tocheck,package + '.' + type);
          // cek tocheck ada apa enggak
          fs.stat(tocheck, function(err, tocheckstat) {
            if (tocheckstat && tocheckstat.isDirectory()) { // kalau tocheck itu directory
              // berlanjut ke move.
              cb(null, newpath);
            } else {  // kalau tocheck itu bukan direktori
              // buat direktori baru, inget, ada callback. dia akan buka thread baru.
              mkdirp(tocheck, 0700, function(err) {
                if (err) { // kalau gagal membuat direktori baru, biasanya karena permission OS.
                  log.error('Fail to create new directory, check your permission on %s.  %s', tocheck, err);
                  cb('Fail to create new directory on inventory.');
                  return;
                } else { // kalau berhasil membuat direktori baru.
                  // berlanjut ke move
                  cb(null,newpath);
                  return;
                }
              });
            }
          });
        } else {
          newpath = path.join(tocheck,project+'.'+type);
          fs.stat(tocheck, function(err, tocheckstat){
            if (tocheckstat && tocheckstat.isDirectory()) { // kalau tocheck itu directory
              cb(null, newpath);
            } else {
              mkdirp(tocheck, 0700, function(err) {
                if (err) { // kalau gagal membuat direktori baru, biasanya karena permission OS.
                  log.error('Fail to create new directory, check your permission on %s.  %s', tocheck, err);
                  cb(err, showStatus(5, 'Fail to create new directory on inventory.'));
                  return;
                } else { // kalau berhasil membuat direktori baru.
                  // berlanjut ke move
                  cb(null,newpath);
                  return;
                }
              });
            }
          });
        }
      } else {
        cb('inventory\'s type doesn\'t match on the list.');
      }
    },
    // pindah filenya.
    function movefile(newpath, cb) {
      // fungsi untuk memindah file.
      function realMove(newpath, lanjut) {
        fs.move(oldPath, newpath, function cbMove (err) {
          if (err) {
            cb('Fail to move Inventory file from '+oldPath);
          } else {
            log.info('sukses create file: '+newpath);
            lanjut(null, newpath);
          }
        });
      }

      // cek newpath, kalau ada hapus dulu baru pindah, kalau belum langsung pindah.
      fs.stat(newpath, function (err, newpathstat) {
        if (newpathstat && newpathstat.isFile()) {
          log.debug('Filenya ada, harusnya hapus dulu baru pindah.');
          fs.unlinkSync(newpath); // hapus dulu.
          realMove(newpath, cb);
        } else {
          log.debug('Filenya gak ada, langsung hapus aja.');
          realMove(newpath, cb);
        }
      });
      // lalu pindah.
    },

    // fungsi simpan ke git.
    function simpanGit(newpath, cb) {//FIXME: where is my git?
      // simpan git hanya yang memiliki pattern project/package.
      cb(null, newpath);
    },


    //fungsi insert inventory ke database
    function insertinv(newpath, cb){
      inventory.findOne({ type: type, filename: newpath }, function (err, data) {
        if (err) {cb(err);}
        else if (data) {
          var date = new Date();
          var oldInv = {
                type: type,
                filename: newpath
              },
              newInv = {
                rev: date.getTime()
              },
              options = {
                new: true,
                upsert: true
              };

          inventory.findOneAndUpdate(oldInv, newInv, options, function(err, rows) {
            if (err) {
              cb(true);
              log.debug('isi err: %s', err);
            } else {
              log.debug(rows);
              cb(false, rows._id);
            }
          });
        }
        else {
          var newInventory = new inventory({
            type: type,
            filename: newpath
          });
          newInventory.save(function(err, obj) {
            if (err) {
              log.debug('isi err: %s', err);
              cb(err);
            } else {
              cb(false, obj._id);
            }
          });
        }
      });
    },

    // push inventory id
    function pushInventoryUser (objid, cb) {
      self.findUserByApikey(apikey, function findUserToPost (err, user) {
        if (err) {
          cb(err, 'User not found to modify inventory id');
        } else {
          // kalau object id belum ada pada inventories user
          if (user.inventories.filter(function (val) { return val == objid }).length == 0) {
            user.inventories.push(objid);
            user.save(function (err, obj) {
              if (err) {
                cb(err, 'Fail to push inventory id to user inventories.');
              } else {
                console.log(obj);
                cb(null, objid);
              }
            });
          // kalau sudah ada
          } else {
            cb(null, objid);
          }
        }
      });
    },

    // fungsi sync dengan inventoryDir
    function sync(objid, cb) {
      realSyncDir(self, apikey, type, function realSyncDirCb (err, result) {
        log.debug(err);
        log.debug(result);
        cb(err, objid);
      });
    }

    //buat fungsi update git
  ],function finalize(err, result){
    log.debug(err);
    log.debug(result);
    cb(err,result);
  });
};

module.exports = Inventory;
